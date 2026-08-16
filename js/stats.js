/* ═══════════════════════════════════════════════════════════════════
   KARTI — stats.js
   THE RECORD BOOK. One place every game in the box reports a result to,
   one screen that shows what you have done in all of them, and one
   leaderboard that shows what everybody else has done.

   WHAT THIS FILE IS
     · KARTI_STATS.record(game, {result:'win'})  — the entire reporting
       API. One line at the end of a match and the game is done.
     · KARTI_STATS.openProfile()      — your record, every game, with
       that game's emblem beside it.
     · KARTI_STATS.openLeaderboard()  — everyone, ranked, from the Pi.

   HOUSE RULES THIS FILE OBEYS
     · index.html, css/ and every other game file belong to somebody
       else, so this builds its own <section class="screen" id="scr-stats">
       at runtime and injects its stylesheet once, the way js/mp.js and
       js/party.js do.
     · its own corner of localStorage — karti_stats_v1. It never writes
       karti_save_*, karti_party_v1, karti_klabb_v1 or anybody else's
       key. It READS karti_active and karti_sync_<who> and nothing else,
       because that is where the account session already lives and there
       is no second copy of a login worth keeping.
     · no emoji, anywhere, ever. The icon set in index.html and a
       handful of symbols appended to it, exactly as game.js does.
     · nothing here puts transform / filter / backdrop-filter /
       will-change on anything that could be an ancestor of .tabbar.
     · the shell is height:100dvh; overflow:hidden. Only the list
       scrolls. The page never does.

   WHY THE COUNTERS ARE THE ONES THEY ARE
     played / won / lost / drawn is what was asked for. On top of that,
     four numbers that are one comparison each to keep and that a player
     can actually brag about: the current win run, the best win run ever,
     the fewest moves a win ever took, and the best score. Nothing is
     averaged, nothing is derived on write, so a number can never drift
     away from the results that made it.

   DOUBLE COUNTING
     A result can arrive twice for two very different reasons and both
     have bitten this project before:
       1. a result screen that re-renders (or is navigated back into)
          and calls the reporting line again on the way past;
       2. two code paths for one match — a game-over check that runs on
          both the bankruptcy path and the round-limit path, say.
     So record() is idempotent twice over. If the caller gives an `id`
     the same id is never counted twice, full stop. If it does not, an
     identical payload inside REPEAT_MS is treated as the same match
     being reported again and dropped. Both return {counted:false} so a
     caller that cares can tell.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

/* ═══════════════════════════════════════════════════════════════════
   0. THE SHELF — every game that can report a result
   The order here is the order on the profile. `logo` is the file stem
   under art/ui/; several of those images do not exist yet and may never,
   so EVERY tile is drawn in CSS first and the photograph is faded in on
   top only once it has actually loaded. There is no path through this
   file that can show a broken-image icon.
   ═══════════════════════════════════════════════════════════════════ */
var GAMES = [
  { id:'cards-story', name:'KARTI Story',   sub:'story mode',        logo:'emblem',     icon:'map',     mono:'ST', accent:'#8A5CFF', sig:'streak' },
  { id:'cards-mp',    name:'KARTI Online',  sub:'against people',    logo:'emblem',     icon:'users',   mono:'MP', accent:'#FFC542', sig:'streak' },
  { id:'cards-solo',  name:'KARTI Duel',    sub:'against the machine',logo:'emblem',    icon:'cards',   mono:'DU', accent:'#E8452C', sig:'streak' },
  { id:'chess',       name:'Chess',         sub:'party games',       logo:'logo-chess', icon:'knight',  mono:'CH', accent:'#D8C79B', sig:'moves'  },
  { id:'dama',        name:'Dama',          sub:'party games',       logo:'logo-dama',  icon:'draught', mono:'DA', accent:'#3DDC84', sig:'moves'  },
  { id:'skarta',      name:'SKARTA',        sub:'party games',       logo:'logo-skarta',icon:'discard', mono:'SK', accent:'#FF5468', sig:'score'  },
  { id:'kiri',        name:'IL-KIRI',       sub:'party games',       logo:'logo-kiri',  icon:'house',   mono:'KI', accent:'#FFC542', sig:'money'  },
  /* the ids here are klabb.js's own — its ledger calls record(M.gid, …) with
     exactly these four, so the one line it needs stays one line */
  { id:'bixkla',      name:'Bixkla',        sub:'playing cards',     logo:'logo-party', icon:'cards',   mono:'BX', accent:'#8A5CFF', sig:'score'  },
  { id:'briscola',    name:'Briscola',      sub:'playing cards',     logo:'logo-party', icon:'cards',   mono:'BR', accent:'#3DDC84', sig:'score'  },
  { id:'sette',       name:'Sette e Mezzo', sub:'playing cards',     logo:'logo-party', icon:'coin',    mono:'SM', accent:'#E8452C', sig:'score'  },
  { id:'cheat',       name:'Il-Gidba',      sub:'playing cards',     logo:'logo-party', icon:'discard', mono:'GD', accent:'#FF5468', sig:'streak' }
];

var BY_ID = {};
for (var gi = 0; gi < GAMES.length; gi++) BY_ID[GAMES[gi].id] = GAMES[gi];

/* An id nobody registered still gets counted and still gets a row. A
   sixth game landing next week must not lose a player's results just
   because this file had not heard of it yet. */
var ID_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;

function defOf(id){
  if (BY_ID[id]) return BY_ID[id];
  var pretty = String(id).replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, function(c){ return c.toUpperCase(); });
  return { id:id, name:pretty, sub:'', logo:'logo-' + id, icon:'deck',
           mono:String(id).replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '??',
           accent:'#A093C4', sig:'streak', unknown:true };
}

/* Everything the profile knows how to show, in the order it shows it. */
function shelf(){
  var out = GAMES.slice(), seen = {}, i;
  for (i = 0; i < out.length; i++) seen[out[i].id] = 1;
  var extra = [];
  for (var k in DATA.g) if (Object.prototype.hasOwnProperty.call(DATA.g, k) && !seen[k]) extra.push(defOf(k));
  extra.sort(function(a, b){ return a.name < b.name ? -1 : 1; });
  return out.concat(extra);
}

/* ═══════════════════════════════════════════════════════════════════
   1. STORAGE
   One key, one shape, versioned. Results are kept PER PROFILE — a
   leaderboard is a list of people, so "who won this" has to mean a
   person and not a phone. The guest is a person too and gets a slot of
   his own that survives somebody else logging in and out over the top.
   ═══════════════════════════════════════════════════════════════════ */
var KEY = 'karti_stats_v1';
var GUEST = '__guest__';
var REPEAT_MS = 4000;      /* identical unlabelled result inside this = the same match */
var SEEN_MAX = 240;        /* match ids remembered for the id-based guard */

var BLANK = function(){
  return { p:0, w:0, l:0, d:0, cs:0, bs:0, bm:0, bt:0, sc:0, at:0 };
};

var ALL = null;            /* { v, prof:{ <who>: { g:{}, seen:[], at } } } */
var DATA = { g:{}, seen:[], at:0 };
var WHO = GUEST;

/* Which profile is signed in. game.js owns karti_active; we only read
   it, and we fall back to the guest slot if it is missing or unreadable
   so a broken localStorage still gives the player a working screen. */
function activeKey(){
  try {
    if (window.KARTI && KARTI.ACTIVE) return String(KARTI.ACTIVE);
  } catch (e){}
  try {
    var v = JSON.parse(localStorage.getItem('karti_active') || 'null');
    if (typeof v === 'string' && v) return v;
  } catch (e){}
  return GUEST;
}

function playerName(){
  try {
    if (window.KARTI && typeof KARTI.displayName === 'function'){
      var n = KARTI.displayName();
      if (n) return String(n);
    }
  } catch (e){}
  var s = session();
  if (s && s.name) return String(s.name);
  return WHO === GUEST ? 'Guest' : WHO;
}

/* The lsSet pattern from js/game.js: a write that did not happen must
   SAY SO rather than pretend. The in-memory copy is updated either way,
   so a full disk costs the player the history but never the screen he
   is looking at or the match he is in the middle of. */
var storageWarned = false;
function lsSet(k, v){
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e){
    if (!storageWarned){
      storageWarned = true;
      try {
        if (window.KARTI && KARTI.toast)
          KARTI.toast('This browser will not let the record book save. Your results will be lost when you close the tab.');
      } catch (_){}
    }
    return false;
  }
}
function lsGet(k, fallback){
  try { var v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
  catch (e){ return fallback; }
}

function loadAll(){
  var raw = lsGet(KEY, null);
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || !raw.prof || typeof raw.prof !== 'object')
    raw = { v:1, prof:{} };
  ALL = raw;
}

function bind(who){
  if (!ALL) loadAll();
  WHO = who || GUEST;
  var slot = ALL.prof[WHO];
  if (!slot || typeof slot !== 'object') slot = ALL.prof[WHO] = { g:{}, seen:[], at:0 };
  if (!slot.g || typeof slot.g !== 'object') slot.g = {};
  if (!Array.isArray(slot.seen)) slot.seen = [];
  DATA = slot;
  return DATA;
}

function persist(){
  if (!ALL) return false;
  DATA.at = Date.now();
  return lsSet(KEY, ALL);
}

function entry(id){
  var e = DATA.g[id];
  if (!e || typeof e !== 'object'){ e = DATA.g[id] = BLANK(); }
  /* a hand-edited or half-written entry must not poison arithmetic */
  var keys = ['p','w','l','d','cs','bs','bm','bt','sc','at'], i;
  for (i = 0; i < keys.length; i++){
    var n = e[keys[i]];
    if (typeof n !== 'number' || !isFinite(n) || n < 0) e[keys[i]] = 0;
    else e[keys[i]] = Math.floor(n);
  }
  return e;
}

/* ═══════════════════════════════════════════════════════════════════
   2. record() — THE WHOLE API EVERY OTHER GAME NEEDS
   ═══════════════════════════════════════════════════════════════════ */
var recent = [];           /* {sig, t} for the no-id repeat guard */

function normResult(r){
  if (r === true || r === 1) return 'w';
  if (r === false || r === 0) return 'l';
  var s = String(r == null ? '' : r).toLowerCase();
  if (s === 'w' || s === 'win' || s === 'won') return 'w';
  if (s === 'l' || s === 'loss' || s === 'lose' || s === 'lost' || s === 'defeat') return 'l';
  if (s === 'd' || s === 'draw' || s === 'drew' || s === 'tie' || s === 'stalemate') return 'd';
  return '';
}

function num(v, cap){
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) return 0;
  v = Math.floor(v);
  return v > cap ? cap : v;
}

/**
 * record(game, opts) -> { ok, counted, why }
 *
 *   game  the shelf id: 'chess', 'dama', 'skarta', 'kiri',
 *         'cards-story', 'cards-mp', 'cards-solo', 'klabb-*'.
 *         An unregistered id is accepted and gets its own row.
 *   opts  { result:'win'|'loss'|'draw'   (also 'w'/'l'/'d')
 *           id:     a match id, if the game has one — the strongest
 *                   possible guard against counting a match twice
 *           moves:  moves/turns the match took   (a win records the fewest)
 *           score:  final score                  (records the best)
 *           ms:     how long it took             (a win records the fastest)
 *         }
 *
 * Never throws. A game reporting a result must never be able to take
 * the game down with it.
 */
function record(game, opts){
  try {
    opts = opts || {};
    var id = String(game == null ? '' : game).toLowerCase();
    if (!ID_RE.test(id)) return { ok:false, counted:false, why:'bad-game' };
    var res = normResult(opts.result);
    if (!res) return { ok:false, counted:false, why:'bad-result' };

    bind(activeKey());

    /* — guard 1: an explicit match id is never counted twice — */
    var mid = opts.id == null ? '' : String(opts.id).slice(0, 48);
    if (mid){
      var tag = id + ':' + mid;
      if (DATA.seen.indexOf(tag) >= 0) return { ok:true, counted:false, why:'already' };
      DATA.seen.push(tag);
      if (DATA.seen.length > SEEN_MAX) DATA.seen.splice(0, DATA.seen.length - SEEN_MAX);
    }

    /* — guard 2: the same result, reported again, moments later — */
    var moves = num(opts.moves, 100000);
    var score = num(opts.score, 100000000);
    var ms    = num(opts.ms, 86400000);
    var now = Date.now();
    if (!mid){
      var sig = id + '|' + res + '|' + moves + '|' + score;
      for (var i = recent.length - 1; i >= 0; i--){
        if (now - recent[i].t > REPEAT_MS){ recent.splice(0, i + 1); break; }
        if (recent[i].sig === sig) return { ok:true, counted:false, why:'repeat' };
      }
      recent.push({ sig:sig, t:now });
      if (recent.length > 40) recent.splice(0, recent.length - 40);
    }

    var e = entry(id);
    e.p++;
    if (res === 'w'){
      e.w++; e.cs++;
      if (e.cs > e.bs) e.bs = e.cs;
      if (moves && (!e.bm || moves < e.bm)) e.bm = moves;
      if (ms && (!e.bt || ms < e.bt)) e.bt = ms;
    } else {
      if (res === 'l') e.l++; else e.d++;
      e.cs = 0;
    }
    if (score > e.sc) e.sc = score;
    e.at = now;

    var stored = persist();
    render();          /* free: only paints if our screen is actually up */
    queuePush();
    /* THE LADDER (js/progress.js). Every game in the box already
       reports a COUNTED result here and record() is idempotent twice
       over, so this is the one honest place to pay XP from: a result
       that did not count here does not pay, and one that was reported
       twice is not paid twice. No game had to learn a new call. */
    if (window.KARTI_XP && KARTI_XP._fromStats)
      KARTI_XP._fromStats(id, { result:res, id:mid, ms:ms });
    return { ok:true, counted:true, stored:stored };
  } catch (err){
    return { ok:false, counted:false, why:'error' };
  }
}

/* Read-only views, for anything that wants the numbers without the UI. */
function statsFor(game){
  bind(activeKey());
  var e = DATA.g[String(game).toLowerCase()];
  return e ? { played:e.p, won:e.w, lost:e.l, drawn:e.d,
               streak:e.cs, bestStreak:e.bs, bestMoves:e.bm,
               bestTime:e.bt, bestScore:e.sc, lastAt:e.at }
           : { played:0, won:0, lost:0, drawn:0, streak:0, bestStreak:0,
               bestMoves:0, bestTime:0, bestScore:0, lastAt:0 };
}

function totals(){
  bind(activeKey());
  var t = { played:0, won:0, lost:0, drawn:0, games:0, bestStreak:0 };
  for (var k in DATA.g) if (Object.prototype.hasOwnProperty.call(DATA.g, k)){
    var e = entry(k);
    t.played += e.p; t.won += e.w; t.lost += e.l; t.drawn += e.d;
    if (e.bs > t.bestStreak) t.bestStreak = e.bs;
    if (e.p) t.games++;
  }
  return t;
}

function reset(){
  bind(activeKey());
  DATA.g = {}; DATA.seen = []; recent.length = 0;
  persist(); render();
}

/* ═══════════════════════════════════════════════════════════════════
   3. LITTLE HELPERS
   ═══════════════════════════════════════════════════════════════════ */
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}
function ico(n, label){
  if (window.ICO) return window.ICO(n, label);
  return '';
}
function $(sel, root){ return (root || document).querySelector(sel); }
function $$(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function pct(w, p){ return p ? Math.round((w / p) * 100) : 0; }

function when(ms){
  if (!ms) return '';
  var s = Math.floor((Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  var d = Math.floor(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 30) return d + ' days ago';
  var mo = Math.floor(d / 30);
  return mo < 12 ? mo + ' months ago' : Math.floor(d / 365) + 'y ago';
}

/* The one line under each game's name. Different games brag about
   different things, so the shelf entry says which number matters and
   this turns it into English. Nothing is invented: if the number was
   never set the row says so plainly instead of printing a zero. */
function signature(def, e){
  if (!e || !e.p) return 'Not played yet';
  var bits = [];
  if (def.sig === 'moves' && e.bm) bits.push('Quickest win in ' + e.bm + ' moves');
  else if (def.sig === 'score' && e.sc) bits.push('Best score ' + e.sc.toLocaleString('en-GB'));
  else if (def.sig === 'money' && e.sc) bits.push('Richest game EUR ' + e.sc.toLocaleString('en-GB'));
  if (!bits.length && e.bs > 1) bits.push('Best run ' + e.bs + ' in a row');
  if (!bits.length && e.bt) bits.push('Fastest win ' + Math.round(e.bt / 1000) + 's');
  if (!bits.length) bits.push(e.p === 1 ? 'One game played' : e.p + ' games played');
  if (e.cs > 1) bits.push('on ' + e.cs + ' now');
  else if (e.at) bits.push(when(e.at));
  return bits.join(' · ');
}

/* ═══════════════════════════════════════════════════════════════════
   4. THE ART, AND WHAT TO DO WHEN THERE IS NONE
   Half of these emblems have not come off the GPU yet. So a tile is
   ALWAYS a finished thing in CSS — the game's colour, its icon from the
   set in index.html, and its two letters — and the png is a separate
   layer that starts at opacity 0 and is only ever revealed by a real
   load event. An image that 404s simply never appears; there is no
   broken-image glyph, no flash of alt text, and no layout change,
   because the tile was already the right size and already looked right.
   ═══════════════════════════════════════════════════════════════════ */
var artOK = {};            /* stem -> true | false, remembered for the session */

function tile(def, cls){
  var stem = def.logo;
  var known = artOK[stem];
  var img = (known === false) ? '' :
    '<img class="sx-art" alt="" aria-hidden="true" decoding="async" loading="lazy"' +
    ' data-stem="' + esc(stem) + '" src="art/ui/' + esc(stem) + '.png">';
  return '<span class="sx-tile ' + (cls || '') + '" style="--ax:' + esc(def.accent) + '">' +
           '<span class="sx-mono">' + esc(def.mono) + '</span>' +
           '<span class="sx-tico">' + ico(def.icon) + '</span>' +
           img +
         '</span>';
}

/* Wire the load/error handlers after the HTML is in the DOM. onload/onerror
   attributes would be inline handlers; this keeps the markup free of them. */
function wireArt(root){
  $$('.sx-art', root).forEach(function(im){
    var stem = im.getAttribute('data-stem');
    if (im.complete && im.naturalWidth > 0){ artOK[stem] = true; im.classList.add('ok'); return; }
    im.addEventListener('load', function(){
      if (im.naturalWidth > 0){ artOK[stem] = true; im.classList.add('ok'); }
      else { artOK[stem] = false; if (im.parentNode) im.parentNode.removeChild(im); }
    });
    im.addEventListener('error', function(){
      artOK[stem] = false;
      if (im.parentNode) im.parentNode.removeChild(im);
    });
  });
}

/* The coin. art/ui/coin-face.png is minted with a blank middle exactly so
   something can sit in it (docs/RUNPOD_PARTY.md §1b) — so the player's
   initial goes there. Until that image exists the coin is struck in CSS,
   which is the fallback and also perfectly presentable on its own. */
function coin(initial){
  /* The player's own face, once js/progress.js is loaded — the record
     book is one of the five places a player is supposed to appear. The
     minted coin below is still the fallback and is still perfectly
     presentable on its own, which is why it was not deleted. */
  try {
    if (window.KARTI_XP && KARTI_XP.avatarHTML)
      return KARTI_XP.avatarHTML(playerName(), { size:62 });
  } catch (e){}
  return '<span class="sx-coin">' +
           '<img class="sx-art sx-coinface" alt="" aria-hidden="true" decoding="async"' +
             ' data-stem="coin-face" src="art/ui/coin-face.png">' +
           '<span class="sx-coinrim" aria-hidden="true"></span>' +
           '<span class="sx-coinch">' + esc(initial) + '</span>' +
         '</span>';
}

/* ═══════════════════════════════════════════════════════════════════
   5. SYMBOLS
   Two marks the sprite in index.html does not carry, appended to it the
   way js/game.js appends its own, drawn to the same 24x24 / 2px round
   stroke rules so they sit correctly beside every other icon.
   ═══════════════════════════════════════════════════════════════════ */
function injectIcons(){
  var sprite = document.getElementById('karti-sprite');
  if (!sprite || document.getElementById('i-podium')) return;
  var ns = 'http://www.w3.org/2000/svg';
  function add(id, d, filled){
    var sym = document.createElementNS(ns, 'symbol');
    sym.setAttribute('id', id);
    sym.setAttribute('viewBox', '0 0 24 24');
    sym.setAttribute('fill', filled ? 'currentColor' : 'none');
    sym.setAttribute('stroke', filled ? 'none' : 'currentColor');
    if (!filled){
      sym.setAttribute('stroke-width', '2');
      sym.setAttribute('stroke-linecap', 'round');
      sym.setAttribute('stroke-linejoin', 'round');
    }
    sym.innerHTML = d;
    sprite.appendChild(sym);
  }
  /* three blocks, tallest in the middle — a podium reads instantly at
     14px where a wreath or a rosette turns into a smudge */
  add('i-podium',
    '<path d="M3 20h18"></path>' +
    '<path d="M4 20v-5h5v5"></path>' +
    '<path d="M9.5 20V9h5v11"></path>' +
    '<path d="M15 20v-7h5v7"></path>');
  /* a single figure, for "this is you" */
  add('i-person',
    '<circle cx="12" cy="8" r="3.4"></circle>' +
    '<path d="M5.5 20a6.5 6.5 0 0 1 13 0"></path>');
  /* Four game marks. These are the emblems until the real ones come off the
     GPU — and on a phone with no art pack they are the emblems forever — so
     they are drawn as the thing itself rather than borrowed from elsewhere in
     the set. A shield does not say chess and three bars do not say dama. */
  add('i-knight',            /* a knight's head, cut down to what survives 24px */
    '<path d="M8 20h9"></path>' +
    '<path d="M9 20c0-3.4 1-5 3.2-6.4 1.6-1 2.3-2 2.3-3.6 0-2.6-2-4.6-4.6-4.6' +
      'L8.2 6.6 6 8.6l1.6 1.5-1.5 2.2 2.2.8"></path>' +
    '<path d="M10.6 6.6 11.6 4"></path>');
  add('i-draught',           /* two stacked discs, the top one crowned */
    '<ellipse cx="12" cy="17.2" rx="7" ry="2.9"></ellipse>' +
    '<path d="M5 17.2v-2.4M19 17.2v-2.4"></path>' +
    '<ellipse cx="12" cy="11.4" rx="7" ry="2.9"></ellipse>' +
    '<path d="M8.6 7.4 9.9 9l2.1-2.6L14.1 9l1.3-1.6"></path>');
  add('i-house',             /* a townhouse with the enclosed balcony */
    '<path d="M4 20h16"></path>' +
    '<path d="M5.5 20V9.4L12 4.6l6.5 4.8V20"></path>' +
    '<rect x="9" y="10.6" width="6" height="4.2" rx=".8"></rect>' +
    '<path d="M10.6 20v-3.2h2.8V20"></path>');
}

/* ═══════════════════════════════════════════════════════════════════
   6. THE STYLESHEET
   Injected once. Everything is scoped to #scr-stats so it cannot leak
   into anybody else's screen, and it uses the tokens already declared
   on :root in index.html so it follows the game if those ever change.
   ═══════════════════════════════════════════════════════════════════ */
function injectCSS(){
  if (document.getElementById('sx-runtime-css')) return;
  var st = document.createElement('style');
  st.id = 'sx-runtime-css';
  st.textContent =
    '#scr-stats{--ax:#FFC542}' +

    /* ── the two-tab switch: profile or the whole island ── */
    '#scr-stats .sx-seg{display:flex;background:var(--panel);border:1px solid var(--line);' +
      'border-radius:13px;padding:4px;gap:4px;margin:0 0 10px;flex:0 0 auto}' +
    '#scr-stats .sx-seg button{flex:1;min-height:42px;border-radius:10px;font-family:var(--disp);' +
      'font-weight:900;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);' +
      'display:flex;align-items:center;justify-content:center;gap:7px;transition:.15s var(--ease)}' +
    '#scr-stats .sx-seg button .ico{font-size:1.25em}' +
    '#scr-stats .sx-seg button[aria-pressed="true"]{background:var(--gold);color:#241800}' +

    /* ── the head: coin, name, and the three numbers ── */
    '#scr-stats .sx-head{display:flex;align-items:center;gap:13px;padding:13px;border-radius:16px;' +
      'background:linear-gradient(150deg,rgba(138,92,255,.20),rgba(27,20,48,.92) 62%);' +
      'border:1px solid var(--line2);flex:0 0 auto;margin-bottom:9px}' +
    '#scr-stats .sx-idn{min-width:0;flex:1}' +
    '#scr-stats .sx-idn h3{font-size:17px;letter-spacing:.04em;text-transform:uppercase;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-stats .sx-idn .sx-sub{display:flex;align-items:center;gap:5px;margin-top:4px;' +
      'font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;font-weight:700;color:var(--dim2)}' +
    '#scr-stats .sx-idn .sx-sub .ico{font-size:1.25em;flex:0 0 auto}' +
    '#scr-stats .sx-idn .sx-sub span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +

    /* the coin. No transform on anything that could parent the tab bar —
       this is a plain sized box with a radial gradient in it. */
    '#scr-stats .sx-coin{position:relative;flex:0 0 auto;width:62px;height:62px;border-radius:50%;' +
      'display:grid;place-items:center;overflow:hidden;' +
      'background:radial-gradient(circle at 34% 28%,#FFE9B0,#FFC542 42%,#B07E12 78%,#7A5407);' +
      'box-shadow:0 3px 0 -1px rgba(0,0,0,.55),0 7px 16px rgba(0,0,0,.45),' +
      'inset 0 0 0 1px rgba(255,255,255,.35)}' +
    '#scr-stats .sx-coinrim{position:absolute;inset:5px;border-radius:50%;' +
      'border:1.5px dashed rgba(93,60,0,.5)}' +
    '#scr-stats .sx-coinch{position:relative;font-family:var(--disp);font-weight:900;font-size:23px;' +
      'line-height:1;color:#5C3D00;text-shadow:0 1px 0 rgba(255,255,255,.45)}' +
    '#scr-stats .sx-coinface{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
      'opacity:0;transition:opacity .25s var(--ease)}' +
    '#scr-stats .sx-coinface.ok{opacity:1}' +
    '#scr-stats .sx-coinface.ok~.sx-coinrim{display:none}' +

    /* ── W / L / D, and the bar under them ── */
    '#scr-stats .sx-score{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;flex:0 0 auto}' +
    '#scr-stats .sx-cell{border-radius:13px;background:var(--panel);border:1px solid var(--line);' +
      'padding:9px 6px 8px;text-align:center}' +
    '#scr-stats .sx-cell b{display:block;font-family:var(--disp);font-weight:900;font-size:23px;' +
      'line-height:1.05;font-variant-numeric:tabular-nums}' +
    '#scr-stats .sx-cell i{display:block;font-style:normal;margin-top:3px;font-size:9.5px;' +
      'letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--dim2)}' +
    '#scr-stats .sx-cell.w b{color:var(--ok)}' +
    '#scr-stats .sx-cell.l b{color:var(--bad)}' +
    '#scr-stats .sx-cell.d b{color:var(--dim)}' +
    '#scr-stats .sx-bar{display:flex;height:7px;border-radius:99px;overflow:hidden;margin:9px 0 4px;' +
      'background:rgba(255,255,255,.07);flex:0 0 auto}' +
    '#scr-stats .sx-bar i{display:block;height:100%}' +
    '#scr-stats .sx-bar .bw{background:linear-gradient(90deg,#3DDC84,#2FB86C)}' +
    '#scr-stats .sx-bar .bd{background:#4C4270}' +
    '#scr-stats .sx-bar .bl{background:linear-gradient(90deg,#C0384A,#FF5468)}' +
    '#scr-stats .sx-rate{display:flex;justify-content:space-between;gap:10px;flex:0 0 auto;' +
      'font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;font-weight:700;' +
      'color:var(--dim2);margin:0 2px 10px}' +
    '#scr-stats .sx-rate b{color:var(--gold);font-weight:900}' +

    /* ── the list ── */
    '#scr-stats .sx-list{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;' +
      '-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:7px;' +
      'padding-bottom:6px;scrollbar-width:thin}' +
    '#scr-stats .sx-list::-webkit-scrollbar{width:5px}' +
    '#scr-stats .sx-list::-webkit-scrollbar-thumb{background:var(--line2);border-radius:6px}' +

    '#scr-stats .sx-row{display:grid;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;' +
      'column-gap:11px;padding:9px 11px 9px 9px;border-radius:14px;background:var(--panel);' +
      'border:1px solid var(--line);flex:0 0 auto}' +
    '#scr-stats .sx-row.cold{opacity:.56}' +
    '#scr-stats .sx-nm{min-width:0}' +
    '#scr-stats .sx-nm b{display:block;font-family:var(--disp);font-weight:900;font-size:12.5px;' +
      'letter-spacing:.06em;text-transform:uppercase;color:var(--txt);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-stats .sx-nm i{display:block;font-style:normal;margin-top:3px;font-size:11px;line-height:1.35;' +
      'color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-stats .sx-wld{display:flex;gap:4px;flex:0 0 auto;font-variant-numeric:tabular-nums}' +
    '#scr-stats .sx-wld span{min-width:29px;text-align:center;padding:4px 5px;border-radius:8px;' +
      'font:900 12px/1.15 var(--disp);letter-spacing:.02em;background:rgba(255,255,255,.05);color:var(--dim2)}' +
    '#scr-stats .sx-wld span em{display:block;font-style:normal;font-size:8px;letter-spacing:.1em;' +
      'font-weight:700;opacity:.72;margin-top:1px}' +
    '#scr-stats .sx-wld .w{color:var(--ok);background:rgba(61,220,132,.13)}' +
    '#scr-stats .sx-wld .l{color:var(--bad);background:rgba(255,84,104,.13)}' +

    /* ── the emblem tile ── */
    '#scr-stats .sx-tile{position:relative;width:48px;height:48px;border-radius:13px;overflow:hidden;' +
      'display:grid;place-items:center;flex:0 0 auto;' +
      'background:linear-gradient(160deg,color-mix(in srgb,var(--ax) 34%,#150F26),#150F26 74%);' +
      'border:1px solid color-mix(in srgb,var(--ax) 40%,transparent)}' +
    /* color-mix is young. Anything that does not understand it simply gets
       the flat panel colour underneath, which still reads correctly. */
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '#scr-stats .sx-tile{background:var(--panel2);border-color:var(--line2)}}' +
    /* the two letters sit in the corner, not behind the glyph — stacked they
       just made a smudge at 48px, which is the only size this is ever seen at */
    /* the two letters sit ABOVE the photograph as well as above the drawn
       tile: the three KARTI modes share one emblem, so without the label
       three different rows would carry three identical pictures */
    '#scr-stats .sx-mono{position:absolute;left:0;right:0;bottom:0;padding:1px 0 2px;z-index:2;' +
      'text-align:center;font-family:var(--disp);font-weight:900;font-size:8px;' +
      'letter-spacing:.14em;color:#FFF0C8;opacity:.9;' +
      'background:linear-gradient(180deg,transparent,rgba(0,0,0,.72) 55%)}' +
    '#scr-stats .sx-tico{position:relative;display:grid;place-items:center;color:var(--ax);' +
      'margin-bottom:6px}' +
    '#scr-stats .sx-tico .ico{width:24px;height:24px;font-size:24px}' +
    '#scr-stats .sx-art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
      'opacity:0;transition:opacity .25s var(--ease)}' +
    '#scr-stats .sx-art.ok{opacity:1}' +

    /* ── leaderboard ── */
    '#scr-stats .sx-filter{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;flex:0 0 auto;' +
      'margin:0 -12px 9px;padding:1px 12px 5px;scrollbar-width:none}' +
    '#scr-stats .sx-filter::-webkit-scrollbar{display:none}' +
    '#scr-stats .sx-filter button{flex:0 0 auto;min-height:34px;padding:0 12px;border-radius:99px;' +
      'background:var(--panel);border:1px solid var(--line);color:var(--dim);white-space:nowrap;' +
      'font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;' +
      'transition:.15s var(--ease)}' +
    '#scr-stats .sx-filter button[aria-pressed="true"]{background:var(--gold);color:#241800;' +
      'border-color:#FFE9B0}' +

    '#scr-stats .sx-state{display:flex;align-items:center;gap:9px;margin:0 0 9px;padding:9px 12px;' +
      'border-radius:12px;font-size:12.5px;line-height:1.45;flex:0 0 auto;' +
      'background:rgba(255,255,255,.05);border:1px solid var(--line)}' +
    '#scr-stats .sx-dot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:#7A8194;' +
      'box-shadow:0 0 0 3px rgba(122,129,148,.18)}' +
    '#scr-stats .sx-state.live .sx-dot{background:var(--ok);box-shadow:0 0 0 3px rgba(61,220,132,.20)}' +
    '#scr-stats .sx-state.bad{background:rgba(255,84,104,.10);border-color:rgba(255,84,104,.35)}' +
    '#scr-stats .sx-state.bad .sx-dot{background:var(--bad);box-shadow:0 0 0 3px rgba(255,84,104,.20)}' +
    '#scr-stats .sx-state.wait .sx-dot{background:var(--gold);box-shadow:0 0 0 3px rgba(255,197,66,.20);' +
      'animation:sxPulse 1.1s ease-in-out infinite}' +
    '@keyframes sxPulse{0%,100%{opacity:1}50%{opacity:.32}}' +
    '#scr-stats .sx-state .sx-txt{flex:1;min-width:0}' +
    '#scr-stats .sx-state button{flex:0 0 auto;min-height:32px;padding:0 11px;border-radius:9px;' +
      'background:rgba(255,255,255,.07);border:1px solid var(--line2);color:var(--txt);' +
      'font-size:10.5px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;' +
      'font-family:var(--disp)}' +

    '#scr-stats .sx-lrow{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;' +
      'column-gap:10px;padding:9px 11px;border-radius:14px;background:var(--panel);' +
      'border:1px solid var(--line);flex:0 0 auto}' +
    '#scr-stats .sx-lrow.me{border-color:var(--gold);background:rgba(255,197,66,.09)}' +
    '#scr-stats .sx-rank{font-family:var(--disp);font-weight:900;font-size:16px;text-align:center;' +
      'color:var(--dim2);font-variant-numeric:tabular-nums}' +
    '#scr-stats .sx-lrow.p1 .sx-rank{color:#FFD979}' +
    '#scr-stats .sx-lrow.p2 .sx-rank{color:#D8DDE8}' +
    '#scr-stats .sx-lrow.p3 .sx-rank{color:#E0955A}' +
    '#scr-stats .sx-lrow.p1{border-color:rgba(255,197,66,.45);' +
      'background:linear-gradient(100deg,rgba(255,197,66,.14),var(--panel) 62%)}' +
    '#scr-stats .sx-lrow.p2{border-color:rgba(216,221,232,.28)}' +
    '#scr-stats .sx-lrow.p3{border-color:rgba(224,149,90,.28)}' +
    '#scr-stats .sx-who{min-width:0;display:flex;align-items:center;gap:7px}' +
    '#scr-stats .sx-who b{font-family:var(--disp);font-weight:900;font-size:12.5px;letter-spacing:.05em;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
    '#scr-stats .sx-who .ico{flex:0 0 auto;color:var(--gold);font-size:1.15em}' +
    '#scr-stats .sx-mine{flex:0 0 auto;font-size:8.5px;letter-spacing:.12em;font-weight:900;' +
      'text-transform:uppercase;color:#241800;background:var(--gold);border-radius:5px;padding:2px 5px}' +

    '#scr-stats .sx-gap{text-align:center;color:var(--dim2);font-size:15px;letter-spacing:.4em;' +
      'line-height:1;padding:2px 0;flex:0 0 auto}' +
    '#scr-stats .sx-lbl{flex:0 0 auto;margin:9px 4px 1px;font-size:9.5px;letter-spacing:.14em;' +
      'text-transform:uppercase;font-weight:700;color:var(--dim2)}' +

    '#scr-stats .sx-empty{margin:auto;padding:26px 18px;text-align:center;color:var(--dim);' +
      'font-size:12.5px;line-height:1.65}' +
    '#scr-stats .sx-empty .ico{display:block;margin:0 auto 11px;width:34px;height:34px;font-size:34px;' +
      'color:var(--dim2)}' +
    '#scr-stats .sx-empty b{display:block;font-family:var(--disp);font-weight:900;font-size:13px;' +
      'letter-spacing:.07em;text-transform:uppercase;color:var(--txt);margin-bottom:7px}' +

    '#scr-stats .sx-foot{flex:0 0 auto;margin:8px 2px 0;font-size:10.5px;line-height:1.55;' +
      'color:var(--dim2);text-align:center}' +

    /* short phones (his is 894 tall, but an installed icon can be shorter
       still) — give the list its room back by shrinking the head */
    '@media (max-height:760px){' +
      '#scr-stats .sx-coin{width:52px;height:52px}' +
      '#scr-stats .sx-coinch{font-size:19px}' +
      '#scr-stats .sx-cell b{font-size:20px}' +
      '#scr-stats .sx-head{padding:10px}}' +

    '.reduced #scr-stats .sx-art,.reduced #scr-stats .sx-coinface{transition:none}' +
    '.reduced #scr-stats .sx-state.wait .sx-dot{animation:none}';
  document.head.appendChild(st);
}

/* ═══════════════════════════════════════════════════════════════════
   7. THE SCREEN
   go() in js/game.js only knows the screens named in its own SCREENS
   array and that array is not ours to edit, so — exactly as party.js
   does — we make our own section, show it ourselves, and keep a
   MutationObserver as the safety net: the moment anything else switches
   a screen on we step aside instead of floating over the top of it.
   ═══════════════════════════════════════════════════════════════════ */
var scr = null, live = false, watching = false;
var VIEW = 'profile';      /* profile | board */

function screenEl(){
  if (scr && scr.isConnected) return scr;
  scr = document.getElementById('scr-stats');
  if (!scr){
    scr = document.createElement('section');
    scr.className = 'screen';
    scr.id = 'scr-stats';
    (document.getElementById('app') || document.body).appendChild(scr);
  }
  return scr;
}

function watch(){
  if (watching || typeof MutationObserver !== 'function') return;
  var app = document.getElementById('app');
  if (!app) return;
  watching = true;
  new MutationObserver(function(recs){
    if (!live) return;
    for (var i = 0; i < recs.length; i++){
      var t = recs[i].target;
      if (t === scr || !t.parentNode || t.parentNode !== app) continue;
      if (t.classList && t.classList.contains('screen') && t.classList.contains('on')){
        standDown(); return;
      }
    }
  }).observe(app, { attributes:true, attributeFilter:['class'], subtree:true });
}

function show(){
  injectCSS(); injectIcons();
  var el = screenEl();
  var app = document.getElementById('app');
  if (app) for (var i = 0; i < app.children.length; i++){
    var s = app.children[i];
    if (s !== el && s.classList && s.classList.contains('screen')) s.classList.remove('on');
  }
  el.classList.add('on');
  live = true;
  watch();
}

function standDown(){ live = false; if (scr) scr.classList.remove('on'); }

function close(){
  standDown();
  try {
    if (window.KARTI_PARTY && KARTI_PARTY.open && cameFrom === 'party') return KARTI_PARTY.open();
  } catch (e){}
  try { if (window.KARTI && KARTI.go) KARTI.go('home'); } catch (e){}
}

var cameFrom = 'home';

function openProfile(from){
  cameFrom = from || cameFrom;
  VIEW = 'profile';
  bind(activeKey());
  show(); render();
}
function openLeaderboard(from){
  cameFrom = from || cameFrom;
  VIEW = 'board';
  bind(activeKey());
  show(); render();
  loadBoard();
}

/* ── the frame both views live in ── */
function render(){
  if (!live || !scr) return;
  bind(activeKey());
  var el = screenEl();
  el.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="sx-back" aria-label="Back">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + (VIEW === 'board' ? 'Leaderboard' : 'Record Book') + '</h2>' +
    '</div>' +
    /* Plain toggle buttons, not role="tab". Tabs owe the screen reader a
       tabpanel to point at and there is not one here — the whole screen
       changes — so aria-pressed is the honest word for what these do. */
    '<div class="sx-seg">' +
      '<button type="button" id="sx-tab-p" aria-pressed="' + (VIEW === 'profile') + '">' +
        ico('person') + 'My record</button>' +
      '<button type="button" id="sx-tab-b" aria-pressed="' + (VIEW === 'board') + '">' +
        ico('podium') + 'Everybody</button>' +
    '</div>' +
    (VIEW === 'board' ? boardHTML() : profileHTML());

  wireArt(el);
  $('#sx-back', el).onclick = close;
  $('#sx-tab-p', el).onclick = function(){ if (VIEW !== 'profile'){ VIEW = 'profile'; render(); } };
  $('#sx-tab-b', el).onclick = function(){ if (VIEW !== 'board'){ VIEW = 'board'; render(); loadBoard(); } };
  if (VIEW === 'board') wireBoard(el);
}

/* ═══════════════════════════════════════════════════════════════════
   8. PROFILE
   ═══════════════════════════════════════════════════════════════════ */

/* One game, one line. The profile is a column of these and the offline
   leaderboard borrows the same row rather than inventing a second look for
   the same fact. A game never played is dimmed and says so — it is still
   listed, because "you have not played IL-KIRI yet" is information and a
   missing row is not. */
function gameRow(def, e){
  var cold = !e || !e.p;
  return '<div class="sx-row' + (cold ? ' cold' : '') + '">' +
           tile(def) +
           '<span class="sx-nm"><b>' + esc(def.name) + '</b>' +
             '<i>' + esc(signature(def, e)) + '</i></span>' +
           '<span class="sx-wld">' +
             '<span class="w">' + (e ? e.w : 0) + '<em>W</em></span>' +
             '<span class="l">' + (e ? e.l : 0) + '<em>L</em></span>' +
             '<span>' + (e ? e.d : 0) + '<em>D</em></span>' +
           '</span>' +
         '</div>';
}

function profileHTML(){
  var t = totals();
  var name = playerName();
  var initial = (name.replace(/[^\p{L}\p{N}]/gu, '') || name || '?').charAt(0).toUpperCase() || '?';
  var s = session();
  var where = s && s.name
    ? 'Signed in as ' + s.name
    : (WHO === GUEST ? 'Playing as a guest on this phone' : 'On this phone only');

  var bw = t.played ? (t.won / t.played) * 100 : 0;
  var bd = t.played ? (t.drawn / t.played) * 100 : 0;
  var bl = t.played ? (t.lost / t.played) * 100 : 0;

  var list = shelf().map(function(def){ return gameRow(def, DATA.g[def.id]); }).join('');

  return '<div class="sx-head">' +
           coin(initial) +
           '<span class="sx-idn"><h3>' + esc(name) + '</h3>' +
             '<span class="sx-sub">' + ico(s && s.name ? 'cloud' : 'person') +
               '<span>' + esc(where) + '</span></span></span>' +
         '</div>' +
         '<div class="sx-score">' +
           '<div class="sx-cell w"><b>' + t.won + '</b><i>Won</i></div>' +
           '<div class="sx-cell l"><b>' + t.lost + '</b><i>Lost</i></div>' +
           '<div class="sx-cell d"><b>' + t.drawn + '</b><i>Drawn</i></div>' +
         '</div>' +
         '<div class="sx-bar" role="img" aria-label="' + t.won + ' won, ' + t.lost +
           ' lost, ' + t.drawn + ' drawn">' +
           '<i class="bw" style="width:' + bw.toFixed(2) + '%"></i>' +
           '<i class="bd" style="width:' + bd.toFixed(2) + '%"></i>' +
           '<i class="bl" style="width:' + bl.toFixed(2) + '%"></i>' +
         '</div>' +
         '<div class="sx-rate"><span>' + t.played + ' played</span>' +
           '<span>Win rate <b>' + pct(t.won, t.played) + '%</b></span>' +
           '<span>Best run <b>' + t.bestStreak + '</b></span></div>' +
         '<div class="sx-list">' + list + '</div>' +
         '<p class="sx-foot">Kept on this phone, for this player. Nothing here is guessed.</p>';
}

/* ═══════════════════════════════════════════════════════════════════
   9. THE LEADERBOARD CLIENT
   The board lives on the Pi and the Pi is frequently unreachable — a
   public https page cannot open a connection to a private address at
   all (Private Network Access), which is exactly the case on the
   owner's own phone. So this NEVER blocks the screen: the profile half
   works with no network whatsoever, the board has a hard timeout, and a
   failure says what actually happened in a sentence instead of spinning
   forever or throwing.
   ═══════════════════════════════════════════════════════════════════ */
var NET_MS = 9000;
var BOARD = { state:'idle', rows:null, you:null, at:0, why:'', game:'' };
var FILTER = 'all';

function baseURL(){
  var u = '';
  try {
    if (window.KARTI_SYNC && typeof KARTI_SYNC.baseURL === 'function') u = KARTI_SYNC.baseURL() || '';
  } catch (e){}
  if (u) return u.replace(/\/acct$/i, '') + '/stats';
  if (location.protocol === 'http:' && location.hostname)
    return 'http://' + location.hostname + ':8101/karti/stats';
  return 'https://raspberrypi.silverside-tench.ts.net:8443/karti/stats';
}

/* The session token. js/sync.js already owns exactly one login and keeps
   it at karti_sync_<profile>; a second copy would be a second thing to
   get out of step, so this reads that one and writes nothing. */
function session(){
  var s = null;
  try {
    var k = activeKey();
    if (k) s = lsGet('karti_sync_' + k, null);
  } catch (e){}
  if (!s || typeof s !== 'object' || typeof s.tok !== 'string' || !s.tok) return null;
  return s;
}

function post(route, body, ms){
  var url = baseURL() + '/' + route;
  var ctrl = null, timer = null;
  try { ctrl = new AbortController(); } catch (e){}
  var opts = {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body || {}),
    credentials:'omit', cache:'no-store', mode:'cors'
  };
  if (ctrl){
    opts.signal = ctrl.signal;
    timer = setTimeout(function(){ try { ctrl.abort(); } catch (e){} }, ms || NET_MS);
  }
  return fetch(url, opts).then(function(r){
    return r.text().then(function(txt){
      var js = null;
      try { js = JSON.parse(txt); } catch (e){}
      return { status:r.status, d: js || {} };
    });
  }).then(function(r){
    if (timer) clearTimeout(timer);
    if (r.status >= 200 && r.status < 300) return { ok:true, d:r.d };
    return { ok:false, status:r.status, why: r.d.why || 'The board said no.', d:r.d };
  }).catch(function(){
    if (timer) clearTimeout(timer);
    return { ok:false, status:0, offline:true, why:'', d:{} };
  });
}

/* ── sending YOUR results up ────────────────────────────────────────
   Only ever your own: the request carries a session token and no name
   and no user field, so the server decides who the numbers belong to.
   There is nothing in the payload that could claim to be somebody else.
   Debounced, because a run of quick games must not be a run of requests. */
var pushTimer = null, lastPush = 0, pushing = false;
var PUSH_DEBOUNCE = 9000, PUSH_MIN_GAP = 25000;

function queuePush(){
  if (!session()) return;
  if (pushTimer) return;
  pushTimer = setTimeout(function(){ pushTimer = null; pushNow(); }, PUSH_DEBOUNCE);
}

function pushNow(force){
  var s = session();
  if (!s) return Promise.resolve({ ok:false, why:'not-linked' });
  var now = Date.now();
  if (!force && now - lastPush < PUSH_MIN_GAP){ queuePush(); return Promise.resolve({ ok:false, why:'too-soon' }); }
  if (pushing) return Promise.resolve({ ok:false, why:'busy' });
  pushing = true; lastPush = now;
  bind(activeKey());
  var games = {}, n = 0;
  for (var k in DATA.g) if (Object.prototype.hasOwnProperty.call(DATA.g, k)){
    if (n++ >= 40) break;
    var e = entry(k);
    if (!e.p) continue;
    games[k] = { p:e.p, w:e.w, l:e.l, d:e.d, bs:e.bs, bm:e.bm, bt:e.bt, sc:e.sc };
  }
  /* the face and the level ride along. Both are one small field, both
     are ignored by a server that has never heard of them, and both are
     what the board needs the day it wants to show either. */
  var body = { tok:s.tok, games:games };
  try {
    if (window.KARTI_XP){ body.av = KARTI_XP.avatar(); body.lv = KARTI_XP.level(); }
  } catch (e){}
  return post('push', body, NET_MS).then(function(r){
    pushing = false;
    return r;
  }, function(){ pushing = false; return { ok:false }; });
}

/* ── pulling the board down ── */
function loadBoard(){
  var s = session();
  BOARD.state = 'loading'; BOARD.why = ''; BOARD.game = FILTER;
  paintBoard();
  var body = { game: FILTER };
  if (s) body.tok = s.tok;
  /* push first when we can, so the board you are about to read already
     includes the game you just finished. A failed push must not stop the
     read — the board is still worth showing. */
  var first = s ? pushNow(true).catch(function(){ return null; }) : Promise.resolve(null);
  first.then(function(){
    return post('board', body, NET_MS);
  }).then(function(r){
    if (BOARD.game !== FILTER) return;               /* the player moved on */
    if (r.ok && r.d && Array.isArray(r.d.rows)){
      BOARD.state = 'live';
      BOARD.rows = r.d.rows;
      BOARD.you = r.d.you || null;
      BOARD.at = Date.now();
    } else {
      BOARD.state = 'down';
      BOARD.why = r.offline || !r.status
        ? 'Cannot reach the board from here.'
        : (r.why || 'The board is not answering.');
    }
    paintBoard();
  }).catch(function(){
    BOARD.state = 'down';
    BOARD.why = 'Cannot reach the board from here.';
    paintBoard();
  });
}

function boardHTML(){
  var chips = [{ id:'all', name:'Overall' }].concat(shelf());
  return '<div class="sx-filter" id="sx-filter">' +
           chips.map(function(c){
             return '<button type="button" data-g="' + esc(c.id) + '" aria-pressed="' +
                    (FILTER === c.id) + '">' + esc(c.name) + '</button>';
           }).join('') +
         '</div>' +
         '<div id="sx-board" class="sx-list"></div>';
}

/* The filter strip is wider than the phone, so the chip that is switched on
   can easily be off the right-hand edge — which reads as "no filter is on"
   and is the one thing a filter must never do. Centre it instead. Set
   directly on scrollLeft rather than scrollIntoView(): that would be free to
   scroll an ancestor as well, and the ancestor here is the app shell. */
function showChip(el){
  var strip = $('#sx-filter', el);
  if (!strip) return;
  var on = $('button[aria-pressed="true"]', strip);
  if (!on) return;
  strip.scrollLeft = Math.max(0, on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2);
}

function wireBoard(el){
  $$('#sx-filter button', el).forEach(function(b){
    b.onclick = function(){
      var g = b.getAttribute('data-g');
      if (g === FILTER) return;
      FILTER = g;
      $$('#sx-filter button', el).forEach(function(o){
        o.setAttribute('aria-pressed', String(o.getAttribute('data-g') === FILTER));
      });
      showChip(el);
      loadBoard();
    };
  });
  showChip(el);
  paintBoard();
}

function stateLine(){
  if (BOARD.state === 'loading')
    return '<p class="sx-state wait"><span class="sx-dot"></span>' +
           '<span class="sx-txt">Asking the Pi who is winning…</span></p>';
  if (BOARD.state === 'down')
    return '<p class="sx-state bad"><span class="sx-dot"></span>' +
           '<span class="sx-txt">' + esc(BOARD.why || 'Cannot reach the board right now.') + '</span>' +
           '<button type="button" id="sx-retry">Retry</button></p>';
  if (BOARD.state === 'live')
    return '<p class="sx-state live"><span class="sx-dot"></span>' +
           '<span class="sx-txt">Live from the Pi' +
           (session() ? ' — your results are on it' : ' — log in to get on it') + '</span>' +
           '<button type="button" id="sx-retry">Refresh</button></p>';
  return '';
}

function lrow(r, rank, me){
  var cls = 'sx-lrow' + (rank <= 3 ? ' p' + rank : '') + (me ? ' me' : '');
  return '<div class="' + cls + '">' +
           '<span class="sx-rank">' + rank + '</span>' +
           '<span class="sx-who">' + (rank === 1 ? ico('trophy') : '') +
             /* everybody on the board has a face. Yours is the one you
                picked; somebody else's is derived from their name, so
                the same person is the same face to everyone looking —
                until a relay build echoes their own `av` back, which
                avatarFor() will prefer the moment it does. */
             (window.KARTI_XP && KARTI_XP.avatarHTML
               ? KARTI_XP.avatarHTML(r.name || '?', { size:26, hint:r.av }) : '') +
             '<b>' + esc(r.name || '?') + '</b>' +
             (me ? '<span class="sx-mine">You</span>' : '') + '</span>' +
           '<span class="sx-wld">' +
             '<span class="w">' + (r.w | 0) + '<em>W</em></span>' +
             '<span class="l">' + (r.l | 0) + '<em>L</em></span>' +
             '<span>' + (r.d | 0) + '<em>D</em></span>' +
           '</span>' +
         '</div>';
}

/* When the board cannot be had, show the thing that IS true: your own record
   for whatever is filtered, and under it the games it is made of. A dead
   server must not leave a blank screen, it must not pretend to be an empty
   leaderboard, and it must not leave three quarters of the phone empty
   either — the numbers waiting to go up are worth looking at on their own. */
function localFallback(){
  bind(activeKey());
  var t, rows;
  if (FILTER === 'all'){
    t = totals();
    rows = shelf().filter(function(d){ var e = DATA.g[d.id]; return e && e.p; })
                  .map(function(d){ return gameRow(d, DATA.g[d.id]); });
  } else {
    var def = defOf(FILTER), e = DATA.g[FILTER] || BLANK();
    t = { won:e.w, lost:e.l, drawn:e.d, played:e.p };
    rows = e.p ? [gameRow(def, e)] : [];
  }
  return '<div class="sx-lrow me">' +
           '<span class="sx-rank">' + ico('person') + '</span>' +
           '<span class="sx-who"><b>' + esc(playerName()) + '</b>' +
             '<span class="sx-mine">You</span></span>' +
           '<span class="sx-wld">' +
             '<span class="w">' + t.won + '<em>W</em></span>' +
             '<span class="l">' + t.lost + '<em>L</em></span>' +
             '<span>' + t.drawn + '<em>D</em></span>' +
           '</span>' +
         '</div>' +
         (rows.length
           ? '<p class="sx-lbl">' + (session()
               ? 'Waiting to go up on the board'
               : 'On this phone — an account puts it on the board') + '</p>' +
             rows.join('')
           : '<div class="sx-empty">' + ico('podium') +
             '<b>Nothing to show yet</b>' +
             'Play something and win it. Your record is kept on the phone ' +
             'either way, and goes up the moment the Pi answers again.</div>');
}

function paintBoard(){
  var host = scr && $('#sx-board', scr);
  if (!host) return;
  var body;
  if (BOARD.state === 'live'){
    var rows = BOARD.rows || [];
    if (!rows.length){
      body = '<div class="sx-empty">' + ico('podium') +
             '<b>Nobody on the board yet</b>' +
             'Play a game and win it, and this is where your name goes. ' +
             'You need an account for the board to know who you are.</div>';
    } else {
      var mine = (BOARD.you && BOARD.you.u) || '';
      var shown = {}, out = [];
      for (var i = 0; i < rows.length; i++){
        var r = rows[i];
        shown[r.u] = 1;
        out.push(lrow(r, i + 1, !!mine && r.u === mine));
      }
      if (mine && BOARD.you && BOARD.you.rank && !shown[mine]){
        out.push('<div class="sx-gap" aria-hidden="true">···</div>');
        out.push(lrow(BOARD.you, BOARD.you.rank, true));
      }
      body = out.join('');
    }
  } else if (BOARD.state === 'loading'){
    body = '';
  } else {
    body = localFallback();
  }
  host.innerHTML = stateLine() + body;
  /* This repaint happens long after render() finished — the answer only
     arrives when the Pi answers — so the emblems in it have to be wired here
     too, or they sit at opacity 0 forever waiting for a load event nobody is
     listening for. */
  wireArt(host);
  var rt = $('#sx-retry', host);
  if (rt) rt.onclick = loadBoard;
}

/* ═══════════════════════════════════════════════════════════════════
   10. BOOT
   ═══════════════════════════════════════════════════════════════════ */
bind(activeKey());

/* A profile switch has to move the record book with it, or one player
   sees another's numbers. game.js does not announce logins, so this
   simply notices the active key changing — cheap, and it also catches a
   login that happened in another tab. */
var lastKey = WHO;
setInterval(function(){
  var k = activeKey();
  if (k !== lastKey){ lastKey = k; bind(k); if (live) render(); }
}, 2500);

/* Anything unsent goes up when the app comes back to the foreground. */
document.addEventListener('visibilitychange', function(){
  if (!document.hidden && session()) queuePush();
});

/* ── the way in ────────────────────────────────────────────────────
   index.html and js/game.js belong to other people, so the button that
   opens this cannot be wired from them. One delegated listener means the
   insert on their side is pure markup and no JavaScript at all:

     <button class="btn ghost" data-karti-stats>Record book</button>
     <button class="btn ghost" data-karti-stats="board">Leaderboard</button>

   Delegated on the document so it also works for a button that is painted
   long after this file ran, which is every screen in this game. */
document.addEventListener('click', function(ev){
  var t = ev.target;
  var b = t && t.closest ? t.closest('[data-karti-stats]') : null;
  if (!b) return;
  ev.preventDefault();
  var what = (b.getAttribute('data-karti-stats') || '').toLowerCase();
  if (what === 'board' || what === 'leaderboard') openLeaderboard();
  else openProfile();
});

window.KARTI_STATS = {
  VERSION: 1,

  /* ── the entire API a game needs ── */
  record: record,

  /* ── the screens ── */
  openProfile: openProfile,
  openLeaderboard: openLeaderboard,
  close: close,
  isOpen: function(){ return live; },

  /* ── reading the numbers without the UI ── */
  GAMES: GAMES,
  games: shelf,
  stats: statsFor,
  totals: totals,
  all: function(){ bind(activeKey()); var o = {}; for (var k in DATA.g) o[k] = statsFor(k); return o; },
  player: playerName,
  reset: reset,

  /* ── the board ── */
  baseURL: baseURL,
  linked: function(){ return !!session(); },
  push: function(){ return pushNow(true); },
  board: function(){ return BOARD; },
  refresh: loadBoard,

  /* used by the headless verification harness */
  _key: KEY,
  _bind: bind,
  _defOf: defOf
};

})();
