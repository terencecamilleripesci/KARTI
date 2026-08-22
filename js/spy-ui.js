/* ═══════════════════════════════════════════════════════════════════
   KARTI — spy-ui.js   ·   L-ISPJUN — the screen

   The hidden-role word game, played OUT LOUD. Everybody knows the
   word except the spies; the questions, the lying and the shouting
   happen in the room, so the phone's job is to deal, to keep the
   clock, to take the vote — and otherwise to shut up. Most of the
   play screen is deliberately doing very little.

   THE HOUSE PATTERNS THIS FILE FOLLOWS
     · mounts inside #scr-party via KARTI_PARTY.ui.screenEl(), like
       chess/tombla/gharraq. Own CSS injected once, scoped to
       #scr-party .sp-*. Reuses the party kit's .tbar/.pt-over so a
       confirm here looks like a confirm everywhere.
     · registers with kind:'other' — the shelf for games that need no
       board and no cards, just the room.
     · drawn icons only, from its own <symbol> sprite. No emoji.
     · sounds only through js/sfx.js ids that already exist.

   THE SECRECY RULE (the whole game):
   in pass-the-phone the word exists in the DOM ONLY while the hold
   button is physically held down. It is not covered, not opacity:0,
   not behind an overlay — it is NOT THERE. Release, and the text is
   wiped before the frame paints. GĦARRAQHOM dropped pass-the-phone
   because its curtain had to be trusted; here the curtain is the
   mechanism, so it is built to be TRUE instead.

   DESIGN DECISIONS (stated, as asked):
     · TIMER — per round, host picks 5/8/10 minutes (8 is the classic
       published length). Per-question timing was rejected: it kills
       the banter, and the banter is the game.
     · THE THEME IS PUBLIC — everybody, spy included, sees which theme
       tonight's word came from, exactly as the printed game shows the
       full list of possible locations. It keeps the questions
       answerable and gives the spy a fighting chance at a big table.
     · VOTING (one phone) — fingers on three. The app counts down,
       everybody points at once, and the table records who took the
       most fingers. Simultaneous pointing is the anti-loudmouth
       device: nobody gets to vote second.
     · VOTING (online) — secret simultaneous ballots; nothing shows
       until every ballot is in. Plurality convicts; a tie convicts
       nobody, and nobody-convicted is a spy win.
     · STOPPING THE CLOCK EARLY needs the whole table to agree (one
       phone) or more than half the seats to ask for it (online), and
       one phone gets at most two early stops a round. A loudmouth
       cannot end the round alone.
     · THE SPY'S GUESS — a caught spy always gets one last-chance
       guess and steals the round by landing it; a spy may also give
       up mid-round and guess. The guess is a 12-word grid from the
       same theme (1 real + 11 decoys) — an open guess against a pool
       of hundreds is not a guess.
     · SPIES — Auto scales 1 (3–7), 2 (8–11), 3 (12+), or pick 1–3;
       the engine caps it so word-knowers always outnumber spies.
       TWO SPIES DO NOT KNOW EACH OTHER: it is the better party game
       (spies accusing each other is the best minute of the night) and
       it keeps pass-the-phone to one look per player.
     · SCORING — spy win pays each spy 3, table win pays each
       non-spy 1. The spy plays outnumbered; the pot reflects it.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

const P = window.KARTI_PARTY;
const E = window.KARTI_SPY_ENG;
const WRD = window.KARTI_SPY_WORDS;
if (!P || !E || !WRD) return;
const K = window.KARTI;
const U = P.ui, esc = U.esc, ico = U.ico;
const SFX = () => window.KARTI_SFX || null;
const sfx = (id, o) => { const S = SFX(); if (S && S.play) try { S.play(id, o); } catch(e){} };
const note = (n, o) => { const S = SFX(); if (S && S.note) try { S.note(n, o); } catch(e){} };

const GID = 'spy';
const TITLE = 'L-ISPJUN';
const SAVE_KEY = 'karti_spy_v1';
const MINS = [5, 8, 10];
const MIN_NOTE = { 5: 'Fast and vicious.', 8: 'The printed classic.', 10: 'Room for a big table.' };
const EARLY_MAX = 2;

/* ═══ 1 · STATE ════════════════════════════════════════════════════ */
let G = null;    /* pass-the-phone session — see save() for the shape */
let OL = null;   /* online session */
let tick = null; /* the one interval */

function stopTick(){ if (tick){ clearInterval(tick); tick = null; } }

/* ── persistence (pass-the-phone only; online lives and dies with
      the room) ─────────────────────────────────────────────────── */
function save(){
  if (!G) return;
  try {
    const r = G.round;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v:1, players:G.players, cfg:G.cfg, used:G.used, scores:G.scores,
      round: r ? { no:r.no, phase:r.phase, ri:r.ri, remainMs:r.remainMs,
                   early:r.early, askFirst:r.askFirst, nonce:r.nonce,
                   sec: E.veil({ w:r.wordId, s:r.spies }, r.nonce),
                   outcome:r.outcome || null, accused:(r.accused === undefined ? null : r.accused),
                   claimant:(r.claimant === undefined ? null : r.claimant) } : null
    }));
  } catch(e){}
}
function loadSave(){
  try {
    const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!j || j.v !== 1 || !Array.isArray(j.players)) return null;
    return j;
  } catch(e){ return null; }
}
function clearSave(){ try { localStorage.removeItem(SAVE_KEY); } catch(e){} }

/* UI-only state (never game state): is the rules fold open on the menu */
const UI_KEY = 'karti_spy_ui_v1';
function uiPref(){
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch(e){ return {}; }
}
function uiSet(k, v){
  try { const j = uiPref(); j[k] = v; localStorage.setItem(UI_KEY, JSON.stringify(j)); } catch(e){}
}
/* the same two doors cardview.js honours */
function reducedMo(){
  try {
    if (document.body && document.body.classList.contains('reduced')) return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch(e){ return false; }
}

document.addEventListener('visibilitychange', () => { if (document.hidden){ save(); wipeSecret(); } });
window.addEventListener('pagehide', () => { save(); });

/* ── shared bits ─────────────────────────────────────────────────── */
function scr(){ U.css(); injectCSS(); injectSprite(); P.show(); return U.screenEl(); }
function myIco(n){
  if (!n) return '';
  if (n.slice(0, 2) === 'i-') return ico(n.slice(2));
  return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
         '<use href="#' + n + '"></use></svg>';
}
function themeName(t, lang){ return lang === 'en' ? t.en : t.mt; }
function fmtClock(ms){
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function leaveGame(){ stopTick(); wipeSecret(); }

/* every screen hangs its back button on #pt-back so the party kit's
   Escape handling keeps working here for free */
function bar(title, sub){
  return '<div class="tbar">' +
    '<button class="iconbtn" id="pt-back" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
    '<h2>' + esc(title) + '</h2>' +
    (sub ? '<span class="pt-badge">' + esc(sub) + '</span>' : '') +
  '</div>';
}

/* ═══ 2 · THE SECRET, AND THE ONLY TWO FUNCTIONS THAT TOUCH IT ═════
   One host node, #sp-secret. renderSecret() writes the role into it;
   wipeSecret() empties it. Nothing else in this file ever puts the
   word anywhere near the document, and both modes go through these
   two, so the secrecy proof is a proof about two functions. */
let secretHost = null;
function renderSecret(role){
  /* role: {spy:bool, word, theme, spies:int, lang} */
  if (!secretHost || !secretHost.isConnected) return;
  const L = role.lang === 'en';
  if (role.spy){
    secretHost.innerHTML =
      '<div class="sp-role spy">' +
        '<span class="sp-roleico">' + myIco('sp-spy') + '</span>' +
        '<b>' + (L ? 'YOU ARE THE SPY' : 'INT L-ISPJUN') + '</b>' +
        '<i>' + (L ? 'There is no word for you. Blend in. Nod a lot.'
                   : 'M’hemmx kelma għalik. Idħol fil-parti. Ċaqlaq rasek.') + '</i>' +
        (role.spies > 1
          ? '<i class="sp-more">' + (L ? role.spies + ' spies tonight — you do not know the others.'
                                       : role.spies + ' spjuni illejla — ma tafx min huma l-oħrajn.') + '</i>'
          : '') +
      '</div>';
  } else {
    secretHost.innerHTML =
      '<div class="sp-role word">' +
        '<i class="sp-cat">' + esc(role.theme) + '</i>' +
        '<b class="sp-word">' + esc(role.word) + '</b>' +
        '<i>' + (L ? 'Everyone has this word except the spy.'
                   : 'Kulħadd għandu din il-kelma barra l-ispjun.') + '</i>' +
      '</div>';
  }
}
function wipeSecret(){
  if (secretHost){ secretHost.innerHTML = ''; }
}
window.addEventListener('blur', wipeSecret);

/* the hold-to-peek wiring: word in the DOM only while held */
function wireHold(btn, getRole, onFirstRelease){
  let held = false, seen = false;
  const down = e => {
    if (e) e.preventDefault();
    if (held) return;
    held = true;
    btn.classList.add('held');
    sfx('ui.toggle');
    renderSecret(getRole());
  };
  const up = () => {
    if (!held) return;
    held = false; seen = true;
    btn.classList.remove('held');
    wipeSecret();
    sfx('ui.untoggle');
    if (onFirstRelease) onFirstRelease();
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
  /* keyboard players hold Space or Enter */
  btn.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); down(); } });
  btn.addEventListener('keyup', e => {
    if (e.key === ' ' || e.key === 'Enter') up(); });
  btn.addEventListener('contextmenu', e => e.preventDefault());
  return { seen: () => seen };
}

/* ═══ 3 · SETUP (the tile's front door) ════════════════════════════ */
/* SCREEN ONE — the front door. Hero, the two ways to play (online first,
   then pass-the-phone), and the rules folded at the bottom. No settings
   here: the roster, the language, the word-packs, the spy-count and the
   clock all live one tap deeper, in setupSheet(), reached by PASS THE
   PHONE. This matches ludu/kanun/bomba: a clean chooser, then a setup. */
function menu(){
  leaveGame(); G = null; OL = null;
  const el = scr();
  sfx('party.open');
  const saved = loadSave();
  const hasRound = !!(saved && saved.round && saved.round.phase !== 'verdict');

  const M = window.KARTI_MP;
  const mpKnows = !!(M && M.openFor && M.GAME_KEYS && M.GAME_KEYS.indexOf(GID) >= 0);

  const rulesOpen = !!uiPref().rules;

  el.innerHTML = '<div class="pt-wrap sp-menu">' + bar(TITLE, '18+') +
    '<div class="scroll">' +
      /* the identity piece: four talkers with the word, one hat with nothing */
      '<div class="sp-hero" aria-hidden="true">' +
        '<svg class="sp-heroart" viewBox="0 0 240 100" width="240" height="100" focusable="false">' +
        '<use href="#sp-hero"></use></svg></div>' +
      '<p class="blurb">Everybody gets the same secret word. <b>The spy gets nothing</b> ' +
      'and has to bluff through the questions without knowing what anyone is on about. ' +
      'Catch the spy before the clock runs out — or, if the word is yours to hide, survive.</p>' +

      (hasRound
        ? '<div class="pt-opts" style="margin-bottom:10px"><button class="pt-opt" id="sp-resume">' +
            ico('play') + '<b>Carry on with the round in progress</b>' +
            '<i>Round ' + esc(String(saved.round.no)) + ' — ' + esc(saved.players.join(', ')) + '</i>' +
          '</button></div>'
        : '') +

      /* THE TWO WAYS TO PLAY — big buttons, online first when the relay
         knows the word, then pass-the-phone (which opens the setup). There
         is NO play-with-AI: L-ISPJUN has no machine opponent, by design. */
      '<div class="pt-opts sp-ways">' +
        (mpKnows
          ? '<button class="pt-opt primary" id="sp-online">' +
              ico('users') + '<b>Play online</b>' +
              '<i>Everybody on their own phone, through a KARTI room.</i></button>'
          : '') +
        '<button class="pt-opt' + (mpKnows ? '' : ' primary') + '" id="sp-pass">' +
          myIco('sp-hand') + '<b>Pass the phone</b>' +
          '<i>One phone round the table. Set up the room, then deal each player their word.</i></button>' +
      '</div>' +

      (mpKnows ? '' :
        '<p class="sp-note dim">Online rooms for L-ISPJUN switch on with the next server update — ' +
        'pass-the-phone works right now, no internet needed.</p>') +

      /* THE RULES, AT THE BOTTOM, SLIDING. Closed by default, remembered in a
         UI-only key, and always the last thing in the scroll — never a modal,
         never over anything a player must read. */
      '<section class="sp-fold">' +
        '<button class="sp-foldtg' + (rulesOpen ? ' open' : '') + '" id="sp-foldtg" ' +
          'aria-expanded="' + (rulesOpen ? 'true' : 'false') + '" aria-controls="sp-foldbody">' +
          ico('book') + '<span>How a round works</span>' +
          '<svg class="sp-foldcv" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="sp-foldbody" id="sp-foldbody"' + (rulesOpen ? '' : ' hidden') + '>' +
          rulesPanel() + '</div>' +
      '</section>' +
      '<div style="height:8px"></div>' +
    '</div></div>';

  /* the rules fold: real button, real aria, state survives a reload */
  { const tg = el.querySelector('#sp-foldtg');
    const body = el.querySelector('#sp-foldbody');
    tg.onclick = () => {
      const open = body.hidden;
      body.hidden = !open;
      tg.setAttribute('aria-expanded', open ? 'true' : 'false');
      tg.classList.toggle('open', open);
      uiSet('rules', open ? 1 : 0);
      sfx(open ? 'ui.sheet' : 'ui.back', { gain: 0.5 });
      if (open){
        if (!reducedMo()){
          body.classList.add('anim');
          body.addEventListener('animationend', () => body.classList.remove('anim'), { once: true });
        }
        body.scrollIntoView({ block: 'nearest', behavior: reducedMo() ? 'auto' : 'smooth' });
      }
    };
  }
  el.querySelector('#pt-back').onclick = () => { leaveGame(); P.hub(); };
  { const r = el.querySelector('#sp-resume');
    if (r) r.onclick = () => resumeSaved(saved); }
  { const o = el.querySelector('#sp-online');
    if (o) o.onclick = () => {
      /* seed the host sheet from the last-used answers, exactly as before */
      const pf = P.pref(GID);
      const themes = (Array.isArray(pf.themes) && pf.themes.length
        ? pf.themes.filter(id => WRD.theme(id)) : WRD.themes.map(t => t.id));
      P.pref(GID, {
        themes: themes.length ? themes : WRD.themes.map(t => t.id),
        lang: pf.lang === 'en' ? 'en' : 'mt',
        spies: [0, 1, 2, 3].indexOf(pf.spies | 0) >= 0 ? (pf.spies | 0) : 0,
        mins: MINS.indexOf(pf.mins | 0) >= 0 ? (pf.mins | 0) : 8,
        roster: (Array.isArray(pf.roster) ? pf.roster : [])
      });
      sfx('ui.tap');
      M.openFor(GID);
    }; }
  el.querySelector('#sp-pass').onclick = () => { sfx('ui.tap'); setupSheet(); };
}

/* SCREEN TWO — the pass-the-phone setup, reached only after PASS THE
   PHONE. This is the block that used to be the whole menu: the roster,
   the language, the word-packs, the spy-count and the clock, and the
   Start button. The pickers and #sp-start SHARE ONE DOM SCOPE and query
   each other, so they must stay together — they are one unit here, never
   split across screens. Back goes to the chooser, no popup. */
function setupSheet(){
  leaveGame(); G = null; OL = null;
  const el = scr();
  const pf = P.pref(GID);

  /* working copy of the setup answers */
  const cfg = {
    themes: Array.isArray(pf.themes) && pf.themes.length ? pf.themes.slice() : WRD.themes.map(t => t.id),
    lang: pf.lang === 'en' ? 'en' : 'mt',
    spies: [0, 1, 2, 3].indexOf(pf.spies | 0) >= 0 ? (pf.spies | 0) : 0,
    mins: MINS.indexOf(pf.mins | 0) >= 0 ? (pf.mins | 0) : 8
  };
  cfg.themes = cfg.themes.filter(id => WRD.theme(id));
  if (!cfg.themes.length) cfg.themes = WRD.themes.map(t => t.id);
  let roster = (Array.isArray(pf.roster) ? pf.roster : []).slice(0, 16);

  el.innerHTML = '<div class="pt-wrap sp-menu sp-setup">' + bar(TITLE, '18+') +
    '<div class="scroll">' +

      '<div class="tiny pt-lbl">Who is in the room (3–16)</div>' +
      '<div class="sp-chips" id="sp-roster" aria-label="Players"></div>' +
      '<div class="sp-addrow">' +
        '<input class="field" id="sp-name" maxlength="14" placeholder="Add a name" ' +
          'autocomplete="off" spellcheck="false" aria-label="Add a player">' +
        '<button class="btn sm" id="sp-add">' + (window.ILB ? window.ILB('plus', 'Add') : 'Add') + '</button>' +
      '</div>' +

      '<div class="tiny pt-lbl">The words — in which language</div>' +
      '<div class="pt-opts two" id="sp-lang">' +
        '<button class="pt-opt" data-v="mt">' + myIco('sp-say') + '<b>Bil-Malti</b><i>Il-każin, il-wirdiena, il-ġostra — kif jgħiduhom in-nies.</i></button>' +
        '<button class="pt-opt" data-v="en">' + myIco('sp-say') + '<b>In English</b><i>The same words with their English labels.</i></button>' +
      '</div>' +

      '<div class="tiny pt-lbl">Themes — pick one, some, or the lot</div>' +
      '<div class="sp-themes" id="sp-themes"></div>' +
      '<button class="btn sm ghost sp-all" id="sp-all">Everything</button>' +

      '<div class="tiny pt-lbl">How many spies</div>' +
      '<div class="pt-opts" id="sp-spies">' +
        '<button class="pt-opt" data-v="0">' + myIco('sp-spy') + '<b>Auto</b>' +
          '<i>One spy up to 7 players, two from 8, three from 12. More spies, harder hunt.</i></button>' +
        '<button class="pt-opt" data-v="1">' + myIco('sp-spy') + '<b>One</b><i>The classic hunt.</i></button>' +
        '<button class="pt-opt" data-v="2">' + myIco('sp-spy') + '<b>Two</b><i>They do not know each other. Needs 5+ players.</i></button>' +
        '<button class="pt-opt" data-v="3">' + myIco('sp-spy') + '<b>Three</b><i>Chaos. Needs 7+ players.</i></button>' +
      '</div>' +
      '<p class="sp-note" id="sp-spynote"></p>' +

      '<div class="tiny pt-lbl">The clock</div>' +
      '<div class="pt-opts three" id="sp-mins">' +
        MINS.map(m => '<button class="pt-opt mid" data-v="' + m + '">' + myIco('sp-timer') +
          '<b>' + m + ' min</b><i>' + MIN_NOTE[m] + '</i></button>').join('') +
      '</div>' +
      '<div style="height:8px"></div>' +
    '</div>' +
    '<div class="pt-startbar"><button class="btn primary" id="sp-start"></button></div></div>';

  /* back to the chooser — no popup; nothing here is a live round */
  el.querySelector('#pt-back').onclick = () => { sfx('ui.back'); menu(); };

  const themesEl = el.querySelector('#sp-themes');
  const paintThemes = () => {
    themesEl.innerHTML = WRD.themes.map(t =>
      '<button class="sp-theme' + (cfg.themes.indexOf(t.id) >= 0 ? ' on' : '') +
        (t.id === 'night' || t.id === 'morning' ? ' adult' : '') + '" data-t="' + esc(t.id) + '">' +
        myIco(t.ico) +
        '<b>' + esc(themeName(t, cfg.lang)) + '</b>' +
        '<i>' + t.words.length + ' words' + (t.id === 'night' || t.id === 'morning' ? ' · 18+' : '') + '</i>' +
      '</button>').join('');
    themesEl.querySelectorAll('.sp-theme').forEach(b => b.onclick = () => {
      const id = b.dataset.t;
      const at = cfg.themes.indexOf(id);
      if (at >= 0){ if (cfg.themes.length > 1) cfg.themes.splice(at, 1); }
      else cfg.themes.push(id);
      sfx('ui.toggle', { gain: 0.4 });
      paintThemes(); syncStart();
    });
  };

  const rosterEl = el.querySelector('#sp-roster');
  const paintRoster = () => {
    rosterEl.innerHTML = roster.length
      ? roster.map((n, i) =>
          '<span class="sp-chip"><span>' + esc(n) + '</span>' +
          '<button data-i="' + i + '" aria-label="Remove ' + esc(n) + '">' + ico('close') + '</button></span>').join('')
      : '<span class="sp-empty">Nobody yet — add the room, one name each.</span>';
    rosterEl.querySelectorAll('button').forEach(b => b.onclick = () => {
      roster.splice(Number(b.dataset.i), 1);
      sfx('ui.back', { gain: 0.4 });
      paintRoster(); syncStart();
    });
  };
  const addName = () => {
    const inp = el.querySelector('#sp-name');
    const n = (inp.value || '').trim().slice(0, 14);
    if (!n) return;
    if (roster.length >= 16){ if (K && K.toast) K.toast('Sixteen is the whole table.'); return; }
    if (roster.some(x => x.toLowerCase() === n.toLowerCase())){
      if (K && K.toast) K.toast(n + ' is already in.');
      inp.value = ''; return;
    }
    roster.push(n);
    inp.value = ''; inp.focus();
    sfx('ui.tap');
    paintRoster(); syncStart();
  };
  el.querySelector('#sp-add').onclick = addName;
  el.querySelector('#sp-name').addEventListener('keydown', e => { if (e.key === 'Enter') addName(); });

  const syncOpts = () => {
    el.querySelectorAll('#sp-lang .pt-opt').forEach(b => b.classList.toggle('on', b.dataset.v === cfg.lang));
    el.querySelectorAll('#sp-spies .pt-opt').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === cfg.spies));
    el.querySelectorAll('#sp-mins .pt-opt').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === cfg.mins));
    const n = roster.length;
    const noteEl = el.querySelector('#sp-spynote');
    if (n >= 3){
      const got = E.spyCount(n, cfg.spies);
      const want = cfg.spies || E.autoSpies(n);
      noteEl.textContent = got < want
        ? 'With ' + n + ' players the most this table can hide is ' + got +
          (got === 1 ? ' spy' : ' spies') + ' — the word-knowers must stay the majority.'
        : 'Tonight: ' + got + (got === 1 ? ' spy' : ' spies') + ' among ' + n + '.';
    } else noteEl.textContent = '';
  };
  const syncStart = () => {
    syncOpts();
    const btn = el.querySelector('#sp-start');
    const n = roster.length;
    const pool = E.poolFor(cfg.themes).length;
    const ok = n >= 3;
    btn.disabled = !ok;
    btn.innerHTML = window.ILB
      ? window.ILB('play', ok ? 'Deal the word — ' + pool + ' in the bag' : 'Needs 3 players')
      : 'Start';
  };
  el.querySelectorAll('#sp-lang .pt-opt').forEach(b => b.onclick = () => { cfg.lang = b.dataset.v; sfx('ui.toggle', { gain:0.4 }); paintThemes(); syncStart(); });
  el.querySelectorAll('#sp-spies .pt-opt').forEach(b => b.onclick = () => { cfg.spies = Number(b.dataset.v); sfx('ui.toggle', { gain:0.4 }); syncStart(); });
  el.querySelectorAll('#sp-mins .pt-opt').forEach(b => b.onclick = () => { cfg.mins = Number(b.dataset.v); sfx('ui.toggle', { gain:0.4 }); syncStart(); });

  paintThemes(); paintRoster(); syncStart();

  el.querySelector('#sp-all').onclick = () => {
    cfg.themes = WRD.themes.map(t => t.id);
    sfx('ui.toggle', { gain:0.4 });
    paintThemes(); syncStart();
  };

  el.querySelector('#sp-start').onclick = () => {
    if (roster.length < 3) return;
    P.pref(GID, { themes:cfg.themes, lang:cfg.lang, spies:cfg.spies, mins:cfg.mins, roster });
    G = {
      players: roster.slice(),
      cfg: { themes:cfg.themes.slice(), lang:cfg.lang, spies:cfg.spies, mins:cfg.mins },
      used: {}, scores: {}, round: null
    };
    const prev = loadSave();
    if (prev && samePlayers(prev.players, G.players)){
      /* same table, same evening: keep the bag and the scores going */
      G.used = prev.used || {};
      G.scores = prev.scores || {};
    }
    startRound(1);
  };
}

function samePlayers(a, b){
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const x = a.slice().sort(), y = b.slice().sort();
  return x.every((v, i) => v === y[i]);
}

function rulesPanel(){
  return '<div class="sp-rulesbody">' +
    '<p><b>THE DEAL.</b> Everybody sees the same secret word except the spy, who sees ' +
    'nothing. The theme is public — spy included — like the location list in the ' +
    'printed games.</p>' +
    '<p><b>THE TALK.</b> The named player asks anyone a question about the word ' +
    '(“would your mother like it?”, “how much does it cost?”). Whoever answers asks the ' +
    'next one — not straight back. Too vague and the table suspects you; too precise ' +
    'and the spy learns the word.</p>' +
    '<p><b>THE VOTE.</b> When the clock dies — or the whole table agrees to stop it — ' +
    'fingers up, count of three, everybody points at once. Most fingers is accused. ' +
    'No majority? The spy walks.</p>' +
    '<p><b>THE STEAL.</b> A caught spy gets one last guess at the word from twelve ' +
    'choices — land it and the round is stolen. A spy may also give up mid-round and ' +
    'guess. Lying about being the spy hands the round to the spies, so don’t.</p>' +
    '<p><b>THE POT.</b> Spies win: 3 points each. Table wins: 1 point each. ' +
    'Two spies never know each other.</p>' +
  '</div>';
}

/* ═══ 4 · PASS-THE-PHONE — the round ═══════════════════════════════ */
function startRound(no){
  const pool = E.poolFor(G.cfg.themes);
  const wordId = E.drawWord(pool, G.used);
  /* the bag remembers the word only once the round has RESOLVED — while
     the round is live its id stays out of the plain-text save, where it
     would undo the veil. An abandoned round returns its word to the bag,
     which is fair: nobody played it out. */
  delete G.used[wordId];
  const n = G.players.length;
  const spies = E.pickSpies(n, E.spyCount(n, G.cfg.spies));
  G.round = {
    no, wordId, spies,
    askFirst: Math.floor(Math.random() * n),
    nonce: (Date.now() ^ (Math.random() * 0xFFFFFF)) >>> 0,
    phase: 'reveal', ri: 0,
    remainMs: G.cfg.mins * 60000,
    early: 0
  };
  save();
  sfx('game.start');
  revealScreen();
}

function roleFor(i){
  const r = G.round;
  const spy = r.spies.indexOf(i) >= 0;
  const t = E.themeOf(r.wordId);
  return {
    spy,
    spies: r.spies.length,
    lang: G.cfg.lang,
    theme: t ? themeName(t, G.cfg.lang) : '',
    word: E.wordOf(r.wordId, G.cfg.lang)
  };
}

/* ── the curtain ──────────────────────────────────────────────────
   Three stages per player, and a hard stop between players:
     1  PASS      "give the phone to NAME" — nothing armed
     2  ARMED     NAME has claimed it; the hold button is live; the
                  word exists only while the button is held
     3  SEEN      released at least once; the only way forward is
                  "pass it on", which arms the NEXT player's stage 1 */
function revealScreen(){
  stopTick(); wipeSecret();
  const el = scr();
  const r = G.round;
  const name = G.players[r.ri];
  const t = E.themeOf(r.wordId);
  const last = r.ri === G.players.length - 1;

  el.innerHTML = bar(TITLE, 'Round ' + r.no) +
    '<div class="sp-stage">' +
      '<div class="sp-curtain" id="sp-curtain">' +
        '<span class="sp-passico">' + myIco('sp-hand') + '</span>' +
        '<i class="sp-passlbl">Pass the phone to</i>' +
        '<b class="sp-passname">' + esc(name) + '</b>' +
        '<i class="sp-passhint">' + (r.ri === 0
            ? 'Theme tonight: <b>' + esc(t ? themeName(t, G.cfg.lang) : '') + '</b>. One look each, in this order, no second phones.'
            : 'Eyes off, everybody else.') + '</i>' +
        '<button class="btn primary sp-claim" id="sp-claim">' +
          (window.ILB ? window.ILB('check', 'I’m ' + esc(name) + ' — nobody else is looking') : 'It’s me') + '</button>' +
      '</div>' +
      '<div class="sp-armed" id="sp-armed" hidden>' +
        '<i class="sp-passlbl">' + esc(name) + ' — hold to look, let go to hide</i>' +
        '<div class="sp-secret" id="sp-secret" aria-live="polite"></div>' +
        '<button class="sp-hold" id="sp-hold" aria-label="Hold to see your word, release to hide it">' +
          '<span class="sp-holdico">' + myIco('sp-eye') + '</span>' +
          '<span class="sp-holdlbl">HOLD</span>' +
        '</button>' +
        '<button class="btn primary sp-next" id="sp-next" disabled>' +
          (window.ILB ? window.ILB('arrow-right', last ? 'Hidden — start the round' : 'Hidden — pass it on') : 'Pass it on') + '</button>' +
      '</div>' +
    '</div>';

  el.querySelector('#pt-back').onclick = confirmQuit;
  const armed = el.querySelector('#sp-armed');
  const curtain = el.querySelector('#sp-curtain');
  el.querySelector('#sp-claim').onclick = () => {
    sfx('ui.sheet');
    curtain.hidden = true;
    armed.hidden = false;
    el.querySelector('#sp-hold').focus();
  };
  secretHost = el.querySelector('#sp-secret');
  const nextBtn = el.querySelector('#sp-next');
  wireHold(el.querySelector('#sp-hold'), () => roleFor(r.ri), () => { nextBtn.disabled = false; });
  nextBtn.onclick = () => {
    wipeSecret();
    sfx('ui.swipe');
    r.ri++;
    if (r.ri >= G.players.length){ r.phase = 'play'; save(); playScreen(true); }
    else { save(); revealScreen(); }
  };
}

/* ── the round itself: mostly a clock, on purpose ────────────────── */
function playScreen(fresh){
  stopTick(); wipeSecret();
  const el = scr();
  const r = G.round;
  r.phase = 'play';               /* wherever we came from, this IS play */
  save();
  const t = E.themeOf(r.wordId);
  let running = !!fresh;

  el.innerHTML = bar(TITLE, 'Round ' + r.no) +
    '<div class="sp-stage">' +
      '<div class="sp-playtop">' +
        '<i class="sp-cat big">' + esc(t ? themeName(t, G.cfg.lang) : '') + '</i>' +
        '<div class="sp-clock" id="sp-clock" role="timer">' + fmtClock(r.remainMs) + '</div>' +
        '<i class="sp-asks"><b>' + esc(G.players[r.askFirst]) + '</b> asks first. Answerer asks next — never straight back.</i>' +
      '</div>' +
      '<div class="sp-table">' +
        G.players.map(n => '<span class="sp-seat">' + esc(n) + '</span>').join('') +
      '</div>' +
      (running ? '' :
        '<button class="btn primary sp-resumeclock" id="sp-go">' +
          (window.ILB ? window.ILB('play', 'Carry on — ' + fmtClock(r.remainMs) + ' left') : 'Carry on') + '</button>') +
      '<div class="sp-playbar">' +
        '<button class="btn sm ghost" id="sp-early"' + (r.early >= EARLY_MAX ? ' disabled' : '') + '>' +
          (window.ILB ? window.ILB('users', 'Vote now') : 'Vote now') + '</button>' +
        '<button class="btn sm ghost" id="sp-confess">' +
          (window.ILB ? window.ILB('flag', 'The spy gives up') : 'Give up') + '</button>' +
      '</div>' +
    '</div>';

  el.querySelector('#pt-back').onclick = confirmQuit;
  const clockEl = el.querySelector('#sp-clock');
  let lastBeep = 99;
  const run = () => {
    stopTick();
    let at = Date.now();
    tick = setInterval(() => {
      /* the app navigated out from under us: stop counting rather than
         paint a vote screen over whatever took over */
      if (!clockEl.isConnected){ stopTick(); save(); return; }
      const now = Date.now();
      r.remainMs -= (now - at); at = now;
      if (r.remainMs <= 0){
        r.remainMs = 0;
        stopTick();
        save();
        sfx('ui.toast');
        voteScreen(false);
        return;
      }
      clockEl.textContent = fmtClock(r.remainMs);
      const s = Math.ceil(r.remainMs / 1000);
      clockEl.classList.toggle('low', s <= 30);
      if (s <= 10 && s !== lastBeep){ lastBeep = s; note(2, { gain: 0.35 }); }
      if (s % 5 === 0) save();
    }, 250);
  };
  if (running) run();
  else {
    const go = el.querySelector('#sp-go');
    go.onclick = () => { go.remove(); running = true; sfx('game.start'); run(); };
  }

  el.querySelector('#sp-early').onclick = () => {
    if (r.early >= EARLY_MAX) return;
    stopTick(); save();
    U.confirm({ root: el }, {
      head: 'Stop the clock?',
      why: 'Only if the WHOLE table agrees to vote now. One objection and the clock runs on. ' +
           (EARLY_MAX - r.early) + ' early stop' + (EARLY_MAX - r.early === 1 ? '' : 's') + ' left this round.',
      yes: 'Everyone agrees — vote',
      no: 'Somebody objected',
      go: () => { r.early++; save(); sfx('ui.sheet'); voteScreen(true); },
      onNo: () => { playScreen(true); }
    });
  };
  el.querySelector('#sp-confess').onclick = () => {
    stopTick(); save();
    U.confirm({ root: el }, {
      head: 'A spy gives up?',
      why: 'Say it out loud first. The spy gets ONE guess at the word — right steals the ' +
           'round, wrong loses it. If you are lying about being the spy, the spies win. ',
      yes: 'Yes — who is it?',
      no: 'Nobody said that',
      go: () => pickClaimant(),
      onNo: () => playScreen(true)
    });
  };
}

function pickClaimant(){
  const el = scr();
  el.innerHTML = bar(TITLE, 'Round ' + G.round.no) +
    '<div class="sp-stage">' +
      '<i class="sp-passlbl">Who says they are the spy?</i>' +
      '<div class="sp-votegrid">' +
        G.players.map((n, i) => '<button class="sp-cand" data-i="' + i + '">' + esc(n) + '</button>').join('') +
      '</div>' +
      '<button class="btn ghost" id="sp-back2">' + (window.ILB ? window.ILB('back', 'Back to the clock') : 'Back') + '</button>' +
    '</div>';
  el.querySelector('#pt-back').onclick = confirmQuit;
  el.querySelector('#sp-back2').onclick = () => playScreen(false);
  el.querySelectorAll('.sp-cand').forEach(b => b.onclick = () => {
    const i = Number(b.dataset.i);
    G.round.claimant = i;
    G.round.phase = 'guess'; save();
    guessScreen(i, 'confess');
  });
}

/* ── the vote: fingers on three ───────────────────────────────────── */
function voteScreen(early){
  stopTick(); wipeSecret();
  const el = scr();
  const r = G.round;
  r.phase = 'vote'; save();

  el.innerHTML = bar(TITLE, 'Round ' + r.no) +
    '<div class="sp-stage">' +
      '<div id="sp-votebox">' +
        '<span class="sp-passico">' + myIco('sp-hand') + '</span>' +
        '<i class="sp-passlbl">Fingers up. On three, EVERYBODY points at their spy. No waiting to see.</i>' +
        '<button class="btn primary sp-count" id="sp-count">' +
          (window.ILB ? window.ILB('play', 'Count us down') : 'Count us down') + '</button>' +
      '</div>' +
    '</div>';

  el.querySelector('#pt-back').onclick = confirmQuit;
  el.querySelector('#sp-count').onclick = () => {
    const box = el.querySelector('#sp-votebox');
    const beats = ['3', '2', '1', 'POINT!'];
    let i = 0;
    box.innerHTML = '<div class="sp-beat" id="sp-beat">3</div>';
    const beat = el.querySelector('#sp-beat');
    const step = () => {
      if (!beat.isConnected) return;
      beat.textContent = beats[i];
      beat.classList.toggle('go', i === 3);
      note(i === 3 ? 5 : 2 + i, { gain: 0.6 });
      i++;
      if (i < beats.length) setTimeout(step, 700);
      else setTimeout(() => tallyFingers(early), 900);
    };
    step();
  };
}

function tallyFingers(early){
  const el = scr();
  const r = G.round;
  el.innerHTML = bar(TITLE, 'Round ' + r.no) +
    '<div class="sp-stage">' +
      '<i class="sp-passlbl">Who took the most fingers?</i>' +
      '<div class="sp-votegrid">' +
        G.players.map((n, i) => '<button class="sp-cand" data-i="' + i + '">' + esc(n) + '</button>').join('') +
      '</div>' +
      '<button class="btn ghost" id="sp-none">' +
        (window.ILB ? window.ILB('slash', early ? 'Split — back to the clock' : 'No majority — nobody') : 'Nobody') + '</button>' +
    '</div>';
  el.querySelector('#pt-back').onclick = confirmQuit;
  el.querySelector('#sp-none').onclick = () => {
    if (early && r.remainMs > 1000){ sfx('ui.back'); playScreen(false); return; }
    verdict('escaped');
  };
  el.querySelectorAll('.sp-cand').forEach(b => b.onclick = () => {
    const i = Number(b.dataset.i);
    r.accused = i; save();
    if (r.spies.indexOf(i) >= 0){
      sfx('ui.toast');
      G.round.phase = 'guess'; save();
      guessScreen(i, 'lastchance');
    } else {
      verdict('wrong');
    }
  });
}

/* ── the guess grid — 12 words, one true ─────────────────────────── */
function guessScreen(who, why){
  stopTick(); wipeSecret();
  const el = scr();
  const r = G.round;
  const grid = E.decoyGrid(r.wordId, r.nonce);
  const name = G.players[who];

  el.innerHTML = bar(TITLE, 'Round ' + r.no) +
    '<div class="sp-stage scrolly">' +
      '<i class="sp-passlbl">' +
        (why === 'lastchance'
          ? '<b>' + esc(name) + '</b>, the table caught you. One guess steals the round.'
          : '<b>' + esc(name) + '</b> — pick the word. Right steals the round, wrong ends it.') + '</i>' +
      '<div class="sp-guessgrid">' +
        grid.map(id => '<button class="sp-guess" data-id="' + esc(id) + '">' +
          esc(E.wordOf(id, G.cfg.lang)) + '</button>').join('') +
      '</div>' +
    '</div>';
  el.querySelector('#pt-back').onclick = confirmQuit;
  el.querySelectorAll('.sp-guess').forEach(b => b.onclick = () => {
    U.confirm({ root: el }, {
      head: 'Final answer?',
      why: '“' + E.wordOf(b.dataset.id, G.cfg.lang) + '” — no changing it after.',
      yes: 'That is the word',
      no: 'Wait',
      go: () => {
        const right = b.dataset.id === r.wordId;
        const claimantInnocent = (why === 'confess') && r.spies.indexOf(who) < 0;
        if (claimantInnocent){ verdict('wrong'); return; }   /* lied about being the spy */
        verdict(right ? 'stolen' : (why === 'confess' ? 'flopped' : 'caught'));
      }
    });
  });
}

/* ── the verdict ──────────────────────────────────────────────────── */
function verdict(outcome){
  stopTick(); wipeSecret();
  const el = scr();
  const r = G.round;
  r.phase = 'verdict'; r.outcome = outcome;
  G.used[r.wordId] = 1;          /* played out in the open: into the bag's memory */
  const win = E.spiesWin(outcome);
  E.applyScore(G.scores, G.players, r.spies, outcome);
  save();
  sfx(win ? 'game.lose' : 'game.win');

  const spyNames = r.spies.map(i => G.players[i]).join(' u ');
  const word = E.wordOf(r.wordId, G.cfg.lang);
  const LINES = {
    caught:  ['THE TABLE WINS', 'Caught, and the last-chance guess missed.'],
    flopped: ['THE TABLE WINS', 'Gave up, guessed, and guessed wrong.'],
    stolen:  ['THE SPIES WIN', 'Guessed the word. Daylight robbery.'],
    wrong:   ['THE SPIES WIN', 'The table pointed at an innocent.'],
    escaped: ['THE SPIES WIN', 'The clock died and nobody agreed.']
  };
  const board = G.players.map((n, i) =>
    '<div class="sp-scorerow' + (r.spies.indexOf(i) >= 0 ? ' spy' : '') + '">' +
      '<span class="sp-sn">' + (r.spies.indexOf(i) >= 0 ? myIco('sp-spy') : '') + esc(n) + '</span>' +
      '<b>' + (G.scores[n] || 0) + '</b>' +
    '</div>').join('');

  el.innerHTML = bar(TITLE, 'Round ' + r.no) +
    '<div class="scroll">' +
      '<div class="sp-verdict ' + (win ? 'spies' : 'table') + '">' +
        '<span class="sp-vico">' + myIco(win ? 'sp-spy' : 'sp-hand') + '</span>' +
        '<h3>' + LINES[outcome][0] + '</h3>' +
        '<p>' + LINES[outcome][1] + '</p>' +
        '<p class="sp-vword">The word was <b>' + esc(word) + '</b>. ' +
          (r.spies.length === 1 ? 'The spy was <b>' + esc(spyNames) + '</b>.'
                                : 'The spies were <b>' + esc(spyNames) + '</b>.') + '</p>' +
      '</div>' +
      '<div class="tiny pt-lbl">The pot so far</div>' +
      '<div class="sp-scores">' + board + '</div>' +
      '<div class="sp-endacts">' +
        '<button class="btn primary" id="sp-again">' + (window.ILB ? window.ILB('play', 'Next round — new word') : 'Next round') + '</button>' +
        '<button class="btn ghost" id="sp-setup">' + (window.ILB ? window.ILB('users', 'Change the table') : 'Change the table') + '</button>' +
        '<button class="btn ghost" id="sp-done">' + (window.ILB ? window.ILB('back', 'Finish for tonight') : 'Finish') + '</button>' +
      '</div>' +
    '</div>';
  el.querySelector('#pt-back').onclick = () => menu();
  el.querySelector('#sp-again').onclick = () => startRound(r.no + 1);
  el.querySelector('#sp-setup').onclick = () => menu();
  el.querySelector('#sp-done').onclick = () => {
    clearSave(); G = null;
    P.hub();
  };
}

function confirmQuit(){
  const el = U.screenEl();
  stopTick(); save();
  U.confirm({ root: el }, {
    head: 'Walk away mid-round?',
    why: 'The round is saved — you can carry on from the tile. Nobody’s word gets shown.',
    yes: 'Leave it saved',
    no: 'Keep playing',
    go: () => { leaveGame(); P.hub(); },
    onNo: () => { if (G && G.round && G.round.phase === 'play') playScreen(false); }
  });
}

function resumeSaved(j){
  const sec = E.unveil(j.round.sec, j.round.nonce);
  if (!sec){ clearSave(); menu(); return; }
  G = { players: j.players, cfg: j.cfg, used: j.used || {}, scores: j.scores || {},
        round: { no: j.round.no, wordId: sec.w, spies: sec.s, askFirst: j.round.askFirst,
                 nonce: j.round.nonce, phase: j.round.phase, ri: j.round.ri | 0,
                 remainMs: Math.max(0, j.round.remainMs | 0), early: j.round.early | 0,
                 outcome: j.round.outcome || null,
                 accused: j.round.accused, claimant: j.round.claimant } };
  const ph = G.round.phase;
  sfx('ui.sheet');
  if (ph === 'reveal') revealScreen();
  else if (ph === 'play') playScreen(false);
  else if (ph === 'vote') voteScreen(false);
  else if (ph === 'guess'){
    const who = (G.round.claimant !== null && G.round.claimant !== undefined) ? G.round.claimant : G.round.accused;
    if (who === null || who === undefined) playScreen(false);
    else guessScreen(who, G.round.claimant !== null && G.round.claimant !== undefined ? 'confess' : 'lastchance');
  }
  else if (ph === 'verdict' && G.round.outcome) verdict(G.round.outcome);
  else playScreen(false);
}

/* ═══ 5 · ONLINE — everybody on their own phone ════════════════════
   js/mp.js owns the sockets and the roster; this half owns the round.
   Everything secret is derived LOCALLY from the shared seed — the
   word never crosses the wire. What crosses: the host's setup (cfg),
   vote-now requests (callv), secret ballots (vote), a spy giving up
   (confess), the guess (slot index), the host's phase pushes, and
   next-round. All of it fits the relay's five bounded fields.

   Move shapes (wire codec form, fields ['v','i','j','s','n']):
     cfg     {t:'cfg', i:maskLo, j:maskHi, s:spySetting, n:mins, v:mt?}
     callv   {t:'callv'}
     vote    {t:'vote', i:target+1}          0 = nobody
     confess {t:'confess'}
     guess   {t:'guess', i:slot}
     phase   {t:'phase', i:1|2|3}            host only: 1 open vote,
                                             2 close vote, 3 guess timed out
     next    {t:'next', n:round}             host only                     */
const OL_VOTE_GRACE = 60000, OL_GUESS_GRACE = 90000;

function olSend(mv){
  if (!OL || !OL.net) return;
  /* fold onto the codec shape mp.js's fromWire expects on the far side */
  const fields = ['v', 'i', 'j', 's', 'n'];
  let mask = 0; const vals = [];
  fields.forEach((f, at) => {
    const v = mv[f];
    if (v === undefined || v === null) return;
    mask |= (1 << at);
    vals.push(v === true ? 1 : v === false ? 0 : (v | 0));
  });
  const out = { a: mv.t, n: mask };
  if (vals.length) out.k = vals;
  OL.net.send({ kind: 'move', m: out });
}

function onlineStart(cfg){
  leaveGame(); G = null;
  const seats = (cfg.seats || []).filter(Boolean);
  OL = {
    seed: cfg.seed >>> 0, me: cfg.you | 0, host: (cfg.host | 0) === (cfg.you | 0),
    hostSeat: cfg.host | 0,
    names: seats.map(s => s.name || 'PLAYER'),
    n: seats.length,
    net: cfg.net || null,
    cfg: null, round: 0, deal: null,
    phase: 'cfg', shown: false,
    votes: {}, calls: {}, myVote: null,
    guessWho: -1, outcome: null,
    scores: {}, timers: {}
  };
  mountOnline();
  /* paint the stage NOW, for everybody. Without this the non-hosts
     stared at a completely blank screen until the host dealt — the
     "…is picking the themes" line existed but was never painted. */
  paintOnline();
  if (OL.host) hostCfgSheet();
  return true;
}

function hostCfgSheet(){
  const pf = P.pref(GID);
  const cfg = {
    themes: (Array.isArray(pf.themes) && pf.themes.length ? pf.themes : WRD.themes.map(t => t.id))
              .filter(id => WRD.theme(id)),
    lang: pf.lang === 'en' ? 'en' : 'mt',
    spies: [0,1,2,3].indexOf(pf.spies | 0) >= 0 ? (pf.spies | 0) : 0,
    mins: MINS.indexOf(pf.mins | 0) >= 0 ? (pf.mins | 0) : 8
  };
  if (!cfg.themes.length) cfg.themes = WRD.themes.map(t => t.id);
  const root = OL.root;
  const sheet = document.createElement('div');
  sheet.className = 'pt-over sp-cfgsheet';
  sheet.innerHTML =
    '<div class="pt-card sp-cfgcard">' +
      '<h3>Set the table</h3>' +
      '<p class="pt-why">Your table, your rules — everybody’s phone deals the same round.</p>' +
      '<div class="sp-themes tight" id="sp-oth"></div>' +
      '<div class="sp-cfgrow" id="sp-olang">' +
        '<button data-v="mt" class="btn sm ghost">Bil-Malti</button>' +
        '<button data-v="en" class="btn sm ghost">English</button></div>' +
      '<div class="sp-cfgrow" id="sp-ospies">' +
        '<button data-v="0" class="btn sm ghost">Auto</button>' +
        '<button data-v="1" class="btn sm ghost">1 spy</button>' +
        '<button data-v="2" class="btn sm ghost">2</button>' +
        '<button data-v="3" class="btn sm ghost">3</button></div>' +
      '<div class="sp-cfgrow" id="sp-omins">' +
        MINS.map(m => '<button data-v="' + m + '" class="btn sm ghost">' + m + ' min</button>').join('') + '</div>' +
      '<div class="pt-acts"><button class="btn primary" id="sp-odeal"></button></div>' +
    '</div>';
  root.appendChild(sheet);
  const paint = () => {
    const th = sheet.querySelector('#sp-oth');
    th.innerHTML = WRD.themes.map(t =>
      '<button class="sp-theme sm' + (cfg.themes.indexOf(t.id) >= 0 ? ' on' : '') + '" data-t="' + esc(t.id) + '">' +
        '<b>' + esc(themeName(t, cfg.lang)) + '</b><i>' + t.words.length + '</i></button>').join('');
    th.querySelectorAll('.sp-theme').forEach(b => b.onclick = () => {
      const at = cfg.themes.indexOf(b.dataset.t);
      if (at >= 0){ if (cfg.themes.length > 1) cfg.themes.splice(at, 1); }
      else cfg.themes.push(b.dataset.t);
      paint();
    });
    sheet.querySelectorAll('#sp-olang .btn').forEach(b => b.classList.toggle('primary', b.dataset.v === cfg.lang));
    sheet.querySelectorAll('#sp-ospies .btn').forEach(b => b.classList.toggle('primary', Number(b.dataset.v) === cfg.spies));
    sheet.querySelectorAll('#sp-omins .btn').forEach(b => b.classList.toggle('primary', Number(b.dataset.v) === cfg.mins));
    sheet.querySelector('#sp-odeal').innerHTML = window.ILB
      ? window.ILB('play', 'Deal — ' + E.poolFor(cfg.themes).length + ' words in the bag') : 'Deal';
  };
  sheet.querySelectorAll('#sp-olang .btn').forEach(b => b.onclick = () => { cfg.lang = b.dataset.v; paint(); });
  sheet.querySelectorAll('#sp-ospies .btn').forEach(b => b.onclick = () => { cfg.spies = Number(b.dataset.v); paint(); });
  sheet.querySelectorAll('#sp-omins .btn').forEach(b => b.onclick = () => { cfg.mins = Number(b.dataset.v); paint(); });
  paint();
  sheet.querySelector('#sp-odeal').onclick = () => {
    P.pref(GID, { themes: cfg.themes, lang: cfg.lang, spies: cfg.spies, mins: cfg.mins });
    sheet.remove();
    /* mask over the theme list, two bytes */
    let mask = 0;
    WRD.themes.forEach((t, i) => { if (cfg.themes.indexOf(t.id) >= 0) mask |= (1 << i); });
    olSend({ t:'cfg', i: mask & 255, j: (mask >> 8) & 255, s: cfg.spies, n: cfg.mins, v: cfg.lang === 'mt' });
    olApplyCfg(mask, cfg.spies, cfg.mins, cfg.lang === 'mt');
  };
}

function olApplyCfg(mask, spies, mins, isMt){
  const themes = WRD.themes.filter((t, i) => mask & (1 << i)).map(t => t.id);
  OL.cfg = {
    themes: themes.length ? themes : WRD.themes.map(t => t.id),
    lang: isMt ? 'mt' : 'en',
    spies: spies | 0,
    mins: MINS.indexOf(mins | 0) >= 0 ? (mins | 0) : 8
  };
  olDeal(1);
}

function olDeal(round){
  OL.round = round;
  OL.deal = E.onlineDeal(OL.seed, round, OL.cfg.themes, OL.n, OL.cfg.spies);
  OL.phase = 'play';
  OL.shown = false;
  OL.votes = {}; OL.calls = {}; OL.myVote = null;
  OL.guessWho = -1; OL.outcome = null;
  OL.endsAt = Date.now() + OL.cfg.mins * 60000;
  sfx('game.start');
  paintOnline();
}

function olRole(){
  const d = OL.deal;
  const spy = d.spies.indexOf(OL.me) >= 0;
  const t = E.themeOf(d.wordId);
  return { spy, spies: d.spies.length, lang: OL.cfg.lang,
           theme: t ? themeName(t, OL.cfg.lang) : '',
           word: E.wordOf(d.wordId, OL.cfg.lang) };
}

function mountOnline(){
  const el = scr();
  el.innerHTML = bar(TITLE, 'Online') +
    '<div class="pt-net" id="sp-net" role="status" aria-live="polite" hidden></div>' +
    '<div class="sp-stage" id="sp-olstage"></div>';
  OL.root = el;
  OL.stage = el.querySelector('#sp-olstage');
  OL.netEl = el.querySelector('#sp-net');
  el.querySelector('#pt-back').onclick = () => {
    U.confirm({ root: el }, {
      head: 'Leave the room?',
      why: 'The table plays on without you.',
      yes: 'Leave', no: 'Stay',
      go: () => { const n = OL && OL.net; olLeave(); if (n && n.onLeave) n.onLeave(); else P.hub(); }
    });
  };
}

function olLeave(){
  stopTick(); wipeSecret();
  for (const k in (OL && OL.timers) || {}) clearTimeout(OL.timers[k]);
  OL = null;
}

function paintOnline(){
  if (!OL || !OL.stage || !OL.stage.isConnected) return;
  stopTick(); wipeSecret();
  const st = OL.stage;

  if (OL.phase === 'cfg'){
    const hostGone = !!(OL.gone && OL.gone[OL.hostSeat] && !OL.host);
    st.innerHTML = '<div class="sp-waiting">' +
      '<span class="sp-passico">' + myIco('sp-spy') + '</span>' +
      '<i class="sp-passlbl">' + (OL.host ? 'Set the table above.' :
        hostGone ? 'The host left before dealing — use Back to return to the rooms.' :
        esc(OL.names[OL.hostSeat] || 'The host') + ' is picking the themes…') + '</i></div>';
    return;
  }

  if (OL.phase === 'play'){
    const t = E.themeOf(OL.deal.wordId);
    const remain = Math.max(0, OL.endsAt - Date.now());
    st.innerHTML =
      '<div class="sp-playtop">' +
        '<i class="sp-cat big">' + esc(t ? themeName(t, OL.cfg.lang) : '') + '</i>' +
        '<div class="sp-clock" id="sp-clock" role="timer">' + fmtClock(remain) + '</div>' +
        '<i class="sp-asks"><b>' + esc(OL.names[OL.deal.askFirst]) + '</b> asks first.</i>' +
      '</div>' +
      '<div class="sp-secret ol" id="sp-secret"></div>' +
      '<button class="sp-peek" id="sp-peek" aria-label="Tap to show your word, tap again to hide">' +
        '<span class="sp-holdico">' + myIco('sp-eye') + '</span>' +
        '<span class="sp-holdlbl" id="sp-peeklbl">TAP TO LOOK</span>' +
      '</button>' +
      '<div class="sp-table">' +
        OL.names.map((n, i) => '<span class="sp-seat' + (OL.calls[i] ? ' called' : '') + '">' + esc(n) + '</span>').join('') +
      '</div>' +
      '<div class="sp-playbar">' +
        '<button class="btn sm ghost" id="sp-callv"' + (OL.calls[OL.me] ? ' disabled' : '') + '>' +
          (window.ILB ? window.ILB('users', 'Vote now (' + Object.keys(OL.calls).length + '/' + (Math.floor(OL.n / 2) + 1) + ')') : 'Vote now') + '</button>' +
        (olRole().spy
          ? '<button class="btn sm ghost" id="sp-olconfess">' + (window.ILB ? window.ILB('flag', 'Give up & guess') : 'Give up') + '</button>'
          : '<span></span>') +
      '</div>';

    secretHost = st.querySelector('#sp-secret');
    const peek = st.querySelector('#sp-peek');
    const lbl = st.querySelector('#sp-peeklbl');
    const syncPeek = () => {
      peek.classList.toggle('held', OL.shown);
      lbl.textContent = OL.shown ? 'TAP TO HIDE' : 'TAP TO LOOK';
      if (OL.shown) renderSecret(olRole()); else wipeSecret();
    };
    peek.onclick = () => { OL.shown = !OL.shown; sfx(OL.shown ? 'ui.toggle' : 'ui.untoggle'); syncPeek(); };
    syncPeek();

    const clockEl = st.querySelector('#sp-clock');
    let lastBeep = 99;
    tick = setInterval(() => {
      if (!OL || OL.phase !== 'play' || !clockEl.isConnected){ stopTick(); return; }
      const ms = Math.max(0, OL.endsAt - Date.now());
      clockEl.textContent = fmtClock(ms);
      const s = Math.ceil(ms / 1000);
      clockEl.classList.toggle('low', s <= 30);
      if (s <= 10 && s !== lastBeep){ lastBeep = s; note(2, { gain: 0.35 }); }
      if (ms <= 0){
        stopTick();
        if (OL.host){ olSend({ t:'phase', i:1 }); olOpenVote(); }
        else clockEl.textContent = '0:00';
      }
    }, 250);

    st.querySelector('#sp-callv').onclick = () => {
      olSend({ t:'callv' });
      olCall(OL.me);
    };
    const cf = st.querySelector('#sp-olconfess');
    if (cf) cf.onclick = () => {
      U.confirm({ root: OL.root }, {
        head: 'Give up and guess?',
        why: 'The round stops for everybody. One guess: steal it or lose it.',
        yes: 'Show me the twelve', no: 'Keep bluffing',
        go: () => { olSend({ t:'confess' }); olConfess(OL.me); }
      });
    };
    return;
  }

  if (OL.phase === 'vote'){
    const cast = Object.keys(OL.votes).length;
    st.innerHTML =
      '<i class="sp-passlbl">Secret ballot — nobody sees a vote until every vote is in. ' +
        '<b>' + cast + '/' + OL.n + '</b></i>' +
      '<div class="sp-votegrid">' +
        OL.names.map((n, i) =>
          i === OL.me ? '' :
          '<button class="sp-cand' + (OL.myVote === i ? ' on' : '') + '" data-i="' + i + '"' +
            (OL.myVote !== null ? ' disabled' : '') + '>' + esc(n) + '</button>').join('') +
      '</div>' +
      '<button class="btn ghost" id="sp-olnone"' + (OL.myVote !== null ? ' disabled' : '') + '>' +
        (window.ILB ? window.ILB('slash', 'Nobody — let them walk') : 'Nobody') + '</button>' +
      (OL.myVote !== null ? '<i class="sp-note dim center">Ballot in. Waiting for the table…</i>' : '');
    st.querySelectorAll('.sp-cand').forEach(b => b.onclick = () => {
      OL.myVote = Number(b.dataset.i);
      olSend({ t:'vote', i: OL.myVote + 1 });
      olVote(OL.me, OL.myVote);
    });
    st.querySelector('#sp-olnone').onclick = () => {
      OL.myVote = -1;
      olSend({ t:'vote', i: 0 });
      olVote(OL.me, -1);
    };
    return;
  }

  if (OL.phase === 'guess'){
    const grid = E.decoyGrid(OL.deal.wordId, OL.deal.gridSeed);
    if (OL.guessWho === OL.me){
      st.innerHTML =
        '<i class="sp-passlbl">One guess. Steal it.</i>' +
        '<div class="sp-guessgrid">' +
          grid.map((id, slot) => '<button class="sp-guess" data-s="' + slot + '">' +
            esc(E.wordOf(id, OL.cfg.lang)) + '</button>').join('') +
        '</div>';
      st.querySelectorAll('.sp-guess').forEach(b => b.onclick = () => {
        const slot = Number(b.dataset.s);
        olSend({ t:'guess', i: slot });
        olGuess(OL.me, slot);
      });
    } else {
      st.innerHTML = '<div class="sp-waiting">' +
        '<span class="sp-passico">' + myIco('sp-spy') + '</span>' +
        '<i class="sp-passlbl"><b>' + esc(OL.names[OL.guessWho] || '?') + '</b> is choosing their last word…</i></div>';
    }
    return;
  }

  if (OL.phase === 'verdict'){
    const win = E.spiesWin(OL.outcome);
    const meSpy = OL.deal.spies.indexOf(OL.me) >= 0;
    const iWon = win === meSpy;
    const spyNames = OL.deal.spies.map(i => OL.names[i]).join(', ');
    const word = E.wordOf(OL.deal.wordId, OL.cfg.lang);
    /* what this round actually paid — the same figures olVerdict paid */
    let payLine = '';
    if (OL.payInfo){
      const pv = OL.payInfo.pay, pr = OL.payInfo.potRes;
      const bits = [];
      if (pr && pr.kind === 'win' && pr.pot > 0) bits.push('<b>+' + pr.pot + '</b> chips — the pot');
      else if (pr && pr.kind === 'lose') bits.push('<b>&minus;' + pr.ante + '</b> chips — your ante went to the winners');
      if (pv && pv.chips) bits.push('<b>+' + ((pv.chips | 0) + (pv.chipsLevel | 0)) + '</b> chips');
      if (pv && pv.xp) bits.push('<b>+' + pv.xp + '</b> XP');
      if (bits.length) payLine = '<p class="sp-vpay">' + bits.join(' · ') + '</p>';
    }
    const hostGone = !!(OL.gone && OL.gone[OL.hostSeat] && !OL.host);
    st.innerHTML =
      '<div class="sp-verdict ' + (win ? 'spies' : 'table') + '">' +
        '<span class="sp-vico">' + myIco(win ? 'sp-spy' : 'sp-hand') + '</span>' +
        '<h3>' + (win ? 'THE SPIES WIN' : 'THE TABLE WINS') + '</h3>' +
        '<p>' + (iWon ? 'And you were on the right side of it.' : 'Not your night.') + '</p>' +
        '<p class="sp-vword">The word was <b>' + esc(word) + '</b>. Spies: <b>' + esc(spyNames) + '</b>.</p>' +
        payLine +
      '</div>' +
      '<div class="sp-scores">' +
        OL.names.map((n, i) => '<div class="sp-scorerow' + (OL.deal.spies.indexOf(i) >= 0 ? ' spy' : '') + '">' +
          '<span class="sp-sn">' + (OL.deal.spies.indexOf(i) >= 0 ? myIco('sp-spy') : '') + esc(n) + '</span>' +
          '<b>' + (OL.scores[i] || 0) + '</b></div>').join('') +
      '</div>' +
      (OL.host
        ? '<button class="btn primary" id="sp-olnext">' + (window.ILB ? window.ILB('play', 'Next round') : 'Next round') + '</button>'
        : hostGone
          ? '<i class="sp-note dim center">The host left the table — use Back to return to the rooms.</i>'
          : '<i class="sp-note dim center">Waiting for ' + esc(OL.names[OL.hostSeat] || 'the host') + ' to deal the next one…</i>');
    const nx = st.querySelector('#sp-olnext');
    if (nx) nx.onclick = () => {
      olSend({ t:'next', n: OL.round + 1 });
      olDeal(OL.round + 1);
    };
    return;
  }
}

/* ── online transitions (applied identically on every phone) ─────── */
function olCall(seat){
  if (!OL || OL.phase !== 'play') return;
  OL.calls[seat] = 1;
  if (Object.keys(OL.calls).length * 2 > OL.n){
    sfx('ui.sheet');
    olOpenVote();
  } else paintOnline();
}
function olOpenVote(){
  if (!OL || OL.phase !== 'play') return;
  OL.phase = 'vote';
  sfx('ui.sheet');
  paintOnline();
  if (OL.host){
    OL.timers.vote = setTimeout(() => {
      if (OL && OL.phase === 'vote'){ olSend({ t:'phase', i:2 }); olCloseVote(); }
    }, OL_VOTE_GRACE);
  }
  /* an empty chair's ballot will never come: every phone casts 'nobody'
     for it locally, identically, so the count can still complete */
  if (OL.gone) for (const k in OL.gone){
    const s = k | 0;
    if (OL.votes[s] === undefined) olVote(s, -1);
    if (!OL || OL.phase !== 'vote') break;      /* the last one closed it */
  }
}
function olVote(seat, target){
  if (!OL || OL.phase !== 'vote') return;
  OL.votes[seat] = target;
  if (Object.keys(OL.votes).length >= OL.n) olCloseVote();
  else paintOnline();
}
function olCloseVote(){
  if (!OL || OL.phase !== 'vote') return;
  clearTimeout(OL.timers.vote);
  const accused = E.tally(OL.votes, OL.n);
  if (accused < 0){ olVerdict('escaped'); return; }
  if (OL.deal.spies.indexOf(accused) >= 0){
    /* a spy the table voted out who has ALREADY WALKED cannot take the
       last-chance guess — an empty chair holding the round forever.
       Caught, on every phone alike. */
    if (OL.gone && OL.gone[accused]){ olVerdict('caught'); return; }
    OL.guessWho = accused;
    OL.phase = 'guess';
    sfx('ui.toast');
    paintOnline();
    if (OL.host){
      OL.timers.guess = setTimeout(() => {
        if (OL && OL.phase === 'guess'){ olSend({ t:'phase', i:3 }); olVerdict('caught'); }
      }, OL_GUESS_GRACE);
    }
  } else olVerdict('wrong');
}
function olConfess(seat){
  if (!OL || OL.phase !== 'play') return;
  /* only an actual spy's phone shows the button, and every phone can
     check the claim against its own deal — a doctored client that
     sends a false confess just hands the round to the spies' rule */
  if (OL.deal.spies.indexOf(seat) < 0) return;
  OL.guessWho = seat;
  OL.confessed = true;
  OL.phase = 'guess';
  sfx('ui.toast');
  paintOnline();
}
function olGuess(seat, slot){
  if (!OL || OL.phase !== 'guess' || seat !== OL.guessWho) return;
  clearTimeout(OL.timers.guess);
  const grid = E.decoyGrid(OL.deal.wordId, OL.deal.gridSeed);
  const right = grid[slot] === OL.deal.wordId;
  olVerdict(right ? 'stolen' : (OL.confessed ? 'flopped' : 'caught'));
  OL.confessed = false;
}
function olVerdict(outcome){
  if (!OL) return;
  clearTimeout(OL.timers.vote); clearTimeout(OL.timers.guess);
  OL.phase = 'verdict';
  OL.outcome = outcome;
  const win = E.spiesWin(outcome);
  for (let i = 0; i < OL.n; i++){
    const isSpy = OL.deal.spies.indexOf(i) >= 0;
    const pts = win ? (isSpy ? 3 : 0) : (isSpy ? 0 : 1);
    if (pts) OL.scores[i] = (OL.scores[i] || 0) + pts;
  }
  const meSpy = OL.deal.spies.indexOf(OL.me) >= 0;

  /* ── THE PAY, exactly once per round ──────────────────────────────
     The verdict never goes through P.ui.result, so the wrap progress.js
     hangs on it never fired and a round of L-ISPJUN paid nothing.
     Every round is a finished game with a winning SIDE, so it pays
     through KARTI_XP.awardPlay under a per-round match id (paidRound
     latches the repaint; progress.js's id guard latches everything
     else). A staked pot settles through mp.js's own TEAM door —
     stakeSettleTeam splits it across the winning side's seats, so six
     phones can never each mint a whole pot — and it settles on the
     FIRST verdict the room reaches: mp.js holds one pot per sitting,
     later rounds find it settled and play for points. Room seats and
     game seats are the same numbers here. */
  if (OL.paidRound !== OL.round){
    OL.paidRound = OL.round;
    const iWon = win === meSpy;
    const MPX = window.KARTI_MP;
    const staked = !!(MPX && MPX.MP && MPX.MP.stakeLive);
    const mid = 'spy:' + ((MPX && MPX.MP && MPX.MP.code) || 'room') + ':' +
                (OL.seed >>> 0) + ':r' + OL.round;
    let pay = null, potRes = null;
    try {
      if (window.KARTI_XP && KARTI_XP.awardPlay){
        const r = KARTI_XP.awardPlay({ game:'spy', won: iWon, id: mid, ranked: staked });
        if (r && r.counted) pay = r;
      }
    } catch(e){}
    /* shelf badge, NO award attached (P.record is wrapped to pay) */
    try { if (P.tally) P.tally(GID, iWon ? 'w' : 'l'); } catch(e){}
    try {
      if (window.KARTI_STATS && KARTI_STATS.record)
        KARTI_STATS.record('spy', { result: iWon ? 'win' : 'loss', id: mid });
    } catch(e){}
    if (staked && MPX.stakeSettleTeam){
      const winners = [];
      for (let i = 0; i < OL.n; i++){
        const isSpy = OL.deal.spies.indexOf(i) >= 0;
        if (win === isSpy) winners.push(i);
      }
      try { potRes = MPX.stakeSettleTeam('win', winners, OL.me); } catch(e){}
    }
    OL.payInfo = (pay || potRes) ? { pay, potRes } : null;
  }

  sfx(win === meSpy ? 'game.win' : 'game.lose');
  paintOnline();
}

/* ── the contract js/mp.js reads ─────────────────────────────────── */
function onlineRemote(seat, mv){
  if (!OL) return { ok:false, why:'no round on this phone' };
  seat = seat | 0;
  if (!mv || typeof mv.t !== 'string') return null;
  switch (mv.t){
    case 'cfg':
      if (seat !== OL.hostSeat || OL.phase !== 'cfg') return null;
      olApplyCfg(((mv.j | 0) << 8) | (mv.i | 0), mv.s | 0, mv.n | 0, !!mv.v);
      return null;
    case 'callv':   olCall(seat); return null;
    case 'vote':    olVote(seat, (mv.i | 0) - 1); return null;
    case 'confess': olConfess(seat); return null;
    case 'guess':   olGuess(seat, mv.i | 0); return null;
    case 'phase':
      if (seat !== OL.hostSeat) return null;
      if ((mv.i | 0) === 1) olOpenVote();
      else if ((mv.i | 0) === 2) olCloseVote();
      else if ((mv.i | 0) === 3 && OL.phase === 'guess') olVerdict('caught');
      return null;
    case 'next':
      if (seat !== OL.hostSeat) return null;
      if (OL.phase === 'verdict') olDeal(Math.max(1, mv.n | 0));
      return null;
  }
  return null;   /* unknown moves are ignored, never fatal */
}
function onlineNote(text, tone){
  if (!OL || !OL.netEl) return;
  if (!text){ OL.netEl.hidden = true; OL.netEl.textContent = ''; return; }
  OL.netEl.className = 'pt-net' + (tone ? ' ' + tone : '');
  OL.netEl.hidden = false;
  OL.netEl.textContent = text;
}
function onlineStop(why, tone){
  if (!OL) return;
  U.result({ root: OL.root }, {
    tone: tone === 'cheat' ? 'lose' : 'draw',
    head: 'Cut off',
    why: why || 'The round stopped.',
    quip: 'Nothing was awarded. The spy neither caught nor free.',
    buttons: [{ label:'Back to the rooms', icon:'back', cls:'primary',
                go: () => { const n = OL && OL.net; olLeave(); if (n && n.onLeave) n.onLeave(); else P.hub(); } }]
  });
}

/* ── A CHAIR THE RELAY FREED MID-ROUND ──────────────────────────────
   Every phone hears the same departure from the relay and applies the
   same rule, so no wire traffic is needed:
   · cfg     — nothing to do unless it was the HOST (said on screen);
   · play    — an empty chair cannot object to a vote, so it counts as
               calling one (otherwise a majority can become unreachable);
   · vote    — its ballot is cast as 'nobody' so the count completes;
   · guess   — a spy who walks out mid-guess is caught;
   · verdict — if the HOST left, the waiting line says so.               */
function olSeatGone(seat){
  if (!OL) return;
  seat = seat | 0;
  if (seat < 0 || seat >= OL.n) return;
  OL.gone = OL.gone || {};
  if (OL.gone[seat]) return;
  OL.gone[seat] = 1;
  if (OL.phase === 'cfg'){ if (seat === OL.hostSeat) paintOnline(); return; }
  if (OL.phase === 'play'){ olCall(seat); return; }
  if (OL.phase === 'vote'){ if (OL.votes[seat] === undefined) olVote(seat, -1); return; }
  if (OL.phase === 'guess' && OL.guessWho === seat){
    clearTimeout(OL.timers.guess);
    olVerdict('caught');
    return;
  }
  if (OL.phase === 'verdict' && seat === OL.hostSeat) paintOnline();
}

P.online = P.online || {};
P.online[GID] = {
  start: onlineStart, remote: onlineRemote, note: onlineNote, stop: onlineStop,
  live: () => !!OL,
  hooks: { seatGone: olSeatGone }
};

/* ── the lobby contract (the same two halves gharraq ships) ──────── */
const LOBBY = {
  id: GID,
  name: TITLE,
  mt: 'The word game with a liar in it',
  minSeats: 3,
  maxSeats: 16,
  levels: [],                 /* there is no machine that can chat */
  defaultLevel: 1,
  isReady: seat => !!(seat && seat.ready),
  autoReady: seat => seat,
  canStart(seatList){
    const list = (seatList || []).filter(Boolean);
    if (list.some(s => s.kind === 'cpu'))
      return { ok:false, why:'L-ISPJUN is played out loud — no machines at this table.' };
    if (list.length < 3) return { ok:false, why:'Three people before anybody can lie properly.' };
    if (list.length > 16) return { ok:false, why:'Sixteen is the whole room.' };
    const unready = list.filter(s => !s.ready).length;
    if (unready) return { ok:false, why: unready + (unready > 1 ? ' people are' : ' person is') + ' not ready yet.' };
    return { ok:true, why:'' };
  },
  rulesHTML: rulesPanel,
  blurb: 'Everybody knows the word except the spy. Questions out loud, one clock, ' +
         'one vote, and a last-chance steal.',
  myName: () => {
    try { return (K && K.S && K.S.profile && K.S.profile.name) || ''; } catch(e){ return ''; }
  },
  start(seats){
    /* the offline twin: a seat list in, a pass-the-phone table out */
    const names = (seats || []).filter(Boolean).map(s => s.name || 'PLAYER').slice(0, 16);
    const pf = P.pref(GID);
    G = {
      players: names,
      cfg: { themes: (Array.isArray(pf.themes) && pf.themes.length ? pf.themes : WRD.themes.map(t => t.id)),
             lang: pf.lang === 'en' ? 'en' : 'mt',
             spies: 0, mins: 8 },
      used: {}, scores: {}, round: null
    };
    startRound(1);
    return G;
  },
  wire: { fields: ['v', 'i', 'j', 's', 'n'] },
  takeback: false
};
window.KARTI_SPY = { lobby: LOBBY, open: menu, engine: E, words: WRD };

/* ═══ 6 · ON THE SHELF ═════════════════════════════════════════════ */
P.register({
  id: GID, order: 60, kind: 'other', name: TITLE, mt: 'Min hu barrani?',
  sprite: 'sp-spy', status: 'live',
  get tag(){
    return 'Everybody gets the same secret word — except the spy, who gets nothing and ' +
      'has to bluff through the questions. ' + WRD.total + ' words, ' + WRD.themes.length +
      ' themes, Malti jew Ingliż.' +
      (loadSave() && loadSave().round ? ' There is a round mid-air.' : '');
  },
  open: menu,
  seats: { min: 3, max: 16 },
  levels: [],
  rulesHTML: rulesPanel,
  start: (seatList, o) => LOBBY.start(seatList, o)
});

/* ═══ 7 · THE SPRITE — drawn, never typed ══════════════════════════ */
const SPRITE =
  /* the spy: hat brim, crown, and dark glasses under it */
  '<symbol id="sp-spy" viewBox="0 0 24 24">' +
    '<path d="M7.2 3.6h9.6l1.1 5.2H6.1z"/>' +
    '<path d="M2.6 9.6h18.8v2.4H2.6z"/>' +
    '<path d="M4.6 13.4h6l1.4 1.6 1.4-1.6h6l-1 4.4c-1.6 1.2-3 1.7-4.4.6l-2-1.7-2 1.7c-1.4 1.1-2.8.6-4.4-.6z"/></symbol>' +
  /* an eye, for hold-to-look */
  '<symbol id="sp-eye" viewBox="0 0 24 24">' +
    '<path fill-rule="evenodd" d="M12 5.2C7 5.2 2.9 8.2 1 12c1.9 3.8 6 6.8 11 6.8s9.1-3 11-6.8c-1.9-3.8-6-6.8-11-6.8zm0 11a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4z"/>' +
    '<circle cx="12" cy="12" r="2.3"/></symbol>' +
  /* a pointing hand, for the vote */
  '<symbol id="sp-hand" viewBox="0 0 24 24">' +
    '<path d="M10.6 2.4c.9 0 1.6.7 1.6 1.6v7l6.9 1.3c1.2.2 2 1.3 1.8 2.5l-.8 4.6c-.2 1.1-1.2 2-2.4 2h-6.5c-.8 0-1.5-.3-2-.9l-5.4-5.6 1.5-1.6c.5-.5 1.3-.6 1.9-.2l1.8 1.2V4c0-.9.7-1.6 1.6-1.6z"/></symbol>' +
  /* an hourglass, for the clock choices */
  '<symbol id="sp-timer" viewBox="0 0 24 24">' +
    '<path d="M5.6 2.4h12.8v2.4l-4.6 4.6a3.6 3.6 0 0 0 0 5.2l4.6 4.6v2.4H5.6v-2.4l4.6-4.6a3.6 3.6 0 0 0 0-5.2L5.6 4.8z"/></symbol>' +
  /* a speech shape, for the language rows */
  '<symbol id="sp-say" viewBox="0 0 24 24">' +
    '<path d="M4 3.6h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8.6L6 21.4v-4.8H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/></symbol>' +
  /* theme marks */
  '<symbol id="sp-box" viewBox="0 0 24 24">' +
    '<path d="M3 7.6L12 3l9 4.6-9 4.6z"/><path d="M2.6 9.4l8.6 4.4v7.6L2.6 17z"/>' +
    '<path d="M21.4 9.4L12.8 13.8v7.6l8.6-4.4z"/></symbol>' +
  '<symbol id="sp-fork" viewBox="0 0 24 24">' +
    '<path d="M7.2 2.2h1.8v6.2h1V2.2h1.8v6.2h1V2.2h1.8v7.2a3 3 0 0 1-2.4 2.9v9.5h-2.6v-9.5a3 3 0 0 1-2.4-2.9z"/>' +
    '<path d="M16 2.2c1.8 1.2 2.8 3.6 2.8 6.2 0 2-.7 3.4-1.8 4v9.4H14.6V12.3c-.4-.8-.6-2-.6-3.9 0-2.6.8-5 2-6.2z"/></symbol>' +
  '<symbol id="sp-ball" viewBox="0 0 24 24">' +
    '<path fill-rule="evenodd" d="M12 1.8a10.2 10.2 0 1 0 0 20.4 10.2 10.2 0 0 0 0-20.4zm0 2a8.2 8.2 0 0 1 5.8 2.4L12 9.4 6.2 6.2A8.2 8.2 0 0 1 12 3.8zM4.2 9l6 3.3-1.5 6.5-4.1-.8A8.2 8.2 0 0 1 3.8 12c0-1 .1-2 .4-3zm15.6 0c.3 1 .4 2 .4 3a8.2 8.2 0 0 1-.8 6l-4.1.8-1.5-6.5z"/></symbol>' +
  '<symbol id="sp-case" viewBox="0 0 24 24">' +
    '<path d="M9 2.8h6a1.6 1.6 0 0 1 1.6 1.6v1.4h4a1.8 1.8 0 0 1 1.8 1.8v11.6a1.8 1.8 0 0 1-1.8 1.8H3.4a1.8 1.8 0 0 1-1.8-1.8V7.6a1.8 1.8 0 0 1 1.8-1.8h4V4.4A1.6 1.6 0 0 1 9 2.8zm.4 3h5.2v-1h-5.2zM1.6 11h20.8v2H14v1.6h-4V13H1.6z"/></symbol>' +
  '<symbol id="sp-tv" viewBox="0 0 24 24">' +
    '<path d="M8.2 2.4l3.8 3 3.8-3 1.2 1.5-2.9 2.3h4.5a2 2 0 0 1 2 2v9.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2V8.2a2 2 0 0 1 2-2h4.5L7 3.9z"/>' +
    '<path d="M7.4 21h9.2v1.4H7.4z"/></symbol>' +
  '<symbol id="sp-paw" viewBox="0 0 24 24">' +
    '<circle cx="6" cy="9" r="2.4"/><circle cx="18" cy="9" r="2.4"/>' +
    '<circle cx="9.4" cy="5" r="2.4"/><circle cx="14.6" cy="5" r="2.4"/>' +
    '<path d="M12 11c3 0 6.4 2.6 6.4 5.4 0 1.7-1.3 3-3 3-1.2 0-2.4-.6-3.4-.6s-2.2.6-3.4.6c-1.7 0-3-1.3-3-3C5.6 13.6 9 11 12 11z"/></symbol>' +
  '<symbol id="sp-tag" viewBox="0 0 24 24">' +
    '<path fill-rule="evenodd" d="M12.6 2.4h7.4a1.6 1.6 0 0 1 1.6 1.6v7.4a2 2 0 0 1-.6 1.4l-8.8 8.8a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1 0-2.8l8.8-8.8a2 2 0 0 1 1.4-.6zm4.4 6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"/></symbol>' +
  '<symbol id="sp-moon" viewBox="0 0 24 24">' +
    '<path d="M14.4 2.2A10 10 0 1 0 21.8 15 8 8 0 0 1 14.4 2.2z"/>' +
    '<path d="M17.6 3.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/></symbol>' +
  /* the sun coming up on the morning after */
  '<symbol id="sp-sun" viewBox="0 0 24 24">' +
    '<path d="M12 7.6a5.2 5.2 0 0 1 5.2 5.2H6.8A5.2 5.2 0 0 1 12 7.6z"/>' +
    '<path d="M2.4 14.6h19.2v2H2.4z"/>' +
    '<path d="M11 2.2h2v3.4h-2z"/>' +
    '<path d="M4.2 5.3l1.4-1.4 2.4 2.4-1.4 1.4z"/>' +
    '<path d="M19.8 5.3l-1.4-1.4-2.4 2.4 1.4 1.4z"/></symbol>' +
  /* ── THE IDENTITY PIECE ─────────────────────────────────────────────
     Five people mid-interrogation. Four hold the same word — the teal
     bar in the paper bubble. The fourth figure has the hat, the dark
     glasses, a tilt to the whole posture, and a bubble with NOTHING in
     it: somebody here does not know. Filled silhouettes, warm ink
     outline (paint-order:stroke fill via .sp-heroart), two shadow
     tones — the spy stands in the darker one. */
  '<symbol id="sp-hero" viewBox="0 0 240 100">' +
    /* floor shadows: villagers in the light one, the spy in the deep one */
    '<ellipse cx="26" cy="92.5" rx="17" ry="3.4" fill="#0A0714" opacity=".32"/>' +
    '<ellipse cx="74" cy="92.5" rx="17" ry="3.4" fill="#0A0714" opacity=".32"/>' +
    '<ellipse cx="122" cy="92.5" rx="17" ry="3.4" fill="#0A0714" opacity=".32"/>' +
    '<ellipse cx="218" cy="92.5" rx="17" ry="3.4" fill="#0A0714" opacity=".32"/>' +
    '<ellipse cx="170" cy="93" rx="19.5" ry="3.9" fill="#0A0714" opacity=".52"/>' +
    /* four who know the word */
    '<g stroke="#120C1E" stroke-width="2">' +
      '<path d="M12 92v-13q0-10 14-10q14 0 14 10v13z" fill="#3A2E5C"/>' +
      '<circle cx="26" cy="59.5" r="9.5" fill="#3A2E5C"/>' +
      '<rect x="9" y="26" width="34" height="20" rx="7" fill="#F4EFFF"/>' +
      '<path d="M21 45.5l4.5 7 6-7z" fill="#F4EFFF" stroke-width="1.6"/>' +
      '<path d="M60 92v-13q0-10 14-10q14 0 14 10v13z" fill="#3A2E5C"/>' +
      '<circle cx="74" cy="59.5" r="9.5" fill="#3A2E5C"/>' +
      '<rect x="57" y="22" width="34" height="20" rx="7" fill="#F4EFFF"/>' +
      '<path d="M69 41.5l4.5 7 6-7z" fill="#F4EFFF" stroke-width="1.6"/>' +
      '<path d="M108 92v-13q0-10 14-10q14 0 14 10v13z" fill="#3A2E5C"/>' +
      '<circle cx="122" cy="59.5" r="9.5" fill="#3A2E5C"/>' +
      '<rect x="105" y="26" width="34" height="20" rx="7" fill="#F4EFFF"/>' +
      '<path d="M117 45.5l4.5 7 6-7z" fill="#F4EFFF" stroke-width="1.6"/>' +
      '<path d="M204 92v-13q0-10 14-10q14 0 14 10v13z" fill="#3A2E5C"/>' +
      '<circle cx="218" cy="59.5" r="9.5" fill="#3A2E5C"/>' +
      '<rect x="201" y="23" width="34" height="20" rx="7" fill="#F4EFFF"/>' +
      '<path d="M213 42.5l4.5 7 6-7z" fill="#F4EFFF" stroke-width="1.6"/>' +
    '</g>' +
    /* the same word in every bubble */
    '<rect x="16" y="33.2" width="20" height="5.6" rx="2.8" fill="#4FC8B8"/>' +
    '<rect x="66" y="29.2" width="16" height="5.6" rx="2.8" fill="#4FC8B8"/>' +
    '<rect x="112" y="33.2" width="20" height="5.6" rx="2.8" fill="#4FC8B8"/>' +
    '<rect x="209" y="30.2" width="18" height="5.6" rx="2.8" fill="#4FC8B8"/>' +
    /* the one who does not */
    '<g transform="rotate(-5 170 78)">' +
      '<g stroke="#120C1E" stroke-width="2">' +
        '<path d="M156 92v-13q0-10 14-10q14 0 14 10v13z" fill="#241A3E"/>' +
        '<circle cx="170" cy="59.5" r="9.5" fill="#241A3E"/>' +
      '</g>' +
      '<path d="M164 51.5l2.6-9h6.8l2.6 9z" fill="#120C1E"/>' +
      '<rect x="154.5" y="50.5" width="31" height="5" rx="2.5" fill="#120C1E"/>' +
      '<rect x="161" y="59" width="18" height="4.4" rx="2.2" fill="#0A0714" ' +
        'stroke="#4A3C6E" stroke-width="1"/>' +
      '<rect x="153" y="23" width="34" height="20" rx="7" fill="rgba(255,84,104,.07)" ' +
        'stroke="#FF5468" stroke-width="2" stroke-dasharray="4 3"/>' +
      '<path d="M165 42.5l4.5 7 6-7" fill="none" stroke="#FF5468" stroke-width="2" ' +
        'stroke-dasharray="4 3"/>' +
    '</g></symbol>';

function injectSprite(){
  if (document.getElementById('sp-sprite')) return;
  const holder = document.createElement('div');
  holder.id = 'sp-sprite';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><defs>' + SPRITE + '</defs></svg>';
  document.body.appendChild(holder);
}
if (document.body) injectSprite();
else document.addEventListener('DOMContentLoaded', injectSprite);

/* ═══ 8 · THE STYLESHEET — scoped to #scr-party .sp-* ══════════════ */
function injectCSS(){
  if (document.getElementById('sp-runtime-css')) return;
  const st = document.createElement('style');
  st.id = 'sp-runtime-css';
  st.textContent =
    /* setup */
    '#scr-party .sp-chips{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 8px}' +
    '#scr-party .sp-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 7px 7px 12px;' +
      'border-radius:999px;background:rgba(255,197,66,.12);border:1px solid rgba(255,197,66,.4);' +
      'font:700 12px/1 var(--disp);letter-spacing:.05em}' +
    '#scr-party .sp-chip button{display:grid;place-items:center;width:22px;height:22px;' +
      'border-radius:50%;background:rgba(0,0,0,.3);color:var(--dim)}' +
    '#scr-party .sp-chip button .ico{width:11px;height:11px}' +
    '#scr-party .sp-empty{font-size:11.5px;color:var(--dim2);text-transform:none;letter-spacing:0}' +
    '#scr-party .sp-addrow{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}' +
    '#scr-party .sp-addrow .field{min-height:44px}' +
    '#scr-party .sp-themes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}' +
    '#scr-party .sp-theme{display:flex;flex-direction:column;align-items:flex-start;gap:3px;' +
      'padding:10px 12px;border-radius:13px;text-align:left;color:var(--txt);' +
      'background:rgba(255,255,255,.04);border:1px solid var(--line)}' +
    '#scr-party .sp-theme .ico{width:19px;height:19px;color:var(--dim)}' +
    '#scr-party .sp-theme b{font-family:var(--disp);font-size:12px;letter-spacing:.05em;' +
      'text-transform:uppercase}' +
    '#scr-party .sp-theme i{font-style:normal;font-size:10.5px;color:var(--dim2);' +
      'text-transform:none;letter-spacing:0}' +
    '#scr-party .sp-theme.on{background:rgba(255,197,66,.13);border-color:rgba(255,197,66,.5)}' +
    '#scr-party .sp-theme.on .ico{color:var(--gold)}' +
    '#scr-party .sp-theme.adult.on{background:rgba(255,84,104,.13);border-color:rgba(255,84,104,.5)}' +
    '#scr-party .sp-theme.sm{padding:7px 9px}' +
    '#scr-party .sp-all{margin:8px 0 0;width:100%}' +
    '#scr-party .sp-note{font-size:11.5px;line-height:1.5;color:#FFD98A;margin:8px 2px 0;' +
      'text-transform:none;letter-spacing:0}' +
    '#scr-party .sp-note.dim{color:var(--dim2)}' +
    '#scr-party .sp-note.center{text-align:center;display:block;margin-top:12px}' +
    '#scr-party .pt-opts.three{grid-template-columns:repeat(3,minmax(0,1fr))}' +
    '#scr-party .pt-opt.mid{grid-template-columns:24px 1fr;min-height:48px}' +
    /* ── the setup sheet in L-ISPJUN's own coat: interrogation teal.
       Everything scoped to .sp-menu so not one tint reaches another
       game — SUSPETT next door is a village at night, not this. ── */
    '#scr-party .sp-menu .sp-hero{display:flex;justify-content:center;padding:8px 0 2px;' +
      'margin:2px 0 10px;border-radius:16px;' +
      'background:radial-gradient(92% 100% at 50% 0,rgba(79,200,184,.14),rgba(79,200,184,0) 74%)}' +
    '#scr-party .sp-menu .sp-heroart{width:min(330px,92%);height:auto;aspect-ratio:240/100;' +
      'display:block;paint-order:stroke fill}' +
    '#scr-party .sp-menu .tiny.pt-lbl{color:#79C9BD}' +
    /* the two ways to play read big; the primary way is tinted teal so the
       eye lands on it first, exactly the shelf's clean-chooser pattern */
    '#scr-party .sp-menu .sp-ways{gap:10px;margin:4px 0 2px}' +
    '#scr-party .sp-menu .sp-ways .pt-opt{min-height:60px}' +
    '#scr-party .sp-menu .sp-ways .pt-opt.primary{background:rgba(79,200,184,.14);' +
      'border-color:rgba(79,200,184,.55)}' +
    '#scr-party .sp-menu .sp-ways .pt-opt.primary>.ico{color:#4FC8B8}' +
    '#scr-party .sp-menu .sp-ways .pt-opt.primary>b{color:#7FE0D2}' +
    '#scr-party .sp-menu .pt-opt.on{background:rgba(79,200,184,.12);' +
      'border-color:rgba(79,200,184,.55)}' +
    '#scr-party .sp-menu .pt-opt.on>.ico{color:#4FC8B8}' +
    '#scr-party .sp-menu .sp-theme.on:not(.adult){background:rgba(79,200,184,.12);' +
      'border-color:rgba(79,200,184,.5)}' +
    '#scr-party .sp-menu .sp-theme.on:not(.adult) .ico{color:#4FC8B8}' +
    '#scr-party .sp-menu .sp-chip{background:rgba(79,200,184,.12);' +
      'border-color:rgba(79,200,184,.4)}' +
    /* the clock choices stack their icon, number and one-liner */
    '#scr-party .sp-menu #sp-mins .pt-opt{grid-template-columns:1fr;justify-items:center;' +
      'row-gap:3px;text-align:center;padding:10px 6px}' +
    '#scr-party .sp-menu #sp-mins .pt-opt>.ico{grid-row:auto}' +
    /* ── the rules fold at the bottom: a real button, sliding open ── */
    '#scr-party .sp-fold{margin:16px 0 0;border:1px solid rgba(79,200,184,.32);' +
      'border-radius:14px;background:rgba(79,200,184,.05);overflow:hidden}' +
    '#scr-party .sp-foldtg{display:flex;align-items:center;gap:9px;width:100%;min-height:48px;' +
      'padding:6px 13px;border:0;background:none;cursor:pointer;color:#4FC8B8;' +
      'font:900 11.5px/1 var(--disp);letter-spacing:.09em;text-transform:uppercase;' +
      'text-align:left}' +
    '#scr-party .sp-foldtg .ico{width:17px;height:17px;flex:0 0 auto}' +
    '#scr-party .sp-foldtg span{flex:1 1 auto}' +
    '#scr-party .sp-foldcv{width:16px;height:16px;flex:0 0 auto;fill:none;stroke:currentColor;' +
      'stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;' +
      'transition:transform .2s var(--ease)}' +
    '#scr-party .sp-foldtg.open .sp-foldcv{transform:rotate(180deg)}' +
    '#scr-party .sp-foldbody{padding:0 13px}' +
    '#scr-party .sp-foldbody.anim{animation:spFoldIn .26s var(--ease) both}' +
    '@keyframes spFoldIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '@media (prefers-reduced-motion:reduce){#scr-party .sp-foldbody.anim{animation:none}' +
      '#scr-party .sp-foldcv{transition:none}}' +
    'body.reduced #scr-party .sp-foldbody.anim{animation:none}' +
    'body.reduced #scr-party .sp-foldcv{transition:none}' +
    '#scr-party .sp-rulesbody{padding:2px 0 12px}' +
    '#scr-party .sp-rulesbody p{font-size:12px;line-height:1.65;color:var(--dim);' +
      'margin:0 0 9px;text-transform:none;letter-spacing:0}' +
    '#scr-party .sp-rulesbody b{color:var(--txt)}' +

    /* the stage — every in-round screen */
    /* centred when it fits, scrollable when it does not: auto margins on the
       ends do the centring so overflow can never clip the top of the stage */
    '#scr-party .sp-stage{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;' +
      'gap:14px;padding:10px 4px;width:100%;max-width:560px;margin:0 auto;' +
      'overflow-y:auto;-webkit-overflow-scrolling:touch}' +
    '#scr-party .sp-stage>:first-child{margin-top:auto}' +
    '#scr-party .sp-stage>:last-child{margin-bottom:auto}' +
    '#scr-party .sp-stage.scrolly>:first-child{margin-top:0}' +
    '#scr-party .sp-stage.scrolly>:last-child{margin-bottom:0}' +
    /* the curtain pair: exactly one of the two is ever visible, and the
       visible one must own BOTH auto margins or it hugs an edge */
    '#scr-party .sp-stage>.sp-curtain{margin-bottom:auto}' +
    '#scr-party .sp-stage>.sp-armed:not([hidden]){margin-top:auto}' +
    '#scr-party .sp-waiting{display:flex;flex-direction:column;align-items:center;gap:12px}' +

    /* the curtain */
    '#scr-party .sp-curtain,#scr-party .sp-armed{display:flex;flex-direction:column;' +
      'align-items:center;gap:12px;width:100%}' +
    '#scr-party .sp-armed[hidden],#scr-party .sp-curtain[hidden]{display:none}' +
    '#scr-party .sp-passico{color:var(--gold)}' +
    '#scr-party .sp-passico .ico{width:44px;height:44px}' +
    '#scr-party .sp-passlbl{font-size:12.5px;line-height:1.55;color:var(--dim);text-align:center;' +
      'font-style:normal;text-transform:none;letter-spacing:0;max-width:320px}' +
    '#scr-party .sp-passlbl b{color:var(--gold)}' +
    '#scr-party .sp-passname{font-family:var(--disp);font-weight:900;font-size:34px;' +
      'letter-spacing:.04em;text-transform:uppercase;text-align:center;word-break:break-word}' +
    '#scr-party .sp-passhint{font-size:11.5px;line-height:1.5;color:var(--dim2);text-align:center;' +
      'font-style:normal;text-transform:none;letter-spacing:0;max-width:300px}' +
    '#scr-party .sp-passhint b{color:var(--gold)}' +
    '#scr-party .sp-claim,#scr-party .sp-next{min-height:52px;width:100%;max-width:320px}' +

    /* the secret host — empty except while held/shown */
    '#scr-party .sp-secret{min-height:128px;width:100%;display:flex;align-items:center;' +
      'justify-content:center}' +
    '#scr-party .sp-secret.ol{min-height:108px}' +
    '#scr-party .sp-role{display:flex;flex-direction:column;align-items:center;gap:7px;' +
      'padding:16px 18px;border-radius:16px;text-align:center;max-width:100%}' +
    '#scr-party .sp-role.word{background:rgba(255,197,66,.1);border:1px solid rgba(255,197,66,.4)}' +
    '#scr-party .sp-role.spy{background:rgba(255,84,104,.1);border:1px solid rgba(255,84,104,.45)}' +
    '#scr-party .sp-roleico{color:var(--danger,#FF5468)}' +
    '#scr-party .sp-roleico .ico{width:38px;height:38px}' +
    '#scr-party .sp-role b{font-family:var(--disp);font-weight:900;font-size:24px;line-height:1.15;' +
      'letter-spacing:.03em;text-transform:uppercase;word-break:break-word}' +
    '#scr-party .sp-role.spy b{color:#FF8A97}' +
    '#scr-party .sp-role i{font-style:normal;font-size:11.5px;line-height:1.5;color:var(--dim);' +
      'text-transform:none;letter-spacing:0;max-width:280px}' +
    '#scr-party .sp-cat{font-style:normal;font:900 10.5px/1 var(--disp);letter-spacing:.16em;' +
      'text-transform:uppercase;color:var(--gold)}' +
    '#scr-party .sp-cat.big{font-size:12px}' +
    '#scr-party .sp-word{color:var(--gold)}' +

    /* hold + peek buttons */
    '#scr-party .sp-hold,#scr-party .sp-peek{display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:6px;width:150px;height:150px;border-radius:50%;color:var(--txt);' +
      'background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.09),rgba(255,255,255,.02) 70%);' +
      'border:2px solid var(--line2);box-shadow:0 8px 0 -3px rgba(0,0,0,.5),0 14px 30px rgba(0,0,0,.45);' +
      'touch-action:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
    '#scr-party .sp-peek{width:auto;height:auto;min-height:56px;border-radius:16px;' +
      'flex-direction:row;padding:10px 22px;touch-action:manipulation}' +
    '#scr-party .sp-hold.held,#scr-party .sp-peek.held{background:rgba(255,197,66,.16);' +
      'border-color:rgba(255,197,66,.6);box-shadow:0 3px 0 -2px rgba(0,0,0,.5)}' +
    '#scr-party .sp-holdico .ico{width:30px;height:30px;color:var(--gold)}' +
    '#scr-party .sp-holdlbl{font:900 12px/1 var(--disp);letter-spacing:.14em}' +

    /* play */
    '#scr-party .sp-playtop{display:flex;flex-direction:column;align-items:center;gap:8px}' +
    '#scr-party .sp-clock{font:900 64px/1 var(--disp);letter-spacing:.04em;color:var(--txt);' +
      'font-variant-numeric:tabular-nums}' +
    '#scr-party .sp-clock.low{color:var(--danger,#FF5468)}' +
    '#scr-party .sp-asks{font-style:normal;font-size:12px;line-height:1.5;color:var(--dim);' +
      'text-align:center;text-transform:none;letter-spacing:0;max-width:320px}' +
    '#scr-party .sp-asks b{color:var(--gold);text-transform:uppercase}' +
    '#scr-party .sp-table{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;max-width:420px}' +
    '#scr-party .sp-seat{padding:6px 11px;border-radius:999px;font:700 11px/1 var(--disp);' +
      'letter-spacing:.06em;text-transform:uppercase;color:var(--dim);' +
      'background:rgba(255,255,255,.05);border:1px solid var(--line)}' +
    '#scr-party .sp-seat.called{color:var(--gold);border-color:rgba(255,197,66,.45)}' +
    '#scr-party .sp-playbar{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;' +
      'max-width:420px;margin-top:4px}' +
    '#scr-party .sp-playbar .btn{min-height:46px}' +
    '#scr-party .sp-resumeclock{min-height:52px;max-width:320px;width:100%}' +

    /* vote */
    '#scr-party .sp-beat{font:900 110px/1 var(--disp);color:var(--gold);text-align:center}' +
    '#scr-party .sp-beat.go{font-size:56px;color:var(--danger,#FF5468)}' +
    '#scr-party #sp-votebox{display:flex;flex-direction:column;align-items:center;gap:14px}' +
    '#scr-party .sp-count{min-height:54px;min-width:230px}' +
    '#scr-party .sp-votegrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;' +
      'width:100%;max-width:420px}' +
    '#scr-party .sp-cand{min-height:52px;padding:8px 10px;border-radius:13px;color:var(--txt);' +
      'font:900 13px/1.2 var(--disp);letter-spacing:.05em;text-transform:uppercase;' +
      'background:rgba(255,255,255,.05);border:1px solid var(--line);word-break:break-word}' +
    '#scr-party .sp-cand:active{background:rgba(255,197,66,.14)}' +
    '#scr-party .sp-cand.on{background:rgba(255,197,66,.16);border-color:rgba(255,197,66,.55)}' +
    '#scr-party .sp-cand[disabled]{opacity:.45}' +

    /* guess grid */
    '#scr-party .sp-guessgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;' +
      'width:100%;max-width:460px}' +
    '#scr-party .sp-guess{min-height:52px;padding:8px 10px;border-radius:13px;color:var(--txt);' +
      'font-size:12.5px;line-height:1.3;background:rgba(255,255,255,.05);' +
      'border:1px solid var(--line);word-break:break-word}' +
    '#scr-party .sp-guess:active{background:rgba(255,197,66,.14)}' +

    /* verdict */
    '#scr-party .sp-verdict{display:flex;flex-direction:column;align-items:center;gap:6px;' +
      'text-align:center;padding:20px 16px;border-radius:18px;margin:6px 0 4px;width:100%}' +
    '#scr-party .sp-verdict.table{background:rgba(61,220,132,.1);border:1px solid rgba(61,220,132,.4)}' +
    '#scr-party .sp-verdict.spies{background:rgba(255,84,104,.1);border:1px solid rgba(255,84,104,.42)}' +
    '#scr-party .sp-vico .ico{width:42px;height:42px}' +
    '#scr-party .sp-verdict.table .sp-vico{color:var(--ok,#3DDC84)}' +
    '#scr-party .sp-verdict.spies .sp-vico{color:var(--danger,#FF5468)}' +
    '#scr-party .sp-verdict h3{font-size:22px;letter-spacing:.05em}' +
    '#scr-party .sp-verdict p{font-size:12.5px;line-height:1.6;color:var(--dim);margin:2px 0 0;' +
      'text-transform:none;letter-spacing:0}' +
    '#scr-party .sp-vword b{color:var(--gold)}' +
    '#scr-party .sp-scores{display:flex;flex-direction:column;gap:6px;margin:4px 0 14px}' +
    '#scr-party .sp-scorerow{display:flex;align-items:center;justify-content:space-between;' +
      'padding:9px 13px;border-radius:12px;background:rgba(255,255,255,.04);' +
      'border:1px solid var(--line)}' +
    '#scr-party .sp-scorerow.spy{border-color:rgba(255,84,104,.4)}' +
    '#scr-party .sp-sn{display:flex;align-items:center;gap:8px;font:700 12.5px/1 var(--disp);' +
      'letter-spacing:.05em;text-transform:uppercase}' +
    '#scr-party .sp-sn .ico{width:16px;height:16px;color:var(--danger,#FF5468)}' +
    '#scr-party .sp-scorerow b{font-family:var(--disp);color:var(--gold)}' +
    '#scr-party .sp-endacts{display:grid;gap:9px;margin-bottom:20px}' +
    '#scr-party .sp-endacts .btn{min-height:50px}' +

    /* online config sheet */
    '#scr-party .sp-cfgcard{max-width:380px;text-align:left;max-height:86vh;overflow-y:auto}' +
    '#scr-party .sp-cfgcard h3{text-align:center}' +
    '#scr-party .sp-cfgcard .pt-why{text-align:center}' +
    '#scr-party .sp-themes.tight{margin:12px 0 4px;gap:6px}' +
    '#scr-party .sp-cfgrow{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '#scr-party .sp-cfgrow .btn{flex:1;min-height:42px}' +

    /* landscape / short phones: the stage rows itself */
    '@media (max-height:520px){' +
      '#scr-party .sp-stage{gap:8px}' +
      '#scr-party .sp-clock{font-size:42px}' +
      '#scr-party .sp-passname{font-size:24px}' +
      '#scr-party .sp-hold{width:104px;height:104px}' +
      '#scr-party .sp-secret{min-height:96px}' +
      '#scr-party .sp-beat{font-size:64px}' +
      '#scr-party .sp-role b{font-size:18px}}';
  document.head.appendChild(st);
}

})();

/* ═══════════════════════════════════════════════════════════════════
   L-ISPJUN — THE KIT SHELF (purely cosmetic, always)
   Night skies for the stage and rings for the hold button, declared
   through KARTI_XP.register() and applied as a couple of CSS rules
   scoped under #app #scr-party — one specificity step above the
   game's own #scr-party sheet, so they win without touching a single
   rule of play. The .held state is deliberately left alone via
   :not(.held): the gold flare when a spy is actually peeking is
   game feedback, not decoration. The sky's moon (where a theme has
   one) is an extra background-image layer on the stage itself — no
   pseudo-elements, no extra nodes, nothing for a finger to hit.
   The style node is re-appended on every change so it always lands
   after the game's own sheet. Unequip and the stage goes back to
   its stock bare felt.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var SKIES = {
  'spy.sky.lejl': { bg:
    'radial-gradient(120% 90% at 50% 0%,#141C38 0%,#0A0F22 55%,#05070F 100%)' },
  'spy.sky.port': { bg:
    'linear-gradient(180deg,#0D2226 0%,#081418 55%,#04090C 100%)' },
  'spy.sky.festa': { bg:
    'radial-gradient(120% 55% at 50% 100%,rgba(255,168,66,.12),transparent 60%),' +
    'linear-gradient(180deg,#271A46 0%,#170F2C 55%,#0D081A 100%)' },
  'spy.sky.qamar': { bg:
    'radial-gradient(circle 34px at 78% 15%,rgba(226,233,248,.16) 0 55%,' +
      'rgba(226,233,248,.05) 72%,transparent 100%),' +
    'linear-gradient(180deg,#242A38 0%,#141826 55%,#0A0C14 100%)' },
  /* MALTESE SUMMER. August at midnight: the stone is still giving
     back the day, so the heat sits low in the frame as a warm haze
     rather than a light. Every solid stop is kept below #3a3355 in
     luminance (the palest is #342433 at .0223 against a .0392 cap)
     and the haze composites to .0109 over the floor, so the clock,
     the pass name and the role text keep the contrast they had. */
  'spy.sky.sajf': { bg:
    'radial-gradient(120% 60% at 50% 100%,rgba(255,138,64,.12),transparent 62%),' +
    'linear-gradient(180deg,#342433 0%,#1D1520 55%,#0E0A10 100%)' }
};
var RINGS = {
  'spy.ring.bahar': { bd:'rgba(122,227,203,.55)',
    bg:'radial-gradient(circle at 34% 28%,rgba(122,227,203,.14),rgba(122,227,203,.03) 70%)' },
  'spy.ring.ram':   { bd:'rgba(226,148,122,.55)',
    bg:'radial-gradient(circle at 34% 28%,rgba(226,148,122,.13),rgba(226,148,122,.03) 70%)' },
  'spy.ring.deheb': { bd:'rgba(255,197,66,.45)',
    bg:'radial-gradient(circle at 34% 28%,rgba(255,197,66,.11),rgba(255,197,66,.02) 70%)' }
};

function sheet(){
  var st = document.getElementById('spx-kit-css');
  if (!st){ st = document.createElement('style'); st.id = 'spx-kit-css'; }
  /* appendChild MOVES an existing node to the end, so this sheet is
     always later than the game's own and its rules win on order as
     well as on the extra #app of specificity. */
  document.head.appendChild(st);
  return st;
}

function apply(){
  var XP = window.KARTI_XP;
  if (!XP) return;
  var css = '', s = SKIES[XP.equipped('sky', 'spy') || ''];
  if (s) css += '#app #scr-party .sp-stage{background:' + s.bg + ';border-radius:14px}';
  var r = RINGS[XP.equipped('ring', 'spy') || ''];
  if (r) css += '#app #scr-party .sp-hold:not(.held){border-color:' + r.bd +
                ';background:' + r.bg + '}';
  sheet().textContent = css;
}

/* previews: the sky is the sky, the ring is the ring */
function skyPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style',
      'display:block;width:' + s + 'px;height:' + s + 'px;border-radius:10px;' +
      'border:1px solid rgba(255,255,255,.14);box-sizing:border-box;' +
      'background:' + t.bg);
    return el;
  };
}
function ringPv(t){
  return function(size){
    var s = size || 62, el = document.createElement('span');
    el.setAttribute('style',
      'display:block;width:' + Math.floor(s * .8) + 'px;height:' + Math.floor(s * .8) +
      'px;margin:' + Math.ceil(s * .1) + 'px auto;border-radius:50%;box-sizing:border-box;' +
      'border:2px solid ' + t.bd + ';background:' + t.bg);
    return el;
  };
}

function boot(tries){
  var XP = window.KARTI_XP;
  if (!XP){ if (tries < 40) setTimeout(function(){ boot(tries + 1); }, 500); return; }
  var KIT = XP.forGame('spy');
  KIT.register([
    { slot:'sky', id:'spy.sky.lejl',  level:4,  name:'Lejl Bla Kwiekeb',
      blurb:'A sky with nothing to look at, so everyone looks at you.', preview:skyPv(SKIES['spy.sky.lejl']) },
    { slot:'sky', id:'spy.sky.port',  level:11, name:'Il-Port Jorqod',
      blurb:'Teal-black harbour water. Whatever it heard, it keeps.', preview:skyPv(SKIES['spy.sky.port']) },
    { slot:'sky', id:'spy.sky.sajf',  level:12, name:'Lejl ta\' Sajf', set:'summer',
      blurb:'Midnight in August and still thirty degrees. Nobody is sleeping, so nobody has an alibi.',
      preview:skyPv(SKIES['spy.sky.sajf']) },
    { slot:'sky', id:'spy.sky.festa', level:23, name:'Lejl tal-Festa',
      blurb:'Violet dark with the band club still glowing at the bottom.', preview:skyPv(SKIES['spy.sky.festa']) },
    { slot:'sky', id:'spy.sky.qamar', level:40, name:'Qamar Kwinta',
      blurb:'Moonlit slate. The moon saw who peeked and says nothing.', preview:skyPv(SKIES['spy.sky.qamar']) },

    { slot:'ring', id:'spy.ring.bahar', level:7,  name:'Ħġieġ tal-Baħar',
      blurb:'Sea glass, sanded smooth by a thousand nervous thumbs.', preview:ringPv(RINGS['spy.ring.bahar']) },
    { slot:'ring', id:'spy.ring.ram',   level:17, name:'Ram u Ward',
      blurb:'Rose brass, polished like a door knocker with secrets behind it.', preview:ringPv(RINGS['spy.ring.ram']) },
    { slot:'ring', id:'spy.ring.deheb', level:35, name:'Deheb Antik',
      blurb:'Old gold. Press it like you inherited it.', preview:ringPv(RINGS['spy.ring.deheb']) }
  ]);
  KIT.onChange(apply);
  apply();
}
boot(0);

})();
