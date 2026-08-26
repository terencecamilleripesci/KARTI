/* ═══════════════════════════════════════════════════════════════════
   KARTI — bomba-ui.js
   IL-BOMBA — the arena screen. The rules live in js/bomba.js (the pure
   engine on window.KARTI_BOMBA.engine); this file is the screen, the
   clock, the thumb and the wire. It follows js/serp-ui.js's shape —
   the real-time sibling in this box — down to the letter it can, and
   departs from it only where the engine's contract differs:

     · SERP broadcasts EVENTS (a turn, an eat, a death) and reconciles
       with a per-seat jitter buffer. BOMBA cannot: "did I get out of
       the blast in time" is a precise yes/no on one tick, and two
       phones that reconcile afterwards WILL disagree about a death,
       which is the worst bug this genre has. So BOMBA runs INPUT-DELAY
       LOCKSTEP over a fixed 16Hz tick: an input sampled for tick N is
       committed for tick N+D, every phone has every seat's input for a
       tick before it simulates that tick, and every phone therefore
       runs the identical pure function step(seed, map, inputs) and can
       never disagree. The engine's header spells this out; this file
       is the half that samples the thumb, ships the byte, and only
       steps when the frame is complete.

   WHAT THIS FILE IS
     · the shelf tile and the themed menu — the map, how many players,
       how hard the machine is, with the RULES FOLDED SHUT at the bottom
       so starting a game is one tap
     · the arena: a <canvas>, drawn at device pixel ratio, walls and
       destructible blocks, bombs with a shrinking fuse, blast crosses,
       power-ups and the players in seat colours, all interpolated over
       the fixed-point sub-cell offset so 16Hz reads as 60fps
     · the thumb: a four-way pad UNDER the arena and a big BOMB button
       beside it, in their own strip that never overlaps the arena
     · the clock: one requestAnimationFrame loop that paces the fixed
       tick off wall time and interpolates between ticks
     · the wire: input-delay lockstep through the relay, wired exactly
       the way SERP wires its transport — but published behind an honest
       canStart() that refuses until the server learns the word "bomba"

   ── WHY A CANVAS ──────────────────────────────────────────────────
     A 13x9 arena is over a hundred cells; up to eight players, a dozen
     bombs and a spreading blast field all move EVERY frame. One <canvas>
     is one compositor layer sized on RESIZE ONLY (fitCanvas), and the
     frame loop reads no geometry at all — no getBoundingClientRect, no
     offsetWidth — so nothing per frame asks the browser to lay out. The
     HUD is DOM, repainted on CHANGE, never per frame.

   ── THE CONTROL SCHEME: A PAD AND A BOMB BUTTON, NOT A SWIPE ──────
     Tested on 390x844 with one thumb, and the reasoning is SERP's,
     extended by one button:

       THE PAD WINS on LATENCY — a pointerdown IS a direction, now, with
       nothing to recognise — and on THE THUMB: the pad owns its own
       strip BELOW the arena, so the hand steering is never over the
       player it is steering. That is asserted in the test file, not
       eyeballed.

       BOMBA needs a second verb the snake never had: DROP. A swipe-to-
       move / tap-to-bomb scheme fails the same way SERP's swipe does —
       a swipe is not a swipe until it has travelled ~24px, which at a
       62ms tick is a wasted tick and, in this genre, a death. So the
       drop is its OWN button, a big one, on the OTHER side of the arena
       from the pad, sized for the thumb that is not on the pad. A left-
       handed player can mirror it (a preference, saved). Both live in
       the control strip and neither is ever over the arena.

       A swipe over the arena is kept anyway, for people who reach for
       it, plus a tap on the arena as a second drop — free, because the
       measured controls are elsewhere.

   ── REDUCED MOTION ───────────────────────────────────────────────
     Turns off sub-cell interpolation (players snap cell-to-cell), the
     fuse pulse, the blast shimmer and the power-up bob. The game stays
     completely playable; it just stops breathing.

   HOUSE RULES OBEYED (SERP's list, unchanged)
     · borrows #scr-party through KARTI_PARTY, injects its own CSS once,
       never touches css/ or the tab bar's ancestors;
     · no emoji; sounds only through KARTI_SFX ids that already exist;
     · every player-visible string is a T(en, mt) pair at its call site;
     · the back arrow goes BACK — no "are you sure", no nav.js guard.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const K = window.KARTI;
const P = window.KARTI_PARTY;
const R = window.KARTI_BOMBA;
if (!K || !P || !R || !R.engine) return;

const E = R.engine;
const esc = (K && K.esc) || (s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

/* ── the one language switch (js/lang.js) ────────────────────────── */
const T = (en, mt) => window.KARTI_LANG ? KARTI_LANG.t(en, mt) : en;

/* ── reduced motion, the two doors the rest of the app honours ───── */
function noMotion(){
  try {
    if (window.KARTI && KARTI.REDUCED) return true;
    if (document.body && document.body.classList.contains('reduced')) return true;
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch(e){ return false; }
}

/* ═══════════════════════════════════════════════════════════════════
   SOUND — existing ids only, through one gate. Blasts come in bunches
   (a chain sets off five bombs in one tick), so the explosion is rate-
   limited or a chain is a wall of noise; the pickup and the death are
   let through in full because they are the moments that matter.
   ═══════════════════════════════════════════════════════════════════ */
let cueAt = 0;
function cue(id, opts, big){
  const S = window.KARTI_SFX;
  if (!S) return;
  const now = Date.now();
  if (!big && now - cueAt < 60) return;
  cueAt = Math.max(cueAt, now);
  try { S.play(id, opts); } catch(e){}
}

/* ── our corner of localStorage ──────────────────────────────────── */
const STORE = 'karti_bomba_v1';
let ST = { v:1, pref:{}, best:0, rec:{ w:0, l:0, d:0 } };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (j && typeof j === 'object'){
    ST.pref = (j.pref && typeof j.pref === 'object') ? j.pref : {};
    ST.rec  = (j.rec  && typeof j.rec  === 'object') ? j.rec  : ST.rec;
    ST.best = j.best | 0;
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
  clearTimeout(persistPending); persistPending = 0;
  try { localStorage.setItem(STORE, JSON.stringify(ST)); } catch(e){}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistNow(); });
window.addEventListener('pagehide', persistNow);
function pref(patch){
  if (patch){ Object.assign(ST.pref, patch); persist(); }
  return ST.pref;
}

/* ── UI-only preferences in their OWN key (serp/kiri's dock rule) ── */
const UIKEY = 'karti_bomba_ui_v1';
let rulesOpen = false;          /* the in-arena panel                 */
let setupOpen = false;          /* the fold at the bottom of the menu */
try { rulesOpen = localStorage.getItem(UIKEY + '.rules') === '1'; } catch(e){}
try { setupOpen = localStorage.getItem(UIKEY + '.setup') === '1'; } catch(e){}
function setSetupOpen(open){
  setupOpen = !!open;
  try { localStorage.setItem(UIKEY + '.setup', setupOpen ? '1' : '0'); } catch(e){}
}

/* the machine, by the club's own three names — a difficulty means one
   thing everywhere in this app */
const LEVELS = [
  { level:1, name:'Gentle',   note:'Will miss things.' },
  { level:2, name:'Normal',   note:'Plays properly.' },
  { level:3, name:'Ruthless', note:'Plays to win.' }
];
function levelWords(k){
  if (k === 1) return { n:T('Gentle', 'Kalm'),        i:T('Wanders. Slow to run.', 'Jitlajja. Bil-mod jaħrab.') };
  if (k === 3) return { n:T('Ruthless', 'Bla ħniena'), i:T('Corners you and lights the fuse.', 'Jixxukkjak u jixgħel il-fitil.') };
  return { n:T('Normal', 'Normali'), i:T('Plays properly.', 'Jilgħab sew.') };
}

/* the shipped maps, named. The id is the engine's; the words are ours
   (bilingual — the engine authors no player strings). Small/medium seat
   2–4; the three LARGE arenas seat up to 8 (the "more than 4 = bigger
   map" set). The engine's MAP_IDS is the source of order; MAPWORDS just
   dresses each id. A map with no words falls back to its id. */
const MAPWORDS = {
  duell:    () => ({ n:T('Duell', 'Duell'),        i:T('Small, mirrored. Two only.', 'Żgħira, mera. Tnejn biss.') }),
  arena:    () => ({ n:T('Arena', 'Arena'),        i:T('Open four corners, brick-packed.', 'Erba’ kantunieri miftuħa, mimlija blokok.') }),
  labirint: () => ({ n:T('Labirint', 'Labirint'),  i:T('Dense blocks, tight lanes.', 'Blokok fitti, mogħdijiet dojoq.') }),
  kurituri: () => ({ n:T('Kurituri', 'Kurituri'),  i:T('Long corridors, pillar walls.', 'Kurituri twal, ħitan bil-pilastri.') }),
  gzira:    () => ({ n:T('Gżira', 'Gżira'),        i:T('Lopsided on purpose. No two corners fair.', 'Storta apposta. L-ebda żewġ kantunieri ġusti.') }),
  salib:    () => ({ n:T('Salib', 'Salib'),        i:T('A pillar cross quarters the arena.', 'Salib ta’ pilastri jaqsam l-arena f’erbgħa.') }),
  gzejjer:  () => ({ n:T('Gżejjer', 'Gżejjer'),    i:T('Big open arena. Five to eight.', 'Arena kbira miftuħa. Ħamsa sa tmienja.') }),
  katakombi:() => ({ n:T('Katakombi', 'Katakombi'),i:T('Big maze, lots to dig. Up to eight.', 'Labirint kbir, ħafna x’tħaffer. Sa tmienja.') }),
  kurituri_kbir: () => ({ n:T('Kurituri l-Kbar', 'Kurituri l-Kbar'), i:T('Grand corridors for eight.', 'Kurituri kbar għal tmienja.') })
};
const MAP_ORDER = (E.MAP_IDS && E.MAP_IDS.slice()) ||
  ['duell', 'arena', 'labirint', 'kurituri', 'gzira', 'salib', 'gzejjer', 'katakombi', 'kurituri_kbir'];
/* how big a map is, for the picker badge: S/M small-medium (2–4), L large (5–8) */
function mapSize(id){ try { return E.MAPS[id] && E.MAPS[id].size || 'M'; } catch(e){ return 'M'; } }
function mapWords(id){ return MAPWORDS[id] ? MAPWORDS[id]() : { n:id, i:'' }; }

/* ── the eight players, by colour. Seat order, fixed, so the player you
   are is the same colour on every phone at the table. Two tones per
   seat: body and a darker rim, drawn like SERP's snake segments. ── */
const COLS = [
  { a:'#3BE08A', b:'#0E7A45', n:() => T('Green',  'Aħdar')   },
  { a:'#FF6B8A', b:'#8E1F38', n:() => T('Pink',   'Roża')    },
  { a:'#5FC8FF', b:'#175E8E', n:() => T('Blue',   'Blu')     },
  { a:'#FFC542', b:'#8A6210', n:() => T('Gold',   'Deheb')   },
  { a:'#C08BFF', b:'#5A2E92', n:() => T('Violet', 'Vjola')   },
  { a:'#FF9A4D', b:'#8E4A10', n:() => T('Orange', 'Oranġjo') },
  { a:'#7BE8E0', b:'#177A74', n:() => T('Teal',   'Teal')    },
  { a:'#E8E2D0', b:'#7A7260', n:() => T('Bone',   'Għadma')  }
];

/* ═══════════════════════════════════════════════════════════════════
   THE BLAST KING (bomba.*.excl) — who is golden in this arena.
   The bomber is the PLAYER and a bomb belongs to whoever dropped it, so
   both travel: my equipped set goes out as a one-byte {t:'skin', b:1}
   action near match start (see onlineStart / onlineRemote — a new
   ACTION on the existing declared fields, so wire.fields does NOT grow
   and an older build's decWire simply returns null and drops it). It
   lands in M.skins, seat → byte, so every phone gilds that seat's
   bomber and its bombs. The ARENA floor is the shared room everybody
   looks at, so it stays the local choice and never travels. A golden
   bomber keeps its SEAT COLOUR as the lower body — eight identical
   kings mid-panic would be unreadable, and the colour is who you are.
   ═══════════════════════════════════════════════════════════════════ */
function xEq(slot){
  try {
    const XP = window.KARTI_XP;
    return !!XP && XP.equipped(slot, 'bomba') === 'bomba.' + slot + '.excl';
  } catch(e){ return false; }
}
function kingSeat(seat){
  if (!M) return false;
  if (seat === M.me) return xEq('char');
  return !!(M.skins && M.skins[seat] === 1);
}
function kingBomb(seat){
  if (!M) return false;
  if (seat === M.me) return xEq('bomb');
  return !!(M.skins && M.skins[seat] === 1);
}

/* the power-ups, by kind, for the HUD and the drawn pickup icon. The
   classic four plus the four scale-up finds. `fill` marks glyphs meant to
   be filled rather than stroked. */
const PU = E.PU;
/* Each kind carries: a colour `c`, an SVG glyph `g` (24-box, `fill` if the
   path is filled not stroked), a one-letter fallback `t` stamped small on the
   tile so it reads even at a phone's smallest cell, and a short bilingual
   collect-label {en,mt} floated over the player on pickup. The glyphs are
   deliberately distinct silhouettes so the eight types tell apart on sight. */
const PU_INFO = {
  [PU.BOMB]:  { c:'#FF6B8A', t:'B', en:'+BOMB',   mt:'+BOMBA', g:'M12 4v16M4 12h16' },                          /* +bomb  (plus)   */
  [PU.RANGE]: { c:'#FF9A4D', t:'R', en:'RANGE UP',mt:'FIRx1',  g:'M12 3v18M12 3l-4 4M12 3l4 4M12 21l-4-4M12 21l4-4' }, /* +range (arrows) */
  [PU.SPEED]: { c:'#5FC8FF', t:'S', en:'SPEED!',  mt:'ĦEFFA!', g:'M13 3L5 13h5l-1 8 8-10h-5z', fill:true },     /* +speed (bolt)   */
  [PU.KICK]:  { c:'#3BE08A', t:'K', en:'KICK',    mt:'DAQQA',  g:'M4 12h11M15 12l-4-4M15 12l-4 4M18 6v12' },    /* kick   (foot)   */
  [PU.REMOTE]:{ c:'#FFC542', t:'D', en:'REMOTE',  mt:'REMOTE', g:'M12 3v5M8 8h8v11H8zM10 12h4M10 15h4', },      /* remote (detonator) */
  [PU.PIERCE]:{ c:'#C08BFF', t:'P', en:'PIERCE',  mt:'NIFED',  g:'M3 12h18M15 8l4 4-4 4M9 8L5 12l4 4' },        /* pierce (arrows out) */
  [PU.SHIELD]:{ c:'#7BE8E0', t:'H', en:'SHIELD',  mt:'TARKA',  g:'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z' },  /* shield          */
  [PU.MEGA]:  { c:'#FF4A3C', t:'M', en:'MEGA',    mt:'MEGA',   g:'M12 3a6 6 0 1 0 4 10l3 3 2-2-3-3A6 6 0 0 0 12 3z', fill:true } /* mega (big bomb) */
};
/* the short collect-label text for a kind, honouring the app's language. */
function puLabel(kind){ const i = PU_INFO[kind]; return i ? T(i.en, i.mt) : ''; }

/* ═══════════════════════════════════════════════════════════════════
   THE STYLESHEET — injected once, scoped to #scr-party .bm-*
   The arena is a fixed rectangle and the pad + bomb are a fixed strip
   under it; both are laid out by FLEX and never by script, so a rotation
   or a keyboard cannot land the thumb on top of the arena.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('bm-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'bm-runtime-css';
  st.textContent =
    '#scr-party .bm-host{display:flex;flex-direction:column;align-items:center;' +
      'justify-content:flex-start;gap:8px;min-height:0}' +

    /* ── the arena ── */
    '#scr-party .bm-arena{position:relative;flex:0 0 auto;border-radius:14px;overflow:hidden;' +
      'border:2px solid rgba(0,0,0,.55);background:#0B0E14;' +
      'box-shadow:0 10px 26px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.05)}' +
    '#scr-party .bm-arena canvas{display:block;width:100%;height:100%;touch-action:none}' +

    '#scr-party .bm-over{position:absolute;inset:0;display:flex;align-items:center;' +
      'justify-content:center;pointer-events:none;z-index:4}' +
    '#scr-party .bm-cd{font:900 64px/1 var(--disp);color:#fff;letter-spacing:.02em;' +
      'text-shadow:0 4px 18px rgba(0,0,0,.8);transform:scale(1);opacity:.95}' +
    '#scr-party .bm-cd.go{font-size:40px;color:var(--gold,#FFC542)}' +

    /* ── the HUD: one chip per player, repainted on CHANGE only ── */
    '#scr-party .bm-hud{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:5px;' +
      'justify-content:center;width:100%;padding:0 4px;box-sizing:border-box}' +
    '#scr-party .bm-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;' +
      'border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);' +
      'font:900 10px/1 var(--disp);letter-spacing:.05em;color:var(--dim)}' +
    '#scr-party .bm-chip .d{width:9px;height:9px;border-radius:3px;flex:0 0 auto}' +
    '#scr-party .bm-chip b{color:#fff;font-size:11px}' +
    '#scr-party .bm-chip em{font-style:normal;color:var(--gold,#FFC542);font-size:9px;' +
      'letter-spacing:.08em;margin-left:1px}' +
    '#scr-party .bm-chip.me{background:rgba(255,197,66,.13);border-color:rgba(255,197,66,.38)}' +
    '#scr-party .bm-chip.out{opacity:.38}' +
    '#scr-party .bm-chip.out b{text-decoration:line-through}' +

    /* ── THE CONTROL STRIP: pad on one side, bomb on the other. Its own
       strip, under the arena, never over it. 44px+ targets. ── */
    '#scr-party .bm-ctrl{flex:0 0 auto;display:flex;align-items:center;justify-content:center;' +
      'gap:20px;margin:2px 0 4px;width:100%;touch-action:none;' +
      '-webkit-user-select:none;user-select:none}' +
    '#scr-party .bm-ctrl.left{flex-direction:row-reverse}' +

    '#scr-party .bm-pad{display:grid;grid-template-columns:repeat(3,54px);' +
      'grid-template-rows:repeat(3,44px);gap:5px;touch-action:none}' +
    '#scr-party .bm-pad button{-webkit-appearance:none;appearance:none;border:0;padding:0;' +
      'border-radius:13px;background:rgba(255,255,255,.075);color:#E9E4F5;' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);display:flex;align-items:center;' +
      'justify-content:center;touch-action:none}' +
    '#scr-party .bm-pad button svg{width:24px;height:24px;stroke:currentColor;fill:none;' +
      'stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .bm-pad button.on{background:rgba(255,197,66,.26);color:#fff;' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.5)}' +
    '#scr-party .bm-pad .bm-mid{background:none;box-shadow:none;pointer-events:none}' +
    '#scr-party .bm-pad .bm-mid span{width:12px;height:12px;border-radius:50%;' +
      'background:rgba(255,255,255,.13)}' +
    '#scr-party .bm-u{grid-area:1/2/2/3}#scr-party .bm-l{grid-area:2/1/3/2}' +
    '#scr-party .bm-c{grid-area:2/2/3/3}#scr-party .bm-r{grid-area:2/3/3/4}' +
    '#scr-party .bm-d{grid-area:3/2/4/3}' +

    /* the bomb button — big, round, unmistakable, its own hand */
    '#scr-party .bm-bomb{-webkit-appearance:none;appearance:none;border:0;flex:0 0 auto;' +
      'width:96px;height:96px;border-radius:50%;background:radial-gradient(120% 120% at 40% 34%,' +
      '#3A2140 0%,#1B1024 70%,#120A19 100%);color:#fff;position:relative;touch-action:none;' +
      'box-shadow:0 8px 20px rgba(0,0,0,.5),inset 0 0 0 2px rgba(255,197,66,.35),' +
      'inset 0 -8px 16px rgba(0,0,0,.5)}' +
    '#scr-party .bm-bomb svg{width:52px;height:52px}' +
    '#scr-party .bm-bomb .bm-bomb-l{position:absolute;left:0;right:0;bottom:8px;text-align:center;' +
      'font:900 8px/1 var(--disp);letter-spacing:.14em;color:rgba(255,197,66,.85)}' +
    '#scr-party .bm-bomb.on{transform:scale(.94);box-shadow:0 4px 12px rgba(0,0,0,.5),' +
      'inset 0 0 0 2px rgba(255,197,66,.8),inset 0 -6px 14px rgba(0,0,0,.5)}' +
    '#scr-party .bm-bomb[disabled]{opacity:.42;filter:grayscale(.5)}' +
    /* ── PLACE-COOLDOWN VISUAL ──────────────────────────────────────
       The bomb button reads the engine's per-player pcd every frame and
       shows how close the next drop is:
         · COOLING DOWN — a grey wash whose radial SWEEP (conic gradient,
           --cd = progress 0..1 toward ready) wipes away as the cooldown
           recovers, so the player literally watches the next bomb fill in.
           The button dims and the icon greys while it is not ready.
         · NO BOMBS LEFT (capacity used, .empty) — a distinct steady dim +
           amber ring, no sweep: "you're out", not "wait a moment".
         · READY — clean, full colour.
       Reduced motion (.rm) drops the animated sweep for a plain two-state
       dim/ready wash; a tap during cooldown adds a brief .nope nudge cue. */
    '#scr-party .bm-bomb .bm-bomb-cd{position:absolute;inset:0;border-radius:50%;' +
      'pointer-events:none;opacity:0;transition:opacity .12s linear}' +
    '#scr-party .bm-bomb.cooling{color:rgba(233,228,245,.5)}' +
    '#scr-party .bm-bomb.cooling .bm-bomb-cd{opacity:1;' +
      'background:conic-gradient(from -90deg,rgba(10,7,16,.02) 0turn,' +
      'rgba(10,7,16,.62) calc(var(--cd,0) * 1turn),rgba(10,7,16,.62) 1turn)}' +
    '#scr-party .bm-bomb.cooling{box-shadow:0 6px 16px rgba(0,0,0,.5),' +
      'inset 0 0 0 2px rgba(255,197,66,.18),inset 0 -8px 16px rgba(0,0,0,.5)}' +
    '#scr-party .bm-bomb.empty{color:rgba(233,228,245,.45);' +
      'box-shadow:0 6px 16px rgba(0,0,0,.5),inset 0 0 0 2px rgba(255,120,120,.42),' +
      'inset 0 -8px 16px rgba(0,0,0,.5)}' +
    '#scr-party .bm-bomb.empty .bm-bomb-cd{opacity:1;background:rgba(10,7,16,.4)}' +
    '#scr-party .bm-bomb.empty .bm-bomb-l{color:rgba(255,120,120,.75)}' +
    /* ── REMOTE / DETONATE STATE ────────────────────────────────────────
       When the player holds REMOTE and has live (held) bombs, the button is a
       DETONATE: a hot red gradient, an amber "DETONATE" label, and a soft pulse
       so it plainly reads as "press to blow them all". It over-rides the empty/
       cooling washes (a remote detonation ignores the placement cooldown), so
       the player is never told "wait" when a detonation is available. */
    '#scr-party .bm-bomb.detonate{background:radial-gradient(120% 120% at 40% 34%,' +
      '#6A1420 0%,#3A0A12 70%,#22060A 100%);color:#fff;' +
      'box-shadow:0 8px 22px rgba(255,74,60,.35),inset 0 0 0 2px rgba(255,74,60,.7),' +
      'inset 0 -8px 16px rgba(0,0,0,.5)}' +
    '#scr-party .bm-bomb.detonate .bm-bomb-cd{opacity:0}' +
    '#scr-party .bm-bomb.detonate .bm-bomb-l{color:#FF6B5A}' +
    '#scr-party .bm-bomb.detonate:not(.rm){animation:bm-det 1s var(--ease) infinite}' +
    '@keyframes bm-det{0%,100%{box-shadow:0 8px 22px rgba(255,74,60,.35),' +
      'inset 0 0 0 2px rgba(255,74,60,.7),inset 0 -8px 16px rgba(0,0,0,.5)}' +
      '50%{box-shadow:0 8px 26px rgba(255,74,60,.6),' +
      'inset 0 0 0 3px rgba(255,120,90,.95),inset 0 -8px 16px rgba(0,0,0,.5)}}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bm-bomb.detonate{animation:none}}' +
    'body.reduced #scr-party .bm-bomb.detonate{animation:none}' +
    /* reduced motion: no animated sweep — a flat wash while not-ready */
    '#scr-party .bm-bomb.rm.cooling .bm-bomb-cd{background:rgba(10,7,16,.5)}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bm-bomb.cooling .bm-bomb-cd{' +
      'background:rgba(10,7,16,.5)}#scr-party .bm-bomb .bm-bomb-cd{transition:none}}' +
    'body.reduced #scr-party .bm-bomb.cooling .bm-bomb-cd{background:rgba(10,7,16,.5)}' +
    /* a subtle "not yet" nudge when tapped mid-cooldown */
    '#scr-party .bm-bomb.nope{animation:bm-nope .22s var(--ease)}' +
    '@keyframes bm-nope{0%{transform:none}35%{transform:translateX(-3px)}' +
      '70%{transform:translateX(3px)}100%{transform:none}}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bm-bomb.nope{animation:none}}' +
    'body.reduced #scr-party .bm-bomb.nope{animation:none}' +
    '@media (max-height:680px){#scr-party .bm-pad{grid-template-rows:repeat(3,40px)}' +
      '#scr-party .bm-bomb{width:84px;height:84px}#scr-party .bm-bomb svg{width:46px;height:46px}}' +
    '@media (max-height:560px){#scr-party .bm-pad{grid-template-columns:repeat(3,46px);' +
      'grid-template-rows:repeat(3,36px)}#scr-party .bm-bomb{width:74px;height:74px}}' +
    /* landscape: strip beside the arena is handled by the flex host wrapping;
       controls stay a row and shrink */

    /* ── the rules: a panel that HIDES AND SLIDES, SERP's exactly ── */
    '#scr-party .bm-rules{position:absolute;top:0;left:0;right:0;z-index:30;max-height:60%;' +
      'display:flex;flex-direction:column;background:rgba(14,10,20,.97);' +
      'border-bottom:1px solid rgba(255,255,255,.12);border-radius:0 0 16px 16px;' +
      'box-shadow:0 14px 34px rgba(0,0,0,.6);transform:translateY(-102%);opacity:0;' +
      'visibility:hidden;pointer-events:none;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s .3s}' +
    '#scr-party .bm-rules.open{transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
      'transition:transform .3s var(--ease),opacity .3s var(--ease),visibility 0s 0s}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bm-rules{transition:none}}' +
    'body.reduced #scr-party .bm-rules{transition:none}' +
    '#scr-party .bm-rules-h{flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:space-between;gap:8px;padding:10px 14px 6px}' +
    '#scr-party .bm-rules-h h4{margin:0;font:900 12px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--gold,#FFC542)}' +
    '#scr-party .bm-rules-x{width:44px;height:44px;margin:-6px 0;border:0;background:none;' +
      'color:var(--dim);display:flex;align-items:center;justify-content:center}' +
    '#scr-party .bm-rules-x svg{width:16px;height:16px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round}' +
    '#scr-party .bm-rules-b{min-height:0;overflow-y:auto;padding:2px 14px 14px;' +
      '-webkit-overflow-scrolling:touch}' +
    '#scr-party .bm-rules-b ul{margin:0;padding:0}' +
    '#scr-party .bm-rules-b li{font-size:12px;line-height:1.6;color:var(--dim);' +
      'list-style:none;margin:0 0 7px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .bm-rules-b li:before{content:"";position:absolute;left:0;top:7px;width:5px;' +
      'height:5px;border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .bm-rules-b b{color:#fff}' +

    /* ── the menu, SERP/poker chrome ── */
    '#scr-party .bm-menu .bm-hero{position:relative;display:flex;align-items:center;' +
      'justify-content:center;height:118px;margin:2px 0 12px;border-radius:16px;overflow:hidden;' +
      'background:radial-gradient(120% 90% at 50% 30%,#3A1E2E 0%,#1E1119 52%,#0A0710 100%);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),inset 0 -16px 30px rgba(0,0,0,.45)}' +
    '#scr-party .bm-menu .bm-hero canvas{display:block}' +
    '#scr-party .bm-menu .bm-hero-cap{position:absolute;right:10px;bottom:8px;' +
      'font:900 10px/1 var(--disp);letter-spacing:.12em;color:rgba(255,255,255,.42)}' +
    '@media (max-height:520px){#scr-party .bm-menu .bm-hero{height:88px}}' +

    /* the map picker: a scroll row of tiles */
    '#scr-party .bm-maps{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;' +
      '-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
    '#scr-party .bm-maps::-webkit-scrollbar{display:none}' +
    '#scr-party .bm-map{flex:0 0 auto;width:96px;border:0;border-radius:14px;padding:8px 8px 9px;' +
      'background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);' +
      'display:flex;flex-direction:column;align-items:stretch;gap:6px;text-align:left}' +
    '#scr-party .bm-map.on{background:rgba(255,197,66,.14);' +
      'box-shadow:inset 0 0 0 1px rgba(255,197,66,.5)}' +
    '#scr-party .bm-map canvas{display:block;width:80px;height:80px;border-radius:9px;' +
      'background:#0B0E14}' +
    '#scr-party .bm-map b{font:900 11px/1 var(--disp);letter-spacing:.05em;color:#fff;' +
      'display:flex;align-items:center;justify-content:space-between;gap:4px}' +
    '#scr-party .bm-map-cap{font:900 8px/1 var(--disp);letter-spacing:.06em;' +
      'color:var(--gold,#FFC542);background:rgba(255,197,66,.14);border-radius:6px;' +
      'padding:2px 4px;flex:0 0 auto}' +
    '#scr-party .bm-map i{font:700 9px/1.3 var(--body);color:var(--dim2);font-style:normal;' +
      'display:block;min-height:22px}' +

    '#scr-party .bm-step{display:flex;align-items:center;justify-content:space-between;gap:10px;' +
      'padding:6px 10px;border-radius:14px;background:rgba(255,255,255,.05);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}' +
    '#scr-party .bm-step .v{font:900 24px/1 var(--disp);color:#fff;display:flex;' +
      'flex-direction:column;align-items:center;gap:3px}' +
    '#scr-party .bm-step .v i{font:900 9px/1 var(--disp);letter-spacing:.1em;' +
      'text-transform:uppercase;color:var(--dim);font-style:normal}' +
    '#scr-party .bm-rnd{width:46px;height:46px;border-radius:50%;border:0;' +
      'background:rgba(255,255,255,.09);color:#fff;font:900 22px/1 var(--disp)}' +
    '#scr-party .bm-rnd[disabled]{opacity:.3}' +

    /* the fold at the bottom of the menu — SERP's, renamed */
    '#scr-party .bm-fold-h{width:100%;display:flex;align-items:center;justify-content:space-between;' +
      'gap:8px;padding:12px 2px;border:0;background:none;color:#fff;text-align:left}' +
    '#scr-party .bm-fold-h b{font:900 11px/1.3 var(--disp);letter-spacing:.06em;' +
      'text-transform:uppercase}' +
    '#scr-party .bm-fold-h i{font:900 9px/1 var(--disp);letter-spacing:.1em;color:var(--dim);' +
      'font-style:normal;flex:0 0 auto}' +
    '#scr-party .bm-fold-b{display:grid;grid-template-rows:0fr;' +
      'transition:grid-template-rows .28s var(--ease)}' +
    '#scr-party .bm-fold-b.open{grid-template-rows:1fr}' +
    '#scr-party .bm-fold-i{overflow:hidden;min-height:0}' +
    '#scr-party .bm-fold-i .bm-fold-c{transform:translateY(-10px);opacity:0;' +
      'transition:transform .28s var(--ease),opacity .28s var(--ease)}' +
    '#scr-party .bm-fold-b.open .bm-fold-i .bm-fold-c{transform:none;opacity:1}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .bm-fold-b,' +
      '#scr-party .bm-fold-i .bm-fold-c{transition:none}}' +
    'body.reduced #scr-party .bm-fold-b,body.reduced #scr-party .bm-fold-i .bm-fold-c' +
      '{transition:none}' +
    '#scr-party .bm-fold-c li{font-size:12px;line-height:1.6;color:var(--dim);list-style:none;' +
      'margin:0 0 7px;padding:0 0 0 13px;position:relative}' +
    '#scr-party .bm-fold-c li:before{content:"";position:absolute;left:0;top:7px;width:5px;' +
      'height:5px;border-radius:2px;background:var(--gold,#FFC542);opacity:.75}' +
    '#scr-party .bm-fold-c b{color:#fff}' +

    /* ── THE ENTRY MODE PICKER — the first screen. Big, few, clean. ── */
    '#scr-party .bm-modes{display:flex;flex-direction:column;gap:11px;margin:6px 0 8px}' +
    '#scr-party .bm-mode{-webkit-appearance:none;appearance:none;border:0;text-align:left;' +
      'display:flex;align-items:center;gap:13px;padding:16px 16px;border-radius:16px;' +
      'background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);' +
      'color:#fff}' +
    '#scr-party .bm-mode .bm-mi{flex:0 0 auto;width:40px;height:40px;display:flex;' +
      'align-items:center;justify-content:center;border-radius:12px;' +
      'background:rgba(255,255,255,.07)}' +
    '#scr-party .bm-mode .bm-mi svg{width:24px;height:24px;stroke:currentColor;fill:none;' +
      'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}' +
    '#scr-party .bm-mode .bm-mt{display:flex;flex-direction:column;gap:2px;min-width:0}' +
    '#scr-party .bm-mode .bm-mt b{font:900 15px/1.1 var(--disp);letter-spacing:.04em}' +
    '#scr-party .bm-mode .bm-mt i{font:600 11.5px/1.35 var(--body);color:var(--dim);' +
      'font-style:normal}' +
    '#scr-party .bm-mode.primary{background:linear-gradient(180deg,rgba(255,197,66,.2),' +
      'rgba(255,197,66,.06));box-shadow:inset 0 0 0 1px rgba(255,197,66,.42),' +
      '0 8px 20px rgba(255,197,66,.14)}' +
    '#scr-party .bm-mode.primary .bm-mi{background:rgba(255,197,66,.2);color:var(--gold,#FFC542)}' +
    '#scr-party .bm-mode.primary .bm-mt b{color:var(--gold,#FFC542)}' +
    '#scr-party .bm-mode:active{transform:translateY(1px)}' +
    '#scr-party .bm-mode .bm-mchev{margin-left:auto;flex:0 0 auto;color:var(--dim2)}' +
    '#scr-party .bm-mode .bm-mchev svg{width:18px;height:18px;stroke:currentColor;fill:none;' +
      'stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}';
  document.head.appendChild(st);
}

/* ── the shelf mark. One symbol, injected once (SERP's injectDefs). ── */
function injectDefs(){
  if (document.getElementById('bm-defs') || !document.body) return;
  const d = document.createElement('div');
  d.id = 'bm-defs';
  d.setAttribute('aria-hidden', 'true');
  d.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  d.innerHTML =
    '<svg width="0" height="0" focusable="false">' +
    '<symbol id="bm-t-bomba" viewBox="0 0 24 24">' +
      '<circle cx="11" cy="15" r="6.4" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
      '<path d="M14.8 9.6l2-2M17 6.2l.9-1.9 1.9.9-.9 1.9z" fill="none" stroke="currentColor" ' +
        'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="8.7" cy="12.8" r="1.5" fill="currentColor" stroke="none"/>' +
    '</symbol></svg>';
  document.body.appendChild(d);
}

/* ═══════════════════════════════════════════════════════════════════
   THE RUNNER — M is the whole live game.
   ═══════════════════════════════════════════════════════════════════ */
let M = null;
let UI = null;
const moveSubs = [];
function fire(list, a){ for (const f of list.slice()){ try { f(a); } catch(e){} } }

const nowMs = () => (typeof performance !== 'undefined' && performance.now)
                      ? performance.now() : Date.now();

/* tick period in ms, from the engine's SIM_HZ */
const TICK_MS = 1000 / E.SIM_HZ;                 /* 62.5 at 16Hz */
/* the input byte's drop bit, read off the engine's own encoder so the two
   can never drift (bomba.js encodeInput: bit 3) */
const DROP_BIT = E.encodeInput({ dir: -1, drop: true });
/* the countdown before a round: three beats and a GO */
const LEAD_MS = 2400;

function mapDef(id){ return E.MAPS[id] || E.MAPS.arena; }
/* how many seats a map can spawn — the ceiling the lobby clamps chairs to
   when this map is the room's chosen variant (Duell spawns two). */
function mapSpawnCount(id){
  try { return E.parseMap(mapDef(id)).spawns.length; } catch(e){ return E.MAX_SEATS; }
}

/* ═══════════════════════════════════════════════════════════════════
   START A MATCH
   opts: { map, seats, lvl }. `net` is null offline.
   ═══════════════════════════════════════════════════════════════════ */
function startMatch(opts, seed, net){
  stopLoop();
  const o = Object.assign({ map:'arena', seats:4, lvl:2 }, opts || {});
  /* THE "MORE THAN 4 => BIGGER MAP" RULE, applied at the one chokepoint so
     every entry (solo, online lobby start, replay) obeys it: if the chosen
     map cannot seat everyone, grow to a large arena that can. Deterministic
     (E.mapForSeats), so the host's phone and the guests' all resolve the
     identical map for the identical seat count — the lockstep cannot fork
     on a map choice. */
  const wantSeats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, o.seats | 0 || 4));
  o.map = (E.mapForSeats ? E.mapForSeats(o.map, wantSeats) : o.map);
  const md = mapDef(o.map);
  const parsed = E.parseMap(md);
  const seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS,
    Math.min(wantSeats, parsed.spawns.length)));

  M = {
    opts: o,
    seed: (seed == null ? E.freshSeed() : seed) | 0,
    st: null,
    net: net || null,
    me: 0,                        /* which seat this phone drives         */
    mine: [],                     /* seats THIS phone is authoritative over */
    meta: [],
    /* the input-delay pipeline. D is the delay in ticks; buf[tick] is a
       full frame (byte per seat) once every seat's byte for that tick is
       in hand. local[] is what the thumb wants right now. */
    D: 3,
    buf: {},                      /* tick -> { bytes:[], have:{seat:1}, n }  */
    committed: -1,                /* last tick actually stepped              */
    lastSent: {},                 /* seat -> last byte we shipped (for repeat) */
    /* ── THE THRIFTY WIRE (tankijiet's fix, ported — see say()/advance()).
       Shipping one message per tick per phone (16Hz) drained the relay's
       per-room fan bucket (40 msg/s sustained) the moment a third chair sat
       down: the relay then DROPS bytes and the lockstep starves forever
       (measured: every 4-seat room froze at ~tick 50). So a byte ships only
       on a CHANGE plus a wall-clock keepalive, and silence provably means
       "unchanged".
       ship  — outbound: lastByte/lastTick = last byte actually SHIPPED and
               the tick it took effect; hiTick = highest tick committed for
               our own seat; lastMs paces the keepalive.
       known — per REMOTE seat, the highest tick heard from it: a message
               {tick,byte} means "my byte is `byte` from `tick` onward", so
               hearing tick T proves every change ≤ T already arrived (the
               transport is ordered) and silence up to T = unchanged.
       cur   — per REMOTE seat, its byte as of the last committed tick. */
    ship: { lastByte: null, lastTick: -1, hiTick: -1, lastMs: 0 },
    known: {}, cur: {},
    shipGap: 3, shipHbMs: 250,
    want: { dir: E.NO_DIR, drop: false },   /* the thumb, sampled each tick  */
    skins: {},                    /* seat → exclusive-set wire byte (§KING)  */
    heldDir: E.NO_DIR,            /* which pad button is held down           */
    t0: 0,                        /* nowMs() of tick 0                       */
    raf: 0, dead: false, finished: false,
    fps: { n:0, at:0, val:0 },
    stall: 0,                     /* frames we have waited for a missing input */
    gone: {},                     /* game seats whose chair the relay freed:
                                     no more bytes will ever arrive, so these
                                     are the ONLY seats we may predict for —
                                     every phone predicts them identically
                                     from the same applied history. */
    lead: LEAD_MS,
    ledSaid: -1,
    /* floating "collect" labels: {seat,text,col,c,born} spawned when a
       player picks a power-up up, drawn rising+fading over them. Draw-only,
       never read by the sim. */
    labels: []
  };
  M.st = E.newMatch({ map: md, seats, humans: net ? undefined : 1, lvl: o.lvl }, M.seed);
  return M;
}

/* ═══════════════════════════════════════════════════════════════════
   INPUT DELAY, MEASURED
   D comes from the engine's delayTicks(), fed by js/mp.js's pingStats.
   Offline there is no round trip, so D is the engine's floor (2) — the
   input still lands two ticks late, which keeps solo and online feeling
   identical rather than tuning the game to a network that is not there.
   Recomputed on start and, online, refreshed as the radio is re-measured.
   ═══════════════════════════════════════════════════════════════════ */
function measureD(){
  if (!M) return 2;
  if (!M.net){
    /* offline: the engine's minimum. Deterministic, no clock read. */
    return E.delayTicks(0, 0);
  }
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
  return E.delayTicks(120, 40);    /* a safe guess until the radio speaks */
}

/* the buffer slot for a tick, created on demand */
function slot(tick){
  let s = M.buf[tick];
  if (!s){
    s = M.buf[tick] = { bytes: new Array(M.st.players.length).fill(null), have:{}, n:0 };
  }
  return s;
}
/* record a seat's input byte for a tick (idempotent — the first write wins,
   so a duplicate off the wire cannot corrupt a committed frame) */
function putInput(tick, seat, byte){
  if (tick <= M.committed) return;          /* too late, already stepped */
  const s = slot(tick);
  if (s.have[seat]) return;
  s.bytes[seat] = byte | 0;
  s.have[seat] = 1;
  s.n++;
}
/* how many seats must a frame have before it can run (living seats this
   phone is NOT authoritative for, plus our own — i.e. everyone). We fill
   AI and our own locally, so only genuine NET seats can be missing. */
function seatsNeeded(){ return M.st.players.length; }

/* ═══════════════════════════════════════════════════════════════════
   THE CLOCK — one rAF loop. Paces the fixed tick off wall time; only
   COMMITS a tick when its frame is complete. A backgrounded tab comes
   back owing many ticks: those are caught up (bounded), never replayed
   into a wall, and if inputs are missing we predict (repeat last) rather
   than freeze — the deterministic rule the engine documents.
   ═══════════════════════════════════════════════════════════════════ */
const MAX_CATCHUP = 6;

function stopLoop(){
  if (M && M.raf){ cancelAnimationFrame(M.raf); M.raf = 0; }
}
function startLoop(){
  if (!M || M.raf) return;
  M.D = measureD();
  /* THE WIRE BUDGET scales with the table (tankijiet's fix, ported): the
     relay's per-room fan bucket is 40 msg/s sustained / 80 burst (server
     L.FAN_RATE) and one bucket token per relayed message — so per-tick
     sending at 16Hz × 3+ seats drains it in seconds flat and every phone
     freezes waiting on a byte the relay dropped. shipGap floors the ticks
     between APPLIED input changes; shipHbMs paces the keepalive. Worst
     case ≈ n·16/gap ≤ 26/s, under the bucket with room for the chat. */
  if (M.net){
    /* 26 Aug 2026 — the relay's per-room bucket was RAISED (FAN_RATE 40 -> 160)
       because the old ceiling sat right on top of these numbers: a 4-seat room
       ran at ~37/s against 40/s, so bytes got refused, and every refusal cost
       the room a whole keepalive of freeze. The note above under-counted: it
       omitted the keepalive, which is most of the traffic when thumbs are
       still. With real headroom we can be both SNAPPIER (a smaller gap lands
       input changes sooner) and QUICKER TO HEAL (a faster keepalive unblocks a
       peer in ~150ms instead of 250-400ms). Worst case now, 6 seats:
       6 x (16/3 + 1000/200) ≈ 62/s — comfortably inside 160, with room for
       chat and a rejoin storm. */
    const n = M.st.players.length;
    M.shipGap  = n <= 4 ? 2 : n <= 6 ? 3 : 4;
    M.shipHbMs = n <= 5 ? 150 : 200;
  }
  /* PRIME THE PIPELINE, online: commit an explicit stand-still byte for our
     seat for ticks 0..D-1. commitLocal() only ever commits N+D, so these
     first D ticks would otherwise never leave this phone — and a peer that
     (correctly, see advance) WAITS for every live seat's byte would block
     on tick 0 forever. Only tick 0 actually SHIPS — one message that tells
     every peer "byte 0 from tick 0"; the rest ride the silence rule (an
     unchanged byte, watermark advanced by the keepalive). Idempotent via
     commitByte's guard. */
  if (M.net) for (let pt = 0; pt < M.D; pt++) commitByte(pt, M.me, 0);
  M.t0 = nowMs() + M.lead;
  const step = t => {
    if (!M || M.dead) return;
    M.raf = requestAnimationFrame(step);
    frame(t);
  };
  M.raf = requestAnimationFrame(step);
}

function frame(t){
  const st = M.st;
  const now = (t == null) ? nowMs() : t;

  /* the countdown, before tick 1 */
  if (now < M.t0){
    const left = M.t0 - now;
    const beat = Math.ceil(left / 800);
    if (beat !== M.ledSaid){
      M.ledSaid = beat;
      const S = window.KARTI_SFX;
      if (S && S.note) { try { S.note(4 - beat); } catch(e){} }
      paintCountdown(beat);
    }
    draw(0);
    meter(now);
    return;
  }
  if (M.ledSaid !== 0){
    M.ledSaid = 0;
    paintCountdown(0);
    cue('game.start', { gain:0.85 }, true);
  }

  if (M.finished){ draw(1); meter(now); return; }

  /* the KEEPALIVE runs from the frame, not from advance(): while this phone
     WAITS on a slow peer, advance() returns false — but the peer may in turn
     be waiting on OUR watermark, so the pulse must keep flowing on wall time
     or two stalled phones deadlock each other. */
  if (M.net) shipPulse();

  /* which tick wall-time says we should have reached */
  const want = Math.floor((now - M.t0) / TICK_MS) + 1;
  if (want - (M.committed + 1) > MAX_CATCHUP){
    /* we were away — move the clock's origin, do not fast-forward into
       a blast nobody was steering out of */
    M.t0 = now - ((M.committed + 1) * TICK_MS);
  } else {
    let guard = 0;
    while (M.committed + 1 <= want && guard++ < MAX_CATCHUP){
      if (!advance()) break;              /* blocked waiting on a peer */
    }
  }

  const frac = M.finished ? 1
    : Math.max(0, Math.min(1, (now - M.t0) / TICK_MS - (M.committed + 1)));
  draw(noMotion() ? 1 : frac);
  meter(now);
}

/* the frame rate, measured rather than assumed */
function meter(now){
  const f = M.fps;
  f.n++;
  if (!f.at) f.at = now;
  else if (now - f.at >= 1000){
    f.val = Math.round(f.n * 1000 / (now - f.at));
    f.n = 0; f.at = now;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ADVANCE ONE TICK — the heart of the lockstep.
     · the tick we are about to run is N = committed + 1.
     · sample OUR seat (and any AI/hot seats this phone owns) and commit
       their bytes for tick N + D, then ship ours.
     · assemble the frame for N: our owned seats are always present; NET
       seats must have arrived. If a NET seat is missing, we wait (up to
       a cap), then PREDICT it (repeat its last byte) so a slow phone
       stalls the room identically rather than forking it.
     · step the engine on the assembled frame — the identical pure
       function on every phone.
   Returns true if it stepped, false if it is blocking on a peer.
   ═══════════════════════════════════════════════════════════════════ */
/* NOTE: there is deliberately NO stall cap for LIVE seats any more — see
   advance(). Predicting a live seat's in-flight byte after a fixed wait was
   a genuine desync (the sender stepped on the real byte, we stepped on a
   guess, and nothing ever reconciled). M.stall now only counts frames for
   the HUD; the wait itself lasts until the byte lands or the chair is freed. */

function advance(){
  const st = M.st;
  const N = M.committed + 1;

  /* 1 — sample and COMMIT our owned seats for tick N + D. Sampling only
     at a cell centre for MOVE keeps the feel crisp; the drop is sampled
     whenever it is pressed and cleared after. */
  commitLocal(N + M.D);

  /* 2 — assemble tick N. Owned seats: fill from the buffer (committed
     above at N when N+D reached N — for the first D ticks nothing local
     was committed, so those bytes are 0 = stand still, which is correct:
     the input lag IS D ticks). AI seats we own: fill from aiInput now.
     NET seats: must be present, else predict. */
  const s = slot(N);
  const need = [];
  for (let i = 0; i < st.players.length; i++){
    if (s.have[i]) continue;
    const pl = st.players[i];
    if (M.mine.indexOf(i) >= 0){
      /* an owned seat with nothing committed for this tick = stand still
         (dir none, no drop). AI owned seats are computed here, live. */
      if (pl.own === 'ai') putInput(N, i, E.aiInput(st, i));
      else putInput(N, i, 0);
    } else {
      need.push(i);                       /* a NET seat we are waiting on */
    }
  }

  if (need.length){
    /* THE LOCKSTEP RULE, corrected and made thrifty (tankijiet's form): a
       seat whose chair the relay has FREED (seatGone) is PREDICTED
       identically on every phone. A LIVE seat rides the silence rule: a
       peer ships a byte only when it CHANGES (plus a keepalive), so a
       missing byte at tick N with the seat's watermark at or past N
       provably means "unchanged" — every change ≤ N would already have
       arrived on the ordered transport — and we repeat its current byte,
       exactly as the sender committed it. A watermark still SHORT of N is
       a byte genuinely in flight: we WAIT, the room runs at the pace of
       its slowest link, in step, which is the whole contract of lockstep.
       (The keepalive in frame() advances the watermark on wall time, so
       waiting cannot deadlock.) */
    let waiting = 0;
    for (const i of need){
      if (M.gone[i]) putInput(N, i, E.predictInput(st.players[i]));
      else if ((M.known[i] !== undefined ? M.known[i] : -1) >= N) putInput(N, i, M.cur[i] | 0);
      else waiting++;
    }
    if (waiting){ M.stall++; return false; }
  }
  M.stall = 0;

  /* 3 — step. The frame is one byte per seat in seat order. */
  const s2 = M.buf[N];
  const bytes = s2.bytes.slice();
  /* remember every remote seat's byte as-of this tick — the silence rule
     above repeats it until that seat's next explicit change arrives */
  for (let i = 0; i < st.players.length; i++)
    if (M.mine.indexOf(i) < 0) M.cur[i] = bytes[i] | 0;
  const before = { alive: st.players.map(p => p.alive),
                   blocks: countBlocks(st), item: st.item.slice() };
  E.step(st, bytes);
  M.committed = N;
  delete M.buf[N];
  afterStep(before);
  return true;
}

/* sample the local seat's intended input and COMMIT it for a future tick.
   Only our human seat is sampled from the thumb; if we own AI seats we do
   NOT pre-commit them (they are computed live at their own tick, above),
   because an AI's move depends on the world at THAT tick, not this one. */
function commitLocal(tick){
  if (tick <= M.committed) return;
  const me = M.me;
  if (M.mine.indexOf(me) < 0) return;
  const pl = M.st.players[me];
  if (!pl || !pl.alive){ commitByte(tick, me, 0); return; }

  /* MOVE: only change direction at a cell centre, else keep walking the
     held direction — this matches the engine's own "decide at centre"
     and stops a held button stuttering. DROP: whenever pressed. */
  let dir = M.heldDir;
  if (pl.ox === 0 && pl.oy === 0){
    dir = M.heldDir;                      /* a fresh choice is allowed */
  }
  const drop = M.want.drop;
  let byte = E.encodeInput({ dir, drop });
  /* ONLINE the applied change rate is FLOORED at shipGap ticks: a sample
     that differs from the last shipped byte before the gap has passed is
     HELD (the old byte is committed instead), so every change that DOES
     apply ships the very tick it applies and the wire never exceeds
     ~16/gap msg/s per phone — the relay's per-room fan bucket (40/s) is
     the hard ceiling this respects. Local commit and remote derivation
     stay bit-identical by construction. (A drop bit repeated by the hold
     is harmless: the engine's drop is edge-triggered — bomba.js step 1.) */
  if (M.net){
    const sh = M.ship;
    if (sh.lastByte !== null && byte !== sh.lastByte && tick - sh.lastTick < M.shipGap)
      byte = sh.lastByte;                /* hold the change one more tick */
  }
  /* the drop is consumed ONLY when it actually rides a byte that commits:
     held back by the ship gap (or landing on an already-committed tick — a
     blocked advance retries this), it stays wanted for the next commit */
  if (drop && (byte & DROP_BIT) && !slot(tick).have[me]) M.want.drop = false;
  commitByte(tick, me, byte);
}

/* commit one of our bytes and ship it ONLY IF IT CHANGED — silence means
   "unchanged", which the keepalive (shipPulse) turns into a provable
   statement. The have-guard matters now that a blocked advance() retries
   every frame: without it a byte re-sampled mid-wait could ship a value the
   local slot never committed, forking the room. */
function commitByte(tick, seat, byte){
  if (tick <= M.committed) return;
  const s = slot(tick);
  if (s.have[seat]) return;              /* already committed (+shipped)  */
  putInput(tick, seat, byte);
  M.lastSent[seat] = byte;
  if (!M.net || seat !== M.me) return;
  const sh = M.ship;
  if (tick > sh.hiTick) sh.hiTick = tick;
  if (sh.lastByte === null || byte !== sh.lastByte){
    sh.lastByte = byte; sh.lastTick = tick; sh.lastMs = nowMs();
    say(seat, tick, byte);
  }
}

/* THE KEEPALIVE — from frame(), on wall time. Re-states the unchanged byte
   at the highest tick we have committed, so every peer's watermark for our
   seat keeps advancing even while the thumb is still (and even while our
   own advance() is stalled waiting on somebody else). */
function shipPulse(){
  const sh = M.ship;
  if (sh.lastByte === null) return;      /* nothing primed yet            */
  if (sh.hiTick <= sh.lastTick) return;  /* nothing new to confirm        */
  if (nowMs() - sh.lastMs < M.shipHbMs) return;
  sh.lastTick = sh.hiTick; sh.lastMs = nowMs();
  say(M.me, sh.hiTick, sh.lastByte);
}

function countBlocks(st){
  let n = 0; for (let i = 0; i < st.block.length; i++) if (st.block[i]) n++;
  return n;
}

/* react to what a tick changed — sounds and the HUD, on CHANGE only */
function afterStep(before){
  const st = M.st;
  let died = false, iDied = false, blast = false, pick = false;
  for (let i = 0; i < st.players.length; i++){
    if (before.alive[i] && !st.players[i].alive){
      died = true;
      if (i === M.me) iDied = true;
    }
  }
  /* a block came down or a bomb went off this tick? blasts are live now */
  if (countBlocks(st) < before.blocks) blast = true;
  if (!blast) for (const bl of st.blasts) if (bl.life === E.BLAST_LIFE){ blast = true; break; }
  /* a power-up we could see was taken */
  for (let i = 0; i < st.item.length; i++) if (before.item[i] && !st.item[i]){ pick = true; break; }

  /* float a "collect" label over anyone who grabbed a power-up THIS tick.
     The engine leaves a read-only breadcrumb (pl.gotItem/gotTick); we name
     it. Reduced motion is honoured in the draw (a static chip, no rise). */
  for (const pl of st.players){
    if (pl.gotItem && pl.gotTick === M.committed){
      const txt = puLabel(pl.gotItem);
      if (txt) M.labels.push({ seat: pl.seat, kind: pl.gotItem, text: txt,
                               col: pl.col, row: pl.row, born: nowMs() });
      if (M.labels.length > 24) M.labels.shift();   /* bound the list */
    }
  }

  if (blast) cue('duel.attack', { gain:0.5 });
  if (pick && !iDied) cue('ui.coin', { gain:0.5 });
  if (died){
    cue(iDied ? 'duel.destroy' : 'piece.capture', { gain: iDied ? 0.85 : 0.4 }, iDied);
    if (iDied && M.ctx) P.ui.setTurn(M.ctx, {
      cls:'bad', who: T('You are out', 'Int barra'),
      note: T('The blast caught you.', 'Il-blast qabdek.')
    });
    hud();
  }
  if (!M.finished && E.over(st)) finish();
}

/* ═══════════════════════════════════════════════════════════════════
   THE CANVAS — fitCanvas() is the ONLY layout read, on mount and resize.
   ═══════════════════════════════════════════════════════════════════ */
function fitCanvas(){
  if (!UI || !UI.cv || !UI.arena) return;
  const mp = M.st.map;
  const host = UI.host;
  const ctrlH = UI.ctrl ? UI.ctrl.offsetHeight : 130;
  const hudH  = UI.hud ? UI.hud.offsetHeight : 24;
  const availW = Math.max(160, host.clientWidth - 8);
  const availH = Math.max(160, host.clientHeight - ctrlH - hudH - 26);
  /* the arena keeps the map's aspect ratio; cell is the largest whole
     number of px that fits both axes, so no seam falls on a half pixel */
  const cell = Math.max(6, Math.floor(Math.min(availW / mp.cols, availH / mp.rows)));
  const w = cell * mp.cols, h = cell * mp.rows;

  UI.cell = cell;
  UI.w = w; UI.h = h;
  UI.arena.style.width = w + 'px';
  UI.arena.style.height = h + 'px';

  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const pxW = Math.round(w * dpr), pxH = Math.round(h * dpr);
  if (UI.cv.width !== pxW || UI.cv.height !== pxH){
    UI.cv.width = pxW; UI.cv.height = pxH;
  }
  UI.dpr = dpr;
  UI.g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  UI.dirtyBg = true;
}

/* the arena floor + the indestructible pillars, painted once into an
   offscreen canvas: neither changes except in sudden death, which flips
   dirtyBg when it seals a cell. */
function bg(){
  const w = UI.w, h = UI.h, cell = UI.cell, st = M.st, mp = st.map;
  if (!UI.bgc) UI.bgc = document.createElement('canvas');
  const dpr = UI.dpr;
  UI.bgc.width = Math.round(w * dpr);
  UI.bgc.height = Math.round(h * dpr);
  const g = UI.bgc.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* floor — THE BLAST KING's arena (local choice, a shared surface) is
     embers under the stone; stock is the cool blue night */
  const fireArena = xEq('arena');
  const grd = g.createRadialGradient(w / 2, h * 0.34, 0, w / 2, h * 0.5, Math.max(w, h) * 0.7);
  if (fireArena){ grd.addColorStop(0, '#361708'); grd.addColorStop(1, '#120503'); }
  else { grd.addColorStop(0, '#17202E'); grd.addColorStop(1, '#0A0E15'); }
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  /* faint grid */
  g.strokeStyle = fireArena ? 'rgba(255,160,70,.06)' : 'rgba(255,255,255,.035)';
  g.lineWidth = 1;
  for (let c = 1; c < mp.cols; c++){ const p = Math.round(c * cell) + 0.5;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke(); }
  for (let r = 1; r < mp.rows; r++){ const p = Math.round(r * cell) + 0.5;
    g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
  /* the pillars — solid, bevelled, unmistakably permanent */
  for (let r = 0; r < mp.rows; r++) for (let c = 0; c < mp.cols; c++){
    if (!mp.pillar[r * mp.cols + c]) continue;
    drawPillar(g, c * cell, r * cell, cell);
  }
  UI.dirtyBg = false;
}

function drawPillar(g, x, y, cell){
  const pad = Math.max(0.5, cell * 0.04);
  g.fillStyle = '#39435A';
  roundRect(g, x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.14); g.fill();
  g.fillStyle = 'rgba(255,255,255,.10)';
  roundRect(g, x + pad, y + pad, cell - pad * 2, (cell - pad * 2) * 0.4, cell * 0.14); g.fill();
  g.fillStyle = 'rgba(0,0,0,.28)';
  roundRect(g, x + pad, y + cell * 0.6, cell - pad * 2, (cell - pad * 2) * 0.38, cell * 0.1); g.fill();
}

/* ── draw one frame ───────────────────────────────────────────────
   `f` is 0..1 between the last committed tick and the next. Players are
   drawn at their committed cell plus their fixed-point sub-offset; the
   engine's ox/oy already carry them PART of the way toward the next
   cell within the current tick, and `f` continues that motion smoothly
   to the next tick's position so 16Hz reads continuous. */
function draw(f){
  if (!UI || !UI.g2 || !M) return;
  const st = M.st, g = UI.g2, cell = UI.cell, w = UI.w, h = UI.h;
  const now = nowMs();

  if (UI.dirtyBg || !UI.bgc) bg();
  g.clearRect(0, 0, w, h);
  g.drawImage(UI.bgc, 0, 0, w, h);

  /* ── destructible blocks ── */
  for (let r = 0; r < st.map.rows; r++) for (let c = 0; c < st.map.cols; c++){
    if (!st.block[r * st.map.cols + c]) continue;
    drawBlock(g, c * cell, r * cell, cell);
  }

  /* ── power-ups (revealed items) ── */
  const bob = noMotion() ? 0 : Math.round(Math.sin(now / 240) * cell * 0.05);
  for (let i = 0; i < st.item.length; i++){
    const kind = st.item[i]; if (!kind) continue;
    const c = i % st.map.cols, r = (i / st.map.cols) | 0;
    drawPowerup(g, c * cell, r * cell + bob, cell, kind, now);
  }

  /* ── DANGER TELEGRAPH — the tiles every live bomb's blast will hit, so a
     player (above all, the one who just dropped a bomb) can see where NOT to
     stand and get out. Painted UNDER the bombs/blasts so they read on top.
     Purely a render overlay: the tiles come from the engine's read-only
     dangerMap (blast cross derived from bomb range/walls/pierce/chains); it
     changes NOTHING in the sim. ── */
  if (st.bombs.length) drawDanger(g, st, cell, now);

  /* ── bombs, with a shrinking fuse ── */
  for (const b of st.bombs) drawBomb(g, b, cell, now);

  /* ── the blast cross ── */
  for (const bl of st.blasts) drawBlast(g, bl, cell, now);

  /* ── the players (dead first, so the living draw over the fade) ── */
  for (let pass = 0; pass < 2; pass++){
    for (let i = 0; i < st.players.length; i++){
      const pl = st.players[i];
      if ((pass === 0) !== !pl.alive) continue;
      drawPlayer(g, pl, f, cell, now);
    }
  }

  /* ── floating "collect" labels, on top of everyone ── */
  drawLabels(g, cell, now);

  /* ── the bomb button's cooldown/capacity visual (draw-only) ── */
  paintBombBtn();
}

/* the rising/fading "SPEED!"/"+BOMB" text over a player who just grabbed a
   power-up. Draw-only: it reads M.labels, which afterStep filled from the
   engine's read-only pl.gotItem breadcrumb. Reduced motion: a STATIC chip
   (no rise, no fade ramp) held for its life then dropped — no animation. */
const LABEL_LIFE = 950;      /* ms a collect label lives */
function drawLabels(g, cell, now){
  if (!M || !M.labels || !M.labels.length) return;
  const still = noMotion();
  const kept = [];
  for (const L of M.labels){
    const age = now - L.born;
    if (age >= LABEL_LIFE) continue;                 /* expired: drop it */
    kept.push(L);
    const t = age / LABEL_LIFE;                       /* 0..1 */
    const info = PU_INFO[L.kind] || { c:'#fff' };
    /* anchor over the player's cell centre; rise up to ~0.7 cell over life */
    const cx = (L.col + 0.5) * cell;
    const baseY = (L.row + 0.5) * cell - cell * 0.55;
    const cy = still ? baseY : baseY - t * cell * 0.7;
    /* alpha: pop in fast, hold, fade out at the end (static = full then cut) */
    const alpha = still ? 1 : (t < 0.15 ? t / 0.15 : (t > 0.7 ? (1 - (t - 0.7) / 0.3) : 1));
    const fs = Math.max(11, Math.round(cell * 0.42));
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, alpha));
    g.font = '800 ' + fs + 'px system-ui,-apple-system,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(L.text).width;
    const padX = fs * 0.5, padY = fs * 0.28;
    const bw = tw + padX * 2, bh = fs + padY * 2;
    /* dark chip so the label reads over any tile */
    g.fillStyle = 'rgba(12,14,20,.82)';
    roundRect(g, cx - bw / 2, cy - bh / 2, bw, bh, bh * 0.32); g.fill();
    g.lineWidth = Math.max(1, cell * 0.03); g.strokeStyle = info.c;
    roundRect(g, cx - bw / 2, cy - bh / 2, bw, bh, bh * 0.32); g.stroke();
    g.fillStyle = info.c;
    g.fillText(L.text, cx, cy + fs * 0.04);
    g.restore();
  }
  M.labels = kept;
}

function drawBlock(g, x, y, cell){
  const pad = Math.max(0.5, cell * 0.06);
  const s = cell - pad * 2, r = cell * 0.16;
  g.fillStyle = '#8A6B4A';
  roundRect(g, x + pad, y + pad, s, s, r); g.fill();
  g.fillStyle = 'rgba(255,240,210,.16)';
  roundRect(g, x + pad, y + pad, s, s * 0.42, r); g.fill();
  /* a brick seam so it reads as breakable, not solid */
  g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = Math.max(1, cell * 0.03);
  g.beginPath();
  g.moveTo(x + pad, y + cell * 0.5); g.lineTo(x + cell - pad, y + cell * 0.5);
  g.moveTo(x + cell * 0.5, y + pad); g.lineTo(x + cell * 0.5, y + cell * 0.5);
  g.stroke();
}

function drawPowerup(g, x, y, cell, kind, now){
  const info = PU_INFO[kind]; if (!info) return;
  const cx = x + cell / 2, cy = y + cell / 2, rr = cell * 0.36;
  const pulse = noMotion() ? 1 : (0.9 + 0.1 * Math.sin(now / 200));
  g.beginPath(); g.arc(cx, cy, rr * pulse, 0, 6.2832);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
  g.lineWidth = Math.max(1.4, cell * 0.07); g.strokeStyle = info.c; g.stroke();
  /* the glyph, scaled from a 24-box path centred on the cell */
  g.save();
  g.translate(cx - cell * 0.28, cy - cell * 0.28);
  const k = cell * 0.56 / 24;
  g.scale(k, k);
  g.strokeStyle = info.c; g.fillStyle = info.c;
  g.lineWidth = 2.6 / k; g.lineCap = 'round'; g.lineJoin = 'round';
  const p = new Path2D(info.g);
  if (info.fill) g.fill(p); else g.stroke(p);
  g.restore();
  /* a tiny letter badge in the corner — the glyph reads at a glance, the
     letter is the safety net when the cell is smallest on a phone. Drawn in
     the ring colour on a dark chip so it stays legible over any tile. */
  if (info.t && cell >= 16){
    const bx = x + cell * 0.80, by = y + cell * 0.80, br = cell * 0.17;
    g.beginPath(); g.arc(bx, by, br, 0, 6.2832);
    g.fillStyle = 'rgba(0,0,0,.62)'; g.fill();
    g.lineWidth = Math.max(1, cell * 0.02); g.strokeStyle = info.c; g.stroke();
    g.fillStyle = info.c;
    g.font = '700 ' + Math.round(cell * 0.22) + 'px system-ui,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(info.t, bx, by + cell * 0.01);
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }
}

/* which cells are covered by a SPECIFIC set of bombs' blast cross (owner
   emphasis). Read-only mirror of the engine's cross rule: stop at a pillar,
   stop after a standing block unless the bomb pierces. Uses ONLY engine
   state — never mutates it. */
function crossCells(st, bombs){
  const mp = st.map, out = {};
  for (const b of bombs){
    out[b.row * mp.cols + b.col] = 1;
    for (let dd = 0; dd < 4; dd++){
      const d = E.DIRS[dd];
      for (let k = 1; k <= b.range; k++){
        const c = b.col + d.dc * k, r = b.row + d.dr * k;
        if (!E.inBounds(mp, c, r)) break;
        const i = E.idx(mp, c, r);
        if (mp.pillar[i]) break;
        out[i] = 1;
        if (st.block[i] && !b.pierce) break;
      }
    }
  }
  return out;
}

/* THE DANGER TELEGRAPH. For every cell a live bomb will burn, tint the tile
   — fainter when the blast is far off, intensifying (and reddening) as the
   fuse nears detonation, so the escape route is obvious. The player's OWN
   bombs' cross is emphasised. Reduced motion: a flat, still tint (no pulse),
   equally legible. Derived from E.dangerMap (ticks-until-lethal per cell) so
   walls, blocks, pierce and CHAIN reactions are all honoured for free. */
function drawDanger(g, st, cell, now){
  const mp = st.map;
  const danger = E.dangerMap(st);           /* cell -> earliest lethal tick (Infinity=safe) */
  /* cells inside one of MY live bombs' crosses, for a stronger read */
  const mine = M ? crossCells(st, st.bombs.filter(b => b.seat === M.me)) : {};
  const still = noMotion();
  /* a slow shared pulse so all telegraph tiles breathe together (motion on) */
  const pulse = still ? 1 : (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(now / 260)));
  const horizon = E.BOMB_FUSE;              /* normalise "how soon" over a full fuse */
  const line = Math.max(1, cell * 0.045);

  for (let i = 0; i < danger.length; i++){
    const t = danger[i];
    if (!isFinite(t)) continue;             /* safe cell */
    if (burnCellNow(st, i)) continue;       /* already a live blast draws itself */
    const c = i % mp.cols, r = (i / mp.cols) | 0;
    const x = c * cell, y = r * cell;
    /* 0 = detonating imminently (max heat), 1 = a whole fuse away (faint) */
    const soon = Math.max(0, Math.min(1, t / horizon));
    const heat = 1 - soon;                  /* 0 far .. 1 imminent */
    const own = !!mine[i];
    /* base alpha: readable but never a solid block; own bombs a touch bolder */
    let a = (0.10 + 0.30 * heat) * (own ? 1.15 : 1) * (still ? 1 : pulse);
    if (a > 0.5) a = 0.5;
    /* colour shifts amber -> hot red as the fuse runs down */
    const rr = 255;
    const gg = Math.round(180 - 150 * heat);
    const bb = Math.round(70  - 60  * heat);
    g.fillStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + a.toFixed(3) + ')';
    const pad = cell * 0.10;
    roundRect(g, x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.16);
    g.fill();
    /* an outline on OWN-bomb danger tiles so "your" blast is unmistakable */
    if (own){
      g.lineWidth = line;
      g.strokeStyle = 'rgba(255,' + gg + ',' + bb + ',' + Math.min(0.7, a + 0.2).toFixed(3) + ')';
      roundRect(g, x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.16);
      g.stroke();
    }
  }
}

/* is cell index i covered by a live blast right now? (so the telegraph does
   not double-paint a tile the real explosion already owns) */
function burnCellNow(st, i){
  const c = i % st.map.cols, r = (i / st.map.cols) | 0;
  for (const bl of st.blasts) if (bl.col === c && bl.row === r) return true;
  return false;
}

function drawBomb(g, b, cell, now){
  const cx = (b.col + 0.5) * cell, cy = (b.row + 0.5) * cell;
  /* a bomb PULSES faster as its fuse runs down — the one read that keeps
     a player alive: how long have I got */
  const frac = Math.max(0, Math.min(1, b.fuse / E.BOMB_FUSE));
  const beat = noMotion() ? 1 : (1 + 0.12 * Math.sin(now / (60 + 200 * frac)));
  const rr = cell * 0.34 * beat;
  /* THE BLAST KING's bomb — gold casing, pulsing; it belongs to whoever
     dropped it, so it follows the OWNER's set on every phone */
  const gold = kingBomb(b.seat);
  if (gold && !noMotion()){
    g.save();
    g.shadowColor = '#FFC542';
    g.shadowBlur = cell * 0.28;
    g.beginPath(); g.arc(cx, cy, rr, 0, 6.2832);
    g.fillStyle = '#3A2708'; g.fill();
    g.restore();
  }
  g.beginPath(); g.arc(cx, cy, rr, 0, 6.2832);
  g.fillStyle = gold ? '#3A2708' : '#161018'; g.fill();
  g.lineWidth = Math.max(1.2, cell * 0.05);
  g.strokeStyle = frac < 0.28 ? '#FF4A3C' : (gold ? '#FFC542' : 'rgba(255,255,255,.25)');
  g.stroke();
  /* a highlight, and a little fuse spark on top */
  g.beginPath(); g.arc(cx - rr * 0.3, cy - rr * 0.32, rr * 0.24, 0, 6.2832);
  g.fillStyle = gold ? 'rgba(255,225,150,.6)' : 'rgba(255,255,255,.35)'; g.fill();
  g.beginPath(); g.arc(cx + rr * 0.45, cy - rr * 0.7, Math.max(1, cell * 0.06), 0, 6.2832);
  g.fillStyle = frac < 0.28 ? '#FFD24A' : '#FF9A4D'; g.fill();
}

function drawBlast(g, bl, cell, now){
  const x = bl.col * cell, y = bl.row * cell;
  const a = Math.max(0.2, bl.life / E.BLAST_LIFE);
  const flick = noMotion() ? 1 : (0.85 + 0.15 * Math.sin(now / 40 + bl.col + bl.row));
  const pad = cell * 0.06 * (1 - a) * 3;
  const grd = g.createRadialGradient(x + cell / 2, y + cell / 2, 0,
    x + cell / 2, y + cell / 2, cell * 0.8);
  grd.addColorStop(0, 'rgba(255,240,180,' + (a * flick) + ')');
  grd.addColorStop(0.5, 'rgba(255,150,50,' + (a * 0.85 * flick) + ')');
  grd.addColorStop(1, 'rgba(220,60,30,' + (a * 0.5) + ')');
  g.fillStyle = grd;
  roundRect(g, x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.2);
  g.fill();
}

function drawPlayer(g, pl, f, cell, now){
  const col = COLS[pl.seat % COLS.length];
  const mine = (pl.seat === M.me);

  let alpha = 1;
  if (!pl.alive){
    /* fade out over ~600ms after death, then stop drawing */
    const gone = (M.committed - (pl.diedTick < 0 ? M.committed : pl.diedTick)) * TICK_MS;
    alpha = Math.max(0, 1 - gone / 600);
    if (alpha <= 0) return;
  }
  g.globalAlpha = alpha;

  /* sub-cell interpolation: the engine's ox/oy is the offset toward the
     cell being walked into, in fixed units (SUB per cell). We continue
     that motion by `f` of one more tick's worth of speed, clamped so it
     never overshoots the next cell — smooth without ever drawing the
     player inside a wall. */
  let px = (pl.col + 0.5) * cell + (pl.ox / E.SUB) * cell;
  let py = (pl.row + 0.5) * cell + (pl.oy / E.SUB) * cell;
  if (!noMotion() && pl.moving !== E.NO_DIR && pl.alive){
    const d = E.DIRS[pl.moving];
    const stepPx = (pl.speed / E.SUB) * cell * f;
    /* remaining distance to the target cell centre, in px, along the axis */
    const remain = (E.SUB - Math.abs(d.dc ? pl.ox : pl.oy)) / E.SUB * cell;
    const adv = Math.min(stepPx, remain);
    px += d.dc * adv; py += d.dr * adv;
  }

  const w = cell * 0.72, rr = Math.min(w / 2, cell * 0.26);
  /* body — THE BLAST KING wears gold on top but keeps the SEAT COLOUR
     as the lower body, so who-is-who survives the crown */
  const king = kingSeat(pl.seat);
  if (king && pl.alive && !noMotion()){
    g.save();
    g.shadowColor = '#FFC542';
    g.shadowBlur = cell * 0.3;
    g.fillStyle = col.b;
    roundRect(g, px - w / 2, py - w / 2 + cell * 0.04, w, w, rr); g.fill();
    g.restore();
  }
  g.fillStyle = col.b;
  roundRect(g, px - w / 2, py - w / 2 + cell * 0.04, w, w, rr); g.fill();
  g.fillStyle = king ? '#FFD24A' : col.a;
  roundRect(g, px - w / 2, py - w / 2, w, w * 0.9, rr); g.fill();
  if (king){
    /* a thin molten seam between crown and body */
    g.fillStyle = 'rgba(255,158,44,.85)';
    roundRect(g, px - w / 2, py + w * 0.18, w, Math.max(1.5, cell * 0.06), cell * 0.03);
    g.fill();
  }

  /* eyes, facing the way it walks — the one read that must be instant */
  const d = E.DIRS[pl.dir] || E.DIRS[1];
  const er = Math.max(1.3, cell * 0.075);
  g.fillStyle = '#0B0E14';
  for (let s = -1; s <= 1; s += 2){
    g.beginPath();
    g.arc(px + d.dc * cell * 0.12 - d.dr * cell * 0.14 * s,
          py + d.dr * cell * 0.12 + d.dc * cell * 0.14 * s - cell * 0.02, er, 0, 6.2832);
    g.fill();
  }

  /* your own player wears a ring — eight colours is too many to hold in
     the head mid-panic; "the one with the ring is me" is not */
  if (mine && pl.alive){
    g.strokeStyle = 'rgba(255,255,255,.85)';
    g.lineWidth = Math.max(1.4, cell * 0.08);
    g.beginPath(); g.arc(px, py, cell * 0.46, 0, 6.2832); g.stroke();
  }
  g.globalAlpha = 1;
}

function roundRect(g, x, y, w, h, r){
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ═══════════════════════════════════════════════════════════════════
   THE SCREEN
   ═══════════════════════════════════════════════════════════════════ */
const ARROW = {
  0:'M12 5v14M12 5l-6 6M12 5l6 6',
  1:'M5 12h14M19 12l-6-6M19 12l-6 6',
  2:'M12 19V5M12 19l-6-6M12 19l6-6',
  3:'M19 12H5M5 12l6-6M5 12l6 6'
};
const arrowSVG = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ARROW[d] + '"/></svg>';
const bombGlyph =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="10.5" cy="15" r="6.2" fill="#161018" stroke="rgba(255,255,255,.3)" stroke-width="1.4"/>' +
    '<circle cx="8.4" cy="12.9" r="1.7" fill="rgba(255,255,255,.4)"/>' +
    '<path d="M14.4 9.8l2.2-2.2M17.2 6l1-2 2 1-1 2z" fill="none" stroke="#FFC542" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

function board(){
  const ctx = M.ctx;
  ctx.host.classList.add('bm-host');
  const leftHanded = !!pref().lefty;
  ctx.host.innerHTML =
    '<div class="bm-hud" id="bm-hud"></div>' +
    '<div class="bm-arena" id="bm-arena">' +
      '<canvas id="bm-cv"></canvas>' +
      '<div class="bm-over"><span class="bm-cd" id="bm-cd"></span></div>' +
      '<div class="bm-rules" id="bm-rulespanel" aria-hidden="true">' +
        '<div class="bm-rules-h"><h4 id="bm-rules-t"></h4>' +
          '<button class="bm-rules-x" id="bm-rules-x" aria-label="' +
            esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="bm-rules-b" id="bm-rules-b"></div>' +
      '</div>' +
    '</div>' +
    /* THE CONTROL STRIP. Pad + bomb, siblings of the arena, BELOW it in
       the flex column — the thumb is kept off the arena by construction. */
    '<div class="bm-ctrl' + (leftHanded ? ' left' : '') + '" id="bm-ctrl">' +
      '<div class="bm-pad" id="bm-pad" role="group" aria-label="' +
          esc(T('Move', 'Mexxi')) + '">' +
        '<button class="bm-u" data-dir="0" aria-label="' + esc(T('Up', 'Fuq')) + '">' + arrowSVG(0) + '</button>' +
        '<button class="bm-l" data-dir="2" aria-label="' + esc(T('Left', 'Xellug')) + '">' + arrowSVG(3) + '</button>' +
        '<span class="bm-mid bm-c" aria-hidden="true"><span></span></span>' +
        '<button class="bm-r" data-dir="3" aria-label="' + esc(T('Right', 'Lemin')) + '">' + arrowSVG(1) + '</button>' +
        '<button class="bm-d" data-dir="1" aria-label="' + esc(T('Down', 'Isfel')) + '">' + arrowSVG(2) + '</button>' +
      '</div>' +
      '<button class="bm-bomb" id="bm-bomb" aria-label="' + esc(T('Drop a bomb', 'Waddab bomba')) + '">' +
        '<span class="bm-bomb-cd" id="bm-bomb-cd" aria-hidden="true"></span>' +
        bombGlyph + '<span class="bm-bomb-l">' + esc(T('BOMB', 'BOMBA')) + '</span></button>' +
    '</div>';

  const arena = ctx.host.querySelector('#bm-arena');
  const cv = ctx.host.querySelector('#bm-cv');
  UI = {
    ctx, arena, cv,
    g2: cv.getContext('2d', { alpha:false }),
    host: ctx.host,
    hud:  ctx.host.querySelector('#bm-hud'),
    ctrl: ctx.host.querySelector('#bm-ctrl'),
    pad:  ctx.host.querySelector('#bm-pad'),
    bomb: ctx.host.querySelector('#bm-bomb'),
    cd:   ctx.host.querySelector('#bm-cd'),
    rules:ctx.host.querySelector('#bm-rulespanel'),
    cell:16, w:240, h:180, dpr:1, bgc:null, dirtyBg:true
  };

  wireControls();
  UI.rules.querySelector('#bm-rules-x').addEventListener('click', () => setRules(false));
  ctx.root.addEventListener('pointerdown', e => {
    if (!rulesOpen || !UI || !UI.rules) return;
    const rb = ctx.btn && ctx.btn('bm-rules');
    if (!UI.rules.contains(e.target) && !(rb && rb.contains(e.target))) setRules(false);
  }, true);

  fitCanvas();
  if (typeof ResizeObserver === 'function'){
    const ro = new ResizeObserver(() => { if (UI && UI.host.isConnected) fitCanvas(); });
    ro.observe(ctx.host);
    UI.stopFit = () => ro.disconnect();
  } else {
    const onR = () => { if (UI) fitCanvas(); };
    window.addEventListener('resize', onR);
    UI.stopFit = () => window.removeEventListener('resize', onR);
  }
  requestAnimationFrame(() => { if (UI) fitCanvas(); });
  hud();
  return UI;
}

/* ═══════════════════════════════════════════════════════════════════
   THE THUMB
   A pad button HELD sets heldDir; releasing clears it, so a player walks
   only while pressing — the crisp Bomberman feel. The bomb button sets a
   one-shot drop flag the next tick consumes. Nothing here waits for the
   network; the wire is told afterwards, by commitLocal().
   The pad's data-dir uses the engine's direction order (0 up,1 down,
   2 left,3 right); the visual arrow is chosen per position above.
   ═══════════════════════════════════════════════════════════════════ */
function setDir(d){
  if (!M || M.dead || M.finished) return;
  M.heldDir = d;
}
function clearDir(d){
  if (!M) return;
  if (d == null || M.heldDir === d) M.heldDir = E.NO_DIR;
}
function dropBomb(){
  if (!M || M.dead || M.finished) return;
  const pl = M.st.players[M.me];
  if (!pl || !pl.alive) return;

  /* REMOTE DETONATE. When the player holds REMOTE and has laid every bomb it
     can (live >= bombs, live > 0), the button is a DETONATE, not a place: the
     same drop byte, but the engine reads it as "tip off everything I own"
     (bomba.js step 3). This MUST NOT be gated by the placement cooldown — a
     remote detonation is always allowed, which is the whole point of the
     power-up and the fix to "REMOTE can't detonate". Below capacity a remote
     press falls through and PLACES another held bomb (so you bank a cluster,
     then detonate the lot). */
  if (pl.remote && pl.live >= pl.bombs && pl.live > 0){
    M.want.drop = true;
    flashBomb();
    return;
  }

  /* a tap while the placement cooldown is running (or with no bombs spare)
     cannot place — give a subtle "not yet" nudge instead of a false flash,
     and do NOT set the drop flag (the engine would ignore it anyway, but
     swallowing it here keeps a mashed button from queueing a stale drop
     onto the instant the cooldown clears). No error spam. */
  if (pl.pcd > 0 || pl.live >= pl.bombs){
    nudgeBomb();
    return;
  }
  M.want.drop = true;
  flashBomb();
}

/* the "not yet" cue: a brief shake on the button, motion-gated. No sound
   beyond the existing gate, and only if a soft id is a good fit — we keep
   it silent to avoid spamming on a mashed button. */
function nudgeBomb(){
  if (!UI || !UI.bomb || noMotion()) return;
  const b = UI.bomb;
  b.classList.remove('nope');
  /* force reflow so the animation restarts on a rapid re-tap */
  void b.offsetWidth;
  b.classList.add('nope');
  setTimeout(() => { try { b.classList.remove('nope'); } catch(e){} }, 240);
}
function flashPad(d){
  if (!UI || !UI.pad || noMotion()) return;
  const b = UI.pad.querySelector('[data-dir="' + d + '"]');
  if (b){ b.classList.add('on'); setTimeout(() => { try { b.classList.remove('on'); } catch(e){} }, 90); }
}
function flashBomb(){
  if (!UI || !UI.bomb) return;
  UI.bomb.classList.add('on');
  setTimeout(() => { try { UI.bomb.classList.remove('on'); } catch(e){} }, 110);
  cue('piece.lift', { gain:0.35 });
}

/* ── THE BOMB BUTTON'S COOLDOWN VISUAL — draw-only, read-only ────────
   Reflects the engine's per-player placement cooldown (pl.pcd, ticked by
   the sim) and capacity (pl.live vs pl.bombs) on the on-screen button, so
   the player can SEE when the next bomb is ready:
     · pcd > 0            -> .cooling, with --cd = fraction elapsed so the
                             conic sweep wipes away as it recovers.
     · live >= bombs      -> .empty (capacity used up), a distinct state
                             from cooling: "no bombs left", not "wait".
     · otherwise          -> ready (no class), full colour.
   Reads M.st only; never writes it, never steps. Called every draw frame.
   Reduced motion is handled in CSS (a flat wash instead of the sweep). */
function paintBombBtn(){
  if (!UI || !UI.bomb) return;
  const b = UI.bomb;
  const st = M && M.st;
  const pl = st && st.players[M.me];
  if (!pl || !pl.alive || M.finished){
    b.classList.remove('cooling', 'empty', 'detonate');
    b.style.removeProperty('--cd');
    setBombLabel(false);
    if (b.disabled) b.disabled = false;
    return;
  }
  b.classList.toggle('rm', noMotion());

  /* REMOTE: holding remote with a FULL bank of held bombs (live >= bombs) turns
     the button into a DETONATE. It takes precedence over cooling/empty — a
     remote detonation is never gated by the placement cooldown, so the player
     sees "press to blow them all", not a "wait" or "out" wash. Below capacity
     the button is a normal PLACE (you are still laying the cluster). */
  const detonate = pl.remote && pl.live >= pl.bombs && pl.live > 0;
  if (detonate){
    b.classList.add('detonate');
    b.classList.remove('cooling', 'empty');
    b.style.removeProperty('--cd');
    setBombLabel(true);
    return;
  }
  b.classList.remove('detonate');
  setBombLabel(false);

  const CD = (E.PLACE_CD | 0) || 6;
  const cooling = pl.pcd > 0;
  const empty = !cooling && pl.live >= pl.bombs;   /* capacity used, not cooling */
  if (cooling){
    /* fraction of the cooldown already elapsed: 0 just after a drop,
       approaching 1 as it clears — the sweep shrinks toward gone. */
    const done = Math.max(0, Math.min(1, (CD - pl.pcd) / CD));
    b.style.setProperty('--cd', String(done));
    b.classList.add('cooling');
    b.classList.remove('empty');
  } else {
    b.classList.remove('cooling');
    b.style.removeProperty('--cd');
    b.classList.toggle('empty', empty);
  }
}

/* swap the bomb button's label between BOMB and DETONATE (remote mode). Keeps
   the aria-label in sync so a screen reader also knows the verb changed. Only
   touches the DOM when it actually changes, so it is cheap to call every frame. */
function setBombLabel(det){
  if (!UI || !UI.bomb) return;
  const want = det ? 'det' : 'bomb';
  if (UI.bombMode === want) return;
  UI.bombMode = want;
  const l = UI.bomb.querySelector('.bm-bomb-l');
  if (l) l.textContent = det ? T('DETONATE', 'FAQQA’') : T('BOMB', 'BOMBA');
  try {
    UI.bomb.setAttribute('aria-label', det
      ? T('Detonate your bombs', 'Faqqa’ l-bombi tiegħek')
      : T('Drop a bomb', 'Waddab bomba'));
  } catch(e){}
}

function wireControls(){
  /* THE PAD — pointerdown starts walking, pointerup/leave/cancel stop.
     Track by pointerId so a slide off a button releases it cleanly. */
  const held = {};
  UI.pad.addEventListener('pointerdown', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-dir]');
    if (!b) return;
    e.preventDefault();
    const d = +b.getAttribute('data-dir');
    held[e.pointerId] = d;
    setDir(d); flashPad(d);
    try { b.setPointerCapture(e.pointerId); } catch(_){}
  });
  const release = e => {
    const d = held[e.pointerId];
    if (d == null) return;
    delete held[e.pointerId];
    clearDir(d);
  };
  UI.pad.addEventListener('pointerup', release);
  UI.pad.addEventListener('pointercancel', release);
  UI.pad.addEventListener('lostpointercapture', release);

  /* THE BOMB BUTTON — pointerdown, not click: a drop is a moment, not a
     lifted finger. */
  UI.bomb.addEventListener('pointerdown', e => { e.preventDefault(); dropBomb(); });

  /* THE SWIPE + TAP — over the arena only, so never under the thumb that
     is on the pad. A swipe steers (held until released); a tap drops. */
  let sx = 0, sy = 0, on = false, moved = false;
  UI.arena.addEventListener('pointerdown', e => {
    if (rulesOpen) return;
    on = true; moved = false; sx = e.clientX; sy = e.clientY;
  });
  UI.arena.addEventListener('pointermove', e => {
    if (!on) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    moved = true;
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : (dy > 0 ? 1 : 0));
  });
  const end = () => {
    if (!on) return;
    on = false;
    if (!moved) dropBomb();          /* a tap on the arena drops */
    else clearDir();                 /* a swipe stops when the finger lifts */
  };
  UI.arena.addEventListener('pointerup', end);
  UI.arena.addEventListener('pointercancel', () => { on = false; });

  /* a keyboard, for the desk and the test harness. Arrows/WASD move
     (held), space/enter drops. */
  UI.keys = e => {
    if (!M || M.dead) return;
    const k = e.key;
    const d = (k === 'ArrowUp' || k === 'w') ? 0 : (k === 'ArrowDown' || k === 's') ? 1
            : (k === 'ArrowLeft' || k === 'a') ? 2 : (k === 'ArrowRight' || k === 'd') ? 3 : -1;
    if (d >= 0){ e.preventDefault(); setDir(d); flashPad(d); return; }
    if (k === ' ' || k === 'Spacebar' || k === 'Enter'){ e.preventDefault(); dropBomb(); }
  };
  UI.keysUp = e => {
    if (!M || M.dead) return;
    const k = e.key;
    const d = (k === 'ArrowUp' || k === 'w') ? 0 : (k === 'ArrowDown' || k === 's') ? 1
            : (k === 'ArrowLeft' || k === 'a') ? 2 : (k === 'ArrowRight' || k === 'd') ? 3 : -1;
    if (d >= 0 && M.heldDir === d) M.heldDir = E.NO_DIR;
  };
  window.addEventListener('keydown', UI.keys);
  window.addEventListener('keyup', UI.keysUp);
}

/* ── the HUD. One chip per player: colour, name, and a live read of
   their kit (bombs / range) so the power-up chase is legible. Repainted
   on CHANGE only, never per frame. ──────────────────────────────── */
function hud(){
  if (!UI || !UI.hud) return;
  const st = M.st;
  UI.hud.innerHTML = st.players.map(pl => {
    const c = COLS[pl.seat % COLS.length];
    const m = M.meta[pl.seat] || {};
    /* the kit read: bombs·range, then a compact run of the toys a player
       has collected so the power-up chase is legible at a glance.
       K kick, R remote, P pierce, S×n shields, M×n mega charges. */
    let toys = '';
    if (pl.alive){
      if (pl.kick)   toys += 'K';
      if (pl.remote) toys += 'R';
      if (pl.pierce) toys += 'P';
      if (pl.shield) toys += 'S' + (pl.shield > 1 ? pl.shield : '');
      if (pl.mega)   toys += 'M' + (pl.mega > 1 ? pl.mega : '');
    }
    const kit = pl.alive
      ? ('<b>' + pl.bombs + '</b>·' + pl.range + (toys ? ' <em>' + esc(toys) + '</em>' : ''))
      : '';
    return '<span class="bm-chip' + (pl.seat === M.me ? ' me' : '') +
             (pl.alive ? '' : ' out') + '">' +
      '<span class="d" style="background:' + c.a + '"></span>' +
      esc(m.name || ('#' + (pl.seat + 1))) + (kit ? ' ' + kit : '') + '</span>';
  }).join('');
}

function paintCountdown(beat){
  if (!UI || !UI.cd) return;
  if (beat <= 0){ UI.cd.textContent = ''; UI.cd.className = 'bm-cd'; return; }
  if (beat >= 4){ UI.cd.textContent = ''; return; }
  UI.cd.className = 'bm-cd' + (beat === 1 ? ' go' : '');
  UI.cd.textContent = beat === 1 ? T('GO', 'MUR') : String(beat - 1);
}

/* ═══════════════════════════════════════════════════════════════════
   THE RULES CARD — one game, told once, in both languages
   ═══════════════════════════════════════════════════════════════════ */
function rulesFor(){
  return [
    T('The pad walks you; the big button <b>drops a bomb</b>. A tap on the arena drops one too.',
      'Il-pad imexxik; il-buttuna l-kbira <b>tarmi bomba</b>. Tektika fuq l-arena tarmi waħda wkoll.'),
    T('A bomb <b>counts down and then throws a cross</b> of blast up, down, left and right. ' +
      'A pillar stops it; it eats one <b>block</b> and no further.',
      'Bomba <b>tgħodd u mbagħad tixħet salib</b> ta’ blast ’il fuq, ’l isfel, xellug u lemin. ' +
      'Pilastru jwaqqfu; jiekol <b>blokka</b> waħda u xejn aktar.'),
    T('Caught in the blast, you are <b>out</b>. So is anybody else — including the one who ' +
      'dropped it.',
      'Jekk taqbad fil-blast, toħroġ <b>barra</b>. U hekk ħaddieħor — inkluż min waddabha.'),
    T('Blow up a block to sometimes reveal a <b>power-up</b>: an extra bomb, a longer blast, ' +
      'more speed, or the ability to <b>kick</b> a bomb.',
      'Faqqa’ blokka biex kultant tikxef <b>power-up</b>: bomba żejda, blast itwal, aktar ' +
      'ħeffa, jew il-ħila li <b>tissuttja</b> bomba.'),
    T('The power-ups, by their tile letter: <b>B</b> +bomb, <b>R</b> range, <b>S</b> speed, ' +
      '<b>K</b> kick, <b>D</b> remote, <b>P</b> pierce, <b>H</b> shield, <b>M</b> mega. ' +
      'Walk over one to grab it — a label names what you got.',
      'Il-power-ups, bl-ittra tagħhom: <b>B</b> bomba, <b>R</b> firxa, <b>S</b> ħeffa, ' +
      '<b>K</b> daqqa, <b>D</b> remote, <b>P</b> nifed, <b>H</b> tarka, <b>M</b> mega. ' +
      'Għaddi minn fuqu biex taqbdu — tidher tikketta ta’ x’ġibt.'),
    T('With <b>remote</b>, your bombs do not go off on their own — they wait. The bomb button ' +
      'turns into <b>DETONATE</b>: press it to blow them all at once, whenever you choose.',
      'Bir-<b>remote</b>, il-bombi tiegħek ma jisplodux waħedhom — jistennew. Il-buttuna ssir ' +
      '<b>FAQQA’</b>: agħfasha biex tfaqqagħhom kollha f’daqqa, meta trid int.'),
    T('<b>Last player standing wins.</b> If a round drags, <b>sudden death</b> walls the arena ' +
      'in, ring by ring, until it ends.',
      '<b>L-aħħar wieħed jirbaħ.</b> Jekk ir-round jittawwal, <b>mewt f’daqqa</b> ddawwar ' +
      'l-arena bil-ħitan, ċirku ċirku, sa ma tispiċċa.'),
    T('Everybody moves at once. Nobody ever waits for a turn.',
      'Kulħadd jiċċaqlaq f’daqqa. Ħadd qatt ma jistenna dawra.')
  ];
}

function clampRules(){
  if (!UI || !UI.rules || !UI.arena) return;
  try {
    UI.rules.style.maxHeight = Math.max(120, Math.floor(UI.arena.clientHeight * 0.9)) + 'px';
  } catch(e){}
}
function paintRules(){
  if (!UI || !UI.rules) return;
  clampRules();
  UI.rules.querySelector('#bm-rules-t').textContent = 'IL-BOMBA — ' + T('the rules', 'ir-regoli');
  UI.rules.querySelector('#bm-rules-b').innerHTML =
    '<ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul>';
  UI.rules.classList.toggle('open', rulesOpen);
  UI.rules.setAttribute('aria-hidden', rulesOpen ? 'false' : 'true');
  const rb = M && M.ctx && M.ctx.btn && M.ctx.btn('bm-rules');
  if (rb) rb.setAttribute('aria-expanded', rulesOpen ? 'true' : 'false');
}
function setRules(open){
  rulesOpen = !!open;
  try { localStorage.setItem(UIKEY + '.rules', rulesOpen ? '1' : '0'); } catch(e){}
  paintRules();
}
window.addEventListener('resize', () => { if (UI && rulesOpen) clampRules(); });

/* ═══════════════════════════════════════════════════════════════════
   THE END OF A ROUND — into ir-rebbieħ, the shared winner screen.
   ═══════════════════════════════════════════════════════════════════ */
function finish(){
  if (!M || M.finished) return;
  M.finished = true;
  const st = M.st;
  const res = E.over(st) || { tone:'draw', winner:-1, ticks:st.tick };
  const won = res.tone === 'win';
  const solo = !M.net;

  /* the record book and the XP. Offline the old funnel stands: P.record
     is wrapped by progress.js and pays as a side effect. ONLINE that
     funnel never fired — the podium never calls P.ui.result either, so
     an online win paid nothing at all. The online path now pays itself
     through KARTI_XP.awardPlay, exactly once under the match id, and
     settles a staked pot through mp.js's own idempotent door (one
     winner takes it; 'draw' — everybody out — sends every ante home). */
  let xpOut = null, potRes = null;
  const outcome = won ? 'w' : (res.tone === 'draw' ? 'd' : 'l');
  if (solo){
    ST.rec[outcome]++;
    persist();
    try {
      if (P.record) P.record('bomba', outcome);
      if (window.KARTI_XP && KARTI_XP.award){
        xpOut = KARTI_XP.award('bomba', outcome, { ms: Math.max(1, st.tick * TICK_MS) });
      }
    } catch(e){}
  } else {
    ST.rec[outcome]++;
    persist();
    const MPX = window.KARTI_MP;
    const staked = !!(MPX && MPX.MP && MPX.MP.stakeLive);
    const mid = 'bomba:' + ((MPX && MPX.MP && MPX.MP.code) || 'room') + ':' + (M.seed >>> 0);
    try {
      if (window.KARTI_XP && KARTI_XP.awardPlay){
        const r = KARTI_XP.awardPlay({
          game:'bomba', won, draw: res.tone === 'draw',
          id: mid, ranked: staked, ms: Math.max(1, st.tick * TICK_MS)
        });
        if (r && r.counted) xpOut = r;
      }
    } catch(e){}
    /* the party-shelf badge, ticked with NO award attached — P.record is
       wrapped to pay, and the match is already paid under its id */
    try { if (P.tally) P.tally('bomba', outcome); } catch(e){}
    try {
      if (window.KARTI_STATS && KARTI_STATS.record)
        KARTI_STATS.record('bomba', {
          result: won ? 'win' : (res.tone === 'draw' ? 'draw' : 'loss'), id: mid });
    } catch(e){}
    if (staked && MPX.stakeSettle){
      try {
        potRes = MPX.stakeSettle(won ? 'win' : (res.tone === 'draw' ? 'draw' : 'lose'));
      } catch(e){}
    }
  }

  cue(won ? 'game.win' : 'game.lose', { gain:0.9 }, true);
  setTimeout(() => { if (M && !M.dead) showResult(res, xpOut, potRes); }, 560);
}

/* standings for the winner screen: the winner first, then the rest by
   how long they lasted (later death = higher place), each with its seat
   colour surfaced through the border id so rebbieh frames it. */
function standings(st){
  const rows = st.players.map(pl => ({
    seat: pl.seat,
    name: (M.meta[pl.seat] && M.meta[pl.seat].name) || ('#' + (pl.seat + 1)),
    you:  pl.seat === M.me,
    bot:  (M.meta[pl.seat] && M.meta[pl.seat].own === 'ai'),
    died: pl.alive ? Infinity : (pl.diedTick < 0 ? 0 : pl.diedTick)
  }));
  rows.sort((a, b) => {
    if (st.winner >= 0){
      if (a.seat === st.winner) return -1;
      if (b.seat === st.winner) return 1;
    }
    return b.died - a.died;                 /* survived longer ranks higher */
  });
  rows.forEach((r, i) => { r.place = i + 1; });
  return rows;
}

function showResult(res, xpOut, potRes){
  if (!M || !M.ctx) return;
  const st = M.st;
  const rows = standings(st);
  const won = res.tone === 'win';

  /* rebbieh: the shared podium. Avatars are null here (the app's avatar
     art is the data-kx-av span system, not a plain src) so it draws the
     handsome initials tile; the seat colour rides in as `border`. */
  const BORDER = ['jade','ruby','ice','gold','neon','fire','ice','silver'];
  const R2 = window.KARTI_REBBIEH;
  const backToLobby = () => {
    const nx = M.net; leave();
    if (nx && nx.onLeave) nx.onLeave(); else menu();
  };
  const again = () => {
    if (M.net){ const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else menu(); }
    else newGame(M.opts);
  };

  if (R2 && R2.show){
    const xp = xpOut && xpOut.counted ? {
      level: xpOut.level, gained: xpOut.xp, leveledUp: !!xpOut.levelled,
      /* fractions unknown to us; let rebbieh show a satisfying near-full bar */
      before: 0, after: xpOut.levelled ? 1 : 0.7
    } : null;
    R2.show({
      lang: (window.KARTI_LANG ? KARTI_LANG.lang() : 'en'),
      reduced: noMotion(),
      title: won ? T('You win', 'Rebaħt')
                 : (res.tone === 'draw' ? T('Everybody out', 'Kulħadd barra')
                                        : T('Out', 'Barra')),
      subtitle: T('Last one standing', 'L-aħħar wieħed wieqaf'),
      rows: rows.map(r => ({
        name: r.name, place: r.place, you: r.you, bot: r.bot,
        border: BORDER[r.seat % BORDER.length]
      })),
      xp,
      /* the reward block: this game's own pay and, on a staked table,
         the pot — all plain positive numbers per rebbieħ's contract */
      reward: ((xpOut && xpOut.counted) || potRes) ? {
        xp: xpOut && xpOut.counted ? xpOut.xp : 0,
        chips: xpOut && xpOut.counted ? (xpOut.chips | 0) + (xpOut.chipsLevel | 0) : 0,
        wonBonus: xpOut && xpOut.counted ? xpOut.wonBonus : 0,
        staked: potRes ? potRes.ante : 0,
        pot: (potRes && potRes.kind === 'win') ? potRes.pot : 0
      } : undefined,
      sound: id => cue(id, { gain:0.6 }),
      playAgainLabel: M.net ? T('Back to the room', 'Lura għall-kamra') : T('Play again', 'Erġa’ lgħab'),
      onPlayAgain: again,
      onLeave: backToLobby
    });
    return;
  }

  /* fallback: the board's own result card, if rebbieh is not present */
  P.ui.result(M.ctx, {
    tone: won ? 'win' : (res.tone === 'draw' ? 'draw' : 'lose'),
    head: won ? T('You win', 'Rebaħt') : T('Out', 'Barra'),
    why: rows.map(r => (r.place) + '. ' + esc(r.name)).join('  '),
    buttons: [
      { label: T('Again', 'Erġa'), icon:'refresh', cls:'primary', go: again },
      { label: T('Back', 'Lura'), icon:'back', cls:'ghost', go: backToLobby }
    ]
  });
}

/* ═══════════════════════════════════════════════════════════════════
   OPENING AND CLOSING
   ═══════════════════════════════════════════════════════════════════ */
function newGame(opts){
  injectCSS();
  P.show();
  const o = Object.assign({}, opts || {});
  startMatch(o, null, null);
  M.me = E.meSeat(M.st);
  M.mine = [];
  M.meta = [];
  for (let s = 0; s < M.st.players.length; s++){
    const pl = M.st.players[s];
    /* offline: seat 0 is us, the rest are the machine; this phone owns all */
    pl.own = s === M.me ? 'me' : 'ai';
    pl.lvl = o.lvl || 2;
    M.mine.push(s);
    M.meta.push({ name: s === M.me ? T('You', 'Int') : levelWords(o.lvl || 2).n + ' ' + (s + 1),
                  own: pl.own });
  }
  openBoard(() => menu());
  startLoop();
}

function openBoard(onBack){
  M.ctx = P.ui.frame({
    title: 'IL-BOMBA',
    onBack,
    leave: () => leave(),
    buttons: [
      { id:'bm-rules', label:T('Rules', 'Regoli'), icon:'book',    cls:'ghost' },
      { id:'bm-new',   label:T('New', 'Ġdida'),    icon:'refresh', cls:'ghost' }
    ]
  });
  /* the frame's square-board sizer is not ours — the arena is not square */
  if (M.ctx.stopFit) M.ctx.stopFit();
  const mw = mapWords(M.opts.map).n;
  M.ctx.badge.textContent = mw + ' · ' + M.st.players.length;
  board();
  M.ctx.btn('bm-rules').onclick = () => setRules(!rulesOpen);
  const nb = M.ctx.btn('bm-new');
  if (nb) nb.onclick = () => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else newGame(M.opts); };
  paintRules();
  P.ui.setTurn(M.ctx, { cls:'', who: T('Get ready', 'Ħejji ruħek'),
                        note: T('Pad walks. Button bombs.', 'Il-pad jimxi. Il-buttuna tarmi.') });
}

function leave(){
  stopLoop();
  if (UI){
    if (UI.stopFit) { try { UI.stopFit(); } catch(e){} }
    if (UI.keys)   { try { window.removeEventListener('keydown', UI.keys); } catch(e){} }
    if (UI.keysUp) { try { window.removeEventListener('keyup', UI.keysUp); } catch(e){} }
  }
  if (M){ M.dead = true; persistNow(); }
  M = null; UI = null;
}

/* ═══════════════════════════════════════════════════════════════════
   THE WIRE — input-delay lockstep, wired the way SERP wires its
   transport. say() is the ONE place a local byte leaves this phone. It
   carries the TICK the byte is committed for and the SEAT, so the peer
   drops it straight into its own buffer at the same tick — every phone
   assembles the identical frame for that tick and steps the identical
   pure function. Offline M.net is null and this is a no-op.

   ── WHAT THE RELAY CARRIES ────────────────────────────────────────
   The generic bact codec (see server/karti_server.py, js/mp.js toWire)
   moves a small bounded object per message. One input is {tick, seat,
   byte} — three small integers — and a byte ships ONLY on a CHANGE
   (rate-floored by shipGap) plus a wall-clock keepalive (shipPulse), so
   a full table of eight stays well inside the relay's per-room fan
   bucket. Silence is a provable "same as last": the receiver's
   watermark (M.known, advanced by every message) says how far it may
   repeat a seat's current byte — see advance(). Shipping every tick
   instead (16/s per phone) drained the bucket the moment a third chair
   sat down, the relay dropped bytes, and every table froze at ~tick 50.
   ═══════════════════════════════════════════════════════════════════ */
function say(seat, tick, byte){
  if (!M || !M.net) return;
  /* the engine's byte-safe wire shape: every field 0..255, because the
     generic codec (mp.js toWire / the relay) refuses any value over 255 —
     a raw {k:tick} dies the moment the tick passes 255. encWire splits
     the tick into three bytes; decWire on the far side reassembles it. */
  const w = E.encWire({ t:'in', tick: tick | 0, byte: byte | 0 });
  if (!w) return;
  fire(moveSubs, { seat, move: w, src:'local' });
}

/* a message from another chair: an input byte for a NET seat at a tick.
   Never fatal — an input for a seat we do not model, or a tick already
   committed, is simply dropped. */
function onlineRemote(seat, wire){
  if (!M || M.dead || !M.net) return null;
  const g = M.net.toGame ? M.net.toGame[seat] : seat;
  if (g === undefined || !M.st.players[g]) return null;
  if (M.mine.indexOf(g) >= 0) return null;           /* our own, echoed back */
  if (M.gone && M.gone[g]) return null;              /* a freed chair: every
       phone predicts this seat from its last APPLIED byte — a zombie packet
       reaching only some phones must not fork the stream, so none apply it */
  /* that seat's exclusive-set byte arriving — pure paint, NEVER part of
     the lockstep (no tick, no input, nothing the sim reads), so it can
     not fork the stream. Validated against the one byte this build
     knows; an unknown value from a newer build is simply stock. */
  if (wire && (wire.t === 'skin' || wire.a === 'skin')){
    if (((wire.b | 0) === 1) && M.skins) M.skins[g] = 1;
    return null;
  }
  const mv = E.decWire(wire);
  if (!mv) return null;
  putInput(mv.tick, g, mv.byte);
  /* advance this seat's WATERMARK: hearing tick T proves every change ≤ T
     already arrived (ordered transport), so silence below T = unchanged */
  if (M.known[g] === undefined || mv.tick > M.known[g]) M.known[g] = mv.tick;
  return null;
}

function onlineNote(text, tone){ if (M && M.ctx) P.ui.setNet(M.ctx, text || '', tone || ''); }

function onlineStop(why, tone){
  if (!M || M.dead || !M.ctx) return;
  const ctx = M.ctx;
  stopLoop();
  M.finished = true;
  P.ui.setNet(ctx, '', '');
  P.ui.result(ctx, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: tone === 'cheat' ? T('No game', 'L-ebda logħba') : T('Cut off', 'Maqtugħ'),
    why: why || T('The arena stopped.', 'L-arena waqfet.'),
    quip: T('Nothing was counted. Nobody loses a round over a dropped connection.',
            'Xejn ma ngħadd. Ħadd ma jitlef round minħabba konnessjoni li waqgħet.'),
    buttons: [{ label:T('Back to the rooms', 'Lura għall-kmamar'), icon:'back', cls:'primary',
                go: () => { const nx = M.net; leave();
                            if (nx && nx.onLeave) nx.onLeave(); else P.hub(); } }]
  });
}

function onlineStart(cfg){
  cfg = cfg || {};
  const chairs = (cfg.seats || []).filter(Boolean);
  const n = chairs.length;
  if (n < E.MIN_SEATS || n > E.MAX_SEATS)
    throw new Error('IL-BOMBA: seats 2 to 8, not ' + n);

  const toGame = {}, toRoom = [];
  chairs.forEach((s, g) => {
    const room = (typeof s.seat === 'number') ? s.seat : g;
    toGame[room] = g; toRoom[g] = room;
  });
  const meG = (toGame[cfg.you] !== undefined) ? toGame[cfg.you] : 0;
  const iAmHost = (cfg.you === (cfg.host | 0));
  const lvl = (chairs.map(s => s && s.level).find(v => v)) || 2;
  const map = (cfg.opts && cfg.opts.mode) || pref().map || 'arena';

  leave();
  injectCSS();
  startMatch({ seats:n, lvl, map }, cfg.seed >>> 0, {});
  M.net = Object.assign({}, cfg.net, { host:iAmHost, toGame, toRoom });
  M.me = meG;
  M.mine = [meG];
  M.meta = chairs.map((s, g) => ({
    name: String(s.name || ('#' + (g + 1))).slice(0, 14),
    own:  g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net')
  }));
  chairs.forEach((s, g) => {
    const pl = M.st.players[g];
    pl.own = g === meG ? 'me' : (s.kind === 'cpu' ? 'ai' : 'net');
    pl.lvl = s.level || lvl;
    /* the machine's seats are computed on EVERY phone, locally, at their
       own tick: aiInput is a pure function of the lockstep state, so every
       phone in the same state derives the IDENTICAL byte — nothing needs
       broadcasting and nothing can fork. (The old host-only ownership was
       the desync: the host computed AI bytes but never shipped them —
       say() only runs for the human seat — so guests waited, stalled, and
       then predicted 0 forever while the host's machines actually played.)
       onlineRemote drops any stray incoming byte for an owned seat, so a
       phone that DID broadcast one could not fork us either. */
    if (pl.own === 'ai') M.mine.push(g);
  });

  P.show();
  openBoard(() => { const nx = M.net; leave(); if (nx && nx.onLeave) nx.onLeave(); else P.hub(); });
  startLoop();

  /* my exclusive set goes out as one byte on its own {t:'skin'} action —
     it reuses the DECLARED fields (just `b`), so wire.fields does not
     grow and an older build's decWire drops it whole. Said three times
     across the first seconds because a peer still inside its own
     onlineStart when the first copy lands has no M yet; idempotent on
     arrival, three messages a match, nothing the lockstep ever reads. */
  if (xEq('char') || xEq('bomb')){
    const sayskin = () => {
      if (!M || M.dead || !M.net) return;
      fire(moveSubs, { seat: M.me, move: { t:'skin', b:1 }, src:'local' });
    };
    sayskin();
    setTimeout(sayskin, 1200);
    setTimeout(sayskin, 3500);
  }
  return null;
}

const NET_HOOKS = {
  live:      () => !!(M && !M.dead && !E.over(M.st)),
  phase:     () => !M ? 'idle' : (E.over(M.st) ? 'over' : 'play'),
  seed:      () => (M ? M.seed : null),
  gameId:    () => (M ? 'bomba' : null),
  turn:      () => -1,                 /* nobody is ever "on turn" (real-time) */
  over:      () => (M ? E.over(M.st) : null),
  moveCount: () => (M ? M.committed + 1 : 0),
  check:     () => '',
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
  /* THE PHONE THAT WALKED OUT. Its seat stops receiving inputs, so
     predictInput repeats its last byte forever — it stands still, or
     keeps walking the way it last went, until a blast finds it. That is
     the honest deterministic behaviour; there is no coasting to invent
     because a Bomberman player who stops IS a stationary target. */
  seatGone: seat => {
    if (!M || M.dead || !M.net) return;
    const g = M.net.toGame[seat];
    if (g === undefined || !M.st.players[g]) return;
    /* the chair is freed for good: from here this seat is PREDICTED (repeat
       last applied byte) on every phone identically, and any straggler
       packet for it is dropped (onlineRemote) so it cannot fork anyone. */
    M.gone[g] = 1;
    const m = M.meta[g];
    try { K.toast((m && m.name ? m.name : T('A player', 'Plejer')) + ' — ' +
                  T('gone.', 'telaq.')); } catch(e){}
  }
};

P.online = P.online || {};
P.online.bomba = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => NET_HOOKS.live(),
  hooks: NET_HOOKS
};

/* ═══════════════════════════════════════════════════════════════════
   THE MENU — the themed sheet: map picker, players, difficulty, with
   the rules FOLDED SHUT at the bottom.
   ═══════════════════════════════════════════════════════════════════ */
function heroCanvas(){
  /* the identity piece: a little arena with a bomb going off, drawn with
     the real renderer's geometry so the menu and the arena are plainly
     the same game. Decoration only — aria-hidden, drawn ONCE.
     The draw helpers all work in absolute px keyed off (col*cell), so we
     translate the context to the arena's origin once and then draw in
     that cell-space consistently. */
  const cv = document.createElement('canvas');
  const w = 210, h = 96, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = 17, cols = 11, rows = 5;
  const aw = cell * cols, ah = cell * rows, ox = (w - aw) / 2, oy = (h - ah) / 2;

  const grd = g.createRadialGradient(w / 2, h * 0.34, 0, w / 2, h * 0.5, w * 0.7);
  grd.addColorStop(0, '#17202E'); grd.addColorStop(1, '#0A0E15');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);

  g.save();
  g.translate(ox, oy);
  /* a checker of pillars */
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    if (r % 2 === 1 && c % 2 === 1) drawPillar(g, c * cell, r * cell, cell);
  /* a couple of destructible blocks */
  drawBlock(g, 3 * cell, 3 * cell, cell);
  drawBlock(g, 9 * cell, 1 * cell, cell);
  /* a blast cross centred at (5,2), a bomb next to it, and the player */
  for (const [dc, dr] of [[1,0],[2,0],[-1,0],[0,1],[0,-1]])
    drawBlast(g, { col:5 + dc, row:2 + dr, life:E.BLAST_LIFE }, cell, 0);
  drawBomb(g, { col:8, row:2, fuse:8, range:2 }, cell, 0);
  drawMiniPlayer(g, 1 * cell, 2 * cell, cell, COLS[0]);
  g.restore();
  return cv;
}
function drawMiniPlayer(g, x, y, cell, col){
  const px = x + cell / 2, py = y + cell / 2, w = cell * 0.72, rr = cell * 0.26;
  g.fillStyle = col.b; roundRect(g, px - w/2, py - w/2 + cell*0.04, w, w, rr); g.fill();
  g.fillStyle = col.a; roundRect(g, px - w/2, py - w/2, w, w*0.9, rr); g.fill();
}

/* a small preview of a map: pillars, blocks and spawn dots, drawn from
   the parsed map so the picker shows the real thing */
function mapPreview(id){
  const cv = document.createElement('canvas');
  const size = 80, dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
  cv.style.width = size + 'px'; cv.style.height = size + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mp = E.parseMap(mapDef(id));
  const cell = Math.floor(Math.min(size / mp.cols, size / mp.rows));
  const w = cell * mp.cols, h = cell * mp.rows;
  const px = (size - w) / 2, py = (size - h) / 2;
  g.fillStyle = '#0B0E14'; g.fillRect(0, 0, size, size);
  for (let r = 0; r < mp.rows; r++) for (let c = 0; c < mp.cols; c++){
    const i = r * mp.cols + c, x = px + c * cell, y = py + r * cell;
    if (mp.pillar[i]){ g.fillStyle = '#39435A'; g.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1); }
    else if (mp.block[i]){ g.fillStyle = '#8A6B4A'; g.fillRect(x + 1, y + 1, cell - 2, cell - 2); }
  }
  mp.spawns.forEach((s, k) => {
    const c = COLS[k % COLS.length];
    g.fillStyle = c.a;
    g.beginPath();
    g.arc(px + (s.col + 0.5) * cell, py + (s.row + 0.5) * cell, Math.max(1.5, cell * 0.32), 0, 6.2832);
    g.fill();
  });
  return cv;
}

/* ═══════════════════════════════════════════════════════════════════
   THE ENTRY SCREEN — MINIMAL BY DESIGN
   The first thing a player sees is not a wall of settings: it is a small
   set of big choices — HOW to play — plus a Rules button that slides the
   rules up, and nothing else. The map/difficulty picker lives one tap
   deeper, on the AI setup screen, so choosing to play is the fast path
   and tuning it is the deliberate one. This is the house UX standard,
   identical in shape across every game.

     PLAY ONLINE  — the primary action, at the top. (Honest: the relay
                    does not know the word yet, so a tap explains that
                    and offers the machine instead — see ONLINE_WHY.)
     PLAY WITH AI — solo vs the machine, straight to a tidy setup.
   No pass-the-phone: IL-BOMBA is real-time and simultaneous — one screen,
   one thumb — so hotseat does not apply and is not offered.
   ═══════════════════════════════════════════════════════════════════ */
let menuRulesOpen = false;
function menuRulesSheet(el){
  /* a sliding rules sheet for the menu, the same clean slide-up as the
     in-arena panel (reuses .bm-rules), appended to the screen element */
  let sheet = el.querySelector('#bm-menu-rules');
  if (!sheet){
    sheet = document.createElement('div');
    sheet.className = 'bm-rules';
    sheet.id = 'bm-menu-rules';
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML =
      '<div class="bm-rules-h"><h4>IL-BOMBA — ' + esc(T('the rules', 'ir-regoli')) + '</h4>' +
        '<button class="bm-rules-x" id="bm-menu-rules-x" aria-label="' +
          esc(T('Put the rules away', 'Warrab ir-regoli')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button></div>' +
      '<div class="bm-rules-b"><ul>' + rulesFor().map(r => '<li>' + r + '</li>').join('') + '</ul></div>';
    /* the sheet is fixed to the screen so it slides over the menu */
    sheet.style.position = 'fixed';
    sheet.style.zIndex = '40';
    el.appendChild(sheet);
    sheet.querySelector('#bm-menu-rules-x').addEventListener('click', () => toggleMenuRules(el, false));
  }
  return sheet;
}
function toggleMenuRules(el, open){
  const sheet = menuRulesSheet(el);
  menuRulesOpen = (open == null) ? !menuRulesOpen : !!open;
  sheet.classList.toggle('open', menuRulesOpen);
  sheet.setAttribute('aria-hidden', menuRulesOpen ? 'false' : 'true');
  try { sheet.style.maxHeight = Math.max(160, Math.floor(window.innerHeight * 0.7)) + 'px'; } catch(e){}
  cue(menuRulesOpen ? 'ui.sheet' : 'ui.close', { gain:0.5 });
}

const CHEV = '<span class="bm-mchev"><svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M9 6l6 6-6 6"/></svg></span>';

function menu(){
  injectCSS();
  P.show();
  stopLoop(); M = null; UI = null;
  menuRulesOpen = false;
  const el = P.ui.screenEl();
  el.innerHTML =
    '<div class="pt-wrap bm-menu">' +
    '<div class="tbar">' +
      '<button class="iconbtn" id="bm-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>IL-BOMBA</h2>' +
    '</div>' +
    '<div class="scroll">' +
      '<div class="bm-hero" id="bm-hero" aria-hidden="true">' +
        '<span class="bm-hero-cap">' + esc(T('BLOW IT UP', 'FAQQAGĦHA')) + '</span>' +
      '</div>' +
      '<p class="blurb">' +
        T('Drop bombs, blow the walls, and be the last one standing. Two to eight in one arena ' +
          '— nobody waits for a turn.',
          'Waddab bombi, faqqa’ l-ħitan, u kun l-aħħar wieħed wieqaf. Minn tnejn sa tmienja ' +
          'f’arena waħda — ħadd ma jistenna dawra.') +
      '</p>' +

      '<div class="bm-modes">' +
        '<button class="bm-mode primary" id="bm-m-online">' +
          '<span class="bm-mi"><svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>' +
          '</svg></span>' +
          '<span class="bm-mt"><b>' + esc(T('Play online', 'Ilgħab onlajn')) + '</b>' +
            '<i>' + esc(T('Two to eight people, one arena.', 'Minn tnejn sa tmien nies, arena waħda.')) + '</i></span>' +
          CHEV +
        '</button>' +
        '<button class="bm-mode" id="bm-m-ai">' +
          '<span class="bm-mi"><svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4M9 4h6"/>' +
            '<circle cx="9.5" cy="13" r="1"/><circle cx="14.5" cy="13" r="1"/></svg></span>' +
          '<span class="bm-mt"><b>' + esc(T('Play with AI', 'Ilgħab kontra l-magna')) + '</b>' +
            '<i>' + esc(T('You against the machine. Straight in.', 'Int kontra l-magna. Dritt.')) + '</i></span>' +
          CHEV +
        '</button>' +
        '<button class="bm-mode" id="bm-m-rules">' +
          '<span class="bm-mi"><svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M4 5h9a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4zM20 5h-9a3 3 0 0 0-3 3"/></svg></span>' +
          '<span class="bm-mt"><b>' + esc(T('How to play', 'Kif tilgħab')) + '</b>' +
            '<i>' + esc(T('The rules, in a minute.', 'Ir-regoli, f’minuta.')) + '</i></span>' +
          CHEV +
        '</button>' +
      '</div>' +
      '<div style="height:16px"></div>' +
    '</div></div>';

  const hero = el.querySelector('#bm-hero');
  if (hero) hero.insertBefore(heroCanvas(), hero.firstChild);

  el.querySelector('#bm-back').onclick = () => { cue('ui.back', { gain:0.7 }); P.hub(); };
  el.querySelector('#bm-m-ai').onclick = () => { cue('ui.tap', { gain:0.6 }); setupAI(); };
  el.querySelector('#bm-m-rules').onclick = () => toggleMenuRules(el, true);
  el.querySelector('#bm-m-online').onclick = () => {
    /* the relay knows "bomba" now (it is in the server's TABLES + GAME_SEATS),
       so open a real room through the shared lobby, the same entry every other
       online game uses. Fall back to the honest "not available" note only if the
       lobby is genuinely absent on this build. */
    cue('ui.tap', { gain:0.6 });
    if (window.KARTI_MP && KARTI_MP.openFor){ try { KARTI_MP.openFor('bomba'); return; } catch (e){} }
    onlineUnavailable(el);
  };
  /* a tap outside the rules sheet puts it away */
  el.addEventListener('pointerdown', e => {
    if (!menuRulesOpen) return;
    const sheet = el.querySelector('#bm-menu-rules');
    if (sheet && !sheet.contains(e.target)) toggleMenuRules(el, false);
  }, true);
}

/* the honest online degrade — a small sheet, not a dead button */
function onlineUnavailable(el){
  const sheet = menuRulesSheet(el);
  sheet.querySelector('h4').textContent = T('Online', 'Onlajn');
  sheet.querySelector('.bm-rules-b').innerHTML =
    '<ul><li>' + esc(ONLINE_WHY) + '</li></ul>' +
    '<button class="btn primary" id="bm-ol-ai" style="margin:6px 0 4px;width:100%">' +
      esc(T('Play the machine instead', 'Ilgħab kontra l-magna minflok')) + '</button>';
  toggleMenuRules(el, true);
  const b = sheet.querySelector('#bm-ol-ai');
  if (b) b.onclick = () => { toggleMenuRules(el, false); setupAI(); };
}

/* ═══════════════════════════════════════════════════════════════════
   THE AI SETUP — one tap deeper. Tidy, not a wall: the arena, how many,
   how hard, which hand — with sensible defaults already chosen so Start
   is always right there. The rules stay folded at the bottom.
   ═══════════════════════════════════════════════════════════════════ */
function setupAI(){
  injectCSS();
  P.show();
  stopLoop(); M = null; UI = null;
  const el = P.ui.screenEl();
  const p = pref();
  let map   = MAPWORDS[p.map] ? p.map : 'arena';
  let seats = Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, p.seats || 4));
  let lvl   = p.lvl || 2;

  /* how many seats a map can spawn */
  function maxSeatsFor(id){ return E.mapSeats ? E.mapSeats(id) : E.parseMap(mapDef(id)).spawns.length; }
  /* THE "MORE THAN 4 => BIGGER MAP" RULE, from the engine. When the player
     raises the seat count past the current map's ceiling, we upgrade to a
     large arena that seats everyone (deterministic, same helper the online
     lobby uses). Picking a specific map that fits keeps it. */
  function fitMap(id, n){ return E.mapForSeats ? E.mapForSeats(id, n) : id; }

  function paint(){
    /* if the seat count outgrew the chosen map, grow the map to fit */
    const fitted = fitMap(map, seats);
    if (fitted !== map) map = fitted;
    const mx = maxSeatsFor(map);
    if (seats > mx) seats = mx;
    el.innerHTML =
      '<div class="pt-wrap bm-menu bm-setup">' +
      '<div class="tbar">' +
        '<button class="iconbtn" id="bm-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<h2>' + esc(T('Play with AI', 'Kontra l-magna')) + '</h2>' +
      '</div>' +
      '<div class="scroll">' +

        '<button class="btn primary" id="bm-go" style="margin:6px 0 14px">' +
          esc(T('Start', 'Ibda')) + '</button>' +

        '<div class="tiny pt-lbl">' + esc(T('The arena', 'L-arena')) + '</div>' +
        '<div class="bm-maps" id="bm-maps">' +
          MAP_ORDER.map(id => {
            const w = mapWords(id);
            const cap = maxSeatsFor(id);
            const badge = mapSize(id) === 'L'
              ? T('5–8', '5–8') : (cap === 2 ? T('2', '2') : T('2–4', '2–4'));
            return '<button class="bm-map' + (map === id ? ' on' : '') + '" data-map="' + id + '">' +
              '<span class="bm-map-pv" data-pv="' + id + '"></span>' +
              '<b>' + esc(w.n) + ' <span class="bm-map-cap">' + esc(badge) + '</span></b>' +
              '<i>' + esc(w.i) + '</i></button>';
          }).join('') +
        '</div>' +

        '<div class="tiny pt-lbl">' + esc(T('How many players', 'Kemm-il plejer')) + '</div>' +
        '<div class="bm-step">' +
          '<button class="bm-rnd" id="bm-s-dn"' + (seats <= E.MIN_SEATS ? ' disabled' : '') +
            ' aria-label="' + esc(T('Fewer', 'Inqas')) + '">&minus;</button>' +
          '<span class="v">' + seats + '<i>' + esc(T('players', 'plejers')) + '</i></span>' +
          '<button class="bm-rnd" id="bm-s-up"' + (seats >= E.MAX_SEATS ? ' disabled' : '') +
            ' aria-label="' + esc(T('More', 'Aktar')) + '">+</button>' +
        '</div>' +
        '<p class="blurb" style="margin:4px 2px 8px;font-size:11px">' +
          esc(seats > 4
            ? T('More than four — a bigger arena is picked for you.',
                'Aktar minn erbgħa — tintgħażel arena akbar għalik.')
            : T('Two to four fits the small and medium arenas.',
                'Tnejn sa erbgħa jidħlu fl-areni żgħar u medji.')) +
        '</p>' +
        '<p class="blurb" style="margin:6px 2px 12px">' +
          esc(T('You, and the rest are the machine. Online, the empty chairs fill with people.',
                'Int, u l-bqija huma l-magna. Onlajn, is-siġġijiet vojta jimtlew bin-nies.')) +
        '</p>' +

        '<div class="tiny pt-lbl">' + esc(T('How hard the machine is', 'Kemm hi iebsa l-magna')) + '</div>' +
        '<div class="pt-opts" id="bm-lvl">' +
          LEVELS.map(L => {
            const w = levelWords(L.level);
            return '<button class="pt-opt' + (lvl === L.level ? ' on' : '') + '" data-lvl="' + L.level + '">' +
              '<b>' + esc(w.n) + '</b><i>' + esc(w.i) + '</i></button>';
          }).join('') +
        '</div>' +

        '<div class="tiny pt-lbl">' + esc(T('Controls', 'Kontrolli')) + '</div>' +
        '<div class="pt-opts" id="bm-hand">' +
          '<button class="pt-opt' + (!p.lefty ? ' on' : '') + '" data-hand="r">' +
            '<b>' + esc(T('Bomb on the right', 'Bomba fuq il-lemin')) + '</b>' +
            '<i>' + esc(T('Pad left, bomb right.', 'Pad xellug, bomba lemin.')) + '</i></button>' +
          '<button class="pt-opt' + (p.lefty ? ' on' : '') + '" data-hand="l">' +
            '<b>' + esc(T('Bomb on the left', 'Bomba fuq ix-xellug')) + '</b>' +
            '<i>' + esc(T('Pad right, bomb left.', 'Pad lemin, bomba xellug.')) + '</i></button>' +
        '</div>' +

        /* ── THE RULES, FOLDED, AT THE BOTTOM. Closed by default. ── */
        '<div class="kb-rules" style="margin:16px 2px 20px;padding:2px 14px;border-radius:14px;' +
            'background:rgba(255,255,255,.035)">' +
          '<button type="button" class="bm-fold-h" id="bm-brules-h" aria-controls="bm-brules-b"' +
            ' aria-expanded="' + (setupOpen ? 'true' : 'false') + '">' +
            '<span><b>' + esc(T('The rules, as this arena plays them',
                                'Ir-regoli, kif tilgħabhom din l-arena')) + '</b></span>' +
            '<i id="bm-brules-i">' + esc(setupOpen ? T('Hide', 'Aħbi') : T('Read', 'Aqra')) + '</i>' +
          '</button>' +
          '<div class="bm-fold-b' + (setupOpen ? ' open' : '') + '" id="bm-brules-b">' +
            '<div class="bm-fold-i"><div class="bm-fold-c">' +
              '<ul style="margin:0;padding:0 0 12px">' +
                rulesFor().map(r => '<li>' + r + '</li>').join('') +
              '</ul>' +
            '</div></div>' +
          '</div>' +
        '</div>' +
        '<div style="height:12px"></div>' +
      '</div></div>';

    /* drop the real map previews in */
    el.querySelectorAll('.bm-map-pv').forEach(sp => {
      const id = sp.getAttribute('data-pv');
      try { sp.appendChild(mapPreview(id)); } catch(e){}
    });

    el.querySelector('#bm-back').onclick = () => { cue('ui.back', { gain:0.7 }); menu(); };
    el.querySelector('#bm-go').onclick = () => {
      pref({ map, seats, lvl });
      newGame({ map, seats, lvl });
    };
    el.querySelector('#bm-maps').addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-map]');
      if (!b) return; map = b.getAttribute('data-map');
      /* choosing a map re-clamps the seat count to what it can hold */
      const mx2 = maxSeatsFor(map); if (seats > mx2) seats = mx2;
      cue('ui.tap', { gain:0.5 }); paint();
    });
    const dn = el.querySelector('#bm-s-dn'), up = el.querySelector('#bm-s-up');
    if (dn) dn.onclick = () => { if (seats > E.MIN_SEATS){ seats--; paint(); } };
    /* raising the seat count past the map's cap grows the map (fitMap in
       paint), all the way to eight players on a large arena */
    if (up) up.onclick = () => { if (seats < E.MAX_SEATS){ seats++; paint(); } };
    el.querySelector('#bm-lvl').addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-lvl]');
      if (!b) return; lvl = +b.getAttribute('data-lvl'); paint();
    });
    el.querySelector('#bm-hand').addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-hand]');
      if (!b) return; pref({ lefty: b.getAttribute('data-hand') === 'l' });
      cue('ui.toggle', { gain:0.5 }); paint();
    });
    const sh = el.querySelector('#bm-brules-h');
    if (sh) sh.onclick = () => {
      setSetupOpen(!setupOpen);
      const bb = el.querySelector('#bm-brules-b');
      const hint = el.querySelector('#bm-brules-i');
      if (bb) bb.classList.toggle('open', setupOpen);
      if (hint) hint.textContent = setupOpen ? T('Hide', 'Aħbi') : T('Read', 'Aqra');
      sh.setAttribute('aria-expanded', setupOpen ? 'true' : 'false');
      cue('ui.sheet', { gain:0.55 });
    };
  }
  paint();
}

/* repaint on a language change, but only what we own and only if it is
   on screen — js/lang.js rule */
try {
  if (window.KARTI_LANG) KARTI_LANG.onChange(() => {
    try {
      const el = P.ui.screenEl();
      if (el && el.querySelector('.bm-setup')) setupAI();
      else if (el && el.querySelector('.bm-menu')) menu();
      else if (UI && rulesOpen) paintRules();
      if (UI) hud();
    } catch(e){}
  });
} catch(e){}

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — what js/mp.js reads before a match exists.

   ── READ THIS BEFORE TRYING TO OPEN AN ONLINE ROOM ─────────────────
   The online half above is written, wired and tested against the
   engine's input-delay lockstep. It is NOT reachable, for the same one
   reason SERP's is not: the relay's table list

       server/karti_server.py  TABLES = (...)

   does not contain "bomba", and neither does js/mp.js's GAMES array —
   so a room labelled bomba is rejected at the door, and the honest
   thing is to say so here rather than to open a door onto a wall.

   THAT IS THE ONLY THING MISSING. Everything else the relay already
   does correctly:
     · it forwards, it does not referee — exactly what lockstep needs;
     · its generic bact codec carries {tick, seat, byte} with room to
       spare;
     · lockstep sends a byte only on a CHANGE of held direction or a
       drop — a couple of messages a second per player, not one per
       tick — because a held key is implied by silence + predictInput.
       Well inside the relay's per-room budget.

   So this contract is published and canStart() REFUSES, in words,
   until the server learns the word. This is js/serp-ui.js's and
   js/poker-ui.js's identical decision for the identical reason: a game
   in KARTI_MP.GAMES is a game the lobby offers to open a room for, and
   offering a room the relay will reject is worse than not offering one.
   ═══════════════════════════════════════════════════════════════════ */
const ONLINE_WHY = T(
  'Online IL-BOMBA is written and ready on this phone — full input-delay lockstep, so no two ' +
  'players ever disagree about a death — but the KARTI server does not know the word "bomba" ' +
  'yet, so it will not open a room for it. Nothing here is missing; one line on the server is. ' +
  'Until then, IL-BOMBA is you against the machine.',
  'IL-BOMBA onlajn hu miktub u lest fuq dan it-telefon — lockstep sħiħ, mela ħadd qatt ma ' +
  'jaqbel ħażin dwar mewt — imma s-server tal-KARTI għadu ma jafx il-kelma "bomba", mela mhux ' +
  'se jiftaħ kamra għaliha. Xejn hawn ma jonqos; linja waħda fuq is-server tonqos. Sa dakinhar, ' +
  'IL-BOMBA hu int kontra l-magna.');

R.lobby = {
  id:'bomba',
  name:'Il-Bomba',
  mt:'Il-Bomba',
  minSeats: E.MIN_SEATS,
  maxSeats: E.MAX_SEATS,
  levels: LEVELS,
  defaultLevel: 2,
  /* THE WIRE CONTRACT — without this, mp.js's codec falls back to tombla's
     field list, which does not know our fields: toWire() would refuse the
     very first input byte and tableStop the whole room ("could not be
     sent"). The engine's shape keeps every value 0..255 (the codec's and
     the relay's hard cap) by splitting the tick into three bytes. */
  wire: { fields: E.WIRE_FIELDS },
  /* THE HOST-CHANGEABLE MAP, as the shared lobby's Rules picker wants it:
     one variant per shipped map. The `net` word IS the engine's map id, so
     the relay's deterministic variant broadcast names the exact same
     validated map on every phone — the choice cannot fork the lockstep.
     Each variant carries the seat range that map's spawn count allows, so
     the lobby re-clamps chairs when a smaller arena is chosen (Duell seats
     two). Labels are ours (the engine authors no player strings). */
  get variants(){
    return MAP_ORDER.map(id => {
      const w = mapWords(id);
      const spawns = mapSpawnCount(id);
      const seats = [];
      for (let n = E.MIN_SEATS; n <= Math.min(E.MAX_SEATS, spawns); n++) seats.push(n);
      /* label carries the size so the host sees which arenas open to 5–8 */
      const tag = mapSize(id) === 'L' ? ' (5–8)' : (spawns === 2 ? ' (2)' : '');
      return { net:id, label:{ en:w.n + tag, mt:w.n + tag }, seats };
    });
  },
  /* which map this room is on, as the relay's word. The room (MP.variant)
     is the authority; offline this falls back to the saved pick, then arena
     — and mp.js only calls this when MP.variant is unset. */
  currentVariant(){
    try {
      const v = window.KARTI_MP && window.KARTI_MP.MP && window.KARTI_MP.MP.variant;
      if (v && E.MAPS[v]) return v;
    } catch(e){}
    const p = (pref().map);
    return (p && E.MAPS[p]) ? p : 'arena';
  },
  /* the host picked a map. Validate it to a real shipped map, remember it as
     the pick the next online start will build, and hand the relay the word.
     Seat re-clamping is the lobby's job off each variant's `seats` range
     above; here we only settle WHICH map. */
  applyVariant(net){
    const map = (net && E.MAPS[net]) ? net : 'arena';
    pref({ map });
    return { variant: map };
  },
  isReady:   seat => !!(seat && (seat.kind === 'cpu' || seat.ready)),
  autoReady: seat => (seat && seat.kind === 'cpu')
    ? Object.assign({}, seat, { ready:true }) : seat,
  canStart(seatList){
    if (!(window.KARTI_PARTY && window.KARTI_PARTY.online && window.KARTI_PARTY.online.bomba))
      return { ok:false, why: ONLINE_WHY };
    const n = (seatList || []).length;
    if (n < E.MIN_SEATS) return { ok:false, why: T('Bomberman needs at least two.', 'Bomberman irid mill-inqas tnejn.') };
    if (n > E.MAX_SEATS) return { ok:false, why: T('Up to eight can play.', 'Sa tmienja jistgħu jilagħbu.') };
    const unready = (seatList || []).filter(x => x && x.kind !== 'cpu' && !x.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1
        ? T(' people are not ready yet.', ' persuni għadhom mhux lesti.')
        : T(' person is not ready yet.', ' persuna għadha mhux lesta.')) };
    return { ok:true, why:'' };
  },
  rulesHTML: () =>
    '<p>' + T('Two to eight players in one walled arena, all at once. Drop bombs, blow the ' +
      'blocks, grab the power-ups, and be the last one standing.',
      'Minn tnejn sa tmien plejers f’arena waħda bil-ħitan, kollha f’daqqa. Waddab bombi, ' +
      'faqqa’ l-blokok, aqbad il-power-ups, u kun l-aħħar wieħed wieqaf.') + '</p>' +
    '<p>' + T('A bomb throws a cross of blast that eats one block and stops at a pillar. Caught ' +
      'in it — anyone, including you — is out. Nobody waits for a turn.',
      'Bomba tixħet salib ta’ blast li jiekol blokka waħda u jieqaf ma’ pilastru. Min jaqbad ' +
      'fih — kulħadd, inkluż int — joħroġ. Ħadd ma jistenna dawra.') + '</p>' +
    '<p>' + esc(ONLINE_WHY) + '</p>',
  blurb: T('Drop bombs, blow the walls, be the last one standing.',
           'Waddab bombi, faqqa’ l-ħitan, kun l-aħħar wieħed wieqaf.'),
  myName(){
    try {
      const n = K.displayName && K.displayName();
      if (n && String(n).trim() && String(n).trim().toLowerCase() !== 'guest')
        return String(n).trim().slice(0, 14);
    } catch(e){}
    return T('You', 'Int');
  },
  start: (seatList, o) => newGame({
    map: (o && o.mode) || pref().map || 'arena',
    seats: Math.max(E.MIN_SEATS, Math.min(E.MAX_SEATS, (seatList || []).length || 4)),
    lvl: ((seatList || []).map(s => s && s.level).find(v => v)) || 2
  }),
  takeback: false
};

/* ═══════════════════════════════════════════════════════════════════
   THE SHELF — one tile on the BOARD shelf. IL-BOMBA is a walled arena
   with things moving on it, which is what that shelf is for.
   register() replaces by id, so wiring the same descriptor twice costs
   nothing.
   ═══════════════════════════════════════════════════════════════════ */
const TILE = {
  id:'bomba', order:28, kind:'board', name:'IL-BOMBA', mt:'Il-Bomba',
  sprite:'bm-t-bomba', status:'live',
  get tag(){
    return T('Drop bombs, blow the walls, grab the power-ups, and be the last one standing. ' +
             'Two to eight players at once — nobody ever waits for a turn.',
             'Waddab bombi, faqqa’ l-ħitan, aqbad il-power-ups, u kun l-aħħar wieħed wieqaf. ' +
             'Minn tnejn sa tmien plejers f’daqqa — ħadd qatt ma jistenna dawra.');
  },
  open: () => menu(),
  seats: { min:E.MIN_SEATS, max:E.MAX_SEATS },
  levels: LEVELS,
  rulesHTML: () => R.lobby.rulesHTML()
};
R.shelfTile = TILE;
R.open = () => menu();
R.close = () => { leave(); P.hub(); };
P.register(TILE);

if (document.body) injectDefs();
else document.addEventListener('DOMContentLoaded', injectDefs);

/* ── test hooks — inert unless the page is opened with ?pttest ──── */
try {
  if (String(location.search).indexOf('pttest') >= 0){
    window.__BM_TEST = {
      engine: E,
      M: () => M,
      st: () => (M ? M.st : null),
      UI: () => UI,
      menu, newGame, leave,
      /* start a match this test drives by hand: no rAF, no countdown, and
         with the input delay forced to 0 so a byte pressed for a tick lands
         on THAT tick — the harness wants to see a move move immediately. */
      manual: (opts, seed, withBoard) => {
        injectCSS(); P.show();
        startMatch(opts || { map:'arena', seats:2, lvl:2 }, seed, null);
        M.me = E.meSeat(M.st); M.mine = []; M.meta = [];
        for (let s = 0; s < M.st.players.length; s++){
          M.st.players[s].own = s === M.me ? 'me' : 'ai';
          M.st.players[s].lvl = (opts && opts.lvl) || 2;
          M.mine.push(s);
          M.meta.push({ name:'#' + (s + 1) });
        }
        M.lead = 0; M.D = 0;
        /* optionally build the real board DOM (no rAF loop) so a UI test can
           render and drive it by hand — this is the manual path plus a screen. */
        if (withBoard){ openBoard(() => menu()); }
        return M;
      },
      /* drive N ticks by hand, off the clock, honouring held input + drops */
      tick: n => { let g = 0; for (let i = 0; i < (n | 0); i++){ if (!advance()){ if (g++ > 20) break; i--; } } return M.committed; },
      tickOnce: () => { advance(); return M.committed; },
      setDir, clearDir, dropBomb,
      hold: d => { M.heldDir = d; },
      drop: () => { M.want.drop = true; },
      setMine: list => { M.mine = list.slice(); },
      setNet: n => { M.net = n; },
      putInput, measureD: () => measureD(),
      remote: (seat, wire) => onlineRemote(seat, wire),
      hooks: NET_HOOKS,
      fps: () => (M ? M.fps.val : 0),
      committed: () => (M ? M.committed : -1),
      draw, fitCanvas, hud, board, openBoard, finish,
      rules: () => rulesOpen, setRules,
      lobby: R.lobby, tile: TILE,
      store: () => ST,
      mapPreview,
      /* draw-only introspection for the power-up icon / collect-label tests */
      PU_INFO, puLabel, drawPowerup, drawLabels,
      labels: () => (M ? M.labels : []),
      noMotion
    };
  }
} catch(e){}

})();
