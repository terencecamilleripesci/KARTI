/* ═══════════════════════════════════════════════════════════════════
   KARTI — mimika-ui.js   ·   MIMIKA — the screen

   Charades. One player is handed a secret word and mimes it; the room
   guesses. This is the SCREEN half of window.KARTI_MIMIKA — the pure
   engine (js/mimika.js, window.KARTI_MIMIKA.engine) owns the rules,
   the rotation, the scoring and the timer-as-state; this file owns the
   pixels, the taps, and — critically — WHO SEES THE WORD.

   THE HOUSE PATTERNS THIS FILE FOLLOWS (same as spy-ui.js)
     · mounts inside #scr-party via KARTI_PARTY.ui.screenEl(). Its CSS
       is injected once, scoped to #scr-party .mk-*, and it reuses the
       party kit's .tbar / .pt-opts / .btn / .pt-over so a control here
       looks like a control everywhere.
     · registers with kind:'other' — the shelf for games with no board.
     · drawn SVG icons only, from its own <symbol> sprite. No emoji.
     · sound only through js/sfx.js ids that already exist.
     · bilingual through window.KARTI_LANG — T(en, mt) at every call
       site; the engine's word bank is already {en, mt} and this file
       reads both so a guess in either language lands.

   ── THE SECRET — THE WHOLE GAME. ─────────────────────────────────────
   A guesser must never read the actor's word. This file has exactly ONE
   place that writes a word into the DOM: renderWord(), and it is only
   ever called on the ACTOR'S screen, behind the actor's own "I'm NAME"
   claim. Every other screen — the pass-hand-off, the guessers' screen,
   the standings — renders the engine's publicView(), which carries NO
   word for a non-actor. So the secrecy proof is a proof about one call.

   OFFLINE / PASS-THE-PHONE (SOURCES.seed) — the natural way to play on
   one device. There is one phone: whoever is acting holds it, taps "I'm
   the actor", sees the word, mimes, then the phone goes to the room to
   confirm the guess. A guesser physically cannot see the actor's screen
   because the actor is holding it and the app has moved on. Fully built
   and the default here.

   ONLINE (SOURCES.private) — the stretch. The relay's private per-seat
   deal (planDeal → the room's `deal` → the {"t":"mine"} push → setSlate)
   hands each seat its own slate of word ids; only the actor's client
   resolves a word for the round it acts, and a guesser's publicView is
   null. The lobby glue below wires the offline twin (P.online contract)
   and documents the exact private-deal handshake the relay owes it; see
   the ONLINE section and the report for the one wiring gap.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const P = window.KARTI_PARTY;
const ENG = window.KARTI_MIMIKA && window.KARTI_MIMIKA.engine;
if (!P || !P.register || !ENG) return;

const K = window.KARTI;
const U = P.ui, esc = U.esc, ico = U.ico;
const T = (en, mt) => window.KARTI_LANG ? window.KARTI_LANG.t(en, mt) : en;
const REB = () => window.KARTI_REBBIEH || null;

const SFX = () => window.KARTI_SFX || null;
const sfx = (id, o) => { const S = SFX(); if (S && S.play) try { S.play(id, o); } catch(e){} };
const note = (n, o) => { const S = SFX(); if (S && S.note) try { S.note(n, o); } catch(e){} };

const GID = 'mimika';
const TITLE = 'MIMIKA';
const SAVE_KEY = 'karti_mimika_v1';
const UI_KEY = 'karti_mimika_ui_v1';

/* ═══ CATEGORY & DIFFICULTY CHROME — bilingual, marks 18+ ═══════════ */
const CAT_META = {
  film:    { ico:'mk-film',  en:'Films & TV',    mt:'Films u TV' },
  malti:   { ico:'mk-malta', en:'Maltese things',mt:'Affarijiet Maltin' },
  annimal: { ico:'mk-paw',   en:'Animals',       mt:'Annimali' },
  azzjoni: { ico:'mk-run',   en:'Actions',       mt:'Azzjonijiet' },
  nies:    { ico:'mk-face',  en:'People',        mt:'Nies famużi' },
  hamalli: { ico:'mk-chili', en:'Ħamalli (18+)', mt:'Ħamalli (18+)', rude:true }
};
const DIFFS = [
  { v:1, en:'Easy',   mt:'Faċli',  note_en:'90s on the clock, gentler words.', note_mt:'90 sekonda, kliem eħfef.' },
  { v:2, en:'Medium', mt:'Medju',  note_en:'75s. The house default.',          note_mt:'75 sekonda. Id-default.' },
  { v:3, en:'Hard',   mt:'Hard',   note_en:'60s and the obscure end of the bag.', note_mt:'60 sekonda u l-agħar kliem.' }
];
function catName(c){ const m = CAT_META[c]; return m ? T(m.en, m.mt) : c; }

/* ═══ STATE ════════════════════════════════════════════════════════ */
let G = null;      /* pass-the-phone session: { st, opts, phase } */
let OL = null;     /* online session (thin — see ONLINE section) */
let tick = null;   /* the one clock interval */

function stopTick(){ if (tick){ clearInterval(tick); tick = null; } }
function leaveGame(){ stopTick(); }

/* ── UI-only prefs (rules fold) ──────────────────────────────────── */
function uiPref(){ try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch(e){ return {}; } }
function uiSet(k, v){ try { const j = uiPref(); j[k] = v; localStorage.setItem(UI_KEY, JSON.stringify(j)); } catch(e){} }

function reducedMo(){
  try {
    if (document.body && document.body.classList.contains('reduced')) return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch(e){ return false; }
}

/* ── persistence (pass-the-phone only). The saved shape is the engine
      state plus the roster names and opts. The word is only ever LIVE
      in st.word on the actor's own resolve; offline that is fine — one
      device — and it replays from the seed anyway, so the save carries
      it without leaking anything a guesser could reach. ─────────────── */
function save(){
  if (!G || !G.st) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v:1, opts:G.opts, names:G.names, phase:G.phase, st:G.st
    }));
  } catch(e){}
}
function loadSave(){
  try {
    const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!j || j.v !== 1 || !j.st) return null;
    return j;
  } catch(e){ return null; }
}
function clearSave(){ try { localStorage.removeItem(SAVE_KEY); } catch(e){} }

window.addEventListener('pagehide', () => { save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

/* ═══ SHARED CHROME ════════════════════════════════════════════════ */
function scr(){ U.css(); injectCSS(); injectSprite(); P.show(); return U.screenEl(); }
function mkIco(n){
  return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
         '<use href="#' + n + '"></use></svg>';
}
function fmtClock(s){
  s = Math.max(0, s | 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
/* every screen hangs its back button on #pt-back so the party kit's
   Escape handling works here for free. Back NEVER raises a popup. */
function bar(sub){
  return '<div class="tbar">' +
    '<button class="iconbtn" id="pt-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
    '<h2>' + esc(TITLE) + '</h2>' +
    (sub ? '<span class="pt-badge">' + esc(sub) + '</span>' : '') +
  '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE MENU — the tile's front door. MINIMAL by house standard: pick HOW
   to play, optionally read the rules, go. No settings wall here — the
   category / difficulty pickers live one screen deeper (setupScreen),
   reached only after you choose PASS THE PHONE. Online options live in
   the shared lobby. Only the modes this game actually supports are shown.
   ═══════════════════════════════════════════════════════════════════ */
function menu(){
  leaveGame(); G = null; OL = null;
  const el = scr();
  sfx('party.open');
  const saved = loadSave();
  const hasSaved = !!(saved && saved.st && saved.phase && saved.phase !== 'over');

  const M = window.KARTI_MP;
  const mpKnows = !!(M && M.openFor && M.GAME_KEYS && M.GAME_KEYS.indexOf(GID) >= 0);

  el.innerHTML = '<div class="pt-wrap mk-menu mk-front">' + bar('18+') +
    '<div class="scroll">' +
      '<div class="mk-hero" aria-hidden="true">' + mkIco('mk-hero') + '</div>' +
      '<h3 class="mk-fronttitle">' + esc(TITLE) + '</h3>' +
      '<p class="mk-frontsub">' + esc(T(
        'One acts a secret word, the room guesses. Charades, Maltese-style.',
        'Wieħed jagħmel kelma bil-mossi, il-kamra taqta’. Ċarati, bil-Malti.')) + '</p>' +

      (hasSaved
        ? '<button class="mk-mode resume" id="mk-resume">' +
            '<span class="mk-modeico">' + mkIco('mk-hand') + '</span>' +
            '<span class="mk-modetx"><b>' + esc(T('Carry on', 'Kompli')) + '</b>' +
            '<i>' + esc(T('Round', 'Round') + ' ' + (saved.st.round || 1) + ' — ' + (saved.names || []).join(', ')) + '</i></span>' +
          '</button>'
        : '') +

      '<div class="mk-modes">' +
        (mpKnows
          ? '<button class="mk-mode primary" id="mk-online">' +
              '<span class="mk-modeico">' + mkIco('mk-team') + '</span>' +
              '<span class="mk-modetx"><b>' + esc(T('Play online', 'Ilgħab online')) + '</b>' +
              '<i>' + esc(T('Everyone on their own phone.', 'Kulħadd fuq it-telefon tiegħu.')) + '</i></span>' +
            '</button>'
          : '') +
        '<button class="mk-mode' + (mpKnows ? '' : ' primary') + '" id="mk-pnp">' +
          '<span class="mk-modeico">' + mkIco('mk-hand') + '</span>' +
          '<span class="mk-modetx"><b>' + esc(T('Pass the phone', 'Għaddi t-telefon')) + '</b>' +
          '<i>' + esc(T('One phone, round the room.', 'Telefon wieħed, madwar il-kamra.')) + '</i></span>' +
        '</button>' +
        '<button class="mk-mode ghost" id="mk-rules">' +
          '<span class="mk-modeico">' + ico('book') + '</span>' +
          '<span class="mk-modetx"><b>' + esc(T('How to play', 'Kif tilgħab')) + '</b>' +
          '<i>' + esc(T('The rules, in one slide.', 'Ir-regoli, f’slide waħda.')) + '</i></span>' +
        '</button>' +
      '</div>' +
    '</div></div>';

  el.querySelector('#pt-back').onclick = () => { leaveGame(); P.hub(); };
  { const r = el.querySelector('#mk-resume'); if (r) r.onclick = () => resumeSaved(saved); }
  { const o = el.querySelector('#mk-online');
    if (o) o.onclick = () => { sfx('ui.tap'); M.openFor(GID); }; }
  el.querySelector('#mk-pnp').onclick = () => { sfx('ui.sheet'); setupScreen(); };
  el.querySelector('#mk-rules').onclick = () => openRulesSheet();
}

/* the rules as a clean slide-up sheet — never dumped on a screen. */
function openRulesSheet(){
  const el = U.screenEl();
  const old = el.querySelector('.mk-sheet'); if (old) old.remove();
  const sheet = document.createElement('div');
  sheet.className = 'mk-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', T('How to play', 'Kif tilgħab'));
  sheet.innerHTML =
    '<div class="mk-sheetscrim" id="mk-sheetscrim"></div>' +
    '<div class="mk-sheetcard' + (reducedMo() ? '' : ' anim') + '">' +
      '<div class="mk-sheethead"><h3>' + esc(T('How a round works', 'Kif jaħdem round')) + '</h3>' +
        '<button class="iconbtn" id="mk-sheetx" aria-label="' + esc(T('Close', 'Agħlaq')) + '">' + ico('close') + '</button></div>' +
      rulesPanel() +
      '<button class="btn primary mk-sheetgo" id="mk-sheetgo">' + esc(T('Got it', 'Fhimt')) + '</button>' +
    '</div>';
  el.appendChild(sheet);
  sfx('ui.sheet');
  const close = () => { sfx('ui.back', { gain: 0.5 }); sheet.remove(); };
  sheet.querySelector('#mk-sheetscrim').onclick = close;
  sheet.querySelector('#mk-sheetx').onclick = close;
  sheet.querySelector('#mk-sheetgo').onclick = close;
}

/* ═══════════════════════════════════════════════════════════════════
   SETUP — the pass-the-phone options, one screen deeper. Sensible
   defaults are pre-picked so a player can hit start immediately; the
   pickers are here, tidy, for those who want them.
   ═══════════════════════════════════════════════════════════════════ */
function setupScreen(){
  const el = scr();
  const pf = P.pref(GID);
  const saved = loadSave();
  const hasSaved = !!(saved && saved.st && saved.phase && saved.phase !== 'over');

  /* working copy of the setup answers */
  const cfg = {
    players: clampN(pf.players | 0 || 4),
    cats: (Array.isArray(pf.cats) && pf.cats.length ? pf.cats.slice() : ['film','malti','annimal','azzjoni','nies'])
            .filter(c => ENG.CATS.indexOf(c) >= 0),
    diff: [1,2,3].indexOf(pf.diff | 0) >= 0 ? (pf.diff | 0) : 2,
    teams: (pf.teams | 0) === 2 ? 2 : 1
  };
  if (!cfg.cats.length) cfg.cats = ['film','malti','annimal','azzjoni','nies'];
  let names = (Array.isArray(pf.names) ? pf.names.slice(0, ENG.MAX_PLAYERS) : []);

  el.innerHTML = '<div class="pt-wrap mk-menu mk-setup">' + bar(T('Pass the phone', 'Għaddi t-telefon')) +
    '<div class="scroll">' +
      '<p class="mk-setuplead">' + esc(T('Defaults are ready — just start, or tweak below.',
                                         'Id-defaults lesti — ibda, jew ibdel hawn taħt.')) + '</p>' +

      (hasSaved
        ? '<div class="pt-opts" style="margin-bottom:10px"><button class="pt-opt" id="mk-resume">' +
            ico('play') + '<b>' + esc(T('Carry on with the game in progress', 'Kompli l-logħba li għaddejja')) + '</b>' +
            '<i>' + esc(T('Round', 'Round') + ' ' + (saved.st.round || 1) + ' — ' + (saved.names || []).join(', ')) + '</i>' +
          '</button></div>'
        : '') +

      /* PLAYER COUNT */
      '<div class="tiny pt-lbl">' + esc(T('How many players', 'Kemm-il plejer')) + '</div>' +
      '<div class="mk-count" id="mk-count">' +
        '<button class="mk-cbtn" id="mk-cminus" aria-label="' + esc(T('Fewer', 'Inqas')) + '">−</button>' +
        '<div class="mk-cnum"><b id="mk-cval">' + cfg.players + '</b><i>' + esc(T('players', 'plejers')) + '</i></div>' +
        '<button class="mk-cbtn" id="mk-cplus" aria-label="' + esc(T('More', 'Aktar')) + '">+</button>' +
      '</div>' +
      '<p class="mk-note dim" id="mk-cnote"></p>' +

      /* NAMES (optional) */
      '<div class="tiny pt-lbl">' + esc(T('Names (optional — pass-the-phone)', 'Ismijiet (fakultattiv)')) + '</div>' +
      '<div class="mk-chips" id="mk-roster" aria-label="' + esc(T('Players', 'Plejers')) + '"></div>' +
      '<div class="mk-addrow">' +
        '<input class="field" id="mk-name" maxlength="14" placeholder="' + esc(T('Add a name', 'Żid isem')) + '" ' +
          'autocomplete="off" spellcheck="false" aria-label="' + esc(T('Add a player', 'Żid plejer')) + '">' +
        '<button class="btn sm" id="mk-add">' + (window.ILB ? window.ILB('plus', T('Add', 'Żid')) : T('Add', 'Żid')) + '</button>' +
      '</div>' +

      /* CATEGORIES */
      '<div class="tiny pt-lbl">' + esc(T('Categories — pick one or the lot', 'Kategoriji — agħżel waħda jew kollha')) + '</div>' +
      '<div class="mk-cats" id="mk-cats"></div>' +

      /* DIFFICULTY */
      '<div class="tiny pt-lbl">' + esc(T('Difficulty — sets the clock', 'Diffikultà — tissettja l-arloġġ')) + '</div>' +
      '<div class="pt-opts three" id="mk-diff">' +
        DIFFS.map(d => '<button class="pt-opt mid" data-v="' + d.v + '">' + mkIco('mk-timer') +
          '<b>' + esc(T(d.en, d.mt)) + '</b><i>' + esc(T(d.note_en, d.note_mt)) + '</i></button>').join('') +
      '</div>' +

      /* TEAMS */
      '<div class="tiny pt-lbl">' + esc(T('Free-for-all or teams', 'Kulħadd għalih jew timijiet')) + '</div>' +
      '<div class="pt-opts two" id="mk-teams">' +
        '<button class="pt-opt" data-v="1">' + mkIco('mk-face') + '<b>' + esc(T('Free-for-all', 'Kulħadd għalih')) + '</b>' +
          '<i>' + esc(T('Everyone for themselves.', 'Kull wieħed għal rasu.')) + '</i></button>' +
        '<button class="pt-opt" data-v="2">' + mkIco('mk-team') + '<b>' + esc(T('Two teams', 'Żewġ timijiet')) + '</b>' +
          '<i>' + esc(T('Only the actor’s team may score.', 'Jiskorja biss it-tim tal-attur.')) + '</i></button>' +
      '</div>' +

      /* RULES — a slide-up sheet, never dumped on the screen */
      '<button class="btn ghost sm mk-rulesbtn" id="mk-rules2">' +
        (window.ILB ? window.ILB('book', T('How to play', 'Kif tilgħab')) : T('How to play', 'Kif tilgħab')) + '</button>' +
      '<div style="height:8px"></div>' +
    '</div>' +
    '<div class="pt-startbar"><button class="btn primary" id="mk-start"></button></div></div>';

  /* ── categories paint ── */
  const catsEl = el.querySelector('#mk-cats');
  const paintCats = () => {
    catsEl.innerHTML = ENG.CATS.map(c => {
      const m = CAT_META[c];
      const on = cfg.cats.indexOf(c) >= 0;
      const words = ENG.poolFor([c], 3).length;
      return '<button class="mk-cat' + (on ? ' on' : '') + (m.rude ? ' rude' : '') + '" data-c="' + esc(c) + '">' +
        mkIco(m.ico) +
        '<b>' + esc(catName(c)) + '</b>' +
        '<i>' + words + ' ' + esc(T('words', 'kliem')) + (m.rude ? ' · 18+' : '') + '</i>' +
      '</button>';
    }).join('');
    catsEl.querySelectorAll('.mk-cat').forEach(b => b.onclick = () => {
      const c = b.dataset.c;
      const at = cfg.cats.indexOf(c);
      if (at >= 0){ if (cfg.cats.length > 1) cfg.cats.splice(at, 1); }
      else cfg.cats.push(c);
      sfx('ui.toggle', { gain: 0.4 });
      paintCats(); syncStart();
    });
  };

  /* ── roster paint ── */
  const rosterEl = el.querySelector('#mk-roster');
  const paintRoster = () => {
    rosterEl.innerHTML = names.length
      ? names.map((n, i) =>
          '<span class="mk-chip"><span>' + esc(n) + '</span>' +
          '<button data-i="' + i + '" aria-label="' + esc(T('Remove', 'Neħħi') + ' ' + n) + '">' + ico('close') + '</button></span>').join('')
      : '<span class="mk-empty">' + esc(T('No names? We’ll just call you Player 1, 2, 3…', 'Bla ismijiet? Insejħulkom Plejer 1, 2, 3…')) + '</span>';
    rosterEl.querySelectorAll('button').forEach(b => b.onclick = () => {
      names.splice(Number(b.dataset.i), 1);
      sfx('ui.back', { gain: 0.4 });
      if (names.length > cfg.players){ /* keep in sync */ }
      paintRoster(); syncStart();
    });
  };
  const addName = () => {
    const inp = el.querySelector('#mk-name');
    const n = (inp.value || '').trim().slice(0, 14);
    if (!n) return;
    if (names.length >= ENG.MAX_PLAYERS){ if (K && K.toast) K.toast(T('That is a full table.', 'Dik mejda mimlija.')); return; }
    if (names.some(x => x.toLowerCase() === n.toLowerCase())){
      if (K && K.toast) K.toast(n + ' ' + T('is already in.', 'diġà daħal.'));
      inp.value = ''; return;
    }
    names.push(n);
    if (names.length > cfg.players){ cfg.players = clampN(names.length); }
    inp.value = ''; inp.focus();
    sfx('ui.tap');
    paintRoster(); syncCount(); syncStart();
  };
  el.querySelector('#mk-add').onclick = addName;
  el.querySelector('#mk-name').addEventListener('keydown', e => { if (e.key === 'Enter') addName(); });

  /* ── count stepper ── */
  const syncCount = () => {
    el.querySelector('#mk-cval').textContent = cfg.players;
    const noteEl = el.querySelector('#mk-cnote');
    noteEl.textContent = names.length > cfg.players
      ? T('You added ' + names.length + ' names — bumped to ' + names.length + '.',
          'Żidt ' + names.length + ' ismijiet — tellajniha għal ' + names.length + '.')
      : T(ENG.MIN_PLAYERS + '–' + ENG.MAX_PLAYERS + ' players. Everyone acts an equal number of times.',
          ENG.MIN_PLAYERS + '–' + ENG.MAX_PLAYERS + ' plejers. Kulħadd jaġixxi daqstant drabi.');
  };
  el.querySelector('#mk-cminus').onclick = () => {
    cfg.players = clampN(Math.max(ENG.MIN_PLAYERS, cfg.players - 1, names.length));
    sfx('ui.tap', { gain: 0.5 }); syncCount(); syncStart();
  };
  el.querySelector('#mk-cplus').onclick = () => {
    cfg.players = clampN(cfg.players + 1);
    sfx('ui.tap', { gain: 0.5 }); syncCount(); syncStart();
  };

  /* ── option syncing ── */
  const syncOpts = () => {
    el.querySelectorAll('#mk-diff .pt-opt').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === cfg.diff));
    el.querySelectorAll('#mk-teams .pt-opt').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === cfg.teams));
  };
  const syncStart = () => {
    syncOpts();
    const btn = el.querySelector('#mk-start');
    const pool = ENG.poolFor(cfg.cats, cfg.diff).length;
    const ok = cfg.players >= ENG.MIN_PLAYERS && cfg.cats.length > 0;
    btn.disabled = !ok;
    btn.innerHTML = window.ILB
      ? window.ILB('play', ok ? T('Deal the word — ' + pool + ' in the bag', 'Aqsam il-kelma — ' + pool + ' fil-borża')
                               : T('Pick players & a category', 'Agħżel plejers u kategorija'))
      : T('Start', 'Ibda');
  };

  el.querySelectorAll('#mk-diff .pt-opt').forEach(b => b.onclick = () => { cfg.diff = Number(b.dataset.v); sfx('ui.toggle', { gain:0.4 }); syncStart(); });
  el.querySelectorAll('#mk-teams .pt-opt').forEach(b => b.onclick = () => { cfg.teams = Number(b.dataset.v); sfx('ui.toggle', { gain:0.4 }); syncStart(); });

  paintCats(); paintRoster(); syncCount(); syncStart();

  /* rules as a slide-up sheet */
  el.querySelector('#mk-rules2').onclick = () => openRulesSheet();

  /* back = to the mode picker, NO popup */
  el.querySelector('#pt-back').onclick = () => { sfx('ui.back'); menu(); };

  { const r = el.querySelector('#mk-resume');
    if (r) r.onclick = () => resumeSaved(saved); }

  el.querySelector('#mk-start').onclick = () => {
    if (cfg.players < ENG.MIN_PLAYERS || !cfg.cats.length) return;
    P.pref(GID, { players:cfg.players, cats:cfg.cats.slice(), diff:cfg.diff, teams:cfg.teams, names:names.slice() });
    startGame(cfg, names.slice());
  };
}

function clampN(n){ return Math.max(ENG.MIN_PLAYERS, Math.min(ENG.MAX_PLAYERS, n | 0 || 4)); }

function rulesPanel(){
  return '<div class="mk-rulesbody">' +
    '<p><b>' + esc(T('THE DEAL.', 'IL-QSIM.')) + '</b> ' + esc(T(
      'One player claims the phone, sees the secret word, and acts it out — miming only, no words and no spelling it in the air.',
      'Plejer wieħed jaqbad it-telefon, jara l-kelma sigrieta, u jagħmilha bil-mossi — bla kliem u bla ma jiktibha fl-arja.')) + '</p>' +
    '<p><b>' + esc(T('THE GUESS.', 'IL-QTUGĦ.')) + '</b> ' + esc(T(
      'Everyone else shouts guesses. When someone lands it, the phone-holder taps “they got it”. Or a guesser can type a guess in — either language counts.',
      'L-oħrajn jgħajtu t-tweġibiet. Meta xi ħadd jaqbadha, min qed iżomm it-telefon jagħfas “qabadha”. Jew plejer jista’ jikteb it-tweġiba — b’kull lingwa.')) + '</p>' +
    '<p><b>' + esc(T('THE CLOCK.', 'L-ARLOĠĠ.')) + '</b> ' + esc(T(
      'A timer runs each round. Stuck? The actor may SKIP for a fresh word (small penalty, three max). Time out and nobody scores.',
      'Arloġġ jaħdem kull round. Imwaħħal? L-attur jista’ jaqbeż għal kelma ġdida (penali żgħira, tlieta l-aktar). Jgħaddi l-ħin u ħadd ma jiskorja.')) + '</p>' +
    '<p><b>' + esc(T('THE POT.', 'IL-PUNTEĠĠ.')) + '</b> ' + esc(T(
      'Getting it across pays the actor ' + ENG.ACTOR_POINTS + '; landing it pays the guesser ' + ENG.GUESSER_POINTS + '. Everyone acts an equal number of times, then the standings crown a winner.',
      'Li twassalha tħallas l-attur ' + ENG.ACTOR_POINTS + '; li taqbadha tħallas lil min qabadha ' + ENG.GUESSER_POINTS + '. Kulħadd jaġixxi daqstant, imbagħad il-klassifika tinkuruna rebbieħ.')) + '</p>' +
  '</div>';
}

/* ═══════════════════════════════════════════════════════════════════
   PASS-THE-PHONE — the game loop.
   G = { st (engine state), opts, names, phase }
     phase: 'handoff' (give phone to the actor) → 'act' (word shown,
     acting + controls) → 'over'. resolveRound folds the next round in
     the engine, so after each round we drop back to 'handoff'.
   ═══════════════════════════════════════════════════════════════════ */
function startGame(cfg, names){
  const opts = {
    players: cfg.players,
    humans: cfg.players,            /* all seats are people on this device */
    cats: cfg.cats.slice(),
    diff: cfg.diff,
    teams: cfg.teams,
    src: 'seed',                    /* OFFLINE secrecy model */
    meSeat: 0
  };
  const seed = ENG.newSeed();
  const st = ENG.deal(opts, seed);
  const roster = [];
  for (let i = 0; i < st.n; i++){
    roster.push((names && names[i]) ? names[i] : T('Player ' + (i + 1), 'Plejer ' + (i + 1)));
  }
  G = { st, opts, names: roster, phase: 'handoff' };
  /* fire the engine's first round */
  step(st, -1, { t: 'begin' });
  G.phase = 'handoff';
  save();
  sfx('game.start');
  handoffScreen();
}

/* the one funnel every engine move goes through: check → apply. Returns
   true if the move landed. Keeps the log honest and one place to look. */
function step(st, seat, mv){
  if (!ENG.check(st, mv, seat)) return false;
  const m = Object.assign({ seat }, mv);
  ENG.apply(st, m);
  return true;
}

function actorName(){ return G.names[G.st.actor] || ('Player ' + (G.st.actor + 1)); }
function catOf(id){ const w = ENG.wordById(id); return w ? w.c : ''; }

/* ── HANDOFF: give the phone to the actor. The word is NOT in the DOM
      here — this screen only names who should hold the phone. ──────── */
function handoffScreen(){
  stopTick();
  const el = scr();
  const st = G.st;
  const pv = ENG.publicView(st);
  const name = actorName();

  el.innerHTML = bar(T('Round', 'Round') + ' ' + st.round) +
    '<div class="mk-stage">' +
      '<div class="mk-handoff">' +
        '<span class="mk-passico">' + mkIco('mk-hand') + '</span>' +
        '<i class="mk-passlbl">' + esc(T('Pass the phone to', 'Għaddi t-telefon lil')) + '</i>' +
        '<b class="mk-passname">' + esc(name) + '</b>' +
        '<i class="mk-passhint">' + esc(T('Everyone else — no peeking. This is your word to mime.',
                                          'L-oħrajn — tħarsux. Din il-kelma tiegħek biex tagħmilha bil-mossi.')) + '</i>' +
        (st.teams >= 2
          ? '<span class="mk-teambadge team' + ENG.teamOf(st, st.actor) + '">' +
              esc(T('Team ' + (ENG.teamOf(st, st.actor) + 1), 'Tim ' + (ENG.teamOf(st, st.actor) + 1))) + '</span>'
          : '') +
        '<button class="btn primary mk-claim" id="mk-claim">' +
          (window.ILB ? window.ILB('check', T('I’m ', 'Jien ') + name + T(' — ready', ' — lest')) : T('It’s me', 'Jien')) + '</button>' +
      '</div>' +
      scoreStrip(pv) +
    '</div>';

  el.querySelector('#pt-back').onclick = () => quitToMenu();
  el.querySelector('#mk-claim').onclick = () => {
    sfx('ui.sheet');
    G.phase = 'act'; save();
    actScreen(true);
  };
}

/* ── ACT: the actor's screen. THE ONE PLACE the word is drawn. ──────
      Word big and clear, a live timer (ticked via engine {t:'tick'}),
      got-it / skip controls, category hint. When this screen is up the
      actor is holding the phone; the room is guessing out loud. There
      is ALSO a typed-guess path for the room, but a typed guess reveals
      nothing the actor does not already see. ─────────────────────── */
function actScreen(fresh){
  stopTick();
  const el = scr();
  const st = G.st;

  /* the word id — offline, present on st.word for the actor. */
  const id = st.word;
  const cat = catOf(id);
  const catM = CAT_META[cat] || {};

  el.innerHTML = bar(T('Round', 'Round') + ' ' + st.round) +
    '<div class="mk-stage mk-actstage">' +
      '<div class="mk-acttop">' +
        '<span class="mk-actor">' + esc(actorName()) + ' ' + esc(T('is acting', 'qed jaġixxi')) + '</span>' +
        '<div class="mk-clock' + (st.clock <= 15 ? ' low' : '') + '" id="mk-clock" role="timer">' + fmtClock(st.clock) + '</div>' +
      '</div>' +

      '<div class="mk-cathint">' + (catM.ico ? mkIco(catM.ico) : '') +
        '<span>' + esc(catName(cat)) + '</span>' +
        (catM.rude ? '<span class="mk-18">18+</span>' : '') + '</div>' +

      '<div class="mk-wordcard" id="mk-wordcard">' +
        renderWord(id) +
      '</div>' +

      '<p class="mk-actnote">' + esc(T('Mime it. No talking. When they shout it, tap Got it.',
                                       'Agħmilha bil-mossi. Bla kliem. Meta jgħajtuha, agħfas Qabadha.')) + '</p>' +

      '<div class="mk-actbar">' +
        '<button class="btn ghost sm" id="mk-skip"' + (st.skips >= ENG.MAX_SKIPS ? ' disabled' : '') + '>' +
          (window.ILB ? window.ILB('refresh', T('Skip (' + (ENG.MAX_SKIPS - st.skips) + ' left)', 'Aqbeż (' + (ENG.MAX_SKIPS - st.skips) + ')')) : T('Skip', 'Aqbeż')) + '</button>' +
        '<button class="btn ghost sm" id="mk-timeout">' +
          (window.ILB ? window.ILB('flag', T('Give up', 'Irrezenja')) : T('Give up', 'Irrezenja')) + '</button>' +
      '</div>' +

      '<button class="btn primary mk-gotit" id="mk-gotit">' +
        (window.ILB ? window.ILB('check', T('Got it! — who?', 'Qabadha! — min?')) : T('Got it', 'Qabadha')) + '</button>' +

      /* typed path: a guesser can type instead of shouting */
      '<details class="mk-typed"><summary>' + esc(T('Someone wants to type a guess', 'Xi ħadd irid jikteb tweġiba')) + '</summary>' +
        '<div class="mk-typedrow">' +
          '<input class="field" id="mk-guess" maxlength="40" autocomplete="off" spellcheck="false" ' +
            'placeholder="' + esc(T('Type the guess…', 'Ikteb it-tweġiba…')) + '" aria-label="' + esc(T('Typed guess', 'Tweġiba miktuba')) + '">' +
          '<button class="btn sm" id="mk-guesssend">' + esc(T('Check', 'Iċċekkja')) + '</button>' +
        '</div>' +
        '<p class="mk-note dim">' + esc(T('Any eligible guesser — either language lands it.',
                                          'Kwalunkwe plejer eliġibbli — kull lingwa taqbadha.')) + '</p>' +
      '</details>' +
    '</div>';

  el.querySelector('#pt-back').onclick = () => quitToMenu();

  /* the clock: tick the engine one second at a time. */
  const clockEl = el.querySelector('#mk-clock');
  const run = () => {
    stopTick();
    if (reducedMo() && false) return; /* clock still runs under reduced motion */
    tick = setInterval(() => {
      if (!clockEl.isConnected){ stopTick(); save(); return; }
      if (G.phase !== 'act'){ stopTick(); return; }
      const landed = step(st, -1, { t: 'tick' });
      if (!landed){ stopTick(); return; }
      clockEl.textContent = fmtClock(st.clock);
      const low = st.clock <= 15;
      clockEl.classList.toggle('low', low);
      if (st.clock <= 10 && st.clock > 0) note(2, { gain: 0.3 });
      if (st.phase !== 'act'){
        /* the tick resolved the round (timeout) */
        stopTick();
        sfx('ui.toast');
        save();
        afterResolve('timeout');
        return;
      }
      if (st.clock % 5 === 0) save();
    }, 1000);
  };
  if (fresh) run(); else run();

  /* skip → fresh word, re-render */
  el.querySelector('#mk-skip').onclick = () => {
    if (st.skips >= ENG.MAX_SKIPS) return;
    if (!step(st, -1, { t: 'skip' })) return;
    sfx('ui.swipe');
    save();
    /* re-render just the word + skip button state */
    const card = el.querySelector('#mk-wordcard');
    if (card) card.innerHTML = renderWord(st.word);
    const cat2 = catOf(st.word), cm = CAT_META[cat2] || {};
    const hint = el.querySelector('.mk-cathint');
    if (hint) hint.innerHTML = (cm.ico ? mkIco(cm.ico) : '') + '<span>' + esc(catName(cat2)) + '</span>' + (cm.rude ? '<span class="mk-18">18+</span>' : '');
    const sk = el.querySelector('#mk-skip');
    if (sk){ sk.disabled = st.skips >= ENG.MAX_SKIPS;
      sk.innerHTML = window.ILB ? window.ILB('refresh', T('Skip (' + (ENG.MAX_SKIPS - st.skips) + ' left)', 'Aqbeż (' + (ENG.MAX_SKIPS - st.skips) + ')')) : T('Skip', 'Aqbeż'); }
  };

  /* give up → timeout resolves the round, nobody scores */
  el.querySelector('#mk-timeout').onclick = () => {
    stopTick();
    if (!step(st, -1, { t: 'timeout' })) return;
    sfx('ui.toast');
    save();
    afterResolve('timeout');
  };

  /* GOT IT → pick who landed it (out-loud path) */
  el.querySelector('#mk-gotit').onclick = () => {
    stopTick();
    sfx('ui.tap');
    pickGuesser();
  };

  /* typed guess */
  const send = () => {
    const inp = el.querySelector('#mk-guess');
    const text = (inp.value || '').trim();
    if (!text) return;
    /* try each eligible guesser as the author; the engine checks the word */
    const elig = ENG.eligibleGuessers(st);
    if (!ENG.guessHits(st.word, text)){
      inp.classList.add('miss');
      setTimeout(() => inp.classList.remove('miss'), 500);
      sfx('ui.back', { gain: 0.4 });
      if (K && K.toast) K.toast(T('Not it — keep going.', 'Mhux hi — kompli.'));
      return;
    }
    /* a hit: if one eligible guesser, credit them; else ask who typed it */
    stopTick();
    if (elig.length === 1){
      step(st, elig[0], { t: 'guess', by: elig[0], text });
      sfx('game.start');
      save();
      afterResolve('guess', elig[0]);
    } else {
      pickGuesser(text);
    }
  };
  el.querySelector('#mk-guesssend').onclick = send;
  el.querySelector('#mk-guess').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

/* renderWord — THE ONLY function that writes the actor's word into the
   DOM, and it is only ever called from actScreen (the actor's screen)
   and its skip re-render. If st.word is null (an online guesser, or a
   dry slate) it draws a safe placeholder and NEVER a word. */
function renderWord(id){
  if (id == null){
    return '<span class="mk-wordwait">' + esc(T('Waiting for the actor…', 'Nistennew lill-attur…')) + '</span>';
  }
  const en = ENG.label(id, 'en');
  const mt = ENG.label(id, 'mt');
  const primary = window.KARTI_LANG && window.KARTI_LANG.mt() ? mt : en;
  const other = window.KARTI_LANG && window.KARTI_LANG.mt() ? en : mt;
  const showBoth = other && other !== primary;
  return '<b class="mk-word">' + esc(primary) + '</b>' +
    (showBoth ? '<i class="mk-wordalt">' + esc(other) + '</i>' : '');
}

/* the "who landed it?" chooser — the out-loud path, and the multi-
   eligible typed path. Only eligible guessers are shown (team mode
   mutes the other team). */
function pickGuesser(typedText){
  const el = scr();
  const st = G.st;
  const elig = ENG.eligibleGuessers(st);
  el.innerHTML = bar(T('Round', 'Round') + ' ' + st.round) +
    '<div class="mk-stage">' +
      '<i class="mk-passlbl big">' + esc(T('Who got it?', 'Min qabadha?')) + '</i>' +
      '<p class="mk-note dim">' + esc(T('Tap the player who shouted the right answer.',
                                        'Agħfas il-plejer li għajjat it-tweġiba t-tajba.')) + '</p>' +
      '<div class="mk-guessgrid">' +
        elig.map(i => '<button class="mk-cand' + (st.teams >= 2 ? ' team' + ENG.teamOf(st, i) : '') + '" data-i="' + i + '">' +
          esc(G.names[i]) + '</button>').join('') +
      '</div>' +
      '<button class="btn ghost" id="mk-nobody">' +
        (window.ILB ? window.ILB('slash', T('Nobody got it — move on', 'Ħadd ma qabadha — kompli')) : T('Nobody', 'Ħadd')) + '</button>' +
    '</div>';
  el.querySelector('#pt-back').onclick = () => { G.phase = 'act'; actScreen(false); };
  el.querySelector('#mk-nobody').onclick = () => {
    if (!step(st, -1, { t: 'timeout' })) return;
    sfx('ui.toast'); save(); afterResolve('timeout');
  };
  el.querySelectorAll('.mk-cand').forEach(b => b.onclick = () => {
    const by = Number(b.dataset.i);
    const ok = typedText != null
      ? step(st, by, { t: 'guess', by, text: typedText })
      : step(st, -1, { t: 'got', by });
    if (!ok) return;
    sfx('game.start');
    save();
    afterResolve('got', by);
  });
}

/* after a round resolves: show the round outcome briefly, then either
   the next handoff or the standings. */
function afterResolve(how, by){
  stopTick();
  const st = G.st;
  const lastRow = st.book[st.book.length - 1] || {};
  const wordId = lastRow.word != null && lastRow.word >= 0 ? lastRow.word : null;
  const el = scr();

  /* is the match over? the engine flips phase to 'over' */
  const done = (st.phase === 'over');

  const won = (how === 'got' || how === 'guess');
  const line = won
    ? (by != null ? esc(G.names[by]) + ' ' + esc(T('got it!', 'qabadha!')) : esc(T('Got it!', 'Qabadha!')))
    : esc(T('Time — nobody landed it.', 'Ħin — ħadd ma qabadha.'));

  el.innerHTML = bar(T('Round', 'Round') + ' ' + (lastRow.round || st.round)) +
    '<div class="mk-stage">' +
      '<div class="mk-resolve ' + (won ? 'good' : 'miss') + '">' +
        '<span class="mk-rico">' + mkIco(won ? 'mk-check' : 'mk-clock2') + '</span>' +
        '<h3>' + line + '</h3>' +
        (wordId != null
          ? '<p class="mk-rword">' + esc(T('The word was', 'Il-kelma kienet')) + ' <b>' +
              esc(ENG.label(wordId, window.KARTI_LANG && window.KARTI_LANG.mt() ? 'mt' : 'en')) + '</b></p>'
          : '') +
      '</div>' +
      scoreStrip(ENG.publicView(st)) +
      '<button class="btn primary" id="mk-next">' +
        (done
          ? (window.ILB ? window.ILB('trophy', T('See the standings', 'Ara l-klassifika')) : T('Standings', 'Klassifika'))
          : (window.ILB ? window.ILB('arrow-right', T('Next actor', 'L-attur li jmiss')) : T('Next', 'Li jmiss'))) + '</button>' +
    '</div>';

  el.querySelector('#pt-back').onclick = () => quitToMenu();
  el.querySelector('#mk-next').onclick = () => {
    if (done){ showStandings(); return; }
    G.phase = 'handoff'; save();
    sfx('ui.swipe');
    handoffScreen();
  };
  save();
}

/* a compact live score strip, from publicView (never leaks a word). */
function scoreStrip(pv){
  const st = G.st;
  const rows = st.seats.map((s, i) => ({ i, name: G.names[i], score: (pv.scores ? pv.scores[i] : s.score), team: st.teams >= 2 ? ENG.teamOf(st, i) : -1 }))
                       .sort((a, b) => b.score - a.score);
  return '<div class="mk-scorestrip">' +
    '<div class="tiny pt-lbl">' + esc(T('Scores', 'Punteġġi')) + '</div>' +
    '<div class="mk-scorelist">' +
      rows.map(r => '<div class="mk-scorerow' + (r.i === st.actor ? ' acting' : '') + (r.team >= 0 ? ' team' + r.team : '') + '">' +
        '<span class="mk-sn">' + (r.i === st.actor ? mkIco('mk-star') : '') + esc(r.name) + '</span>' +
        '<b>' + (r.score | 0) + '</b>' +
      '</div>').join('') +
    '</div>' +
  '</div>';
}

/* ── the winner, via the shared rebbieh standings ─────────────────── */
function showStandings(){
  stopTick();
  const st = G.st;
  const R = REB();
  const tallied = ENG.tally(st);
  const me = ENG.meSeat(st);

  /* rows sorted by score; team mode annotates the team. */
  const rows = st.seats.map((s, i) => ({
    name: G.names[i],
    score: (tallied.seats[i] ? tallied.seats[i].score : s.score),
    you: (i === me),
    team: st.teams >= 2 ? ENG.teamOf(st, i) : -1
  })).sort((a, b) => b.score - a.score).map((r, idx) => (r.place = idx + 1, r));

  const subtitle = st.teams >= 2
    ? (function(){
        const tt = tallied.teams || [0, 0];
        const win = tt[0] === tt[1] ? -1 : (tt[0] > tt[1] ? 0 : 1);
        return win < 0 ? T('Teams tied', 'Timijiet indaqs')
          : T('Team ' + (win + 1) + ' wins', 'Tim ' + (win + 1) + ' rebaħ');
      })()
    : T('Final standings', 'Klassifika finali');

  clearSave();
  G.phase = 'over';

  if (R && R.show){
    R.show({
      title: T('Winner!', 'Rebbieħ!'),
      subtitle,
      rows,
      lang: window.KARTI_LANG ? window.KARTI_LANG.lang() : 'en',
      reduced: reducedMo(),
      sound: (id) => sfx(id),
      playAgainLabel: T('Play again', 'Erġa’ lgħab'),
      playAgainCaption: T('Back to setup — same players, new bag.', 'Lura għas-setup — l-istess plejers, borża ġdida.'),
      onPlayAgain: () => { menu(); },
      onLeave: () => { leaveGame(); G = null; P.hub(); }
    });
  } else {
    /* defensive fallback if rebbieh is not loaded (should not happen) */
    const el = scr();
    el.innerHTML = bar(T('Over', 'Spiċċa')) +
      '<div class="mk-stage"><h3>' + esc(subtitle) + '</h3>' + scoreStrip(ENG.publicView(st)) +
      '<button class="btn primary" id="mk-again">' + esc(T('Play again', 'Erġa’ lgħab')) + '</button></div>';
    el.querySelector('#pt-back').onclick = () => { leaveGame(); G = null; P.hub(); };
    el.querySelector('#mk-again').onclick = () => menu();
  }
}

/* leaving mid-game — the game is saved, so back is NOT a scary popup;
   we just save and go to the menu (the tile offers "carry on"). */
function quitToMenu(){
  stopTick();
  save();
  sfx('ui.back');
  menu();
}

/* resume a saved pass-the-phone game straight into its phase. */
function resumeSaved(j){
  if (!j || !j.st){ clearSave(); menu(); return; }
  G = { st: j.st, opts: j.opts, names: j.names || [], phase: j.phase || 'handoff' };
  sfx('ui.sheet');
  if (G.phase === 'act') actScreen(false);
  else handoffScreen();
}

/* ═══════════════════════════════════════════════════════════════════
   ONLINE — the stretch. The offline twin is wired below via the lobby
   `start`; the live-on-their-own-phones path needs the relay's private
   per-seat deal, and the exact handshake is documented here so the
   integration (or a future pass) can complete it without guesswork.

   THE PRIVATE-DEAL HANDSHAKE THIS UI EXPECTS (see js/mimika.js header):
     1. HOST builds the room's `deal` payload before start:
          const plan = ENG.planDeal(opts, seed);   // {items:[{v,g}], each}
        and hands `plan.items` to the relay's v_deal so the relay
        shuffles with its OWN entropy and pushes each seat a private
        slate via {"t":"mine","d":[wordIds]}.
     2. On the {"t":"mine"} push, THIS client stores its slate:
          ENG.setSlate(st, msg.d);
        and deals with opts.src = 'private', opts.meSeat = my seat.
     3. Each round: only the actor's client holds a word (SOURCES.private
        returns null for a non-actor), so renderWord() draws the "waiting
        for the actor" placeholder on every guesser's screen — no word.
     4. A typed guess online cannot be adjudicated by a guesser (it has
        no word), so it is routed as an intent to the actor's client /
        unit, which resolves it with {t:'got'} — exactly the wire the
        engine documents (only 'got' crosses; wrong guesses stay local).

   WHAT IS MISSING to go live (the wiring gap): a live relay message for
   the {"t":"mine"} private slate push routed into KARTI_MP for THIS
   game key, plus mp.js teaching (a GAME_KEYS entry) the way SUSPETT
   does it. That is relay + mp.js work, forbidden from this file. Until
   then P.online[GID].start reuses the offline engine so a room that
   somehow reaches this game still runs pass-the-phone honestly rather
   than leaking a word. ─────────────────────────────────────────────── */
function onlineStart(cfg){
  /* Honest degrade: no private-deal wire yet, so an online room falls
     back to the offline pass-the-phone game on the host's device rather
     than risk showing a guesser the word. */
  const names = (cfg && cfg.seats ? cfg.seats.filter(Boolean).map(s => s.name || 'PLAYER') : []);
  leaveGame(); OL = null; G = null;
  startGame({
    players: Math.max(ENG.MIN_PLAYERS, names.length || 4),
    cats: ['film','malti','annimal','azzjoni','nies'],
    diff: 2, teams: 1
  }, names);
  return true;
}
function onlineRemote(){ return null; }
function onlineNote(){}
function onlineStop(){ leaveGame(); G = null; OL = null; P.hub(); }

P.online = P.online || {};
P.online[GID] = { start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop, live: () => !!OL };

/* ═══════════════════════════════════════════════════════════════════
   THE LOBBY CONTRACT — the same two halves gharraq/spy ship. The online
   half is a placeholder (see ONLINE) but `start` (the offline twin) is
   the real, tested entry from the shared lobby.
   ═══════════════════════════════════════════════════════════════════ */
const LOBBY = {
  id: GID,
  name: TITLE,
  mt: T('Charades — act it, guess it', 'Ċarati — agħmilha, aqta’ha'),
  minSeats: ENG.MIN_PLAYERS,
  maxSeats: ENG.MAX_PLAYERS,
  levels: [],
  defaultLevel: 1,
  isReady: seat => !!(seat && seat.ready),
  autoReady: seat => seat,
  canStart(seatList){
    const list = (seatList || []).filter(Boolean);
    if (list.some(s => s.kind === 'cpu'))
      return { ok:false, why: T('MIMIKA is acted out loud — no machines at this table.', 'MIMIKA tintlagħab bil-mossi — bla magni.') };
    if (list.length < ENG.MIN_PLAYERS) return { ok:false, why: T('At least ' + ENG.MIN_PLAYERS + ' players.', 'Mill-inqas ' + ENG.MIN_PLAYERS + ' plejers.') };
    if (list.length > ENG.MAX_PLAYERS) return { ok:false, why: T('That is a full table.', 'Dik mejda mimlija.') };
    const unready = list.filter(s => !s.ready).length;
    if (unready) return { ok:false, why: unready + T(' not ready yet.', ' għadhom mhux lesti.') };
    return { ok:true, why:'' };
  },
  rulesHTML: rulesPanel,
  blurb: T('One player mimes a secret word; the room guesses against the clock. Everybody takes a turn.',
           'Plejer wieħed jagħmel kelma sigrieta bil-mossi; il-kamra taqta’ kontra l-arloġġ. Kulħadd jieħu daqqa.'),
  myName: () => { try { return (K && K.S && K.S.profile && K.S.profile.name) || ''; } catch(e){ return ''; } },
  start(seats){
    const names = (seats || []).filter(Boolean).map(s => s.name || 'PLAYER').slice(0, ENG.MAX_PLAYERS);
    const pf = P.pref(GID);
    const cfg = {
      players: Math.max(ENG.MIN_PLAYERS, names.length),
      cats: (Array.isArray(pf.cats) && pf.cats.length ? pf.cats : ['film','malti','annimal','azzjoni','nies']).filter(c => ENG.CATS.indexOf(c) >= 0),
      diff: [1,2,3].indexOf(pf.diff | 0) >= 0 ? (pf.diff | 0) : 2,
      teams: (pf.teams | 0) === 2 ? 2 : 1
    };
    if (!cfg.cats.length) cfg.cats = ['film','malti','annimal','azzjoni','nies'];
    startGame(cfg, names);
    return G;
  },
  wire: { fields: ['v', 'i', 'j', 's', 'n'] },
  takeback: false
};

window.KARTI_MIMIKA.ui = { menu, engine: ENG, actScreen, handoffScreen, showStandings };
window.KARTI_MIMIKA.lobby = LOBBY;
window.KARTI_MIMIKA.open = menu;

/* ═══ ON THE SHELF ═════════════════════════════════════════════════ */
P.register({
  id: GID, order: 62, kind: 'other', name: TITLE, mt: T('Charades', 'Ċarati'),
  sprite: 'mk-hand', status: 'live',
  get tag(){
    const words = ENG.BANK.length, cats = ENG.CATS.length;
    return T(
      'One player mimes a secret word — no talking — while the room shouts guesses against the clock. ' +
        words + ' words across ' + cats + ' categories, Malti or English, 18+ ħamalli set included.' +
        (loadSave() ? ' There is a game in progress.' : ''),
      'Plejer wieħed jagħmel kelma bil-mossi — bla kliem — waqt li l-kamra tgħajjat kontra l-arloġġ. ' +
        words + ' kelma f’' + cats + ' kategoriji, bil-Malti jew bl-Ingliż, bis-sett ħamalli 18+.' +
        (loadSave() ? ' Hemm logħba għaddejja.' : ''));
  },
  open: menu,
  seats: { min: ENG.MIN_PLAYERS, max: ENG.MAX_PLAYERS },
  levels: [],
  rulesHTML: rulesPanel,
  start: (seatList, o) => LOBBY.start(seatList, o)
});

/* repaint tile chrome + any live menu on a language flip */
if (window.KARTI_LANG && window.KARTI_LANG.onChange){
  window.KARTI_LANG.onChange(() => {
    try {
      const el = U.screenEl && U.screenEl();
      if (el && el.querySelector && el.querySelector('.mk-menu') && (!G || G.phase === 'over' || !G.phase)) menu();
    } catch(e){}
  });
}

/* ═══════════════════════════════════════════════════════════════════
   THE SPRITE — drawn SVG symbols, never emoji. Scoped ids (mk-*).
   ═══════════════════════════════════════════════════════════════════ */
const SPRITE =
  /* a masked mime face — the hero mark */
  '<symbol id="mk-hero" viewBox="0 0 240 100">' +
    '<ellipse cx="120" cy="93" rx="46" ry="4" fill="#0A0714" opacity=".4"/>' +
    '<g stroke="#120C1E" stroke-width="2">' +
      /* body */
      '<path d="M96 90V70q0-16 24-16q24 0 24 16v20z" fill="#3A2E5C"/>' +
      /* striped shirt hint */
      '<path d="M100 74h40M100 80h40M100 86h40" stroke="#F4EFFF" stroke-width="2" fill="none" opacity=".5"/>' +
      /* head */
      '<circle cx="120" cy="40" r="16" fill="#F4EFFF"/>' +
      /* mime eyes + brow */
      '<circle cx="114" cy="38" r="2.4" fill="#120C1E" stroke="none"/>' +
      '<circle cx="126" cy="38" r="2.4" fill="#120C1E" stroke="none"/>' +
      '<path d="M111 32q3-3 6 0M123 32q3-3 6 0" fill="none" stroke-width="1.6"/>' +
      '<path d="M114 47q6 4 12 0" fill="none" stroke-width="1.8"/>' +
    '</g>' +
    /* raised acting hands */
    '<path d="M150 62q10-8 16-4l-4 8z" fill="#F4EFFF" stroke="#120C1E" stroke-width="2"/>' +
    '<path d="M90 62q-10-8-16-4l4 8z" fill="#F4EFFF" stroke="#120C1E" stroke-width="2"/></symbol>' +
  /* a hand (pass / claim) */
  '<symbol id="mk-hand" viewBox="0 0 24 24">' +
    '<path d="M10.6 2.4c.9 0 1.6.7 1.6 1.6v7l6.9 1.3c1.2.2 2 1.3 1.8 2.5l-.8 4.6c-.2 1.1-1.2 2-2.4 2h-6.5c-.8 0-1.5-.3-2-.9l-5.4-5.6 1.5-1.6c.5-.5 1.3-.6 1.9-.2l1.8 1.2V4c0-.9.7-1.6 1.6-1.6z"/></symbol>' +
  /* an hourglass (timer / difficulty) */
  '<symbol id="mk-timer" viewBox="0 0 24 24">' +
    '<path d="M5.6 2.4h12.8v2.4l-4.6 4.6a3.6 3.6 0 0 0 0 5.2l4.6 4.6v2.4H5.6v-2.4l4.6-4.6a3.6 3.6 0 0 0 0-5.2L5.6 4.8z"/></symbol>' +
  /* a clock (round result / low) */
  '<symbol id="mk-clock2" viewBox="0 0 24 24">' +
    '<path fill-rule="evenodd" d="M12 2.4A9.6 9.6 0 1 0 12 21.6 9.6 9.6 0 0 0 12 2.4zm1 4.6h-2v6l4.8 2.9 1-1.7-3.8-2.3z"/></symbol>' +
  /* a check (got it) */
  '<symbol id="mk-check" viewBox="0 0 24 24">' +
    '<path d="M9.6 16.2 4.8 11.4l1.7-1.7 3.1 3.1 7.6-7.6 1.7 1.7z"/></symbol>' +
  /* a star (whose turn) */
  '<symbol id="mk-star" viewBox="0 0 24 24">' +
    '<path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 21.4l-5.8 3 1.1-6.5L2.6 13.4l6.5-.9z"/></symbol>' +
  /* category marks */
  '<symbol id="mk-film" viewBox="0 0 24 24">' +
    '<path d="M2.6 4.6h18.8v14.8H2.6z" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M6 4.6v14.8M18 4.6v14.8M2.6 9.3h18.8M2.6 14.7h18.8" stroke="currentColor" stroke-width="1.4"/></symbol>' +
  '<symbol id="mk-malta" viewBox="0 0 24 24">' +
    '<path d="M12 2.2 4 6v6c0 5 3.4 8.6 8 9.8 4.6-1.2 8-4.8 8-9.8V6z"/>' +
    '<path d="M11 7h2v3h3v2h-3v3h-2v-3H8v-2h3z" fill="var(--bg,#0E0B14)" stroke="none"/></symbol>' +
  '<symbol id="mk-paw" viewBox="0 0 24 24">' +
    '<circle cx="6" cy="9" r="2.4"/><circle cx="18" cy="9" r="2.4"/>' +
    '<circle cx="9.4" cy="5" r="2.4"/><circle cx="14.6" cy="5" r="2.4"/>' +
    '<path d="M12 11c3 0 6.4 2.6 6.4 5.4 0 1.7-1.3 3-3 3-1.2 0-2.4-.6-3.4-.6s-2.2.6-3.4.6c-1.7 0-3-1.3-3-3C5.6 13.6 9 11 12 11z"/></symbol>' +
  '<symbol id="mk-run" viewBox="0 0 24 24">' +
    '<circle cx="15" cy="4.4" r="2.2"/>' +
    '<path d="M12.6 7.4 8.4 9.8l1 3.4-2.8 5.4 2 1 2.6-5 2.2 2.2.8 4.4 2-.4-.9-5.2-2.9-2.6 1-2.8 2.4 2.2 3.2-.6-.3-1.8-2.4.4-2.4-2.2c-.6-.6-1.4-.8-2.2-.4z"/></symbol>' +
  '<symbol id="mk-face" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="8" r="4.4"/>' +
    '<path d="M3.6 21c0-4.6 3.8-7.4 8.4-7.4s8.4 2.8 8.4 7.4z"/></symbol>' +
  '<symbol id="mk-team" viewBox="0 0 24 24">' +
    '<circle cx="7.5" cy="8" r="3.4"/><circle cx="16.5" cy="8" r="3.4"/>' +
    '<path d="M1.6 20c0-3.6 2.6-5.8 5.9-5.8s5.9 2.2 5.9 5.8z"/>' +
    '<path d="M10.6 20c0-3.6 2.6-5.8 5.9-5.8s5.9 2.2 5.9 5.8z" opacity=".7"/></symbol>' +
  /* a chili — the ħamalli 18+ mark */
  '<symbol id="mk-chili" viewBox="0 0 24 24">' +
    '<path d="M6 20c8 0 13-5 13-12 0-1.6-.4-3-1.2-4.2-.5.9-1.3 1.6-2.4 1.9 1 1 1.6 2.4 1.6 4.1 0 5-4 9-11 9-.9 0-1.7 0-2.4-.2A6 6 0 0 0 6 20z"/>' +
    '<path d="M16.4 3.6c1.4 0 2.6.6 3.4 1.6-1.2.2-2 .8-2.4 1.8-.6-1.2-1.6-2-3-2.2.6-.7 1.3-1.2 2-1.2z"/></symbol>';

function injectSprite(){
  if (document.getElementById('mk-sprite')) return;
  const holder = document.createElement('div');
  holder.id = 'mk-sprite';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><defs>' + SPRITE + '</defs></svg>';
  document.body.appendChild(holder);
}

/* ═══════════════════════════════════════════════════════════════════
   CSS — injected once, scoped under #scr-party .mk-*. Uses the app
   tokens with hard fallbacks so it is still handsome in an isolated
   harness. Compositor-only motion; reduced-motion honoured.
   ═══════════════════════════════════════════════════════════════════ */
const CSS_ID = 'mk-style';
function injectCSS(){
  if (document.getElementById(CSS_ID)) return;
  const st = document.createElement('style');
  st.id = CSS_ID;
  st.textContent = [
    '#scr-party .mk-menu .scroll{padding-bottom:12px}',

    /* ── FRONT (mode picker): minimal, big choices ── */
    '#scr-party .mk-front .scroll{display:flex;flex-direction:column;align-items:center;padding:8px 16px 16px}',
    '#scr-party .mk-fronttitle{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:30px;',
    '  letter-spacing:.06em;color:var(--gold,#FFC542);margin:2px 0 2px;text-align:center}',
    '#scr-party .mk-frontsub{color:var(--dim,#A093C4);font-size:13px;text-align:center;max-width:300px;margin:0 0 16px}',
    '#scr-party .mk-modes{display:flex;flex-direction:column;gap:10px;width:100%;max-width:400px}',
    '#scr-party .mk-mode{display:flex;align-items:center;gap:14px;text-align:left;padding:16px 16px;border-radius:16px;',
    '  background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.1));width:100%;max-width:400px}',
    '#scr-party .mk-mode:active{transform:translateY(1px)}',
    '#scr-party .mk-modeico{flex:0 0 auto;width:46px;height:46px;display:grid;place-items:center;border-radius:12px;',
    '  background:var(--panel2,#241A3E);border:1px solid var(--line2,rgba(255,255,255,.18))}',
    '#scr-party .mk-modeico .ico{width:24px;height:24px;color:var(--dim,#A093C4)}',
    '#scr-party .mk-modetx{display:flex;flex-direction:column;gap:2px;min-width:0}',
    '#scr-party .mk-modetx b{font-family:var(--disp,"Exo 2",sans-serif);font-weight:800;font-size:16px;color:var(--txt,#F4EFFF)}',
    '#scr-party .mk-modetx i{font-size:12px;color:var(--dim,#A093C4)}',
    '#scr-party .mk-mode.primary{border-color:var(--gold,#FFC542);',
    '  background:linear-gradient(180deg,rgba(255,197,66,.16),var(--panel,#1B1430));box-shadow:0 8px 22px rgba(255,197,66,.14)}',
    '#scr-party .mk-mode.primary .mk-modeico{background:linear-gradient(180deg,#FFD979,var(--gold,#FFC542));border-color:#FFE9B0}',
    '#scr-party .mk-mode.primary .mk-modeico .ico{color:#241800}',
    '#scr-party .mk-mode.primary .mk-modetx b{color:var(--gold,#FFC542)}',
    '#scr-party .mk-mode.resume{max-width:400px;margin-bottom:6px;border-color:var(--ok,#3DDC84)}',
    '#scr-party .mk-mode.resume .mk-modetx b{color:var(--ok,#3DDC84)}',
    '#scr-party .mk-mode.ghost{background:transparent}',

    /* ── rules SLIDE-UP sheet ── */
    '#scr-party .mk-sheet{position:absolute;inset:0;z-index:50;display:flex;flex-direction:column;justify-content:flex-end}',
    '#scr-party .mk-sheetscrim{position:absolute;inset:0;background:rgba(6,4,12,.6);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
    '#scr-party .mk-sheetcard{position:relative;z-index:1;background:var(--panel,#1B1430);',
    '  border-top:1px solid var(--line2,rgba(255,255,255,.18));border-radius:20px 20px 0 0;',
    '  padding:8px 18px calc(env(safe-area-inset-bottom,0px) + 16px);max-height:86%;overflow-y:auto;',
    '  box-shadow:0 -12px 40px rgba(0,0,0,.5)}',
    '#scr-party .mk-sheetcard.anim{animation:mk-sheetup .3s var(--ease,cubic-bezier(.22,.9,.28,1))}',
    '@keyframes mk-sheetup{from{transform:translateY(100%)}to{transform:none}}',
    '#scr-party .mk-sheethead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0 4px}',
    '#scr-party .mk-sheethead h3{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:18px;color:var(--gold,#FFC542);margin:0}',
    '#scr-party .mk-sheethead .iconbtn .ico{width:20px;height:20px;color:var(--dim,#A093C4)}',
    '#scr-party .mk-sheetgo{width:100%;margin-top:6px}',
    '@media (prefers-reduced-motion:reduce){#scr-party .mk-sheetcard.anim{animation:none}}',

    /* ── setup screen lead ── */
    '#scr-party .mk-setuplead{color:var(--dim,#A093C4);font-size:12.5px;text-align:center;margin:2px 2px 12px}',
    '#scr-party .mk-rulesbtn{width:100%;margin-top:14px}',

    '#scr-party .mk-hero{display:flex;justify-content:center;margin:2px 0 6px}',
    '#scr-party .mk-hero .ico{width:190px;height:auto}',
    '#scr-party .mk-hero svg{width:190px;height:80px}',
    '#scr-party .blurb{color:var(--dim,#A093C4);font-size:13px;line-height:1.45;margin:0 2px 12px}',
    '#scr-party .blurb b{color:var(--txt,#F4EFFF)}',
    '#scr-party .mk-note{font-size:11.5px;line-height:1.35;margin:4px 2px 8px}',
    '#scr-party .mk-note.dim{color:var(--dim,#A093C4)}',

    /* count stepper */
    '#scr-party .mk-count{display:flex;align-items:center;justify-content:center;gap:18px;',
    '  background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.1));',
    '  border-radius:14px;padding:10px 14px;margin-bottom:2px}',
    '#scr-party .mk-cbtn{width:44px;height:44px;border-radius:12px;font-size:26px;font-weight:900;',
    '  background:var(--panel2,#241A3E);color:var(--gold,#FFC542);border:1px solid var(--line2,rgba(255,255,255,.18));',
    '  display:grid;place-items:center;line-height:1}',
    '#scr-party .mk-cbtn:active{transform:translateY(1px)}',
    '#scr-party .mk-cnum{text-align:center;min-width:64px}',
    '#scr-party .mk-cnum b{display:block;font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:30px;color:var(--txt,#F4EFFF);line-height:1}',
    '#scr-party .mk-cnum i{font-size:11px;color:var(--dim,#A093C4);letter-spacing:.06em;text-transform:uppercase}',

    /* roster chips */
    '#scr-party .mk-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;min-height:8px}',
    '#scr-party .mk-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 6px 4px 10px;',
    '  background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.1));border-radius:99px;font-size:12.5px}',
    '#scr-party .mk-chip button{width:20px;height:20px;display:grid;place-items:center;border-radius:50%;color:var(--dim,#A093C4)}',
    '#scr-party .mk-chip button .ico{width:14px;height:14px}',
    '#scr-party .mk-empty{color:var(--dim2,#7F73A0);font-size:12px;font-style:italic}',
    '#scr-party .mk-addrow{display:flex;gap:8px;margin-bottom:6px}',
    '#scr-party .mk-addrow .field{flex:1 1 auto}',

    /* category grid */
    '#scr-party .mk-cats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:2px}',
    '#scr-party .mk-cat{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;',
    '  gap:0 10px;align-items:center;text-align:left;padding:10px 12px;border-radius:14px;',
    '  background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.1))}',
    '#scr-party .mk-cat .ico{grid-row:1/3;width:22px;height:22px;color:var(--dim,#A093C4)}',
    '#scr-party .mk-cat b{font-family:var(--disp,"Exo 2",sans-serif);font-weight:800;font-size:13.5px;color:var(--txt,#F4EFFF)}',
    '#scr-party .mk-cat i{font-size:10.5px;color:var(--dim,#A093C4)}',
    '#scr-party .mk-cat.on{border-color:var(--gold,#FFC542);background:linear-gradient(180deg,rgba(255,197,66,.14),var(--panel,#1B1430))}',
    '#scr-party .mk-cat.on .ico{color:var(--gold,#FFC542)}',
    '#scr-party .mk-cat.rude{border-style:dashed}',
    '#scr-party .mk-cat.rude.on{border-color:var(--hot,#E8452C);background:linear-gradient(180deg,rgba(232,69,44,.16),var(--panel,#1B1430))}',
    '#scr-party .mk-cat.rude.on .ico{color:var(--hot,#E8452C)}',

    /* fold (rules) */
    '#scr-party .mk-fold{margin-top:14px;border-top:1px solid var(--line,rgba(255,255,255,.1));padding-top:10px}',
    '#scr-party .mk-foldtg{display:flex;align-items:center;gap:8px;width:100%;padding:8px 4px;',
    '  font-family:var(--disp,"Exo 2",sans-serif);font-weight:800;font-size:13px;color:var(--dim,#A093C4)}',
    '#scr-party .mk-foldtg .ico{width:18px;height:18px}',
    '#scr-party .mk-foldcv{width:18px;height:18px;margin-left:auto;transition:transform .2s ease;fill:none;stroke:currentColor;stroke-width:2}',
    '#scr-party .mk-foldtg.open .mk-foldcv{transform:rotate(180deg)}',
    '#scr-party .mk-foldbody{overflow:hidden}',
    '#scr-party .mk-foldbody.anim{animation:mk-slide .28s var(--ease,cubic-bezier(.22,.9,.28,1))}',
    '@keyframes mk-slide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
    '#scr-party .mk-rulesbody p{font-size:12.5px;line-height:1.5;color:var(--dim,#A093C4);margin:0 2px 9px}',
    '#scr-party .mk-rulesbody b{color:var(--gold,#FFC542);font-family:var(--disp,"Exo 2",sans-serif);letter-spacing:.03em}',

    /* stage */
    '#scr-party .mk-stage{display:flex;flex-direction:column;align-items:stretch;gap:12px;',
    '  padding:14px 16px;max-width:520px;margin:0 auto;width:100%;min-height:0;flex:1 1 auto;overflow-y:auto}',
    '#scr-party .mk-passlbl{text-align:center;color:var(--dim,#A093C4);font-size:13px}',
    '#scr-party .mk-passlbl.big{font-family:var(--disp,"Exo 2",sans-serif);font-weight:800;font-size:19px;color:var(--txt,#F4EFFF)}',

    /* handoff */
    '#scr-party .mk-handoff{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;',
    '  padding:26px 18px;background:radial-gradient(400px 240px at 50% 0%,rgba(138,92,255,.16),transparent 70%);',
    '  border-radius:18px}',
    '#scr-party .mk-passico{width:64px;height:64px;display:grid;place-items:center;border-radius:50%;',
    '  background:var(--panel2,#241A3E);border:1px solid var(--line2,rgba(255,255,255,.18))}',
    '#scr-party .mk-passico .ico{width:34px;height:34px;color:var(--gold,#FFC542)}',
    '#scr-party .mk-passname{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:30px;',
    '  color:var(--gold,#FFC542);line-height:1.1}',
    '#scr-party .mk-passhint{font-size:12px;color:var(--dim,#A093C4);max-width:260px}',
    '#scr-party .mk-teambadge{font-family:var(--disp,"Exo 2",sans-serif);font-weight:800;font-size:11px;',
    '  padding:3px 10px;border-radius:99px;letter-spacing:.05em}',
    '#scr-party .mk-teambadge.team0{background:rgba(127,212,255,.18);color:#7FD4FF}',
    '#scr-party .mk-teambadge.team1{background:rgba(255,84,104,.18);color:#FF8494}',
    '#scr-party .mk-claim{width:100%;max-width:340px;margin-top:6px}',

    /* act top: actor + clock */
    '#scr-party .mk-acttop{display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '#scr-party .mk-actor{font-size:12.5px;color:var(--dim,#A093C4);font-weight:600}',
    '#scr-party .mk-clock{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:34px;',
    '  color:var(--txt,#F4EFFF);font-variant-numeric:tabular-nums;line-height:1;',
    '  padding:2px 12px;border-radius:12px;background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.1))}',
    '#scr-party .mk-clock.low{color:var(--hot,#E8452C);border-color:rgba(232,69,44,.5);animation:mk-pulse 1s ease infinite}',
    '@keyframes mk-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}',
    'body.reduced #scr-party .mk-clock.low,@media (prefers-reduced-motion:reduce){#scr-party .mk-clock.low{animation:none}}',

    /* category hint */
    '#scr-party .mk-cathint{display:flex;align-items:center;justify-content:center;gap:8px;',
    '  color:var(--dim,#A093C4);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}',
    '#scr-party .mk-cathint .ico{width:18px;height:18px}',
    '#scr-party .mk-18{background:var(--hot,#E8452C);color:#fff;font-size:9px;border-radius:99px;padding:1px 6px;letter-spacing:.05em}',

    /* the word card — the hero of the act screen */
    '#scr-party .mk-wordcard{display:flex;flex-direction:column;align-items:center;justify-content:center;',
    '  gap:6px;text-align:center;min-height:150px;padding:24px 18px;border-radius:20px;',
    '  background:linear-gradient(180deg,var(--panel2,#241A3E),var(--panel,#1B1430));',
    '  border:2px solid var(--gold,#FFC542);box-shadow:0 10px 30px rgba(0,0,0,.4),inset 0 0 40px rgba(255,197,66,.06)}',
    '#scr-party .mk-word{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;',
    '  font-size:clamp(28px,8vw,44px);line-height:1.05;color:var(--txt,#F4EFFF);',
    '  text-shadow:0 2px 12px rgba(255,197,66,.25)}',
    '#scr-party .mk-wordalt{font-family:var(--disp,"Exo 2",sans-serif);font-weight:700;font-size:15px;',
    '  color:var(--gold,#FFC542);opacity:.85}',
    '#scr-party .mk-wordwait{color:var(--dim,#A093C4);font-size:15px;font-style:italic}',
    '#scr-party .mk-actnote{text-align:center;color:var(--dim,#A093C4);font-size:12px;margin:2px 0}',

    /* act controls */
    '#scr-party .mk-actbar{display:flex;gap:8px}',
    '#scr-party .mk-actbar .btn{flex:1 1 0}',
    '#scr-party .mk-gotit{width:100%}',
    '#scr-party .mk-typed{border:1px solid var(--line,rgba(255,255,255,.1));border-radius:12px;padding:0 12px;background:var(--panel,#1B1430)}',
    '#scr-party .mk-typed summary{padding:10px 0;font-size:12.5px;color:var(--dim,#A093C4);cursor:pointer;list-style:none}',
    '#scr-party .mk-typed summary::-webkit-details-marker{display:none}',
    '#scr-party .mk-typedrow{display:flex;gap:8px;padding-bottom:8px}',
    '#scr-party .mk-typedrow .field{flex:1 1 auto}',
    '#scr-party .mk-typed .field.miss{border-color:var(--hot,#E8452C);animation:mk-shake .4s ease}',
    '@keyframes mk-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}',
    '#scr-party .mk-typed .mk-note{padding-bottom:8px;margin:0}',

    /* who got it grid */
    '#scr-party .mk-guessgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '#scr-party .mk-cand{padding:14px 10px;border-radius:12px;font-family:var(--disp,"Exo 2",sans-serif);',
    '  font-weight:800;font-size:14px;color:var(--txt,#F4EFFF);',
    '  background:var(--panel,#1B1430);border:1px solid var(--line2,rgba(255,255,255,.18))}',
    '#scr-party .mk-cand:active{transform:translateY(1px)}',
    '#scr-party .mk-cand.team0{border-left:4px solid #7FD4FF}',
    '#scr-party .mk-cand.team1{border-left:4px solid #FF8494}',

    /* round resolve */
    '#scr-party .mk-resolve{text-align:center;padding:20px 16px;border-radius:18px}',
    '#scr-party .mk-resolve.good{background:radial-gradient(360px 200px at 50% 0%,rgba(61,220,132,.18),transparent 70%)}',
    '#scr-party .mk-resolve.miss{background:radial-gradient(360px 200px at 50% 0%,rgba(160,147,196,.14),transparent 70%)}',
    '#scr-party .mk-rico{display:inline-grid;place-items:center;width:56px;height:56px;border-radius:50%;',
    '  background:var(--panel2,#241A3E);margin-bottom:6px}',
    '#scr-party .mk-resolve.good .mk-rico .ico{width:30px;height:30px;color:var(--ok,#3DDC84)}',
    '#scr-party .mk-resolve.miss .mk-rico .ico{width:30px;height:30px;color:var(--dim,#A093C4)}',
    '#scr-party .mk-resolve h3{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:20px;color:var(--txt,#F4EFFF);margin:0 0 4px}',
    '#scr-party .mk-rword{font-size:13px;color:var(--dim,#A093C4)}',
    '#scr-party .mk-rword b{color:var(--gold,#FFC542)}',

    /* score strip */
    '#scr-party .mk-scorestrip{margin-top:2px}',
    '#scr-party .mk-scorelist{display:flex;flex-direction:column;gap:5px}',
    '#scr-party .mk-scorerow{display:flex;align-items:center;justify-content:space-between;gap:10px;',
    '  padding:7px 12px;border-radius:10px;background:var(--panel,#1B1430);border:1px solid var(--line,rgba(255,255,255,.1))}',
    '#scr-party .mk-scorerow.acting{border-color:var(--gold,#FFC542);background:linear-gradient(90deg,rgba(255,197,66,.12),var(--panel,#1B1430))}',
    '#scr-party .mk-scorerow.team0{border-left:4px solid #7FD4FF}',
    '#scr-party .mk-scorerow.team1{border-left:4px solid #FF8494}',
    '#scr-party .mk-sn{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--txt,#F4EFFF);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#scr-party .mk-sn .ico{width:14px;height:14px;color:var(--gold,#FFC542);flex:0 0 auto}',
    '#scr-party .mk-scorerow b{font-family:var(--disp,"Exo 2",sans-serif);font-weight:900;font-size:15px;color:var(--gold,#FFC542);font-variant-numeric:tabular-nums}',

    /* landscape */
    '@media (max-height:520px) and (orientation:landscape){',
    '  #scr-party .mk-wordcard{min-height:96px;padding:14px}',
    '  #scr-party .mk-word{font-size:clamp(24px,6vw,36px)}',
    '  #scr-party .mk-handoff{padding:14px}',
    '  #scr-party .mk-passname{font-size:24px}',
    '  #scr-party .mk-passico{width:48px;height:48px}',
    '}'
  ].join('\n');
  document.head.appendChild(st);
}

})();
