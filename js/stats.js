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
     Those are ONE screen now, not two destinations: a three-tab control
     across the top — MY RECORD / RECENT / BOARD — and the two calls above
     simply open it on the tab they name. Same for the markup hooks:
     `data-karti-stats` lands on MY RECORD, `data-karti-stats="board"` on
     BOARD.

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
  { id:'cheat',       name:'Il-Gidba',      sub:'playing cards',     logo:'logo-party', icon:'discard', mono:'GD', accent:'#FF5468', sig:'streak' },
  /* Tombla was never in this list, so every tombla result the record book
     has ever counted was drawn through the unknown-id fallback row — it
     counted correctly and looked like nothing. The three new games would
     have joined it there. */
  { id:'tombla',      name:'Tombla',        sub:'party games',       logo:'logo-tombla',  icon:'coin',    mono:'TB', accent:'#FFB300', sig:'streak' },
  { id:'gharraq',     name:'Għarraqhom!',   sub:'party games',       logo:'logo-gharraq', icon:'bomb',    mono:'GĦ', accent:'#4FA9E8', sig:'moves'  },
  { id:'rummy',       name:'Rummy',         sub:'playing cards',     logo:'logo-rummy',   icon:'cards',   mono:'RM', accent:'#3DDC84', sig:'streak' },
  { id:'gin',         name:'Gin Rummy',     sub:'playing cards',     logo:'logo-gin',     icon:'deck',    mono:'GN', accent:'#D8C79B', sig:'score'  }
];

var BY_ID = {};
for (var gi = 0; gi < GAMES.length; gi++) BY_ID[GAMES[gi].id] = GAMES[gi];

/* ── THE LOGO ATLAS ──────────────────────────────────────────────────
   Every game the board can be filtered by, mapped to the picture that
   says what it is at a glance. The files that actually exist under
   art/ui/ are: logo-{bomba,briks,cards2131,chess,dama,erbgha,kanun,
   kiri,kodici,ludu,minhu,serp,skarta,tankijiet,party}.png plus emblem.png.
   A game with no logo of its own falls back to the drawn emblem in the
   chip (its two-letter mono + icon), so the strip is never a broken
   image and never a bare word with nothing beside it. The 'all' tab is
   the trophy/podium mark, drawn, because "Overall" is not one game.
   Several board ids differ from the file stem (suspett -> serp art,
   cards-* share the KARTI emblem), so this is the one place they meet. */
var TABLOGO = {
  'all':         '',            /* drawn podium icon, see logoChip */
  'cards-story': 'emblem',
  'cards-mp':    'emblem',
  'cards-solo':  'emblem',
  'chess':       'logo-chess',
  'dama':        'logo-dama',
  'skarta':      'logo-skarta',
  'kiri':        'logo-kiri',
  'serp':        'logo-serp',
  'suspett':     'logo-serp',   /* the snake-eye emblem doubles for the whodunit */
  'kanun':       'logo-kanun',
  'bomba':       'logo-bomba',
  'briks':       'logo-briks',
  'ludu':        'logo-ludu',
  'erbgha':      'logo-erbgha',
  'minhu':       'logo-minhu',
  'kodici':      'logo-kodici',
  'cards2131':   'logo-cards2131',
  'tankijiet':   'logo-tankijiet',
  /* THE ART CAUGHT UP. gharraq, poker, spy and tombla were pointed at the
     shared party emblem because their own files did not exist yet;
     art/ui/logo-{gharraq,poker,spy,tombla}.png now do, so a chip for one
     of those shows the GAME instead of a generic deck. The rows under
     them were never in this table at all, so they drew the CSS emblem
     while their real picture sat unused on disk — kaxxi and konkwista
     are two of the ten games this pass put on the board, and the rest
     came in with it. A stem that 404s is still safe: the <img> is
     removed on error and the drawn tile beneath is what shows. */
  'gharraq':     'logo-gharraq',
  'poker':       'logo-poker',
  'spy':         'logo-spy',
  'tombla':      'logo-tombla',
  'kaxxi':       'logo-kaxxi',
  'konkwista':   'logo-konkwista',
  'sqaq':        'logo-sqaq',
  'kelma':       'logo-kelma',
  'aqleb':       'logo-aqleb',
  'ballun':      'logo-ballun',
  'misteru':     'logo-misteru',
  'ilforka':     'logo-ilforka',
  /* these have no dedicated file yet — the shared party emblem reads as
     "a card/party game" and is a real picture, not a broken one */
  'bixkla':      'logo-party',
  'briscola':    'logo-party',
  'sette':       'logo-party',
  'cheat':       'logo-party',
  'rummy':       'logo-party',
  'gin':         'logo-party'
};
/* The stem to show in a filter chip for game `id`: the atlas first, then
   the shelf def's own `logo`, then '' (drawn fallback). '' never 404s
   because there is no <img> for it. */
function logoFor(id){
  if (Object.prototype.hasOwnProperty.call(TABLOGO, id)) return TABLOGO[id];
  var d = BY_ID[id];
  if (d && d.logo && d.logo !== 'emblem' && /^logo-/.test(d.logo)) return d.logo;
  return '';
}

/* ── THE WHOLE ISLAND, GROUPED ──────────────────────────────────────
   KARTI now ships ~28 games and a flat horizontal chip strip can only
   ever show four or five of them at once, so the rest are invisible.
   This is the one list that names EVERY game the box can play and puts
   it in a shelf a person actually thinks in — the KARTI TCG, then card
   games, board & strategy, arena, party. The quick chips above the board
   stay a short, curated row for speed; the "All games" button opens this,
   laid out as a grid of cards so every single game is one tap away and
   nothing is hidden off the edge of a strip.

   `nm`/`mt` are the game's real English/Maltese name (pulled from the
   games' own files); the id is the same id the board filters by and the
   logo atlas already maps, so tapping a card is identical to tapping a
   chip. A game with no dedicated logo png still shows — its drawn emblem
   (icon on an accent) is the guaranteed base under every card, exactly as
   the chips do, so this grid can never show a broken image. */
var CAT_ACCENT = {
  karti:'#8A5CFF', card:'#FFC542', board:'#3DDC84', arena:'#E8452C', party:'#4FA9E8',
  /* WORD GAMES got their own shelf because two games asked for one: kelma and
     il-forka both declare cat:'word' on their own tiles, and filing a letter
     guessing game under "board & strategy" is the kind of small lie a player
     notices when they cannot find it. */
  word:'#D8C79B'
};
var CATALOG = [
  { key:'karti', en:'KARTI', mt:'KARTI', icon:'cards', games:[
    { id:'cards-story', nm:'KARTI Story',  mt:'KARTI Story',  icon:'map',   accent:'#8A5CFF' },
    { id:'cards-mp',    nm:'KARTI Online', mt:'KARTI Online', icon:'users', accent:'#FFC542' },
    { id:'cards-solo',  nm:'KARTI Duel',   mt:'KARTI Duel',   icon:'cards', accent:'#E8452C' }
  ]},
  { key:'card', en:'Card games', mt:'Logħob tal-karti', icon:'cards', games:[
    { id:'skarta',    nm:'SKARTA',        mt:'SKARTA',        icon:'discard', accent:'#FF5468' },
    { id:'bixkla',    nm:'Bixkla',        mt:'Bixkla',        icon:'cards',   accent:'#8A5CFF' },
    { id:'briscola',  nm:'Briscola',      mt:'Briscola',      icon:'cards',   accent:'#3DDC84' },
    { id:'sette',     nm:'Sette e Mezzo', mt:'Sette e Mezzo', icon:'coin',    accent:'#E8452C' },
    { id:'cheat',     nm:'Il-Gidba',      mt:'Il-Gidba',      icon:'discard', accent:'#FF5468' },
    { id:'rummy',     nm:'Rummy',         mt:'Rummy',         icon:'cards',   accent:'#3DDC84' },
    { id:'gin',       nm:'Gin Rummy',     mt:'Gin Rummy',     icon:'deck',    accent:'#D8C79B' },
    { id:'cards2131', nm:'21 & 31',       mt:'21 & 31',       icon:'coin',    accent:'#FFC542' },
    { id:'poker',     nm:'Poker',         mt:'Il-Poker',      icon:'coin',    accent:'#3DDC84' }
  ]},
  { key:'board', en:'Board & strategy', mt:'Bord u strateġija', icon:'knight', games:[
    { id:'chess',     nm:'Chess',         mt:'Ċess',          icon:'knight',  accent:'#D8C79B' },
    { id:'dama',      nm:'Dama',          mt:'Dama',          icon:'draught', accent:'#3DDC84' },
    { id:'kanun',     nm:'Il-Kanun',      mt:'Il-Kanun',      icon:'deck',    accent:'#FFB300' },
    { id:'briks',     nm:'Il-Ħajt',       mt:'Il-Ħajt',       icon:'deck',    accent:'#E8452C' },
    { id:'kodici',    nm:'Il-Kodiċi',     mt:'Il-Kodiċi',     icon:'deck',    accent:'#4FA9E8' },
    { id:'konkwista', nm:'Konkwista',     mt:'Konkwista',     icon:'deck',    accent:'#8A5CFF' },
    { id:'erbgha',    nm:'Four in a Row', mt:'Erbgħa f\'Ringiela', icon:'coin', accent:'#FFC542' },
    /* name, mt and icon lifted from kaxxi-ui.js's own TILE, so the grid
       card and the game shelf call it the same thing */
    { id:'kaxxi',     nm:'Dots & Boxes',  mt:'Puntini u Kaxxi', icon:'map',   accent:'#4FA9E8' },
    { id:'ludu',      nm:'Ludu',          mt:'Ludu',          icon:'coin',    accent:'#FF5468' },
    { id:'serp',      nm:'Is-Serp',       mt:'Is-Serp',       icon:'deck',    accent:'#3DDC84' },
    { id:'sqaq',      nm:'Is-Sqaq',       mt:'Is-Sqaq',       icon:'map',     accent:'#FFC542' }
  ]},
  { key:'word', en:'Word games', mt:'Logħob tal-kliem', icon:'book', games:[
    { id:'kelma',     nm:'Kelma',         mt:'Kelma',         icon:'book',    accent:'#D8C79B' },
    { id:'ilforka',   nm:'Il-Forka',      mt:'Il-Forka',      icon:'book',    accent:'#FFB300' }
  ]},
  { key:'arena', en:'Arena', mt:'Arena', icon:'bomb', games:[
    { id:'bomba',     nm:'Il-Bomba',      mt:'Il-Bomba',      icon:'bomb',    accent:'#E8452C' },
    { id:'tankijiet', nm:'It-Tankijiet',  mt:'It-Tankijiet',  icon:'bomb',    accent:'#4FA9E8' },
    { id:'gharraq',   nm:'Għarraqhom!',   mt:'Għarraqhom!',   icon:'bomb',    accent:'#4FA9E8' },
    { id:'ballun',    nm:'Il-Ballun',     mt:'Il-Ballun',     icon:'impact',  accent:'#3DDC84' }
  ]},
  { key:'party', en:'Party', mt:'Party', icon:'users', games:[
    { id:'kiri',      nm:'IL-KIRI',       mt:'IL-KIRI',       icon:'house',   accent:'#FFC542' },
    { id:'tombla',    nm:'Tombla',        mt:'Tombla',        icon:'coin',    accent:'#FFB300' },
    { id:'minhu',     nm:'Min Hu?',       mt:'Min Hu?',       icon:'users',   accent:'#3DDC84' },
    { id:'suspett',   nm:'SUSPETT',       mt:'SUSPETT',       icon:'deck',    accent:'#FF5468' },
    { id:'spy',       nm:'L-Ispjun',      mt:'L-Ispjun',      icon:'users',   accent:'#8A5CFF' },
    /* IL-MISTERU was missing from its own grid — the one game in the box with
       50 hand-authored cases, unfindable here. Filed with the other whodunits
       (SUSPETT, L-Ispjun) rather than under "board", which is where its shelf
       tile sits, because a player looking for it is looking for a mystery. */
    { id:'misteru',   nm:'Il-Misteru',    mt:'Il-Misteru',    icon:'search',  accent:'#8A5CFF' },
    { id:'aqleb',     nm:'Flip It',       mt:'Aqleb',         icon:'drop',    accent:'#4FA9E8' }
  ]}
];

/* every id the catalog carries, mapped to its catalog def, so a card and
   a chip agree on name/accent/icon even for ids that never joined GAMES */
var CAT_BY_ID = {};
(function(){
  for (var c = 0; c < CATALOG.length; c++)
    for (var g = 0; g < CATALOG[c].games.length; g++){
      var e = CATALOG[c].games[g];
      e.cat = CATALOG[c].key;
      CAT_BY_ID[e.id] = e;
    }
})();

/* A display def for any id, preferring the shelf, then the catalog, then
   the generic pretty-name fallback — so the board, the grid and the player
   card all name and colour a game the same way. */
function richDef(id){
  if (BY_ID[id]) return BY_ID[id];
  var c = CAT_BY_ID[id];
  if (c){
    return { id:id, name:c.nm, sub:'', logo:logoFor(id) || 'emblem',
             icon:c.icon, mono:(c.nm.replace(/[^A-Za-z0-9]/g,'').slice(0,2).toUpperCase() || '??'),
             accent:c.accent, sig:'streak' };
  }
  return defOf(id);
}

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

/* Everything the profile knows how to show, in the order it shows it.
   richDef, NOT defOf, for the games that never joined GAMES: defOf can
   only pretty-print the id, so the ten games wired to the record book in
   this pass would have come up on the profile as "Erbgha", "Cards2131"
   and "Kodici" while the CATALOG two hundred lines up already held their
   real names, icons and accents. richDef reads the shelf first, then the
   catalog, then falls back to defOf exactly as before, so an id nobody
   registered anywhere still gets its row. */
function shelf(){
  var out = GAMES.slice(), seen = {}, i;
  for (i = 0; i < out.length; i++) seen[out[i].id] = 1;
  var extra = [];
  for (var k in DATA.g) if (Object.prototype.hasOwnProperty.call(DATA.g, k) && !seen[k]) extra.push(richDef(k));
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
var HIST_MAX = 120;        /* recent-match entries kept for the RECENT feed */

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
  if (!slot || typeof slot !== 'object') slot = ALL.prof[WHO] = { g:{}, seen:[], h:[], at:0 };
  if (!slot.g || typeof slot.g !== 'object') slot.g = {};
  if (!Array.isArray(slot.seen)) slot.seen = [];
  /* h[] — the RECENT GAMES feed. Every COUNTED result appends one small
     entry here, newest last, capped. It is the one place this file keeps a
     per-MATCH record (the counters in g[] are aggregates and cannot answer
     "what happened last"), so the Recent tab has something true to show. */
  if (!Array.isArray(slot.h)) slot.h = [];
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

    /* THE RECENT FEED. One entry per counted match, newest last, capped at
       HIST_MAX. Only fields this file actually has: the game id, the result,
       the moves/score/ms the caller passed (0 when it did not), and when.
       Opponent names are NOT in record()'s payload, so they cannot be stored
       here honestly — see the report. */
    if (!Array.isArray(DATA.h)) DATA.h = [];
    DATA.h.push({ g:id, r:res, m:moves, sc:score, ms:ms, t:now });
    if (DATA.h.length > HIST_MAX) DATA.h.splice(0, DATA.h.length - HIST_MAX);

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
  DATA.g = {}; DATA.seen = []; DATA.h = []; recent.length = 0;
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
/* The house language idiom. Every player-visible string in this file goes
   through T(en, mt) so the record book speaks whichever language the rest of
   KARTI is in. No hard dependency on lang.js — English is the fallback. */
function T(en, mt){
  try {
    if (window.KARTI_LANG && typeof KARTI_LANG.t === 'function') return KARTI_LANG.t(en, mt);
  } catch (e){}
  return en;
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
  if (s < 90) return T('just now', 'issa');
  if (s < 3600) return Math.floor(s / 60) + T(' min ago', ' min ilu');
  if (s < 86400) return Math.floor(s / 3600) + T('h ago', 's ilu');
  var d = Math.floor(s / 86400);
  if (d === 1) return T('yesterday', 'ilbieraħ');
  if (d < 30) return d + T(' days ago', ' ijiem ilu');
  var mo = Math.floor(d / 30);
  return mo < 12 ? mo + T(' months ago', ' xhur ilu') : Math.floor(d / 365) + T('y ago', ' snin ilu');
}

/* The one line under each game's name. Different games brag about
   different things, so the shelf entry says which number matters and
   this turns it into English. Nothing is invented: if the number was
   never set the row says so plainly instead of printing a zero. */
function signature(def, e){
  if (!e || !e.p) return T('Not played yet', 'Għadu ma ntlagħabx');
  var bits = [];
  if (def.sig === 'moves' && e.bm) bits.push(T('Quickest win in ' + e.bm + ' moves', 'L-eħfef rebħa f\'' + e.bm + ' mossi'));
  else if (def.sig === 'score' && e.sc) bits.push(T('Best score ', 'L-aħjar punteġġ ') + e.sc.toLocaleString('en-GB'));
  else if (def.sig === 'money' && e.sc) bits.push(T('Richest game EUR ', 'L-agħna logħba EUR ') + e.sc.toLocaleString('en-GB'));
  if (!bits.length && e.bs > 1) bits.push(T('Best run ' + e.bs + ' in a row', 'L-aħjar sensiela ' + e.bs));
  if (!bits.length && e.bt) bits.push(T('Fastest win ' + Math.round(e.bt / 1000) + 's', 'L-eħfef rebħa ' + Math.round(e.bt / 1000) + 's'));
  if (!bits.length) bits.push(e.p === 1 ? T('One game played', 'Logħba waħda') : T(e.p + ' games played', e.p + ' logħbiet'));
  if (e.cs > 1) bits.push(T('on ' + e.cs + ' now', 'fuq ' + e.cs + ' issa'));
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
  /* .sx-art = the trophy tiles and the coin face; .sx-chart = the filter
     chip logos. Both obey the same rule: reveal on a real load, remove on
     error so the drawn thing beneath is what shows. */
  $$('.sx-art, .sx-chart', root).forEach(function(im){
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
  var shared = '';
  try {
    if (window.KARTI_XP && KARTI_XP.avatarHTML)
      /* me:true is what makes describe() resolve the VIEWER'S OWN chosen
         face and their stored data: photo — the exact call the profile
         screen makes (progress-ui.js). Without it describe() treats the
         viewer as a stranger with a default face and no photo, and the
         head showed the initials tile instead of the face he picked. */
      shared = KARTI_XP.avatarHTML(playerName(), { size:62, me:true }) || '';
  } catch (e){ shared = ''; }
  if (shared){
    /* still floored by the guaranteed tile, so a missing sprite or a
       photo that never lands can never leave the head blank */
    return '<span class="sx-coin sx-coinav">' +
             initialsTile(playerName(), 62) +
             '<span class="sx-face-real" style="position:absolute;inset:0">' + shared + '</span>' +
           '</span>';
  }
  return '<span class="sx-coin">' +
           initialsTile(playerName(), 62) +
           '<img class="sx-art sx-coinface" alt="" aria-hidden="true" decoding="async"' +
             ' data-stem="coin-face" src="art/ui/coin-face.png">' +
           '<span class="sx-coinrim" aria-hidden="true"></span>' +
           '<span class="sx-coinch">' + esc(initial) + '</span>' +
         '</span>';
}

/* A five-point crown, drawn once for the leaderboard's first place — the
   same visual language as the winner screen (js/rebbieh.js). No image, no
   emoji, just a gold-gradient SVG. */
function crownSVG(){
  return '<svg class="sx-crown" viewBox="0 0 40 26" aria-hidden="true">' +
    '<defs><linearGradient id="sxCrownG" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#FFF3CF"/><stop offset=".5" stop-color="#FFC542"/>' +
    '<stop offset="1" stop-color="#C77A00"/></linearGradient></defs>' +
    '<path d="M2 9 L10 15 L20 4 L30 15 L38 9 L34.5 24 L5.5 24 Z" ' +
    'fill="url(#sxCrownG)" stroke="#7a4d00" stroke-width="1" stroke-linejoin="round"/>' +
    '<circle cx="2" cy="9" r="2.3" fill="url(#sxCrownG)"/>' +
    '<circle cx="38" cy="9" r="2.3" fill="url(#sxCrownG)"/>' +
    '<circle cx="20" cy="4" r="2.5" fill="url(#sxCrownG)"/></svg>';
}

/* THE INITIALS, AND A COLOUR THAT IS ALWAYS THE SAME FOR A NAME.
   Up to two letters: first letter of the first word, first of the last
   word, so "Karti Story" reads KS and "Guzi" reads G. A stable hash of
   the name picks a hue, so the same person is always the same tile to
   everybody looking, everywhere. This is the floor under every avatar in
   the file — it is drawn with nothing but the name, synchronously, so it
   is on screen on the first frame whether or not a photo, a drawn face,
   the shared renderer, or the sprite ever arrive. */
function initialsOf(name){
  var clean = String(name == null ? '' : name).replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  if (!clean) return '?';
  var parts = clean.split(/\s+/);
  var a = parts[0].charAt(0);
  var b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (a + b).toUpperCase() || '?';
}
function hueOf(name){
  var s = String(name == null ? '' : name).toLowerCase(), h = 5381, i;
  for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}
/* the guaranteed, synchronous, never-blank tile. Its own inline colours
   so it does not depend on a stylesheet being present either. */
function initialsTile(name, size){
  var hue = hueOf(name);
  var ch = initialsOf(name);
  var fs = Math.max(9, Math.round(size * (ch.length > 1 ? 0.36 : 0.44)));
  return '<span class="sx-fallback" aria-hidden="true" style="position:absolute;inset:0;' +
         'display:grid;place-items:center;font-family:var(--disp,inherit);font-weight:900;' +
         'font-size:' + fs + 'px;line-height:1;letter-spacing:.02em;color:#fff;' +
         'text-shadow:0 1px 2px rgba(0,0,0,.45);' +
         'background:linear-gradient(155deg,hsl(' + hue + ' 62% 46%),hsl(' + ((hue + 34) % 360) +
         ' 58% 26%))">' + esc(ch) + '</span>';
}

/* A WEEKLY-CHAMPION MARKER, IF THE DATA CARRIES ONE.
   The board may tag a row as the current weekly #1 of a game. The awarding
   lives elsewhere (the relay / progress.js); this only DISPLAYS whatever
   marker arrives. Tolerant of several shapes so it lights up the day the
   field lands whichever way it is spelled:
       row.champ      — a game id string, e.g. "chess"       (preferred)
       row.champion   — same, alternate spelling
       row.crown      — a game id, or `true`/1 for a generic crown
   A recognised game id shows that game's emblem inside a gold roundel; an
   unrecognised value or a bare truthy still shows a generic crown, so a
   marker is never silently dropped. Returns '' when there is nothing. */
function championOf(row){
  if (!row) return '';
  var v = row.champ != null ? row.champ : (row.champion != null ? row.champion : row.crown);
  if (v == null || v === false || v === 0 || v === '') return '';
  var gid = (typeof v === 'string') ? v.toLowerCase() : '';
  var def = gid && BY_ID[gid] ? BY_ID[gid] : (gid ? defOf(gid) : null);
  var inner = def
    ? '<span class="sx-chmk-ico" style="color:' + esc(def.accent) + '">' + ico(def.icon) + '</span>'
    : crownSVG();
  var label = def ? T('Weekly champion of ' + def.name, 'Champjin tal-ġimgħa ta\' ' + def.name)
                  : T('Weekly champion', 'Champjin tal-ġimgħa');
  return '<span class="sx-chmk" role="img" aria-label="' + esc(label) + '">' + inner + '</span>';
}

/* A player's face for a leaderboard row, in whatever size the row wants.
   TWO LAYERS, ALWAYS. A guaranteed initials tile is drawn first and never
   removed; the shared avatar renderer (js/progress.js — real photo, drawn
   face, or its own initials medallion) is layered on top and shown only
   when it actually produces something. If that renderer, its sprite, or a
   photograph never arrive, the tile beneath is what shows — so an avatar
   in this file can NEVER be an empty circle, with or without a session,
   with or without the network. A champion marker, if the data carries one,
   is pinned on top. */
function faceHTML(row, size, opts){
  opts = opts || {};
  var name = (row && row.name) || '?';
  /* IS THIS THE VIEWER? A row flagged `you` (paintBoard sets it when the
     row's user id matches the session), or an explicit opts.me, is the
     person looking at the screen — so it must render EXACTLY like the
     profile: describe(me:true) resolves their own chosen face and their
     stored data: photo. A stranger's row instead carries the look the
     relay published beside their name (hint/border/who+pv), no photo
     request unless a version came down. Getting this right is what makes
     the board avatar match the profile the user asked for. */
  var mine = opts.me === true || !!(row && row.you);
  var shared = '';
  try {
    if (window.KARTI_XP && KARTI_XP.avatarHTML){
      var o = mine
        ? { size:size, me:true }
        : { size:size, hint:row && row.av, border:row && row.bd,
            who:row && row.u, pv:row && row.pv };
      shared = KARTI_XP.avatarHTML(name, o) || '';
    }
  } catch (e){ shared = ''; }
  var mark = opts.noChamp ? '' : championOf(row);
  return '<span class="sx-face" style="position:relative;display:block;width:100%;height:100%">' +
           initialsTile(name, size) +
           (shared ? '<span class="sx-face-real" style="position:absolute;inset:0">' +
                     shared + '</span>' : '') +
           mark +
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
  /* four tiles, for "all games" — the grid affordance */
  add('i-grid',
    '<rect x="4" y="4" width="7" height="7" rx="1.4"></rect>' +
    '<rect x="13" y="4" width="7" height="7" rx="1.4"></rect>' +
    '<rect x="4" y="13" width="7" height="7" rx="1.4"></rect>' +
    '<rect x="13" y="13" width="7" height="7" rx="1.4"></rect>');
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

    /* ── the segmented switch. ONE control, used at two levels: the outer
       my record / recent / board, and the board's own overall / all games.
       44px is the touch floor, so that is the button height. ── */
    '#scr-stats .sx-seg{display:flex;background:var(--panel);border:1px solid var(--line);' +
      'border-radius:13px;padding:4px;gap:4px;margin:0 0 10px;flex:0 0 auto}' +
    '#scr-stats .sx-seg button{flex:1;min-height:44px;border-radius:10px;font-family:var(--disp);' +
      'font-weight:900;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);' +
      'display:flex;align-items:center;justify-content:center;gap:7px;transition:.15s var(--ease)}' +
    '#scr-stats .sx-seg button .ico{font-size:1.25em}' +
    '#scr-stats .sx-seg button[aria-pressed="true"]{background:var(--gold);color:#241800}' +
    /* the three-tab variant: labels are short, so let them ellipsis rather
       than wrap or overflow on 360px. min-width:0 lets the flex child shrink. */
    '#scr-stats .sx-seg3 button{min-width:0;font-size:10.5px;letter-spacing:.05em;gap:5px;padding:0 4px}' +
    '#scr-stats .sx-seg3 button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
    '#scr-stats .sx-seg3 button .ico{flex:0 0 auto}' +
    /* the SUB control, one level in (the board\'s overall / all games). Reads
       as subordinate to the tab strip above it without shrinking the target:
       no fill of its own, a lighter pressed state, a tighter gap under it. */
    '#scr-stats .sx-segsub{background:transparent;border-color:transparent;padding:0;gap:6px;' +
      'margin:0 0 8px}' +
    '#scr-stats .sx-segsub button{background:var(--panel);border:1px solid var(--line);' +
      'font-size:10.5px;letter-spacing:.06em}' +
    '#scr-stats .sx-segsub button[aria-pressed="true"]{background:rgba(255,197,66,.16);' +
      'border-color:var(--gold);color:var(--gold)}' +

    /* ── the panels — one shows, the others are hidden. Each panel is a full
       flex column (only its inner list scrolls), so a tab switch is a display
       flip with no re-render and no scroll jump. The same rules serve both
       levels; the outer panes key off data-vpanel and the board\'s off
       data-panel, so a nested pair cannot hide each other.
       The cross-fade is OPACITY ONLY — a transform here would make the panel a
       containing block for any position:fixed descendant, which is the bug
       that once caught the tab bar (see index.html\'s scrIn note) — and it is
       switched off entirely under prefers-reduced-motion. ── */
    '#scr-stats .sx-panes{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}' +
    '#scr-stats .sx-panel{flex:1 1 auto;min-height:0;display:none;flex-direction:column}' +
    '#scr-stats .sx-panel.on{display:flex;animation:sxPane .18s var(--ease) both}' +
    '#scr-stats .sx-panel[hidden]{display:none}' +
    '@keyframes sxPane{from{opacity:0}to{opacity:1}}' +
    '@media (prefers-reduced-motion:reduce){#scr-stats .sx-panel.on{animation:none}}' +
    /* the app\'s OWN reduced-motion switch (PREFS in js/game.js puts .reduced
       on <body>), honoured the same way as the OS one */
    'body.reduced #scr-stats .sx-panel.on{animation:none}' +

    /* ── the ALL GAMES tab: grid <-> one game\'s board, both in one scroller ── */
    '#scr-stats .sx-gwrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}' +
    '#scr-stats .sx-gview{flex:1 1 auto;min-height:0;display:none;flex-direction:column;' +
      'overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:thin;' +
      'padding-bottom:6px}' +
    '#scr-stats .sx-gview.on{display:flex}' +
    '#scr-stats .sx-gview[hidden]{display:none}' +
    '#scr-stats .sx-gview::-webkit-scrollbar{width:5px}' +
    '#scr-stats .sx-gview::-webkit-scrollbar-thumb{background:var(--line2);border-radius:6px}' +
    /* the per-game board sub-view holds its own list, which is the scroller */
    '#scr-stats .sx-gboard{overflow:visible}' +
    '#scr-stats .sx-gboard .sx-list{flex:1 1 auto;min-height:0}' +
    '#scr-stats .sx-gbhead{display:flex;align-items:center;gap:9px;margin:0 0 9px;flex:0 0 auto}' +
    '#scr-stats .sx-gback{flex:0 0 auto;display:flex;align-items:center;gap:5px;min-height:34px;' +
      'padding:0 11px 0 7px;border-radius:9px;background:var(--panel);border:1px solid var(--line);' +
      'color:var(--dim);font-family:var(--disp);font-weight:900;font-size:10px;letter-spacing:.07em;' +
      'text-transform:uppercase}' +
    '#scr-stats .sx-gback svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;' +
      'stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}' +
    '#scr-stats .sx-gbtitle{min-width:0;font-family:var(--disp);font-weight:900;font-size:13px;' +
      'letter-spacing:.03em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +

    /* ── the RECENT GAMES feed ── */
    '#scr-stats .sx-rrow{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;' +
      'column-gap:11px;padding:9px 11px 9px 9px;border-radius:14px;background:var(--panel);' +
      'border:1px solid var(--line);flex:0 0 auto}' +
    '#scr-stats .sx-rnm{min-width:0}' +
    '#scr-stats .sx-rnm b{display:block;font-family:var(--disp);font-weight:900;font-size:12.5px;' +
      'letter-spacing:.05em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-stats .sx-rnm i{display:block;font-style:normal;margin-top:3px;font-size:11px;color:var(--dim);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-stats .sx-rres{flex:0 0 auto;font-family:var(--disp);font-weight:900;font-size:10.5px;' +
      'letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border-radius:8px;' +
      'background:rgba(255,255,255,.05);color:var(--dim2)}' +
    '#scr-stats .sx-rres.w{color:var(--ok);background:rgba(61,220,132,.14)}' +
    '#scr-stats .sx-rres.l{color:var(--bad);background:rgba(255,84,104,.14)}' +
    '#scr-stats .sx-rres.d{color:var(--dim);background:rgba(255,255,255,.06)}' +

    /* ── the head: coin, name, and the three numbers ── */
    '#scr-stats .sx-head{display:flex;align-items:center;gap:13px;padding:13px;border-radius:16px;' +
      'background:linear-gradient(150deg,rgba(138,92,255,.20),rgba(27,20,48,.92) 62%);' +
      'border:1px solid var(--line2);flex:0 0 auto;margin-bottom:9px}' +
    '#scr-stats .sx-idn{min-width:0;flex:1 1 auto;display:flex;flex-direction:column;align-items:flex-start}' +
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
    '#scr-stats .sx-coin .sx-coinch{z-index:2}' +
    '#scr-stats .sx-coinav{background:none}' +
    /* THE `img:not(.kx-ring-art)` IS LOAD-BEARING, HERE AND IN THE THREE
       OTHER AVATAR HOSTS ON THIS SCREEN (.sx-lav, .sx-pav, .sx-pcav).
       "Every img in this box fills it and takes its corner" is right for a
       photograph, and wrong for a FRAME: the beta gem rings
       (js/progress-faces.js, .kx-ring-art) are painted art the frame CSS
       deliberately hangs outside the face at 118% / inset -9%, so the stones
       break the silhouette. Caught by the blanket rule they came out 100%
       wide with a -9% left/top still applied — two pixels too small and two
       pixels up-and-left, so the jewellery sat crooked ON the face instead
       of around it, with its corners rounded off. Excluding it is better
       than out-shouting it: these rules are !important, so a correction
       would have had to win a specificity fight it does not need to have. */
    '#scr-stats .sx-coinav .kx-av,#scr-stats .sx-coinav .sx-face-real>*,' +
      '#scr-stats .sx-coinav img:not(.kx-ring-art),#scr-stats .sx-coinav>span{' +
      'width:100%!important;height:100%!important;border-radius:50%!important}' +
    '#scr-stats .sx-coinav .sx-fallback{border-radius:50%!important}' +

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

    /* ── the win-rate ring: the hero number of the profile head ── */
    '#scr-stats .sx-badges{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap;max-width:100%}' +
    '#scr-stats .sx-ring{margin-left:2px}' +
    '#scr-stats .sx-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;' +
      'border-radius:99px;background:rgba(255,255,255,.05);border:1px solid var(--line);' +
      'font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:var(--dim)}' +
    '#scr-stats .sx-badge b{color:var(--txt);font-weight:900;font-variant-numeric:tabular-nums}' +
    '#scr-stats .sx-badge .ico{font-size:1.15em;color:var(--gold)}' +
    '#scr-stats .sx-ring{position:relative;flex:0 0 auto;width:62px;height:62px;border-radius:50%;' +
      'display:grid;place-items:center;' +
      'background:conic-gradient(var(--gold) calc(var(--v,0)*1%),rgba(255,255,255,.08) 0)}' +
    '@supports not (background:conic-gradient(red 10%,blue 0)){' +
      '#scr-stats .sx-ring{background:rgba(255,197,66,.14);border:2px solid var(--gold)}}' +
    '#scr-stats .sx-ring-in{position:absolute;inset:5px;border-radius:50%;background:var(--panel);' +
      'display:grid;place-items:center;text-align:center;line-height:1}' +
    '#scr-stats .sx-ring-in b{font-family:var(--disp);font-weight:900;font-size:19px;color:var(--gold);' +
      'font-variant-numeric:tabular-nums}' +
    '#scr-stats .sx-ring-in b em{font-style:normal;font-size:11px;margin-left:1px}' +
    '#scr-stats .sx-ring-in i{display:block;font-style:normal;margin-top:1px;font-size:8px;' +
      'letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--dim2)}' +

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
    /* ALL-TIME | WEEKLY — a pill segmented control, same language as the
       two-tab switch at the top but scoped to the ranking period */
    '#scr-stats .sx-period{display:flex;gap:4px;background:var(--panel);border:1px solid var(--line);' +
      'border-radius:11px;padding:3px;margin:0 0 9px;flex:0 0 auto}' +
    '#scr-stats .sx-period button{flex:1;min-height:34px;border-radius:8px;font-family:var(--disp);' +
      'font-weight:900;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim);' +
      'display:flex;align-items:center;justify-content:center;gap:6px;' +
      'transition:background .15s var(--ease),color .15s var(--ease)}' +
    '#scr-stats .sx-period button .ico{font-size:1.2em}' +
    '#scr-stats .sx-period button[aria-pressed="true"]{background:var(--gold);color:#241800}' +
    '#scr-stats .sx-week{display:flex;align-items:flex-start;gap:8px;margin:0 2px 9px;padding:8px 11px;' +
      'border-radius:11px;font-size:11px;line-height:1.45;color:var(--dim);flex:0 0 auto;' +
      'background:rgba(255,197,66,.08);border:1px solid rgba(255,197,66,.22)}' +
    '#scr-stats .sx-week .sx-dot{margin-top:3px;background:var(--gold);' +
      'box-shadow:0 0 0 3px rgba(255,197,66,.18)}' +
    '#scr-stats .sx-filter{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;flex:0 0 auto;' +
      'margin:0 -12px 9px;padding:1px 12px 5px;scrollbar-width:none}' +
    '#scr-stats .sx-filter::-webkit-scrollbar{display:none}' +
    '#scr-stats .sx-filter button{flex:0 0 auto;min-height:38px;padding:4px 13px 4px 5px;border-radius:99px;' +
      'background:var(--panel);border:1px solid var(--line);color:var(--dim);white-space:nowrap;' +
      'display:flex;align-items:center;gap:7px;' +
      'font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;' +
      'transition:transform .12s var(--ease),background .15s var(--ease),color .15s var(--ease),' +
      'border-color .15s var(--ease),box-shadow .15s var(--ease)}' +
    '#scr-stats .sx-filter button:active{transform:scale(.94)}' +
    '#scr-stats .sx-filter button[aria-pressed="true"]{color:#241800;border-color:#FFE9B0;' +
      'background:linear-gradient(180deg,#FFE39A,var(--gold));' +
      'box-shadow:0 3px 12px rgba(255,197,66,.32)}' +
    /* the little emblem inside each chip: a drawn base (icon on accent),
       the photograph faded in over it once it truly loads */
    '#scr-stats .sx-chlogo{position:relative;flex:0 0 auto;width:26px;height:26px;border-radius:50%;' +
      'overflow:hidden;display:grid;place-items:center;background:rgba(0,0,0,.28);' +
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.10)}' +
    '#scr-stats .sx-chico{position:absolute;inset:0;display:grid;place-items:center;color:var(--ax)}' +
    '#scr-stats .sx-chico .ico{width:17px;height:17px;font-size:17px}' +
    '#scr-stats .sx-chart{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
      'opacity:0;transition:opacity .25s var(--ease)}' +
    '#scr-stats .sx-chart.ok{opacity:1}' +
    '#scr-stats .sx-filter button[aria-pressed="true"] .sx-chlogo{' +
      'box-shadow:inset 0 0 0 1px rgba(0,0,0,.25),0 0 0 1px rgba(255,255,255,.35)}' +
    '#scr-stats .sx-chtx{white-space:nowrap}' +
    '.reduced #scr-stats .sx-chart{transition:none}' +

    /* ── the podium: top three, lifted onto risers, matching the winner screen ── */
    '#scr-stats .sx-podium{position:relative;flex:0 0 auto;display:flex;justify-content:center;' +
      'align-items:flex-end;gap:8px;margin:2px 0 11px;padding-top:22px}' +
    '#scr-stats .sx-pcol{position:relative;display:flex;flex-direction:column;align-items:center;' +
      'flex:0 1 33%;min-width:0;justify-content:flex-end}' +
    '#scr-stats .sx-pcol.p1{order:2;z-index:3}' +
    '#scr-stats .sx-pcol.p2{order:1;z-index:2}' +
    '#scr-stats .sx-pcol.p3{order:3;z-index:1}' +
    /* the framed avatar ring — gold/silver/bronze.
       NOT overflow:hidden on the pav itself: the rank medal and the YOU tag
       are pinned to its corners at negative offsets, so clipping them here is
       how they ended up shoved to the centre. The ROUND clip belongs to the
       avatar layer (.sx-face), which is the only child that must be a circle. */
    '#scr-stats .sx-pav{position:relative;border-radius:50%;display:grid;place-items:center;' +
      'flex:0 0 auto;background:var(--panel2);box-shadow:0 4px 14px rgba(0,0,0,.45)}' +
    /* the AVATAR layer fills the frame and is the thing that is a circle —
       the medal/you-tag are corner badges and MUST NOT be caught by this,
       or the blanket 100%/round rule blows the medal up into an opaque ball
       that hides the face and the photo (the podium-blank-ball bug). */
    /* overflow stays VISIBLE so the top-left weekly-champion marker (pinned
       at -4px inside .sx-face) is not clipped; the circle is cut on each
       inner layer (photo, drawn face, fallback) by border-radius instead. */
    '#scr-stats .sx-pav>.sx-face{position:absolute;inset:0;width:100%;height:100%;' +
      'border-radius:50%}' +
    /* .kx-ring-art excluded — see the .sx-coinav block for why. */
    '#scr-stats .sx-pav .sx-face .kx-av,' +
      '#scr-stats .sx-pav .sx-face img:not(.kx-ring-art),' +
      '#scr-stats .sx-pav .sx-face .sx-face-real,#scr-stats .sx-pav .sx-face .sx-face-real>*{' +
      'width:100%!important;height:100%!important;border-radius:50%!important}' +
    '#scr-stats .sx-pav .sx-fallback{border-radius:50%!important}' +
    '#scr-stats .sx-pcol.p1 .sx-pav{width:78px;height:78px;box-shadow:0 0 0 3px #FFD979,' +
      '0 0 22px rgba(255,197,66,.4),0 5px 16px rgba(0,0,0,.5)}' +
    '#scr-stats .sx-pcol.p2 .sx-pav{width:60px;height:60px;box-shadow:0 0 0 2.5px #D8DDE8,' +
      '0 4px 12px rgba(0,0,0,.45)}' +
    '#scr-stats .sx-pcol.p3 .sx-pav{width:60px;height:60px;box-shadow:0 0 0 2.5px #E0955A,' +
      '0 4px 12px rgba(0,0,0,.45)}' +
    /* the ranked medal badge on the avatar */
    '#scr-stats .sx-medal{position:absolute;right:-3px;bottom:-3px;width:24px;height:24px;' +
      'border-radius:50%;display:grid;place-items:center;font-family:var(--disp);font-weight:900;' +
      'font-size:12px;color:#241800;z-index:4;border:2px solid var(--bg);' +
      'font-variant-numeric:tabular-nums;background:linear-gradient(180deg,#FFDE8B,var(--gold))}' +
    '#scr-stats .sx-pcol.p2 .sx-medal{background:linear-gradient(180deg,#EFEFF6,#B9B9C8)}' +
    '#scr-stats .sx-pcol.p3 .sx-medal{background:linear-gradient(180deg,#E7A87A,#B87333)}' +
    /* the crown over first, drawn SVG */
    '#scr-stats .sx-crown{position:absolute;left:50%;top:-19px;width:40px;height:26px;' +
      'margin-left:-20px;z-index:5;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}' +
    /* the weekly-champion marker — a small gold roundel with the game's
       emblem (or a crown) on the top-left of the avatar */
    '#scr-stats .sx-chmk{position:absolute;left:-4px;top:-4px;z-index:5;width:22px;height:22px;' +
      'border-radius:50%;display:grid;place-items:center;border:2px solid var(--bg);' +
      'background:linear-gradient(180deg,#FFE9B0,var(--gold));' +
      'box-shadow:0 2px 6px rgba(0,0,0,.45)}' +
    '#scr-stats .sx-chmk .sx-crown{position:static;margin:0;width:16px;height:12px;left:auto;top:auto}' +
    '#scr-stats .sx-chmk-ico{display:grid;place-items:center}' +
    '#scr-stats .sx-chmk-ico .ico{width:13px;height:13px;font-size:13px}' +
    '#scr-stats .sx-lav .sx-chmk{width:17px;height:17px;left:-5px;top:-5px}' +
    '#scr-stats .sx-lav .sx-chmk .sx-crown{width:12px;height:9px}' +
    '#scr-stats .sx-lav .sx-chmk-ico .ico{width:10px;height:10px;font-size:10px}' +
    /* the two-layer face never lets the tile beneath bleed past the frame */
    '#scr-stats .sx-face,#scr-stats .sx-face-real{overflow:visible}' +
    '#scr-stats .sx-you-tag{position:absolute;left:-6px;bottom:-4px;z-index:6;font-family:var(--disp);' +
      'font-weight:900;font-size:8px;letter-spacing:.1em;color:#241800;background:var(--gold);' +
      'border-radius:99px;padding:1px 5px;border:2px solid var(--bg)}' +
    '#scr-stats .sx-pname{margin-top:7px;font-family:var(--disp);font-weight:800;font-size:11.5px;' +
      'max-width:100%;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'line-height:1.15;padding:0 2px}' +
    '#scr-stats .sx-pcol.p1 .sx-pname{font-size:13px;color:var(--gold)}' +
    '#scr-stats .sx-pscore{margin-top:1px;font-family:var(--disp);font-weight:900;font-size:11px;' +
      'color:var(--dim);font-variant-numeric:tabular-nums}' +
    '#scr-stats .sx-pcol.p1 .sx-pscore{color:#FFE39A}' +
    /* A SOLID STEP, NOT AN OUTLINED BOX. A 1px outline around a hollow
       middle reads as an empty input field on a phone — which is exactly
       what it looked like. A pedestal is a block: no border, a fill that
       is opaque at the top where the player stands and fades into the
       screen at the foot, so three of them read as a podium. */
    '#scr-stats .sx-riser{margin-top:7px;width:82%;border-radius:8px 8px 0 0;border:0;' +
      'background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.02))}' +
    '#scr-stats .sx-pcol.p1 .sx-riser{height:26px;' +
      'background:linear-gradient(180deg,rgba(255,197,66,.55),rgba(255,197,66,.06))}' +
    '#scr-stats .sx-pcol.p2 .sx-riser{height:17px}' +
    '#scr-stats .sx-pcol.p3 .sx-riser{height:11px}' +

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

    '#scr-stats .sx-lrow{display:grid;grid-template-columns:26px 38px minmax(0,1fr) auto;' +
      'align-items:center;column-gap:9px;padding:8px 11px 8px 9px;border-radius:14px;' +
      'background:var(--panel);border:1px solid var(--line);flex:0 0 auto}' +
    '#scr-stats .sx-lrow.me{border-color:var(--gold);' +
      'background:linear-gradient(100deg,rgba(255,197,66,.13),var(--panel) 70%);' +
      'box-shadow:0 0 0 1px rgba(255,197,66,.25),0 4px 14px rgba(255,197,66,.12)}' +
    '#scr-stats .sx-rank{font-family:var(--disp);font-weight:900;font-size:15px;text-align:center;' +
      'color:var(--dim2);font-variant-numeric:tabular-nums}' +
    '#scr-stats .sx-rank .ico{font-size:1.05em}' +
    '#scr-stats .sx-lrow.p1 .sx-rank{color:#FFD979}' +
    '#scr-stats .sx-lrow.p2 .sx-rank{color:#D8DDE8}' +
    '#scr-stats .sx-lrow.p3 .sx-rank{color:#E0955A}' +
    /* the framed avatar in a ranked row */
    '#scr-stats .sx-lav{position:relative;width:38px;height:38px;border-radius:11px;flex:0 0 auto;' +
      'overflow:hidden;background:var(--panel2);box-shadow:inset 0 0 0 1px var(--line)}' +
    /* .kx-ring-art excluded — see the .sx-coinav block for why. */
    '#scr-stats .sx-lav .kx-av,#scr-stats .sx-lav img:not(.kx-ring-art),' +
      '#scr-stats .sx-lav>span,#scr-stats .sx-lav .sx-face-real>*{' +
      'width:100%!important;height:100%!important;border-radius:11px!important}' +
    '#scr-stats .sx-lav .sx-fallback{border-radius:11px!important}' +
    '#scr-stats .sx-lrow.p1 .sx-lav{box-shadow:0 0 0 2px #FFD979}' +
    '#scr-stats .sx-lrow.p2 .sx-lav{box-shadow:0 0 0 2px #D8DDE8}' +
    '#scr-stats .sx-lrow.p3 .sx-lav{box-shadow:0 0 0 2px #E0955A}' +
    '#scr-stats .sx-who{min-width:0;display:flex;flex-direction:column;justify-content:center;gap:2px}' +
    '#scr-stats .sx-who .sx-whorow{display:flex;align-items:center;gap:6px;min-width:0}' +
    '#scr-stats .sx-who b{font-family:var(--disp);font-weight:900;font-size:12.5px;letter-spacing:.04em;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
    '#scr-stats .sx-who .sx-sig{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;' +
      'font-weight:700;color:var(--dim2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#scr-stats .sx-mine{flex:0 0 auto;font-size:8.5px;letter-spacing:.12em;font-weight:900;' +
      'text-transform:uppercase;color:#241800;background:var(--gold);border-radius:5px;padding:2px 5px}' +

    '#scr-stats .sx-gap{display:flex;align-items:center;gap:8px;color:var(--dim2);' +
      'padding:3px 6px;flex:0 0 auto}' +
    '#scr-stats .sx-gap::before,#scr-stats .sx-gap::after{content:"";flex:1;height:1px;' +
      'background:linear-gradient(90deg,transparent,var(--line2),transparent)}' +
    '#scr-stats .sx-gap span{font-size:14px;letter-spacing:.35em;line-height:1}' +
    '#scr-stats .sx-lbl{flex:0 0 auto;margin:9px 4px 1px;font-size:9.5px;letter-spacing:.14em;' +
      'text-transform:uppercase;font-weight:700;color:var(--dim2);display:flex;align-items:center;gap:7px}' +
    '#scr-stats .sx-lbl .sx-cnt{font-size:9px;font-weight:900;color:var(--gold);' +
      'background:rgba(255,197,66,.12);border:1px solid rgba(255,197,66,.28);border-radius:99px;' +
      'padding:1px 7px;font-variant-numeric:tabular-nums;letter-spacing:.06em}' +

    /* ── entrance: rows and podium columns slide up, compositor only.
       Applied only under .sx-anim, which is set only when motion is on. ── */
    '#scr-stats .sx-pcol,#scr-stats .sx-lrow{opacity:1;transform:none}' +
    '#scr-stats.sx-anim .sx-pcol{opacity:0;transform:translateY(20px)}' +
    '#scr-stats.sx-anim .sx-lrow{opacity:0;transform:translateY(12px)}' +
    '#scr-stats.sx-anim.sx-go .sx-pcol{opacity:1;transform:none;' +
      'transition:opacity .34s var(--ease),transform .42s var(--ease)}' +
    '#scr-stats.sx-anim.sx-go .sx-pcol.p1{transition-delay:.08s}' +
    '#scr-stats.sx-anim.sx-go .sx-pcol.p2{transition-delay:0s}' +
    '#scr-stats.sx-anim.sx-go .sx-pcol.p3{transition-delay:.14s}' +
    '#scr-stats.sx-anim.sx-go .sx-lrow{opacity:1;transform:none;' +
      'transition:opacity .3s var(--ease),transform .34s var(--ease)}' +
    '#scr-stats.sx-anim.sx-go .sx-lrow:nth-child(2){transition-delay:.04s}' +
    '#scr-stats.sx-anim.sx-go .sx-lrow:nth-child(3){transition-delay:.08s}' +
    '#scr-stats.sx-anim.sx-go .sx-lrow:nth-child(4){transition-delay:.12s}' +
    '#scr-stats.sx-anim.sx-go .sx-lrow:nth-child(5){transition-delay:.16s}' +
    '#scr-stats.sx-anim.sx-go .sx-lrow:nth-child(n+6){transition-delay:.2s}' +

    '#scr-stats .sx-empty{margin:auto;padding:26px 18px;text-align:center;color:var(--dim);' +
      'font-size:12.5px;line-height:1.65}' +
    '#scr-stats .sx-empty .ico{display:block;margin:0 auto 11px;width:34px;height:34px;font-size:34px;' +
      'color:var(--dim2)}' +
    '#scr-stats .sx-empty b{display:block;font-family:var(--disp);font-weight:900;font-size:13px;' +
      'letter-spacing:.07em;text-transform:uppercase;color:var(--txt);margin-bottom:7px}' +

    '#scr-stats .sx-foot{flex:0 0 auto;margin:8px 2px 0;font-size:10.5px;line-height:1.55;' +
      'color:var(--dim2);text-align:center}' +

    /* ── the "All games" chip: a chip in the strip, but it opens a sheet ── */
    '#scr-stats .sx-allchip{border-style:dashed}' +
    '#scr-stats .sx-allchip .sx-chico .ico{width:15px;height:15px;font-size:15px}' +

    /* ── the overlay sheets (all-games grid AND player card) ──
       Absolutely positioned inside #scr-stats, not fixed, so nothing here
       can ever parent .tabbar and no transform lands on an ancestor of it.
       A scrim dims the board; the sheet slides up from the bottom and its
       own body is the only thing that scrolls. */
    '#scr-stats .sx-scrim{position:absolute;inset:0;z-index:30;display:flex;' +
      'flex-direction:column;justify-content:flex-end;' +
      'background:rgba(6,4,16,.62);opacity:0;transition:opacity .18s var(--ease)}' +
    '#scr-stats .sx-scrim.in{opacity:1}' +
    '#scr-stats .sx-sheet{background:var(--bg,#120C24);border:1px solid var(--line2);' +
      'border-bottom:0;border-radius:20px 20px 0 0;max-height:88%;display:flex;' +
      'flex-direction:column;box-shadow:0 -12px 40px rgba(0,0,0,.5);' +
      'transform:translateY(14px);transition:transform .2s var(--ease)}' +
    '#scr-stats .sx-scrim.in .sx-sheet{transform:none}' +
    '.reduced #scr-stats .sx-scrim,.reduced #scr-stats .sx-sheet{transition:none}' +
    '#scr-stats .sx-shead{flex:0 0 auto;display:flex;align-items:center;gap:10px;' +
      'padding:13px 14px 10px;border-bottom:1px solid var(--line)}' +
    '#scr-stats .sx-shead::before{content:"";position:absolute;left:50%;top:6px;width:38px;' +
      'height:4px;margin-left:-19px;border-radius:99px;background:var(--line2)}' +
    '#scr-stats .sx-shead{position:relative}' +
    '#scr-stats .sx-shead h3{flex:1;font-family:var(--disp);font-weight:900;font-size:14px;' +
      'letter-spacing:.05em;text-transform:uppercase}' +
    '#scr-stats .sx-shx{flex:0 0 auto;width:34px;height:34px;border-radius:10px;display:grid;' +
      'place-items:center;background:var(--panel);border:1px solid var(--line);color:var(--dim)}' +
    '#scr-stats .sx-shx svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;' +
      'stroke-linecap:round}' +
    '#scr-stats .sx-sbody{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;' +
      '-webkit-overflow-scrolling:touch;padding:12px 14px 18px;scrollbar-width:thin}' +
    '#scr-stats .sx-sbody::-webkit-scrollbar{width:5px}' +
    '#scr-stats .sx-sbody::-webkit-scrollbar-thumb{background:var(--line2);border-radius:6px}' +
    '#scr-stats .sx-gfoot{margin:12px 2px 0;font-size:10.5px;line-height:1.5;color:var(--dim2);' +
      'text-align:center}' +

    /* ── the grouped grid of game cards ── */
    '#scr-stats .sx-ggroup{margin-bottom:14px}' +
    '#scr-stats .sx-ghead{display:flex;align-items:center;gap:8px;margin:2px 2px 9px;' +
      'font-family:var(--disp);font-weight:900;font-size:10.5px;letter-spacing:.13em;' +
      'text-transform:uppercase;color:var(--dim)}' +
    '#scr-stats .sx-ghico{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;' +
      'flex:0 0 auto;color:var(--ax);background:color-mix(in srgb,var(--ax) 18%,transparent)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '#scr-stats .sx-ghico{background:rgba(255,255,255,.06)}}' +
    '#scr-stats .sx-ghico .ico{width:14px;height:14px;font-size:14px}' +
    '#scr-stats .sx-ghead span:not(.sx-ghico){min-width:0;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap}' +
    '#scr-stats .sx-ghead i{margin-left:auto;flex:0 0 auto;font-style:normal;font-size:9.5px;' +
      'font-weight:800;color:var(--dim2);background:rgba(255,255,255,.05);border-radius:99px;' +
      'padding:2px 8px;font-variant-numeric:tabular-nums}' +
    '#scr-stats .sx-ggrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}' +
    '#scr-stats .sx-gcard{display:flex;flex-direction:column;align-items:center;gap:8px;padding:11px 6px;' +
      'border-radius:14px;background:var(--panel);border:1px solid var(--line);' +
      'transition:transform .12s var(--ease),border-color .15s var(--ease),background .15s var(--ease)}' +
    '#scr-stats .sx-gcard:active{transform:scale(.95)}' +
    '#scr-stats .sx-gcard.on{border-color:var(--gold);' +
      'background:linear-gradient(180deg,rgba(255,197,66,.12),var(--panel) 70%);' +
      'box-shadow:0 0 0 1px rgba(255,197,66,.28)}' +
    '#scr-stats .sx-gclogo{position:relative;width:46px;height:46px;border-radius:13px;overflow:hidden;' +
      'display:grid;place-items:center;flex:0 0 auto;' +
      'background:linear-gradient(160deg,color-mix(in srgb,var(--ax) 30%,#150F26),#150F26 74%);' +
      'border:1px solid color-mix(in srgb,var(--ax) 34%,transparent)}' +
    '@supports not (background:color-mix(in srgb,red 50%,blue)){' +
      '#scr-stats .sx-gclogo{background:var(--panel2);border-color:var(--line2)}}' +
    '#scr-stats .sx-gcico{position:absolute;inset:0;display:grid;place-items:center;color:var(--ax)}' +
    '#scr-stats .sx-gcico .ico{width:24px;height:24px;font-size:24px}' +
    '#scr-stats .sx-gcname{font-family:var(--disp);font-weight:800;font-size:10.5px;line-height:1.25;' +
      'text-align:center;letter-spacing:.02em;color:var(--txt);max-width:100%;' +
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +

    /* ── the player card ── */
    '#scr-stats .sx-phead{display:flex;align-items:center;gap:12px;margin:2px 0 12px}' +
    '#scr-stats .sx-pcav{position:relative;flex:0 0 auto;width:76px;height:76px;border-radius:50%;' +
      'overflow:hidden;background:var(--panel2);box-shadow:inset 0 0 0 1px var(--line),' +
      '0 4px 14px rgba(0,0,0,.4)}' +
    '#scr-stats .sx-pcav.p1{box-shadow:0 0 0 3px #FFD979,0 4px 16px rgba(0,0,0,.45)}' +
    '#scr-stats .sx-pcav.p2{box-shadow:0 0 0 3px #D8DDE8,0 4px 16px rgba(0,0,0,.45)}' +
    '#scr-stats .sx-pcav.p3{box-shadow:0 0 0 3px #E0955A,0 4px 16px rgba(0,0,0,.45)}' +
    /* .kx-ring-art excluded — see the .sx-coinav block for why. */
    '#scr-stats .sx-pcav .kx-av,#scr-stats .sx-pcav img:not(.kx-ring-art),' +
      '#scr-stats .sx-pcav>span,' +
      '#scr-stats .sx-pcav .sx-face-real>*{width:100%!important;height:100%!important;' +
      'border-radius:50%!important}' +
    '#scr-stats .sx-pcav .sx-fallback{border-radius:50%!important}' +
    '#scr-stats .sx-pident{flex:1 1 auto;min-width:0}' +
    '#scr-stats .sx-pident h4{display:flex;align-items:center;gap:7px;font-family:var(--disp);' +
      'font-weight:900;font-size:17px;letter-spacing:.02em;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap}' +
    '#scr-stats .sx-pident h4 .sx-mine{flex:0 0 auto}' +
    '#scr-stats .sx-pmeta{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}' +
    '#scr-stats .sx-pbadge{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;' +
      'border-radius:99px;background:rgba(255,255,255,.05);border:1px solid var(--line);' +
      'font-size:10px;letter-spacing:.05em;font-weight:800;color:var(--dim);' +
      'font-variant-numeric:tabular-nums}' +
    '#scr-stats .sx-pbadge .ico{font-size:1.1em;color:var(--dim2)}' +
    '#scr-stats .sx-pbadge.gold{color:#241800;background:linear-gradient(180deg,#FFE39A,var(--gold));' +
      'border-color:#FFE9B0}' +
    '#scr-stats .sx-pbadge.gold .ico{color:#7a4d00}' +
    '#scr-stats .sx-phead .sx-ring{flex:0 0 auto;margin-left:2px}' +
    '#scr-stats .sx-pglbl,#scr-stats .sx-pgheadlbl{margin:14px 2px 8px;font-size:9.5px;' +
      'letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--dim2)}' +
    '#scr-stats .sx-pglist{display:flex;flex-direction:column;gap:7px}' +
    '#scr-stats .sx-pgrow{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;' +
      'column-gap:10px;padding:8px 10px 8px 8px;border-radius:12px;background:var(--panel);' +
      'border:1px solid var(--line)}' +
    '#scr-stats .sx-pgtile{width:40px!important;height:40px!important;border-radius:11px!important}' +
    '#scr-stats .sx-pgnm{min-width:0}' +
    '#scr-stats .sx-pgnm b{display:block;font-family:var(--disp);font-weight:900;font-size:11.5px;' +
      'letter-spacing:.04em;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;' +
      'white-space:nowrap}' +
    '#scr-stats .sx-pgnm i{display:block;font-style:normal;margin-top:2px;font-size:10px;color:var(--dim2);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    /* tappable board rows: a subtle press + cursor so it reads as openable */
    '#scr-stats .sx-lrow[data-pi],#scr-stats .sx-pcol[data-pi]{cursor:pointer}' +
    '#scr-stats .sx-lrow[data-pi]:active{transform:scale(.99)}' +
    '#scr-stats .sx-lrow[data-pi]{transition:transform .1s var(--ease)}' +

    /* two columns of game cards on a narrow (360) phone keeps names legible */
    '@media (max-width:365px){' +
      '#scr-stats .sx-ggrid{grid-template-columns:repeat(2,minmax(0,1fr))}}' +

    /* short phones (his is 894 tall, but an installed icon can be shorter
       still) — give the list its room back by shrinking the head */
    '@media (max-height:760px){' +
      '#scr-stats .sx-coin{width:52px;height:52px}' +
      '#scr-stats .sx-coinch{font-size:19px}' +
      '#scr-stats .sx-cell b{font-size:20px}' +
      '#scr-stats .sx-head{padding:10px}}' +

    /* short phones: shrink the podium too so the list keeps its room */
    '@media (max-height:760px){' +
      '#scr-stats .sx-podium{padding-top:18px;margin-bottom:8px}' +
      '#scr-stats .sx-pcol.p1 .sx-pav{width:64px;height:64px}' +
      '#scr-stats .sx-pcol.p2 .sx-pav,#scr-stats .sx-pcol.p3 .sx-pav{width:52px;height:52px}}' +

    /* reduced motion: everything sits at its final state, nothing transitions */
    '.reduced #scr-stats .sx-art,.reduced #scr-stats .sx-coinface{transition:none}' +
    '.reduced #scr-stats .sx-state.wait .sx-dot{animation:none}' +
    '.reduced #scr-stats .sx-pcol,.reduced #scr-stats .sx-lrow{opacity:1!important;' +
      'transform:none!important;transition:none!important}' +
    '@media (prefers-reduced-motion:reduce){' +
      '#scr-stats .sx-pcol,#scr-stats .sx-lrow{opacity:1!important;transform:none!important;' +
      'transition:none!important}' +
      '#scr-stats .sx-state.wait .sx-dot{animation:none}}';
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

/* ── ONE SCREEN, THREE TABS ──────────────────────────────────────────
   The record book and the leaderboard used to be two destinations with two
   buttons in the profile sheet, and the second of those buttons asked for an
   icon that does not exist. They are now ONE screen — "Record Book" — with a
   three-tab segmented control across the top:

       [ MY RECORD ]   [ RECENT ]   [ BOARD ]

     me      — the trophy cabinet: totals, the win-rate ring, every game
               with its emblem and its W/L/D.
     recent  — the last matches from DATA.h, newest first.
     board   — the leaderboard, which keeps its own sub-tabs (Overall / All
               games) below this one.

   PANE is the outer tab, TAB the board's inner one. They use the SAME CSS
   machinery (.sx-seg / .sx-seg3 / .sx-panes / .sx-panel) and differ only in
   the data attribute they key off — `data-vpanel` / `.sx-vtab` outside,
   `data-panel` / `.sx-tab` inside — so nesting one inside the other cannot
   make either one hide the other's panels. Switching either level is a class
   flip on panels already in the DOM: no re-render, no scroll jump, every
   avatar and logo stays mounted. */
var PANE = 'me';           /* me | recent | board */
/* THE BOARD'S OWN SUB-TABS.
     overall  — the combined ranking across everything (podium + numbered
                ladder + the all-time/weekly toggle). The default.
     games    — the per-game browse: the grid of every game, tap one to see
                that game's board.
   There used to be a third, `recent`, showing exactly the feed the outer
   RECENT tab now shows. Two routes to one list is the untidiness this pass
   was asked to fix, and both panels wanted the same #sx-recent element, so the
   feed was promoted OUT of the board rather than duplicated inside it. */
var TAB = 'overall';

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

function standDown(){ live = false; closeGrid(); closeCard(); if (scr) scr.classList.remove('on'); }

function close(){
  standDown();
  try {
    if (window.KARTI_PARTY && KARTI_PARTY.open && cameFrom === 'party') return KARTI_PARTY.open();
  } catch (e){}
  try { if (window.KARTI && KARTI.go) KARTI.go('home'); } catch (e){}
}

var cameFrom = 'home';

/* THE TWO ENTRY POINTS, KEPT. Other code calls both by name and the profile
   sheet still opens them by data attribute; they are now the same screen on a
   different tab, which is the whole point of the merge. */
function openProfile(from){
  cameFrom = from || cameFrom;
  PANE = 'me';
  bind(activeKey());
  show(); render();
}
function openLeaderboard(from){
  cameFrom = from || cameFrom;
  PANE = 'board';
  bind(activeKey());
  show(); render();
  loadBoard();
}

/* THE OUTER TABS, declared once so the segmented control and the switch logic
   agree. Each is a title + an icon that exists: `person` and `podium` are
   appended to the sprite by injectIcons() above, `bolt` ships in index.html. */
var PANES = [
  { id:'me',     en:'My record', mt:'Ir-rekord', icon:'person' },
  { id:'recent', en:'Recent',    mt:'Reċenti',   icon:'bolt'   },
  { id:'board',  en:'Board',     mt:'Klassifika',icon:'podium' }
];

/* THE BOARD'S SUB-TABS, same shape. `grid` is injected by injectIcons(). */
var TABS = [
  { id:'overall', en:'Overall',  mt:'Total',   icon:'podium' },
  { id:'games',   en:'All games',mt:'Logħob',  icon:'grid'   }
];

/* Switch board tab WITHOUT a re-render — a class flip on panels that are
   already in the DOM. Instant, keeps every avatar/logo mounted, no scroll
   jump. The overall tab is the only one that talks to the Pi, so its board
   is (re)loaded lazily the first time it is shown and whenever a filter or
   period changes; the other two are static local content. */
/* Switch the OUTER tab. Same class flip, keyed on data-vpanel so it can never
   touch the board's own panels (data-panel) nested inside it. */
function setPane(id, el){
  if (!PANES.some(function(p){ return p.id === id; })) return;
  PANE = id;
  el = el || scr;
  if (!el) return;
  $$('.sx-vtab', el).forEach(function(b){
    b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === PANE));
  });
  $$('.sx-panel[data-vpanel]', el).forEach(function(p){
    var on = p.getAttribute('data-vpanel') === PANE;
    p.classList.toggle('on', on);
    p.hidden = !on;
  });
  /* the two panes that have work to do when they come up */
  if (PANE === 'recent') paintRecent(el);
  else if (PANE === 'board') setTab(TAB, el);
}

function setTab(id, el){
  if (!TABS.some(function(t){ return t.id === id; })) return;
  TAB = id;
  el = el || scr;
  if (!el) return;
  $$('.sx-tab', el).forEach(function(b){
    b.setAttribute('aria-pressed', String(b.getAttribute('data-t') === TAB));
  });
  /* [data-panel] only — the outer panes are .sx-panel too, and without the
     attribute filter this loop would hide the very pane it is running inside */
  $$('.sx-panel[data-panel]', el).forEach(function(p){
    var on = p.getAttribute('data-panel') === TAB;
    p.classList.toggle('on', on);
    p.hidden = !on;
  });
  if (TAB === 'overall'){
    /* Overall is the combined ranking: force FILTER back to 'all' and paint
       into #sx-board (not a lingering per-game board host). Reload only if
       the last board painted was not already the all-games one. */
    boardHost = null;
    if (FILTER !== 'all'){ FILTER = 'all'; boardNeedsLoad = true; }
    if (boardNeedsLoad || BOARD.game !== 'all'){ boardNeedsLoad = false; loadBoard(); }
    else paintBoard();
  } else if (TAB === 'games'){
    /* if a single game's board is open, keep painting into it */
    if (GTAB === 'board' && FILTER !== 'all'){
      boardHost = $('#sx-gboard', el) || null;
      if (BOARD.game !== FILTER) loadBoard(); else paintBoard();
    } else {
      boardHost = null;
    }
  }
}
var boardNeedsLoad = true;

/* ── the one frame all three tabs live in ── */
function render(){
  if (!live || !scr) return;
  /* a full re-render replaces the screen's innerHTML, which would orphan an
     open overlay's DOM while leaving its nav layer registered — close them
     cleanly first so back/outside-tap can never point at a dead node */
  closeGrid(); closeCard();
  bind(activeKey());
  var el = screenEl();

  /* the OUTER control: my record / recent / board */
  var vseg = '<div class="sx-seg sx-seg3" role="tablist" aria-label="' +
    esc(T('Record book sections', 'Sezzjonijiet tal-ktieb tar-rekords')) + '">' +
    PANES.map(function(p){
      return '<button type="button" class="sx-vtab" data-v="' + p.id + '" ' +
        'aria-pressed="' + (PANE === p.id) + '">' +
        ico(p.icon) + '<span>' + esc(T(p.en, p.mt)) + '</span></button>';
    }).join('') + '</div>';

  /* the BOARD's own control, one level in: overall / all games */
  var seg = '<div class="sx-seg sx-segsub" role="tablist" aria-label="' +
    esc(T('Leaderboard sections', 'Sezzjonijiet tal-klassifika')) + '">' +
    TABS.map(function(t){
      return '<button type="button" class="sx-tab" data-t="' + t.id + '" ' +
        'aria-pressed="' + (TAB === t.id) + '">' +
        ico(t.icon) + '<span>' + esc(T(t.en, t.mt)) + '</span></button>';
    }).join('') + '</div>';

  function pane(id, inner){
    return '<div class="sx-panel' + (PANE === id ? ' on' : '') + '" data-vpanel="' + id + '"' +
      (PANE === id ? '' : ' hidden') + '>' + inner + '</div>';
  }

  el.innerHTML =
    '<div class="tbar">' +
      '<button class="iconbtn" id="sx-back" aria-label="' + esc(T('Back', 'Lura')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' +
      '<h2>' + T('Record Book', 'Ktieb tar-Rekords') + '</h2>' +
    '</div>' +
    vseg +
    '<div class="sx-panes">' +
      pane('me', profileHTML()) +
      pane('recent', recentHTML()) +
      pane('board',
        seg +
        '<div class="sx-panes">' +
          '<div class="sx-panel' + (TAB === 'overall' ? ' on' : '') + '" data-panel="overall"' +
            (TAB === 'overall' ? '' : ' hidden') + '>' + overallHTML() + '</div>' +
          '<div class="sx-panel' + (TAB === 'games' ? ' on' : '') + '" data-panel="games"' +
            (TAB === 'games' ? '' : ' hidden') + '>' + gamesHTML() + '</div>' +
        '</div>') +
    '</div>';

  wireArt(el);
  try { if (window.KARTI_XP && KARTI_XP.repaintAvatars) KARTI_XP.repaintAvatars(el); } catch (e){}
  $('#sx-back', el).onclick = close;
  $$('.sx-vtab', el).forEach(function(b){
    b.onclick = function(){ var id = b.getAttribute('data-v'); if (id !== PANE) setPane(id, el); };
  });
  $$('.sx-tab', el).forEach(function(b){
    b.onclick = function(){ var id = b.getAttribute('data-t'); if (id !== TAB) setTab(id, el); };
  });
  wireBoard(el);      /* the period toggles + the first paint of #sx-board */
  wireGames(el);      /* the grid + per-game board sub-view */
  if (PANE === 'recent') paintRecent(el);
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
    ? T('Signed in as ', 'Illoggjat bħala ') + s.name
    : (WHO === GUEST ? T('Playing as a guest on this phone', 'Qed tilgħab bħala mistieden fuq dan it-telefon')
                     : T('On this phone only', 'Fuq dan it-telefon biss'));

  var bw = t.played ? (t.won / t.played) * 100 : 0;
  var bd = t.played ? (t.drawn / t.played) * 100 : 0;
  var bl = t.played ? (t.lost / t.played) * 100 : 0;
  var rate = pct(t.won, t.played);

  var list = shelf().map(function(def){ return gameRow(def, DATA.g[def.id]); }).join('');

  /* the win-rate ring — a conic gradient swept to the win %, drawn in CSS.
     It is the one number the whole cabinet is about, so it is the hero. */
  var ring = '<span class="sx-ring" style="--v:' + rate + '" role="img" aria-label="' +
    T('Win rate ', 'Rata ta\' rebħ ') + rate + '%">' +
      '<span class="sx-ring-in"><b>' + rate + '<em>%</em></b>' +
        '<i>' + T('won', 'rebħa') + '</i></span></span>';

  return '<div class="sx-head">' +
           coin(initial) +
           '<span class="sx-idn"><h3>' + esc(name) + '</h3>' +
             '<span class="sx-sub">' + ico(s && s.name ? 'cloud' : 'person') +
               '<span>' + esc(where) + '</span></span>' +
             '<span class="sx-badges">' +
               '<span class="sx-badge">' + ico('bolt') +
                 '<b>' + t.bestStreak + '</b> ' + T('run', 'sensiela') + '</span>' +
               '<span class="sx-badge">' + ico('cards') +
                 '<b>' + t.games + '</b> ' + T('games', 'logħob') + '</span>' +
             '</span>' +
           '</span>' +
           ring +
         '</div>' +
         '<div class="sx-score">' +
           '<div class="sx-cell w"><b>' + t.won + '</b><i>' + T('Won', 'Rebħa') + '</i></div>' +
           '<div class="sx-cell l"><b>' + t.lost + '</b><i>' + T('Lost', 'Telfa') + '</i></div>' +
           '<div class="sx-cell d"><b>' + t.drawn + '</b><i>' + T('Drawn', 'Draw') + '</i></div>' +
         '</div>' +
         '<div class="sx-bar" role="img" aria-label="' + t.won + T(' won, ', ' rebħa, ') + t.lost +
           T(' lost, ', ' telfa, ') + t.drawn + T(' drawn', ' draw') + '">' +
           '<i class="bw" style="width:' + bw.toFixed(2) + '%"></i>' +
           '<i class="bd" style="width:' + bd.toFixed(2) + '%"></i>' +
           '<i class="bl" style="width:' + bl.toFixed(2) + '%"></i>' +
         '</div>' +
         '<div class="sx-rate"><span>' + t.played + T(' played', ' logħbiet') + '</span>' +
           '<span>' + T('Win rate ', 'Rata ') + '<b>' + rate + '%</b></span>' +
           '<span>' + T('Best run ', 'L-aħjar ') + '<b>' + t.bestStreak + '</b></span></div>' +
         '<div class="sx-lbl">' + T('Trophy cabinet', 'Il-kabinett tat-trofej') + '</div>' +
         '<div class="sx-list">' + list + '</div>' +
         '<p class="sx-foot">' +
           T('Kept on this phone, for this player. Nothing here is guessed.',
             'Miżmum fuq dan it-telefon, għal dan il-plejer. Xejn hawn m\'hu maħsub.') + '</p>';
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
var BOARD = { state:'idle', rows:null, you:null, at:0, why:'', game:'', period:'all' };
var FILTER = 'all';
var PERIOD = 'all';        /* all = all-time | week = this week (resets Sun 00:00) */
/* where paintBoard writes. null = the OVERALL tab's #sx-board; when a single
   game's board is open in the ALL GAMES tab it points at #sx-gboard instead. */
var boardHost = null;

/* The start of the current KARTI week: the most recent Sunday at local
   00:00. The weekly board — and the Sunday champion awards it drives —
   reset here. Sent to the server so it ranks the same window this client
   labels, and used to filter a `weekly` slice locally if the server sends
   one keyed by day. */
function weekStart(){
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());   /* getDay(): 0 = Sunday */
  return d.getTime();
}

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
    if (window.KARTI_XP){
      body.av = KARTI_XP.avatar();          /* the drawn face, always  */
      body.lv = KARTI_XP.level();
      body.bd = KARTI_XP.border();          /* the ring, if one is on  */
      /* 0 = nothing to fetch. WORN, not merely uploaded: a player who
         has a photo on the Pi but has switched back to the drawn face
         must look like the drawn face to everybody, not just to
         themselves — one truth, the same truth, on every phone. */
      body.pv = KARTI_XP.usingPhoto() ? KARTI_XP.photoVer() : 0;
    }
  } catch (e){}
  return post('push', body, NET_MS).then(function(r){
    pushing = false;
    return r;
  }, function(){ pushing = false; return { ok:false }; });
}

/* Pull the ranking the server sends for the period we asked for.
   TOLERANT OF THREE SHAPES, so this lights up whichever way the relay
   ends up wiring the weekly board:
     1. the server honoured `period` and just returned the right `rows`
        / `you` for it (the clean end state) — used as-is;
     2. the server returned an all-time board but ALSO a `weekly` object,
        e.g. { rows:[…], you:{…} } (or a bare array of rows) keyed for
        this week — for period 'week' we prefer that;
     3. the server knows nothing of weeks — we fall back to the all-time
        `rows`, and the toggle still switches labels/awards copy so the
        feature is visibly present the day the server catches up.
   Returns { rows, you } or null. */
function sliceFor(d, period){
  if (!d) return null;
  if (period === 'week'){
    var wk = d.weekly || d.week || null;
    if (Array.isArray(wk)) return { rows:wk, you:d.weeklyYou || d.you || null };
    if (wk && Array.isArray(wk.rows)) return { rows:wk.rows, you:wk.you || d.you || null };
    /* server didn't split it out — fall through to whatever `rows` is */
  }
  if (Array.isArray(d.rows)) return { rows:d.rows, you:d.you || null };
  return null;
}

/* ── pulling the board down ── */
function loadBoard(){
  var s = session();
  BOARD.state = 'loading'; BOARD.why = ''; BOARD.game = FILTER; BOARD.period = PERIOD;
  paintBoard();
  /* period + since: the server ranks the same window this client labels.
     A server that ignores them returns the all-time board, which sliceFor
     still makes sense of, so an old relay is not a broken screen. */
  var body = { game: FILTER, period: PERIOD };
  if (PERIOD === 'week') body.since = weekStart();
  if (s) body.tok = s.tok;
  /* push first when we can, so the board you are about to read already
     includes the game you just finished. A failed push must not stop the
     read — the board is still worth showing. */
  var first = s ? pushNow(true).catch(function(){ return null; }) : Promise.resolve(null);
  var askedPeriod = PERIOD;
  first.then(function(){
    return post('board', body, NET_MS);
  }).then(function(r){
    if (BOARD.game !== FILTER || BOARD.period !== askedPeriod) return;   /* the player moved on */
    var sl = r.ok ? sliceFor(r.d, askedPeriod) : null;
    if (sl){
      BOARD.state = 'live';
      BOARD.rows = sl.rows;
      BOARD.you = sl.you;
      BOARD.at = Date.now();
    } else {
      BOARD.state = 'down';
      BOARD.why = r.offline || !r.status
        ? T('Cannot reach the board from here.', 'Ma nistax nilħaq il-klassifika minn hawn.')
        : (r.why || T('The board is not answering.', 'Il-klassifika mhux twieġeb.'));
    }
    paintBoard();
  }).catch(function(){
    BOARD.state = 'down';
    BOARD.why = T('Cannot reach the board from here.', 'Ma nistax nilħaq il-klassifika minn hawn.');
    paintBoard();
  });
}

/* The ALL-TIME | WEEKLY period toggle, used by both the OVERALL tab and the
   per-game board in the ALL GAMES tab. */
function periodHTML(){
  return '<div class="sx-period" role="group" aria-label="' +
       T('Ranking period', 'Perjodu tal-klassifika') + '">' +
      '<button type="button" data-p="all" aria-pressed="' + (PERIOD === 'all') + '">' +
        ico('podium') + T('All-time', 'Kull żmien') + '</button>' +
      '<button type="button" data-p="week" aria-pressed="' + (PERIOD === 'week') + '">' +
        ico('bolt') + T('This week', 'Din il-ġimgħa') + '</button>' +
    '</div>';
}

/* ── TAB 1: OVERALL — the combined ranking across every game ──
   The all-time/weekly toggle, then the podium + numbered ladder for
   FILTER='all'. No per-game filter chips here: browsing a single game's
   board is the ALL GAMES tab's job, and "Overall" is by definition the
   sum of everything. */
function overallHTML(){
  return periodHTML() + '<div id="sx-board" class="sx-list"></div>';
}

/* ── TAB 2: ALL GAMES — the per-game browse ──
   The organised grid of every game (the same catalog shelves the sheet used
   to show), inline. Tapping a card slides to that game's own board, with a
   back arrow to the grid and the same all-time/weekly toggle. The grid and
   the per-game board live in one scroller and swap with a class flip, so no
   re-render and no scroll jump. `GTAB` says which of the two is showing. */
var GTAB = 'grid';         /* grid | board (a single game's board) */

function gridGroupsHTML(){
  return CATALOG.map(function(cat){
    var cards = cat.games.map(gameCard).join('');
    return '<div class="sx-ggroup">' +
             '<div class="sx-ghead" style="--ax:' + esc(CAT_ACCENT[cat.key] || 'var(--gold)') + '">' +
               '<span class="sx-ghico">' + ico(cat.icon) + '</span>' +
               '<span>' + esc(T(cat.en, cat.mt)) + '</span>' +
               '<i>' + cat.games.length + '</i>' +
             '</div>' +
             '<div class="sx-ggrid">' + cards + '</div>' +
           '</div>';
  }).join('');
}

function gamesHTML(){
  var def = FILTER !== 'all' ? richDef(FILTER) : null;
  var gridShown = GTAB === 'grid' || !def;
  return '<div class="sx-gwrap">' +
           /* the grid of every game */
           '<div class="sx-gview' + (gridShown ? ' on' : '') + '" id="sx-gview-grid"' +
             (gridShown ? '' : ' hidden') + '>' +
             gridGroupsHTML() +
             '<p class="sx-gfoot">' + T('Tap a game for its own leaderboard. Overall ranks every game together.',
               'Agħfas logħba għall-klassifika tagħha. It-total jgħodd il-logħob kollu flimkien.') + '</p>' +
           '</div>' +
           /* one game's board */
           '<div class="sx-gview sx-gboard' + (!gridShown ? ' on' : '') + '" id="sx-gview-board"' +
             (!gridShown ? '' : ' hidden') + '>' +
             '<div class="sx-gbhead">' +
               '<button type="button" class="sx-gback" id="sx-gback" aria-label="' +
                 esc(T('All games', 'Il-logħob kollu')) + '">' +
                 '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>' +
                 '<span>' + T('All games', 'Il-logħob kollu') + '</span>' +
               '</button>' +
               '<span class="sx-gbtitle">' + (def ? esc(def.name) : '') + '</span>' +
             '</div>' +
             periodHTML() +
             '<div id="sx-gboard" class="sx-list"></div>' +
           '</div>' +
         '</div>';
}

/* Show a single game's board inside the ALL GAMES tab. Sets the filter and
   flips to the board sub-view without a full re-render, then loads. */
function openGameBoard(id, el){
  el = el || scr;
  if (!el) return;
  FILTER = id;
  GTAB = 'board';
  /* the board id in the games tab is #sx-gboard; loadBoard paints #sx-board
     (overall). Point the painter at the right host by giving the games board
     the same id while it is the active one is fragile — instead loadBoard
     always paints #sx-board, so mirror: give the visible board host the id. */
  var def = richDef(id);
  var grid = $('#sx-gview-grid', el), bd = $('#sx-gview-board', el);
  if (grid){ grid.classList.remove('on'); grid.hidden = true; }
  if (bd){ bd.classList.add('on'); bd.hidden = false; }
  var title = $('.sx-gbtitle', el); if (title) title.textContent = def.name;
  /* reflect the period toggle in this sub-view */
  $$('#sx-gview-board .sx-period button', el).forEach(function(o){
    o.setAttribute('aria-pressed', String(o.getAttribute('data-p') === PERIOD));
  });
  boardHost = $('#sx-gboard', el) || null;
  loadBoard();
}
function backToGrid(el){
  el = el || scr;
  if (!el) return;
  GTAB = 'grid';
  var grid = $('#sx-gview-grid', el), bd = $('#sx-gview-board', el);
  if (bd){ bd.classList.remove('on'); bd.hidden = true; }
  if (grid){ grid.classList.add('on'); grid.hidden = false; }
  boardHost = null;
}

/* wire the ALL GAMES tab: grid cards + the back arrow. The per-game board's
   own period toggle is wired by wireBoard (it matches .sx-period button). */
function wireGames(el){
  $$('#sx-gview-grid .sx-gcard', el).forEach(function(b){
    b.onclick = function(){ openGameBoard(b.getAttribute('data-g'), el); };
  });
  var gb = $('#sx-gback', el);
  if (gb) gb.onclick = function(){ backToGrid(el); };
}

/* ── THE RECENT TAB — a feed of the player's own recent results ──
   The middle tab of the outer three. Built from DATA.h[], the per-match log
   record() keeps. Newest first: each row is the game (logo + name), the
   result (win/loss/draw), and when.
   THERE IS NO OPPONENT COLUMN AND THERE MUST NOT BE ONE. record()'s payload
   carries {result, id, moves, score, ms} and nothing else — no seat list, no
   names — so who you played is not a fact this file has. An empty column
   would promise it is coming; inventing one would be a lie. The foot line
   under the list says so plainly instead. */
function recentHTML(){
  return '<div id="sx-recent" class="sx-list"></div>';
}

var RES_TXT = {
  w: { en:'Win',  mt:'Rebħa', cls:'w' },
  l: { en:'Loss', mt:'Telfa', cls:'l' },
  d: { en:'Draw', mt:'Draw',  cls:'d' }
};

function recentRow(h){
  var def = richDef(h.g);
  var r = RES_TXT[h.r] || RES_TXT.d;
  /* the one true extra detail this match carried, if any */
  var extra = '';
  if (h.r === 'w' && h.m) extra = T('in ' + h.m + ' moves', 'f\'' + h.m + ' mossi');
  else if (h.sc) extra = T('score ', 'punteġġ ') + h.sc.toLocaleString('en-GB');
  else if (h.r === 'w' && h.ms) extra = Math.round(h.ms / 1000) + T('s', 's');
  var meta = when(h.t) + (extra ? ' · ' + extra : '');
  return '<div class="sx-rrow">' +
           tile(def, 'sx-pgtile') +
           '<span class="sx-rnm"><b>' + esc(def.name) + '</b>' +
             '<i>' + esc(meta) + '</i></span>' +
           '<span class="sx-rres ' + r.cls + '">' + T(r.en, r.mt) + '</span>' +
         '</div>';
}

function paintRecent(el){
  el = el || scr;
  var host = el && $('#sx-recent', el);
  if (!host) return;
  bind(activeKey());
  var h = Array.isArray(DATA.h) ? DATA.h : [];
  if (!h.length){
    host.innerHTML = '<div class="sx-empty">' + ico('bolt') +
      '<b>' + T('No games yet', 'L-ebda logħba s\'issa') + '</b>' +
      T('Play a game and finish it, and your last results appear here — ' +
        'newest first — kept on this phone.',
        'Ilgħab logħba u temmha, u l-aħħar riżultati tiegħek jidhru hawn — ' +
        'l-aktar reċenti l-ewwel — miżmuma fuq dan it-telefon.') + '</div>';
    return;
  }
  /* newest first: h[] is appended in play order, so read it back-to-front */
  var out = [];
  for (var i = h.length - 1; i >= 0; i--) out.push(recentRow(h[i]));
  host.innerHTML =
    '<div class="sx-lbl">' + T('Your recent results', 'Ir-riżultati reċenti tiegħek') +
      '<span class="sx-cnt">' + h.length + '</span></div>' +
    out.join('') +
    '<p class="sx-foot">' +
      T('Your own matches, kept on this phone. Opponents and scores from other players are not stored here.',
        'Il-logħbiet tiegħek, miżmuma fuq dan it-telefon. L-avversarji u l-punteġġi ta\' plejers oħra mhumiex maħżuna hawn.') +
    '</p>';
  wireArt(host);
  try { if (window.KARTI_XP && KARTI_XP.repaintAvatars) KARTI_XP.repaintAvatars(host); } catch (e){}
}

/* ═══════════════════════════════════════════════════════════════════
   THE ALL-GAMES GRID — every game, grouped, one card
   Each card is the game's LOGO over its drawn emblem + its name, grouped
   by the catalog shelves. It lives INLINE in the ALL GAMES tab now (see
   gridGroupsHTML / gamesHTML), not a bottom sheet — tapping a card opens
   that game's own board in the same tab. gridEl/closeGrid are kept as a
   harmless safety net (standDown/render call closeGrid defensively).
   ═══════════════════════════════════════════════════════════════════ */
var gridEl = null;
function closeGrid(){
  try { if (window.KARTI_NAV && KARTI_NAV.unlayer) KARTI_NAV.unlayer('sx-grid'); } catch (e){}
  if (gridEl && gridEl.parentNode) gridEl.parentNode.removeChild(gridEl);
  gridEl = null;
}

function gameCard(g){
  var stem = logoFor(g.id);
  var known = stem ? artOK[stem] : false;
  var on = FILTER === g.id;
  var base = '<span class="sx-gcico" style="--ax:' + esc(g.accent) + '">' + ico(g.icon) + '</span>';
  var img = (!stem || known === false) ? '' :
    '<img class="sx-chart" alt="" aria-hidden="true" decoding="async" loading="lazy"' +
    ' data-stem="' + esc(stem) + '" src="art/ui/' + esc(stem) + '.png">';
  return '<button type="button" class="sx-gcard' + (on ? ' on' : '') + '" data-g="' + esc(g.id) + '" ' +
         'aria-pressed="' + on + '">' +
           '<span class="sx-gclogo" style="--ax:' + esc(g.accent) + '">' + base + img + '</span>' +
           '<span class="sx-gcname">' + esc(T(g.nm, g.mt)) + '</span>' +
         '</button>';
}

/* ═══════════════════════════════════════════════════════════════════
   THE PLAYER CARD — tap a name, see that player
   A sheet inside #scr-stats showing one player big: their avatar (the
   viewer's own real face+photo via the same me:true / repaintAvatars
   path, a published look for everybody else), name, rank, overall record
   with a win-rate ring, their weekly-champion marker if the data carries
   one, and — organised — a per-game breakdown IF the board row brought
   one down (it does not yet; see the report). Registered as a KARTI_NAV
   layer so Android back dismisses the card and stays on the leaderboard,
   and closes on an outside tap too.
   ═══════════════════════════════════════════════════════════════════ */
var cardEl = null;
/* the rows the current board painted, kept so a tap can find the row it
   belongs to without threading the object through the DOM */
var cardRows = [];

/* Per-game breakdown, IF the row carries one. Tolerant of a couple of
   shapes so it lights up the day the relay wires it:
     row.games  — { <id>:{p,w,l,d,bs,...}, ... }  (the push payload shape)
     row.g      — same, alternate spelling
   Returns HTML of grouped per-game rows, or '' when there is nothing —
   in which case the card honestly shows only the overall record. */
function perGameHTML(row){
  var g = row && (row.games || row.g);
  if (!g || typeof g !== 'object') return '';
  var ids = [];
  for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)){
    var e = g[k];
    if (e && ((e.p | 0) || (e.w | 0) || (e.l | 0) || (e.d | 0))) ids.push(k);
  }
  if (!ids.length) return '';
  ids.sort(function(a, b){ return ((g[b].p | 0) - (g[a].p | 0)); });
  var rows = ids.map(function(id){
    var e = g[id], def = richDef(id);
    var p = e.p | 0, w = e.w | 0, l = e.l | 0, d = e.d | 0;
    if (!p) p = w + l + d;
    var rate = p ? pct(w, p) + '%' : '—';
    return '<div class="sx-pgrow">' +
             tile(def, 'sx-pgtile') +
             '<span class="sx-pgnm"><b>' + esc(def.name) + '</b>' +
               '<i>' + rate + T(' won · ', ' rebħa · ') + p + T(' played', ' logħbiet') + '</i></span>' +
             '<span class="sx-wld">' +
               '<span class="w">' + w + '<em>W</em></span>' +
               '<span class="l">' + l + '<em>L</em></span>' +
               '<span>' + d + '<em>D</em></span>' +
             '</span>' +
           '</div>';
  }).join('');
  return '<div class="sx-pglbl">' + T('Per game', 'Kull logħba') + '</div>' +
         '<div class="sx-pglist">' + rows + '</div>';
}

function cardHTML(row, rank){
  var name = (row && row.name) || '?';
  var w = row.w | 0, l = row.l | 0, d = row.d | 0;
  var played = w + l + d;
  var rate = pct(w, played);
  var mine = !!row.you;
  /* rank badge / weekly-champion line */
  var rankTxt = rank ? ('#' + rank) : (row.rank ? '#' + row.rank : '');
  var champ = championOf(row);
  var pg = perGameHTML(row);
  var bw = played ? (w / played) * 100 : 0;
  var bd = played ? (d / played) * 100 : 0;
  var bl = played ? (l / played) * 100 : 0;
  var ring = '<span class="sx-ring" style="--v:' + rate + '" role="img" aria-label="' +
    T('Win rate ', 'Rata ta\' rebħ ') + rate + '%">' +
      '<span class="sx-ring-in"><b>' + rate + '<em>%</em></b>' +
        '<i>' + T('won', 'rebħa') + '</i></span></span>';
  return '<div class="sx-sheet sx-pcardsheet" role="dialog" aria-modal="true" aria-label="' +
           esc(name) + '">' +
           '<div class="sx-shead">' +
             '<h3>' + T('Player', 'Plejer') + '</h3>' +
             '<button type="button" class="sx-shx" id="sx-card-x" aria-label="' +
               esc(T('Close', 'Agħlaq')) + '">' +
               '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
             '</button>' +
           '</div>' +
           '<div class="sx-sbody">' +
             '<div class="sx-phead">' +
               '<span class="sx-pcav' + (rank === 1 ? ' p1' : rank === 2 ? ' p2' : rank === 3 ? ' p3' : '') + '">' +
                 faceHTML(row, 88, { me:mine }) +
               '</span>' +
               '<div class="sx-pident">' +
                 '<h4>' + esc(name) + (mine ? '<span class="sx-mine">' + T('You', 'Int') + '</span>' : '') + '</h4>' +
                 '<div class="sx-pmeta">' +
                   (rankTxt ? '<span class="sx-pbadge">' + ico('podium') + rankTxt + '</span>' : '') +
                   (champ ? '<span class="sx-pbadge gold">' + ico('trophy') +
                     T('Weekly champ', 'Champ tal-ġimgħa') + '</span>' : '') +
                 '</div>' +
               '</div>' +
               ring +
             '</div>' +
             '<div class="sx-score">' +
               '<div class="sx-cell w"><b>' + w + '</b><i>' + T('Won', 'Rebħa') + '</i></div>' +
               '<div class="sx-cell l"><b>' + l + '</b><i>' + T('Lost', 'Telfa') + '</i></div>' +
               '<div class="sx-cell d"><b>' + d + '</b><i>' + T('Drawn', 'Draw') + '</i></div>' +
             '</div>' +
             '<div class="sx-bar" role="img" aria-label="' + w + T(' won, ', ' rebħa, ') + l +
               T(' lost, ', ' telfa, ') + d + T(' drawn', ' draw') + '">' +
               '<i class="bw" style="width:' + bw.toFixed(2) + '%"></i>' +
               '<i class="bd" style="width:' + bd.toFixed(2) + '%"></i>' +
               '<i class="bl" style="width:' + bl.toFixed(2) + '%"></i>' +
             '</div>' +
             '<div class="sx-rate"><span>' + played + T(' played', ' logħbiet') + '</span>' +
               '<span>' + T('Win rate ', 'Rata ') + '<b>' + rate + '%</b></span>' +
               ((row.bs | 0) > 1 ? '<span>' + T('Best run ', 'L-aħjar ') + '<b>' + (row.bs | 0) + '</b></span>' : '<span></span>') +
             '</div>' +
             (pg || '<p class="sx-gfoot">' + T('Overall record across every game. A per-game breakdown shows here once the board sends it.',
               'Ir-rekord total fil-logħob kollu. It-tqassim skont il-logħba jidher hawn meta l-klassifika tibgħatu.') + '</p>') +
           '</div>' +
         '</div>';
}

function openCard(row, rank){
  if (!row) return;
  closeCard();
  var host = screenEl();
  var wrap = document.createElement('div');
  wrap.className = 'sx-scrim';
  wrap.innerHTML = cardHTML(row, rank);
  host.appendChild(wrap);
  cardEl = wrap;
  wireArt(wrap);
  try { if (window.KARTI_XP && KARTI_XP.repaintAvatars) KARTI_XP.repaintAvatars(wrap); } catch (e){}
  wrap.addEventListener('click', function(ev){ if (ev.target === wrap) closeCard(); });
  $('#sx-card-x', wrap).onclick = closeCard;
  try { if (window.KARTI_NAV && KARTI_NAV.layer)
    KARTI_NAV.layer({ id:'sx-pcard', isOpen:cardOpen, close:closeCard }); } catch (e){}
  requestAnimationFrame(function(){ if (cardEl) cardEl.classList.add('in'); });
}
function cardOpen(){ return !!(cardEl && cardEl.isConnected); }
function closeCard(){
  try { if (window.KARTI_NAV && KARTI_NAV.unlayer) KARTI_NAV.unlayer('sx-pcard'); } catch (e){}
  if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
  cardEl = null;
}

/* No horizontal filter strip on the board anymore (per-game browsing is the
   ALL GAMES tab), so this is a no-op kept only because setTab() calls it. */
function showChip(){}

function wireBoard(el){
  /* every all-time/weekly toggle on the screen (OVERALL has one, the ALL
     GAMES per-game board has its own) — they share PERIOD, so a change on
     either updates both and reloads whichever board is currently painted. */
  $$('.sx-period button', el).forEach(function(b){
    b.onclick = function(){
      var p = b.getAttribute('data-p');
      if (p === PERIOD) return;
      PERIOD = p;
      $$('.sx-period button', el).forEach(function(o){
        o.setAttribute('aria-pressed', String(o.getAttribute('data-p') === PERIOD));
      });
      loadBoard();
    };
  });
  paintBoard();
}

function stateLine(){
  if (BOARD.state === 'loading')
    return '<p class="sx-state wait"><span class="sx-dot"></span>' +
           '<span class="sx-txt">' + T('Asking the Pi who is winning…', 'Nistaqsi lill-Pi min qed jirbaħ…') + '</span></p>';
  if (BOARD.state === 'down')
    return '<p class="sx-state bad"><span class="sx-dot"></span>' +
           '<span class="sx-txt">' + esc(BOARD.why || T('Cannot reach the board right now.', 'Ma nistax nilħaq il-klassifika bħalissa.')) + '</span>' +
           '<button type="button" id="sx-retry">' + T('Retry', 'Erġa\'') + '</button></p>';
  /* When the board is up there is deliberately NO banner — a green
     "Live from the Pi" line on every tab was noise. Loading and error
     states still speak (you need to know when the board can't be
     reached), but a working board just shows the ranking. */
  return '';
}

/* One ranked row, places 4 and below (the top three are lifted onto the
   podium above the list). A framed face, the rank, the name with its win
   rate under it, and the W/L/D. Everybody on the board has a face: yours is
   the one you picked; somebody else's is derived from their name so the same
   person is the same face to everyone looking, until a relay build echoes
   their own `av` back, which avatarFor() prefers the moment it does. */
function lrow(r, rank, me, idx){
  var cls = 'sx-lrow' + (rank <= 3 ? ' p' + rank : '') + (me ? ' me' : '');
  var played = (r.w | 0) + (r.l | 0) + (r.d | 0);
  var sig = played
    ? pct(r.w | 0, played) + T('% won', '% rebħa') +
      ((r.bs | 0) > 1 ? ' · ' + T('best run ', 'l-aħjar sensiela ') + (r.bs | 0) : '')
    : T('no games yet', 'l-ebda logħba');
  var tap = (idx == null) ? '' :
    ' data-pi="' + idx + '" data-rk="' + rank + '" role="button" tabindex="0"' +
    ' aria-label="' + esc((r.name || '?') + T(', open player card', ', iftaħ il-karta tal-plejer')) + '"';
  return '<div class="' + cls + '"' + tap + '>' +
           '<span class="sx-rank">' + rank + '</span>' +
           '<span class="sx-lav">' + faceHTML(r, 38) + '</span>' +
           '<span class="sx-who">' +
             '<span class="sx-whorow"><b>' + esc(r.name || '?') + '</b>' +
               (me ? '<span class="sx-mine">' + T('You', 'Int') + '</span>' : '') + '</span>' +
             '<span class="sx-sig">' + esc(sig) + '</span>' +
           '</span>' +
           '<span class="sx-wld">' +
             '<span class="w">' + (r.w | 0) + '<em>W</em></span>' +
             '<span class="l">' + (r.l | 0) + '<em>L</em></span>' +
             '<span>' + (r.d | 0) + '<em>D</em></span>' +
           '</span>' +
         '</div>';
}

/* The podium: the top three, lifted onto gold/silver/bronze risers with
   framed faces and a crown on first — the record book's echo of the winner
   screen. Rendered in DOM order 1,2,3; CSS `order` lays them centre/left/right. */
function podium(top){
  var cols = top.map(function(r, i){
    var rank = i + 1;
    var played = (r.w | 0) + (r.l | 0) + (r.d | 0);
    var score = played ? pct(r.w | 0, played) + '%' : '—';
    return '<div class="sx-pcol p' + rank + '" data-pi="' + i + '" data-rk="' + rank +
             '" role="button" tabindex="0" aria-label="' +
             esc((r.name || '?') + T(', open player card', ', iftaħ il-karta tal-plejer')) + '">' +
             (rank === 1 ? crownSVG() : '') +
             '<span class="sx-pav">' + faceHTML(r, rank === 1 ? 78 : 60) +
               (r.you ? '<span class="sx-you-tag">' + T('YOU', 'INT') + '</span>' : '') +
               '<span class="sx-medal">' + rank + '</span>' +
             '</span>' +
             '<span class="sx-pname">' + esc(r.name || '?') + '</span>' +
             '<span class="sx-pscore">' + esc(score) + T(' won', ' rebħa') + '</span>' +
             '<span class="sx-riser" aria-hidden="true"></span>' +
           '</div>';
  }).join('');
  return '<div class="sx-podium">' + cols + '</div>';
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
  var meRate = t.played ? pct(t.won, t.played) + T('% won', '% rebħa') : T('no games yet', 'l-ebda logħba');
  return '<div class="sx-lrow me">' +
           '<span class="sx-rank">' + ico('person') + '</span>' +
           '<span class="sx-lav">' + faceHTML({ name:playerName() }, 38, { me:true }) + '</span>' +
           '<span class="sx-who">' +
             '<span class="sx-whorow"><b>' + esc(playerName()) + '</b>' +
               '<span class="sx-mine">' + T('You', 'Int') + '</span></span>' +
             '<span class="sx-sig">' + esc(meRate) + '</span>' +
           '</span>' +
           '<span class="sx-wld">' +
             '<span class="w">' + t.won + '<em>W</em></span>' +
             '<span class="l">' + t.lost + '<em>L</em></span>' +
             '<span>' + t.drawn + '<em>D</em></span>' +
           '</span>' +
         '</div>' +
         (rows.length
           ? '<p class="sx-lbl">' + (session()
               ? T('Waiting to go up on the board', 'Qed jistenna biex jitla\' fuq il-klassifika')
               : T('On this phone — an account puts it on the board', 'Fuq dan it-telefon — kont ipoġġih fuq il-klassifika')) + '</p>' +
             rows.join('')
           : '<div class="sx-empty">' + ico('podium') +
             '<b>' + T('Nothing to show yet', 'Xejn x\'nuri s\'issa') + '</b>' +
             T('Play something and win it. Your record is kept on the phone ' +
               'either way, and goes up the moment the Pi answers again.',
               'Ilgħab xi ħaġa u irbaħha. Ir-rekord tiegħek jinżamm fuq it-telefon ' +
               'xorta, u jitla\' hekk kif il-Pi jerġa\' jwieġeb.') + '</div>');
}

function paintBoard(){
  /* boardHost is the ALL GAMES per-game board when one is open; otherwise
     the OVERALL tab's #sx-board. Fall back to #sx-board if the pointer went
     stale (e.g. a re-render dropped the games board). */
  var host = (boardHost && boardHost.isConnected)
    ? boardHost
    : (scr && $('#sx-board', scr));
  if (!host) return;
  var body;
  if (BOARD.state === 'live'){
    var rows = BOARD.rows || [];
    if (!rows.length){
      body = '<div class="sx-empty">' + ico('podium') +
             '<b>' + T('Nobody on the board yet', 'Ħadd fuq il-klassifika s\'issa') + '</b>' +
             T('Play a game and win it, and this is where your name goes. ' +
               'You need an account for the board to know who you are.',
               'Ilgħab logħba u irbaħha, u hawn imur ismek. ' +
               'Trid kont biex il-klassifika tkun taf min int.') + '</div>';
    } else {
      var mine = (BOARD.you && BOARD.you.u) || '';
      var shown = {}, i, r;
      /* mark who is you, so the podium and the rows can both flag it */
      for (i = 0; i < rows.length; i++){
        rows[i].you = !!mine && rows[i].u === mine;
        shown[rows[i].u] = 1;
      }
      /* the flat index space the player card taps into: one entry per row in
         board order, so both the podium and the numbered ladder tap the same
         person by index */
      cardRows = rows.slice();
      var top = rows.slice(0, 3);

      /* THE FULL NUMBERED RANKING — 1..N, always shown when anybody is on the
         board. The podium above is a flourish over the top three; this is the
         list the user reads, and it lists EVERYONE (the top three included, so
         a board of one, two or three players is a readable "1st, 2nd, 3rd"
         and never a blank space under three medals). Rows 1-3 keep their
         medal-tint; the viewer's row is highlighted wherever it lands. */
      var out = [];
      for (i = 0; i < rows.length; i++){
        r = rows[i];
        out.push(lrow(r, i + 1, !!r.you, i));
      }
      /* your own row, pinned below the ranking if you fell outside what
         came down — a leaderboard you are not visible on is no use to you */
      if (mine && BOARD.you && BOARD.you.rank && !shown[mine]){
        out.push('<div class="sx-gap" aria-hidden="true"><span>···</span></div>');
        out.push(lrow(BOARD.you, BOARD.you.rank, true, cardRows.length));
        cardRows.push(BOARD.you);
      }
      /* WEEKLY is the board the Sunday champion awards are cut from, so
         when it is on it says whose week it is and that its top three are
         the ones who take the tiered borders. All-time is just the ranking. */
      /* IT NO LONGER PROMISES THE CHAMPION BORDERS. It used to say the top
         three "take this week's champion borders", and nothing has ever
         handed one out: KARTI_XP.grantRank() is written and exported, and
         called by no file and no route — there is no Sunday job. Until one
         exists the line said something untrue on the one screen a player
         goes to to be told the truth about their record. What it says now is
         what the board actually does, which is enough of a thing to say. */
      var cap = '';
      if (BOARD.period === 'week'){
        cap = '<p class="sx-week"><span class="sx-dot"></span><span>' +
              T('This week · resets Sunday. Only games played since Sunday count here.',
                'Din il-ġimgħa · tibda mill-ġdid il-Ħadd. Hawn jgħoddu biss il-logħbiet ' +
                'mill-Ħadd \'l hawn.') +
              '</span></p>';
      }
      var ladLbl = '<div class="sx-lbl">' +
        (BOARD.period === 'week' ? T('This week\'s ranking', 'Il-klassifika ta\' din il-ġimgħa')
                                 : T('Full ranking', 'Il-klassifika sħiħa')) +
        '<span class="sx-cnt">' + rows.length + '</span></div>';
      /* podium only when there are at least 3 to lift onto it; below three
         the numbered list alone reads better than a lonely medal or two */
      var pod = rows.length >= 3 ? podium(top) : '';
      body = cap + pod + ladLbl + out.join('');
    }
  } else if (BOARD.state === 'loading'){
    body = '';
    cardRows = [];
  } else {
    body = localFallback();
    cardRows = [];
  }
  host.innerHTML = stateLine() + body;
  /* This repaint happens long after render() finished — the answer only
     arrives when the Pi answers — so the emblems in it have to be wired here
     too, or they sit at opacity 0 forever waiting for a load event nobody is
     listening for. */
  wireArt(host);
  /* the real-photo avatars are lazy: progress.js swaps the initials tile for
     the fetched face once it lands, so ask it to look over what we just drew */
  try { if (window.KARTI_XP && KARTI_XP.repaintAvatars) KARTI_XP.repaintAvatars(host); } catch (e){}
  var rt = $('#sx-retry', host);
  if (rt) rt.onclick = loadBoard;
  /* tap a podium column or a ladder row to open that player's card */
  function tapCard(node){
    var pi = parseInt(node.getAttribute('data-pi'), 10);
    var rk = parseInt(node.getAttribute('data-rk'), 10);
    if (isNaN(pi) || !cardRows[pi]) return;
    openCard(cardRows[pi], isNaN(rk) ? 0 : rk);
  }
  $$('.sx-pcol[data-pi],.sx-lrow[data-pi]', host).forEach(function(node){
    node.addEventListener('click', function(){ tapCard(node); });
    node.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); tapCard(node); }
    });
  });
  entrance();
}

/* The entrance flourish: the podium columns and the first rows slide up once,
   compositor-only (transform/opacity). Off entirely under reduced motion —
   the class is never added, so everything is already at its final state. */
function entrance(){
  if (!scr) return;
  var reduced = false;
  try {
    reduced = (document.body && document.body.classList.contains('reduced')) ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e){}
  scr.classList.remove('sx-anim', 'sx-go');
  if (reduced) return;
  scr.classList.add('sx-anim');
  requestAnimationFrame(function(){
    if (scr) requestAnimationFrame(function(){ if (scr) scr.classList.add('sx-go'); });
  });
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

   The profile sheet in js/game.js carries exactly ONE of these now — the
   record book — because the leaderboard is a tab inside it. The ="board"
   form still works and still lands on that tab, so anything else that used
   it keeps working.

   Delegated on the document so it also works for a button that is painted
   long after this file ran, which is every screen in this game. */
document.addEventListener('click', function(ev){
  var t = ev.target;
  var b = t && t.closest ? t.closest('[data-karti-stats]') : null;
  if (!b) return;
  ev.preventDefault();
  /* A DESTINATION CLOSES THE SHEET IT WAS TAPPED IN. Both of these
     buttons live in js/game.js's profile sheet, and both used to
     navigate and leave that sheet sitting over the top of where you
     had just arrived — so the record book opened underneath a menu,
     and js/nav.js's back press then closed the menu and left you on a
     screen you never knowingly went to. Fixed here rather than in
     game.js so it holds for every place that ever uses the attribute. */
  try { if (window.KARTI && KARTI.closeSheet) KARTI.closeSheet(); } catch (e){}
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
