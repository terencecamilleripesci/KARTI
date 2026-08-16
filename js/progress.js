/* ═══════════════════════════════════════════════════════════════════
   KARTI — progress.js
   THE LADDER. Experience from every game in the box, a level that pays
   out coins, packs and cosmetics, a face for every player, and one
   registry the eleven games hang their customisation on.

   WHAT THIS FILE IS
     · KARTI_XP.award(game, result)   — one match, one payment.
     · KARTI_XP.register(defs)        — a game declares its cosmetics.
     · KARTI_XP.equipped(slot, game)  — what the player is wearing.
     · KARTI_XP.open()                — the customisation screen
                                        (drawn by js/progress-ui.js).

   ── COINS AND XP ARE NOT THE SAME THING ───────────────────────────
   S.coins already exists and already buys card packs. It keeps that
   job, untouched. XP is a second, slower track: you earn it by
   PLAYING, and a level-up PAYS OUT coins, packs and cosmetics. Two
   currencies, two jobs, and nothing you can buy with one you can buy
   with the other.

   ── NOTHING HERE EVER GATES A GAME ────────────────────────────────
   Levels unlock cosmetics, coins and cards. Not a game, not a mode,
   not a difficulty, not an opponent. Somebody opening this app for the
   first time can play all eleven games, all of them, immediately. That
   rule is not a preference, it is the point: he plays this with
   friends and a locked game is a friend who cannot join in.

   ── WHERE IT IS KEPT, AND WHY THERE ───────────────────────────────
   Inside js/game.js's own save object, as S.prog. That is deliberate:
   js/sync.js pushes karti_save_<profile> wholesale to the Pi, so
   putting progression anywhere else would mean a player levelling up
   on his phone and starting again on the tablet. load() there does
   Object.assign over the defaults, so S.prog survives with no
   migration, and the guest→account upgrade carries the save across
   wholesale, so it survives that too.

   Nothing here is cached in a module variable. Every read goes through
   root() to the live S, so a cloud pull or a profile switch changes
   what this file sees on the very next call, with no listener to
   forget to fire.

   ── HOW A GAME PAYS ───────────────────────────────────────────────
   Four funnels, one dedupe. Every one of them already existed:
     1. KARTI_STATS.record(game, {result})   — the record book. One
        line added in js/stats.js calls us after a COUNTED result.
     2. KARTI_PARTY.record(id, outcome)      — chess, dama, IL-KIRI
        and the four klabb games all report here. Wrapped, not edited.
     3. KARTI_PARTY.ui.result(ctx, o)        — the shared party result
        card. SKARTA reports nowhere else, so this catches it, and the
        game id is resolved from the frame title.
     4. KARTI.onDuelEvent({type:'over'})     — the card duel, in all
        four of its modes.
   A game that reports through two of them is paid ONCE: see fresh().
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function(){

if (window.KARTI_XP) return;

/* ═══════════════════════════════════════════════════════════════════
   1. THE ECONOMY
   Every number in this section is argued for in docs/PROGRESSION.md.
   The short version: about ten XP for an average game, about eight
   games for the first level, about nine hundred for level 20, and a
   cap at 25 that is meant to take a year.
   ═══════════════════════════════════════════════════════════════════ */

var MAX_LEVEL = 25;

/* WEIGHT = roughly how long the game takes, in units of "a short hand
   of cards". It is the only per-game number, and it drives three
   things at once: the XP a game pays, the XP a win pays, and how long
   a game of it has to last to count as a real one (par, below). One
   number, three jobs, so they can never drift apart. */
var WEIGHT = {
  'sette':       5,     /* Sette e Mezzo — a minute, maybe two          */
  'cheat':       5,     /* Il-Gidba                                     */
  'tombla':      5.5,   /* fast, but you sit through the whole card     */
  'bixkla':      6,
  'briscola':    6,
  'dama':        6.5,
  'skarta':      6.5,
  'chess':       7,
  'cards-solo':  7,     /* 8000 LP is not a quick duel                  */
  'cards-story': 9,     /* a boss, with a deck built for it             */
  'cards-mp':    9,     /* against a person, who thinks between turns   */
  'kiri':       10      /* the longest thing in the box by some way     */
};
var DEFAULT_WEIGHT = 6;          /* a game added next week still pays   */

/* RESULT — playing pays, drawing pays more, winning pays double. A
   loss is never zero and never rounds to zero: the bar has to move
   when you lose or the reward screen becomes a punishment and people
   stop opening the game they just lost. */
var RESULT = { w:2, d:1.4, l:1 };

/* PAR — how long a real game of this takes, in ms. weight × 15s.
   A game that ends faster than par pays proportionally less, floored
   at a quarter. This is the whole answer to "beat the easiest AI in
   ten seconds on repeat": a ten-second chess win pays 4 XP where a
   proper one pays 14, so farming is four times SLOWER than playing. */
function par(game){ return weight(game) * 15000; }
var SPEED_FLOOR = 0.25;

/* TAPER — the same game, over and over, in one day. Generous on
   purpose: a party night of twenty tombla cards should not be
   punished. But the eighth game of the day is where the curve starts
   to bend, and the seventeenth pays a third, so the fastest route up
   the ladder is always to play something ELSE. */
var TAPER = [ [8, 1], [16, 0.6], [Infinity, 0.35] ];

/* FIRST WIN OF THE DAY, per game — half as much again. The carrot that
   does the anti-farm work the taper only hints at: eleven first wins
   is worth far more than fifty repeats of one game, so the optimal
   play and the fun play are the same play. */
var FIRST_WIN = 1.5;

/* THE CURVE. need(L) is the XP to get from level L to level L+1.
     L1 → 110  ·  L5 → 232  ·  L10 → 478  ·  L20 → 1286
   Quadratic, not exponential: the top is a long climb but it is not a
   wall you can see from level three, and it is the same shape all the
   way up, so "the next one is a bit more than the last one" is true
   everywhere and a player is never ambushed.
   The 110 is measured, not guessed: a real mixed player earns about
   13-14 XP a game (see docs/PROGRESSION.md), so the first level is
   about eight games, which is the number he was promised. */
function need(L){
  L = L | 0;
  if (L < 1) L = 1;
  if (L >= MAX_LEVEL) return Infinity;
  var d = L - 1;
  return 110 + 22 * d + Math.round(2.1 * d * d);
}

/* Cumulative XP at the START of each level, built once. */
var CUM = (function(){
  var a = [0, 0], t = 0, L;
  for (L = 1; L < MAX_LEVEL; L++){ t += need(L); a[L + 1] = t; }
  return a;
})();

function levelFromXp(x){
  var L = 1;
  while (L < MAX_LEVEL && x >= CUM[L + 1]) L++;
  return L;
}

/* WHAT A LEVEL PAYS. Coins every level, packs on the thirds and the
   fifths. Cosmetics are not in here — a game declares those itself,
   because only chess knows what a chess board looks like. */
function payout(L){
  return {
    coins: 100 + 50 * L,
    packs: (L % 5 === 0) ? 2 : (L % 3 === 0 ? 1 : 0)
  };
}

function weight(game){
  var w = WEIGHT[game];
  return (typeof w === 'number' && w > 0) ? w : DEFAULT_WEIGHT;
}

/* ═══════════════════════════════════════════════════════════════════
   2. STORAGE
   S.prog, or a private key if js/game.js is somehow not there — the
   fallback exists so this file can be loaded and tested on its own,
   not because it is expected to be used.
   ═══════════════════════════════════════════════════════════════════ */
var FKEY = 'karti_prog_v1';
var SEEN_MAX = 120;

function blank(){
  return { v:1, xp:0, av:'', eq:{}, own:{}, day:'', n:{}, fw:{}, last:{}, seen:[], seenAv:0 };
}

var FB = null;                   /* the standalone fallback slot       */

function lsGet(k, d){
  try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
  catch (e){ return d; }
}
function lsSet(k, v){
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e){ return false; }
}

/* A half-written or hand-edited block must not be able to poison
   arithmetic — every number is squeezed back into range on the way
   out, exactly as js/stats.js does with its counters. */
function norm(p){
  if (typeof p.xp !== 'number' || !isFinite(p.xp) || p.xp < 0) p.xp = 0;
  p.xp = Math.floor(p.xp);
  if (typeof p.av !== 'string') p.av = '';
  if (!p.eq || typeof p.eq !== 'object') p.eq = {};
  if (!p.own || typeof p.own !== 'object') p.own = {};
  if (!p.n || typeof p.n !== 'object') p.n = {};
  if (!p.fw || typeof p.fw !== 'object') p.fw = {};
  if (!p.last || typeof p.last !== 'object') p.last = {};
  if (!Array.isArray(p.seen)) p.seen = [];
  if (typeof p.day !== 'string') p.day = '';
  return p;
}

function root(){
  var S = null;
  try { if (window.KARTI && KARTI.S) S = KARTI.S; } catch (e){}
  if (S){
    if (!S.prog || typeof S.prog !== 'object') S.prog = blank();
    return norm(S.prog);
  }
  if (!FB) FB = norm(lsGet(FKEY, null) || blank());
  return FB;
}

function commit(){
  try {
    if (window.KARTI && KARTI.S && typeof KARTI.save === 'function'){ KARTI.save(); return true; }
  } catch (e){}
  return lsSet(FKEY, FB || blank());
}

/* Which profile we are looking at. Read, never written — js/game.js
   owns karti_active and there is no second copy of a login worth
   keeping (the same rule js/stats.js follows). */
function activeKey(){
  try { if (window.KARTI && KARTI.ACTIVE) return String(KARTI.ACTIVE); } catch (e){}
  var v = lsGet('karti_active', null);
  return (typeof v === 'string' && v) ? v : '__guest__';
}

function dayKey(){
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

/* Roll the day over if it has. Kept out of award() so a read never has
   a side effect the caller did not ask for. */
function rollDay(p){
  var k = dayKey();
  if (p.day !== k){ p.day = k; p.n = {}; p.fw = {}; return true; }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   3. THE COSMETICS REGISTRY
   In memory only. A game declares what it can wear every time it
   loads, so the registry is always exactly as current as the code —
   there is no stale definition to migrate and a cosmetic that is
   deleted from a game simply stops existing. Only the player's CHOICE
   is persisted, and a choice pointing at something that no longer
   exists reads as "nothing equipped" rather than as a crash.
   ═══════════════════════════════════════════════════════════════════ */
var DEFS = {};                   /* id -> def                          */
var ORDER = [];                  /* registration order, for stable UI  */
var SLOT_GAMES = {};             /* slot -> { game:true }              */

var ID_RE  = /^[a-z0-9][a-z0-9._-]{0,47}$/i;
var SLOT_RE = /^[a-z][a-z0-9-]{0,23}$/i;

/**
 * register(defs) -> number registered
 *
 * A cosmetic definition:
 *   id      unique, e.g. 'chess.board.pink'
 *   game    a record-book game id: 'chess', 'dama', 'skarta', 'kiri',
 *           'tombla', 'bixkla', 'briscola', 'sette', 'cheat',
 *           'cards-solo', 'cards-story', 'cards-mp' — or 'karti' for
 *           the things that are not one game's (avatars).
 *   slot    what it REPLACES: 'board', 'pieces', 'felt', 'back',
 *           'avatar', 'table', 'tokens'. Equipping one clears whatever
 *           was in that slot for that game.
 *   name    two or three words, shouted in the display face.
 *   blurb   one line, in the game's voice.
 *   level   the level it unlocks at. 0 or 1 = free from the start.
 *   preview(size) -> Element | HTML string. Draws the thing itself at
 *           roughly size×size. The inventory calls this without ever
 *           knowing what a board or a piece is.
 *   sort    optional, orders within a slot.
 *
 * Idempotent: registering the same id again REPLACES the definition,
 * so a game that reloads (or a hot edit) never doubles its shelf.
 * Never throws — a game must not be able to take the app down by
 * declaring a bad cosmetic. A bad def is dropped and counted.
 */
function register(defs){
  if (!defs) return 0;
  if (!Array.isArray(defs)) defs = [defs];
  var n = 0;
  for (var i = 0; i < defs.length; i++){
    var d = defs[i];
    try {
      if (!d || typeof d !== 'object') continue;
      var id = String(d.id || '');
      var slot = String(d.slot || '');
      if (!ID_RE.test(id) || !SLOT_RE.test(slot)) continue;
      var game = String(d.game || 'karti').toLowerCase();
      var lvl = (typeof d.level === 'number' && isFinite(d.level)) ? Math.max(0, Math.floor(d.level)) : 0;
      if (lvl > MAX_LEVEL) lvl = MAX_LEVEL;
      var def = {
        id: id, game: game, slot: slot.toLowerCase(),
        name: String(d.name || id),
        blurb: String(d.blurb || ''),
        level: lvl,
        sort: (typeof d.sort === 'number' && isFinite(d.sort)) ? d.sort : 0,
        preview: (typeof d.preview === 'function') ? d.preview : null,
        accent: typeof d.accent === 'string' ? d.accent : ''
      };
      def.key = def.game + '.' + def.slot;
      if (!DEFS[id]) ORDER.push(id);
      DEFS[id] = def;
      (SLOT_GAMES[def.slot] || (SLOT_GAMES[def.slot] = {}))[def.game] = true;
      n++;
    } catch (e){}
  }
  if (n) fire(equipCbs, { registered:n });
  return n;
}

function defsAll(){
  var out = [], i;
  for (i = 0; i < ORDER.length; i++) if (DEFS[ORDER[i]]) out.push(DEFS[ORDER[i]]);
  out.sort(function(a, b){
    if (a.slot !== b.slot) return a.slot < b.slot ? -1 : 1;
    if (a.sort !== b.sort) return a.sort - b.sort;
    if (a.level !== b.level) return a.level - b.level;
    return a.name < b.name ? -1 : 1;
  });
  return out;
}

function defsFor(game){
  game = String(game || '').toLowerCase();
  return defsAll().filter(function(d){ return d.game === game; });
}

/* Every game that has declared anything, in record-book order so the
   inventory tabs and the record book read the same way round. */
function gamesWithKit(){
  var seen = {}, i, list = defsAll(), order = [], j;
  for (i = 0; i < list.length; i++) seen[list[i].game] = true;
  var shelf = [];
  try { if (window.KARTI_STATS && KARTI_STATS.GAMES) shelf = KARTI_STATS.GAMES; } catch (e){}
  for (j = 0; j < shelf.length; j++) if (seen[shelf[j].id]){ order.push(shelf[j].id); delete seen[shelf[j].id]; }
  for (var k in seen) if (Object.prototype.hasOwnProperty.call(seen, k) && k !== 'karti') order.push(k);
  return order;
}

/* ── the equip key ────────────────────────────────────────────────
   Two games can both have a slot called 'board' and mean completely
   different objects, so a slot is stored as game.slot. The public API
   takes 'board', 'chess.board' or ('board','chess') and resolves all
   three; an ambiguous bare slot is refused rather than guessed at,
   because silently dressing the wrong game is worse than saying no.
   KARTI_XP.forGame('chess') hands a game a facade with the game
   already bound, which is what a game should actually use. */
function keyOf(slot, game){
  slot = String(slot == null ? '' : slot);
  if (slot.indexOf('.') > 0){
    var bits = slot.split('.');
    return bits[0].toLowerCase() + '.' + bits.slice(1).join('.').toLowerCase();
  }
  slot = slot.toLowerCase();
  if (game) return String(game).toLowerCase() + '.' + slot;
  var owners = SLOT_GAMES[slot] ? Object.keys(SLOT_GAMES[slot]) : [];
  if (owners.length === 1) return owners[0] + '.' + slot;
  return null;                   /* nothing declares it, or several do */
}

/* ═══════════════════════════════════════════════════════════════════
   4. WHERE THE PLAYER IS
   ═══════════════════════════════════════════════════════════════════ */
function xpTotal(){ return root().xp; }
function level(){ return levelFromXp(root().xp); }
function xpInto(){ var L = level(); return root().xp - CUM[L]; }
function xpNeeded(){ var L = level(); return L >= MAX_LEVEL ? 0 : need(L); }
function atMax(){ return level() >= MAX_LEVEL; }

function owns(id){
  var d = DEFS[id];
  if (!d) return false;
  if (d.level <= 1) return true;
  if (root().own[id]) return true;
  return level() >= d.level;
}

/* The next thing there is to get, and at what level. Optionally within
   one game — that is the line at the top of each inventory tab. */
function nextUnlock(game){
  var L = level(), list = defsAll(), best = null, i;
  for (i = 0; i < list.length; i++){
    var d = list[i];
    if (game && d.game !== game) continue;
    if (d.level <= L || owns(d.id)) continue;
    if (!best || d.level < best.level) best = d;
  }
  return best;
}

function unlocksAt(L){
  var out = [], list = defsAll(), i;
  for (i = 0; i < list.length; i++) if (list[i].level === L) out.push(list[i]);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   5. EQUIPPING
   ═══════════════════════════════════════════════════════════════════ */
function equipped(slot, game){
  var k = keyOf(slot, game);
  if (!k) return null;
  var id = root().eq[k];
  if (!id) return null;
  var d = DEFS[id];
  /* a choice pointing at a cosmetic this build no longer has, or one
     the player no longer owns (a wiped save, a shared account) is not
     an error — it is simply nothing on */
  if (!d || d.key !== k || !owns(id)) return null;
  return id;
}

function equipDef(slot, game){
  var id = equipped(slot, game);
  return id ? DEFS[id] : null;
}

function equip(slot, id){
  /* the id is the authority: it knows its own game and its own slot,
     so equip('board', 'chess.board.pink') is never ambiguous even
     though the bare word 'board' would be */
  var d = DEFS[id];
  if (!d) return { ok:false, why:'unknown' };
  if (slot){
    var want = keyOf(slot, d.game);
    if (want && want !== d.key) return { ok:false, why:'wrong-slot' };
  }
  if (!owns(id)) return { ok:false, why:'locked', level:d.level };
  var p = root();
  if (p.eq[d.key] === id) return { ok:true, already:true, id:id, slot:d.key };
  p.eq[d.key] = id;
  commit();
  if (window.KARTI_SFX){ try { KARTI_SFX.play('ui.toggle'); } catch (e){} }
  fire(equipCbs, { slot:d.key, game:d.game, id:id, def:d });
  return { ok:true, id:id, slot:d.key };
}

function unequip(slot, game){
  var k = keyOf(slot, game);
  if (!k) return { ok:false, why:'ambiguous' };
  var p = root();
  if (!p.eq[k]) return { ok:true, already:true };
  delete p.eq[k];
  commit();
  if (window.KARTI_SFX){ try { KARTI_SFX.play('ui.untoggle'); } catch (e){} }
  fire(equipCbs, { slot:k, game:String(k).split('.')[0], id:null, def:null });
  return { ok:true, slot:k };
}

/* The ergonomic front door for a game. chess.js keeps one of these and
   never has to think about slot namespacing again. */
function forGame(game){
  game = String(game || '').toLowerCase();
  return {
    game: game,
    equipped: function(slot){ return equipped(slot, game); },
    def: function(slot){ return equipDef(slot, game); },
    equip: function(slot, id){ return equip(slot, id); },
    unequip: function(slot){ return unequip(slot, game); },
    owns: owns,
    list: function(){ return defsFor(game); },
    register: function(defs){
      if (!Array.isArray(defs)) defs = [defs];
      return register(defs.map(function(d){
        return (d && !d.game) ? Object.assign({}, d, { game: game }) : d;
      }));
    },
    onChange: function(cb){
      return onEquip(function(ev){ if (!ev || !ev.game || ev.game === game) cb(ev); });
    }
  };
}

/* ═══════════════════════════════════════════════════════════════════
   6. LISTENERS
   ═══════════════════════════════════════════════════════════════════ */
var levelCbs = [], unlockCbs = [], equipCbs = [], awardCbs = [];
function on(list, cb){
  if (typeof cb !== 'function') return function(){};
  list.push(cb);
  return function(){ var i = list.indexOf(cb); if (i >= 0) list.splice(i, 1); };
}
function fire(list, ev){
  for (var i = 0; i < list.length; i++){
    try { list[i](ev); } catch (e){}
  }
}
function onLevel(cb){ return on(levelCbs, cb); }
function onUnlock(cb){ return on(unlockCbs, cb); }
function onEquip(cb){ return on(equipCbs, cb); }
function onAward(cb){ return on(awardCbs, cb); }

/* ═══════════════════════════════════════════════════════════════════
   7. THE AWARD
   ═══════════════════════════════════════════════════════════════════ */
function normResult(r){
  if (r === true || r === 1) return 'w';
  if (r === false || r === 0) return 'l';
  var s = String(r == null ? '' : r).toLowerCase();
  if (s === 'w' || s === 'win' || s === 'won') return 'w';
  if (s === 'l' || s === 'loss' || s === 'lose' || s === 'lost' || s === 'defeat') return 'l';
  if (s === 'd' || s === 'draw' || s === 'drew' || s === 'tie' || s === 'stalemate') return 'd';
  return '';
}

/* ── the double-payment guard ──────────────────────────────────────
   Three of the four funnels can fire for ONE match: chess calls
   KARTI_PARTY.record and then KARTI_PARTY.ui.result, and a game that
   also reports to the record book would make three. A match id, when
   there is one, is absolute and is remembered across a reload. With no
   id, the same game reporting the same result inside ten seconds is
   the same match being announced again — the same reasoning, and the
   same shape, as record()'s own guard in js/stats.js. */
var REPEAT_MS = 10000;
var recent = [];
function fresh(game, res, mid){
  var p = root(), now = Date.now(), i;
  if (mid){
    var tag = game + ':' + mid;
    if (p.seen.indexOf(tag) >= 0) return false;
    p.seen.push(tag);
    if (p.seen.length > SEEN_MAX) p.seen.splice(0, p.seen.length - SEEN_MAX);
    return true;
  }
  var sig = game + '|' + res;
  for (i = recent.length - 1; i >= 0; i--){
    if (now - recent[i].t > REPEAT_MS){ recent.splice(0, i + 1); break; }
    if (recent[i].sig === sig) return false;
  }
  recent.push({ sig:sig, t:now });
  if (recent.length > 30) recent.splice(0, recent.length - 30);
  return true;
}

function taperFor(n){
  for (var i = 0; i < TAPER.length; i++) if (n < TAPER[i][0]) return TAPER[i][1];
  return TAPER[TAPER.length - 1][1];
}

/**
 * award(game, result, opts) -> {counted, xp, level, levelled, unlocked, …}
 *
 *   game    a record-book id. Unknown ids are accepted at the default
 *           weight — a twelfth game next week must not pay nothing
 *           just because this file has not heard of it.
 *   result  'win' | 'loss' | 'draw' (also w/l/d, true/false)
 *   opts    { id, ms, quiet, table, title }
 *             id     a match id — the strongest guard against paying twice
 *             ms     how long the match took; drives the speed factor
 *             quiet  award, but do not put the reward screen up
 *             table  [{name, score, you}] the standings, if the game has any
 *
 * Never throws. Ending a game must never be able to take the app down.
 */
function award(game, result, opts){
  var out = { counted:false, xp:0, level:level(), levelled:false, unlocked:[] };
  try {
    opts = opts || {};
    game = String(game == null ? '' : game).toLowerCase();
    var res = normResult(result);
    if (!game || !res) return out;

    var mid = opts.id == null ? '' : String(opts.id).slice(0, 48);
    if (!fresh(game, res, mid)) { out.why = 'already'; return out; }

    var p = root();
    rollDay(p);

    var now = Date.now();
    var w = weight(game);
    var base = w * RESULT[res];

    /* speed: the game's own clock if it kept one, otherwise the gap
       since the last result in this same game. A first game with no
       history gets the benefit of the doubt — you cannot be farming
       something you have not played yet. */
    var t = (typeof opts.ms === 'number' && isFinite(opts.ms) && opts.ms > 0) ? opts.ms
          : (p.last[game] ? now - p.last[game] : par(game));
    var speed = Math.max(SPEED_FLOOR, Math.min(1, t / par(game)));

    var played = p.n[game] || 0;
    var tap = taperFor(played);

    var firstWin = (res === 'w' && !p.fw[game]) ? FIRST_WIN : 1;

    var xp = Math.max(1, Math.round(base * speed * tap * firstWin));

    var before = levelFromXp(p.xp);
    p.xp += xp;
    var after = levelFromXp(p.xp);

    p.n[game] = played + 1;
    if (res === 'w') p.fw[game] = 1;
    p.last[game] = now;

    out.counted = true;
    out.xp = xp;
    out.game = game;
    out.result = res;
    out.from = before;
    out.level = after;
    out.levelled = after > before;
    out.speed = speed;
    out.taper = tap;
    out.firstWin = firstWin > 1;
    out.total = p.xp;

    /* the payout. Coins and packs go into the SAME purse the card game
       already uses — a level does not mint a second currency, it tops
       up the one that already buys packs. */
    var coins = 0, packs = 0, L;
    for (L = before + 1; L <= after; L++){
      var pay = payout(L);
      coins += pay.coins; packs += pay.packs;
      out.unlocked = out.unlocked.concat(unlocksAt(L));
    }
    if (coins || packs){
      try {
        if (window.KARTI && KARTI.S){
          if (coins) KARTI.S.coins = (KARTI.S.coins | 0) + coins;
          if (packs) KARTI.S.packs = (KARTI.S.packs | 0) + packs;
        }
      } catch (e){}
    }
    out.coins = coins; out.packs = packs;

    commit();

    fire(awardCbs, out);
    if (out.levelled){
      fire(levelCbs, out);
      if (out.unlocked.length) fire(unlockCbs, out);
    }

    if (!opts.quiet) show(out, opts);
    return out;
  } catch (err){
    return out;
  }
}

/* The reward screen lives in js/progress-ui.js. If it is not loaded —
   a partial deploy, a 404 — the award still happened and the game
   simply carries on. Nothing here depends on the UI existing. */
function show(res, opts){
  try {
    if (UI && typeof UI.reward === 'function') UI.reward(res, opts || {});
  } catch (e){}
}

/* ═══════════════════════════════════════════════════════════════════
   8. THE FACES
   Templates, chosen at account creation, changed whenever you like.
   No upload: that would mean storage, sizes, and moderating whatever
   somebody puts on a shared leaderboard, and none of that is worth it
   for a game eight people play. Drawn as silhouettes in the artkit
   idiom — one accent colour, two shadow tones, a warm near-black rim —
   so a face and a game emblem sit on the same shelf.

   The wording is the game's: Maltese, funny, and never crude.
   ═══════════════════════════════════════════════════════════════════ */
var FACES = [
  /* ── the five you start with ── */
  { id:'nanna',  name:'In-Nanna',        lvl:0, ax:'#FFC542',
    blurb:'"Eat. You are too thin." You are not. You will eat anyway.' },
  { id:'kazin',  name:'Tal-Każin',       lvl:0, ax:'#E8452C',
    blurb:'Same chair since 1987. Do not sit in it.' },
  { id:'linja',  name:'Tal-Linja',       lvl:0, ax:'#3DDC84',
    blurb:'The timetable is a rumour. The route is a suggestion.' },
  { id:'pastizz',name:'Il-Pastizz',      lvl:0, ax:'#F2E4C4',
    blurb:'Warm, flaky, and better company than most of this table.' },
  { id:'bahar',  name:'Il-Baħar',        lvl:0, ax:'#4FA9E8',
    blurb:'Blue, patient, and full of jellyfish by August.' },

  /* ── the ladder ── */
  { id:'sajjied',name:'Is-Sajjied',      lvl:2,  ax:'#A9C6D8',
    blurb:'"It was THIS big." It was the size of his thumb.' },
  { id:'turist', name:'It-Turist',       lvl:3,  ax:'#FF7A5C',
    blurb:'Factor 50 was right there in the shop. He walked past it.' },
  { id:'gar',    name:'Il-Ġar',          lvl:4,  ax:'#8A5CFF',
    blurb:'Knows what time you got in. And who dropped you off.' },
  { id:'luzzu',  name:'Il-Luzzu',        lvl:5,  ax:'#FFD979',
    blurb:'The eye watches you. It has always watched you.' },
  { id:'kelb',   name:'Il-Kelb tal-Bejt',lvl:6,  ax:'#C99A5B',
    blurb:'Barks all night. The neighbours called twice. Still barking.' },
  { id:'qarnita',name:'Il-Qarnita',      lvl:8,  ax:'#FF5468',
    blurb:'Eight arms, eight problems, one very small rock pool.' },
  { id:'bandist',name:'Il-Bandist',      lvl:10, ax:'#FFC542',
    blurb:'In tune by the third street. Mostly.' },
  { id:'kuntrat',name:'Il-Kuntrattur',   lvl:12, ax:'#D8C79B',
    blurb:'Started in March. It is November. "Next week, sur."' },
  { id:'ministru',name:'Il-Ministru',    lvl:14, ax:'#B7A8E0',
    blurb:'Promises everything, delivers nothing, somehow still winning.' },
  { id:'papocc', name:'Il-Papoċċ',       lvl:17, ax:'#FF8FA0',
    blurb:'Accurate from ten metres. Never misses. You will apologise.' },
  { id:'petard', name:'Il-Petardist',    lvl:20, ax:'#FF9E2C',
    blurb:'Louder than the band. Deafer than the band.' },
  { id:'kampjun',name:'Il-Kampjun',      lvl:25, ax:'#FFE9B0',
    blurb:'Twenty-five levels. Somebody has been extremely busy.' }
];
var FACE_BY = {};
for (var fi = 0; fi < FACES.length; fi++) FACE_BY[FACES[fi].id] = FACES[fi];

function faces(){ return FACES.slice(); }
function faceDef(id){ return FACE_BY[id] || null; }
function ownsFace(id){
  var f = FACE_BY[id];
  if (!f) return false;
  return f.lvl <= 1 || level() >= f.lvl || !!root().own['face.' + id];
}

/* Your face, or the one your name says you are. A player who has never
   opened the picker still HAS a face — a stable hash of the name — so
   nobody on the leaderboard is a blank circle and nobody has to make a
   decision before they are allowed to play. */
function hashOf(s){
  var h = 5381, i;
  s = String(s || '');
  for (i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}
function defaultFaceFor(name){
  var free = FACES.filter(function(f){ return f.lvl <= 1; });
  return free[hashOf(String(name).toLowerCase()) % free.length].id;
}

function avatar(){
  var p = root();
  if (p.av && FACE_BY[p.av] && ownsFace(p.av)) return p.av;
  var n = '';
  try { if (window.KARTI && KARTI.displayName) n = KARTI.displayName(); } catch (e){}
  return defaultFaceFor(n || activeKey());
}

function setAvatar(id){
  if (!FACE_BY[id]) return { ok:false, why:'unknown' };
  if (!ownsFace(id)) return { ok:false, why:'locked', level:FACE_BY[id].lvl };
  var p = root();
  p.av = id;
  commit();
  if (window.KARTI_SFX){ try { KARTI_SFX.play('ui.toggle'); } catch (e){} }
  fire(equipCbs, { slot:'karti.avatar', game:'karti', id:id, def:FACE_BY[id] });
  repaintAvatars();
  return { ok:true, id:id };
}

/* Somebody else's face — the leaderboard, the lobby, the seat opposite.
   Their choice is not on this phone, so it is derived from their name,
   which at least means the same person is always the same face to
   everybody. If a future relay build echoes an `av` field back with
   the board rows, avatarFor() will prefer it; passing it costs one
   field in the push and nothing if the server ignores it. */
function avatarFor(name, hint){
  if (hint && FACE_BY[hint]) return hint;
  var me = '';
  try { if (window.KARTI && KARTI.displayName) me = KARTI.displayName(); } catch (e){}
  if (name && me && String(name).toLowerCase() === String(me).toLowerCase()) return avatar();
  return defaultFaceFor(name);
}

/* Drawn by js/progress-ui.js, which owns the sprite. With the UI file
   missing this still returns something wearable — the initial in the
   same medallion — so no caller has to check. */
function avatarHTML(name, opts){
  if (UI && typeof UI.avatarHTML === 'function') return UI.avatarHTML(name, opts);
  var ch = String(name || '?').replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '?';
  var sz = (opts && opts.size) || 38;
  return '<span class="kx-av-fallback" aria-hidden="true" style="width:' + sz + 'px;height:' + sz +
         'px;border-radius:' + Math.round(sz * 0.27) + 'px;display:inline-grid;place-items:center;' +
         'background:#241A3E;color:#FFC542;font-weight:900">' + ch + '</span>';
}
function repaintAvatars(){
  try { if (UI && typeof UI.repaintAvatars === 'function') UI.repaintAvatars(); } catch (e){}
}

/* ═══════════════════════════════════════════════════════════════════
   9. THE FUNNELS
   Every hook below reads somebody else's existing report. Not one game
   file had to learn a new call, and a game that reports twice is paid
   once.
   ═══════════════════════════════════════════════════════════════════ */

/* js/stats.js calls this itself after a COUNTED result — see the four
   lines added there. Anything the record book counts, we pay for. */
function fromStats(game, opts){
  award(game, opts && opts.result, {
    id: opts && opts.id, ms: opts && opts.ms,
    table: opts && opts.table
  });
}

/* ── KARTI_PARTY.record(id, 'w'|'l'|'d') ──
   chess, dama, IL-KIRI and (via js/klabb.js) bixkla, briscola, sette
   and cheat all pass through here. Wrapped rather than edited: those
   files belong to other people and a wrapper cannot break their
   ledger, because the original runs first and its return value is
   handed straight back. */
function wrapRecorder(obj, name, tag){
  if (!obj || typeof obj[name] !== 'function' || obj[name].__kx) return false;
  var orig = obj[name];
  var wrapped = function(id, outcome){
    var r = orig.apply(this, arguments);
    try { award(String(id || '').toLowerCase(), outcome, { via:tag }); } catch (e){}
    return r;
  };
  wrapped.__kx = 1;
  try { obj[name] = wrapped; } catch (e){ return false; }
  return true;
}

/* ── KARTI_PARTY.ui.frame({title}) / .result(ctx, {tone}) ──
   SKARTA keeps its own ledger and reports to nobody, so without this
   the one game with the best result screen in the box would pay
   nothing. frame() is the only place a party game says what it is
   called, so the title is remembered when the board is built and read
   back when the result card goes up. Anything already paid for by
   record() a moment earlier is caught by fresh() and not paid twice. */
var lastFrame = { title:'', at:0 };

function titleToGame(title){
  title = String(title || '').toLowerCase();
  if (!title) return '';
  var shelf = [];
  try { if (window.KARTI_STATS && KARTI_STATS.GAMES) shelf = KARTI_STATS.GAMES; } catch (e){}
  var i;
  for (i = 0; i < shelf.length; i++){
    var n = String(shelf[i].name || '').toLowerCase();
    if (n && (title === n || title.indexOf(n) === 0)) return shelf[i].id;
  }
  /* the shelf in js/stats.js has no tombla row (it is an unknown id
     there too), and IL-KIRI is written several ways */
  if (title.indexOf('tombla') === 0) return 'tombla';
  if (title.indexOf('kiri') >= 0) return 'kiri';
  if (title.indexOf('skarta') >= 0) return 'skarta';
  return '';
}

function wrapPartyUI(){
  var P = window.KARTI_PARTY;
  if (!P || !P.ui) return false;
  var done = 0;
  if (typeof P.ui.frame === 'function' && !P.ui.frame.__kx){
    var of = P.ui.frame;
    var wf = function(o){
      try { lastFrame = { title:(o && o.title) || '', at:Date.now() }; } catch (e){}
      return of.apply(this, arguments);
    };
    wf.__kx = 1; P.ui.frame = wf; done++;
  }
  if (typeof P.ui.result === 'function' && !P.ui.result.__kx){
    var or = P.ui.result;
    var wr = function(ctx, o){
      var r = or.apply(this, arguments);
      try {
        var g = titleToGame(lastFrame.title);
        var tone = o && o.tone;
        if (g && tone) award(g, tone === 'win' ? 'w' : tone === 'draw' ? 'd' : 'l', { via:'party-ui' });
      } catch (e){}
      return r;
    };
    wr.__kx = 1; P.ui.result = wr; done++;
  }
  return done > 0;
}

/* ── the card duel ──
   js/game.js emits {type:'over'} through onDuelEvent for all four
   modes, and D.mode says which one, so one hook covers the solo duel,
   story mode, pass-and-play and an online match. The line that calls
   this lives in js/game.js; everything it needs to decide is here. */
function duelOver(ev){
  try {
    var D = window.KARTI && KARTI.D;
    if (!D) return;
    var mode = D.mode || 'solo';
    var game = mode === 'story' ? 'cards-story'
             : (mode === 'online' || mode === 'pnp') ? 'cards-mp'
             : 'cards-solo';
    var res = ev && ev.winner === 0 ? 'w' : 'l';
    /* turnCount is the honest length of a duel and every duel has one,
       so a two-turn deck-out cannot pay like a twenty-turn game even
       when nobody passed a clock */
    var ms = Math.max(1, (D.turnCount | 0)) * 14000;
    award(game, res, { ms: ms });
  } catch (e){}
}

/* ═══════════════════════════════════════════════════════════════════
   10. BOOT
   ═══════════════════════════════════════════════════════════════════ */
var UI = null;                   /* filled by js/progress-ui.js        */

/* The wrappers are applied on load and re-checked a few times: this
   file loads after party.js, klabb.js and the rest, but a module that
   replaces its own export later (or a deploy that reorders the loader)
   must not quietly cost the player every party game's XP. Cheap, and
   it stops after twelve seconds. */
function wireAll(){
  var ok = 0;
  ok += wrapRecorder(window.KARTI_PARTY, 'record', 'party') ? 1 : 0;
  ok += wrapRecorder(window.KARTI_KLABB, 'record', 'klabb') ? 1 : 0;
  ok += wrapPartyUI() ? 1 : 0;
  return ok;
}
wireAll();
var tries = 0;
var wireT = setInterval(function(){ wireAll(); if (++tries > 12) clearInterval(wireT); }, 1000);

/* A profile switch has to move the ladder with it. Nothing is cached,
   so the only thing to reset is the in-memory repeat guard and the
   painted faces. */
var lastKey = activeKey();
setInterval(function(){
  var k = activeKey();
  if (k !== lastKey){ lastKey = k; recent.length = 0; repaintAvatars(); }
}, 2500);

/* ── the way in ───────────────────────────────────────────────────
   index.html and most of js/game.js belong to other people, so any
   button that opens the customisation screen is pure markup:
     <button data-karti-xp>Customise</button>
     <button data-karti-xp="avatar">Change your face</button>
   Delegated on the document, so it works for a button painted long
   after this file ran — which is every screen in this game. */
document.addEventListener('click', function(ev){
  var t = ev.target;
  var b = t && t.closest ? t.closest('[data-karti-xp]') : null;
  if (!b) return;
  ev.preventDefault();
  var what = (b.getAttribute('data-karti-xp') || '').toLowerCase();
  if (what === 'avatar' || what === 'face') pickAvatar();
  else open(what || '');
});

function open(tab){
  if (UI && typeof UI.open === 'function') return UI.open(tab);
  try { if (window.KARTI && KARTI.toast) KARTI.toast('The customisation screen did not load. Try reopening the app.'); } catch (e){}
}
function pickAvatar(opts){
  if (UI && typeof UI.pickAvatar === 'function') return UI.pickAvatar(opts || {});
  return open('karti');
}

/* ═══════════════════════════════════════════════════════════════════
   11. THE API
   The shape below was fixed before either half of this was written, so
   the file that draws a pink chess board and the file that keeps the
   ladder could be built at the same time.
   ═══════════════════════════════════════════════════════════════════ */
window.KARTI_XP = {
  VERSION: 1,
  MAX_LEVEL: MAX_LEVEL,

  /* where the player is */
  level: level,
  xp: xpTotal,
  xpInto: xpInto,
  xpNeeded: xpNeeded,
  atMax: atMax,
  progress: function(){
    var n = xpNeeded();
    return n ? Math.max(0, Math.min(1, xpInto() / n)) : 1;
  },

  /* one match, one payment */
  award: award,

  /* a game declares its kit */
  register: register,
  forGame: forGame,
  defs: defsAll,
  defsFor: defsFor,
  def: function(id){ return DEFS[id] || null; },
  games: gamesWithKit,
  nextUnlock: nextUnlock,
  unlocksAt: unlocksAt,

  /* wearing it */
  owns: owns,
  equip: equip,
  equipped: equipped,
  equippedDef: equipDef,
  unequip: unequip,

  /* listeners */
  onLevel: onLevel,
  onUnlock: onUnlock,
  onEquip: onEquip,
  onAward: onAward,

  /* the screens */
  open: open,
  pickAvatar: pickAvatar,

  /* faces */
  faces: faces,
  face: faceDef,
  ownsFace: ownsFace,
  avatar: avatar,
  setAvatar: setAvatar,
  avatarFor: avatarFor,
  avatarHTML: avatarHTML,

  /* the economy, readable — the inventory quotes it and so does
     docs/PROGRESSION.md's generator */
  ECON: {
    WEIGHT: WEIGHT, RESULT: RESULT, TAPER: TAPER, FIRST_WIN: FIRST_WIN,
    SPEED_FLOOR: SPEED_FLOOR, MAX_LEVEL: MAX_LEVEL,
    need: need, cum: function(L){ return CUM[L] || 0; }, payout: payout,
    par: par, weight: weight, levelFromXp: levelFromXp
  },

  /* the funnels — called by the four lines added elsewhere */
  _fromStats: fromStats,
  duelOver: duelOver,

  /* the reward screen, for a game that wants to hand it the standings
     rather than let it work them out: KARTI_XP.finish({game, result,
     table:[{name,score,you}]}) */
  finish: function(o){
    o = o || {};
    return award(o.game, o.result, o);
  },

  /* test hooks only */
  _ui: function(u){ UI = u; },
  _state: function(){ return root(); },
  _reset: function(){
    var p = root(), k;
    for (k in blank()) p[k] = blank()[k];
    recent.length = 0;
    commit();
  },
  _wire: wireAll,
  _defaultFaceFor: defaultFaceFor
};

})();
