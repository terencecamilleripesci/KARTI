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
   games for the first level, about nine hundred for level 20 — and a
   ladder that now runs to 50. The first 25 are untouched (nobody's
   level moved when the ceiling did); past 25 the climb goes LINEAR,
   not quadratic, because the quadratic's own slope at 24 (~120 XP a
   level of growth) would have made 26-50 a seven-year wall. Linear at
   +95 keeps "the next one is a bit more than the last one" true and
   keeps a level landing every few party nights deep into the ladder.
   The top half is aspirational on purpose — he asked for XP kept low
   so people grind — but every level on it pays, and the games hang
   cosmetics off the whole run so no stretch is empty.
   ═══════════════════════════════════════════════════════════════════ */

var MAX_LEVEL = 50;

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
     L1 → 110  ·  L5 → 232  ·  L10 → 478  ·  L20 → 1286  ·  L25 → 1848
     L30 → 2323  ·  L40 → 3273  ·  L49 → 4128
   Quadratic to 25, LINEAR after. Quadratic, not exponential, for the
   first half: the top is a long climb but it is not a wall you can see
   from level three. Past 25 the quadratic's own growth (~120 more XP
   per level, and rising) would have turned the new half of the ladder
   into a wall nobody climbs, so the second half keeps the quadratic's
   exit slope frozen: every level is 95 XP dearer than the last, which
   is a whisker LESS than the step from 24 to 25 was. "The next one is
   a bit more than the last one" stays true at every rung and the deep
   ladder stays reachable by somebody who simply keeps playing.
   The 110 is measured, not guessed: a real mixed player earns about
   13-14 XP a game (see docs/PROGRESSION.md), so the first level is
   about eight games, which is the number he was promised. */
var TURN_LEVEL = 25;               /* where quadratic hands over        */
var TURN_NEED = 110 + 22 * 24 + Math.round(2.1 * 24 * 24);   /* 1848   */
var LINEAR_STEP = 95;
function need(L){
  L = L | 0;
  if (L < 1) L = 1;
  if (L >= MAX_LEVEL) return Infinity;
  var d = L - 1;
  if (L < TURN_LEVEL) return 110 + 22 * d + Math.round(2.1 * d * d);
  return TURN_NEED + LINEAR_STEP * (L - TURN_LEVEL);
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
  /* pv is the version of THIS player's photograph on the relay, or 0
     for "no photo". THE IMAGE ITSELF IS NOT IN HERE AND MUST NEVER
     BE. server/karti_server.py caps one save at 128 KB, shared with
     two hundred cards, every deck and the whole story — and, far more
     to the point, a picture that lives in a save only ever reaches
     that player's own phones, which is no use whatsoever to a
     leaderboard, a lobby roster or the seat opposite. The bytes live
     on the Pi; this is only the pointer, and it costs one integer. */
  return { v:1, xp:0, av:'', pv:0, usePic:0,
           eq:{}, own:{}, day:'', n:{}, fw:{}, last:{}, seen:[], seenAv:0 };
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
  if (typeof p.pv !== 'number' || !isFinite(p.pv) || p.pv < 0) p.pv = 0;
  p.pv = Math.floor(p.pv);
  p.usePic = p.usePic ? 1 : 0;
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
        accent: typeof d.accent === 'string' ? d.accent : '',
        /* THE COLLECTION. A cosmetic can belong to a named set that
           runs ACROSS games — the summer collection is one board, one
           felt, one dice set and a dozen more, and the only thing that
           makes them a collection rather than fifteen unrelated items
           is this string. It is deliberately a free-form tag and not
           an enum: a set is a curatorial idea, not a schema, and the
           shop groups by whatever it finds rather than by a list this
           file would have to be edited to extend. */
        set: (typeof d.set === 'string' && /^[a-z][a-z0-9-]{0,23}$/i.test(d.set))
               ? d.set.toLowerCase() : '',
        /* EARNED, not levelled. A def with an `earn` is not on the
           ladder at all — no amount of XP produces it, you have to go
           and do the thing. That is what "exclusive" actually means,
           and it is why these two are the only cosmetics in the set
           whose level is meaningless. {how: one sentence, test: fn} */
        earn: (d.earn && typeof d.earn.test === 'function')
                ? { how:String(d.earn.how || ''), test:d.earn.test,
                    /* asked every time and never remembered — see owns() */
                    live:!!d.earn.live } : null
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
  var p = root();
  /* A LIVE test is asked every single time and is never written down.
     "Once earned, always yours" is right for an achievement — a streak
     border must survive the eleventh game being a loss — but it is
     exactly wrong for an identity one. Tempesta is owned by WHO YOU
     ARE, not by what you did, so the moment that stops being true it
     has to stop being yours; a sticky answer would leave it sitting in
     the wardrobe of the next person to sign in on the same phone, and
     a one-of-a-kind item that two people have is not one. */
  if (d.earn && d.earn.live){
    try { return !!d.earn.test(); } catch (e){ return false; }
  }
  /* once earned, always yours — the test is run until it passes and
     then the answer is written down, so a border won with a ten-game
     streak is not taken away by the eleventh game being a loss */
  if (p.own[id]) return true;
  if (d.earn){
    var got = false;
    try { got = !!d.earn.test(); } catch (e){ got = false; }
    if (got){
      p.own[id] = 1;
      commit();
      fire(unlockCbs, { earned:true, level:level(), unlocked:[d] });
      return true;
    }
    return false;
  }
  if (d.level <= 1) return true;
  return level() >= d.level;
}

/* ── grant(id) — THE ONLY WAY TO BE GIVEN SOMETHING ────────────────
   A cosmetic can arrive three ways: the ladder pays it out, an `earn`
   test passes, or somebody is GIVEN it — which today means the shop in
   js/game.js sold it. That third way had no door, so the shop was
   reaching through _state() and writing own[id] by hand: a test hook
   doing production work, and a permanent coupling to the private shape
   of this object. The next rename of `own` would have broken paid
   purchases silently. So here is the door.

   THREE THINGS IT WILL NOT DO, and they are the whole point:

   1. IT WILL NOT GRANT AN EARNED ITEM. Tempesta, the ten-in-a-row
      border and the Story ring mean exactly one thing — that somebody
      went and did the thing. An item that can be bought is not that
      item any more. The shop already refuses to stock them; this
      refuses to hand them over even if it forgets, because the
      guarantee belongs to the ladder, not to the till.
   2. IT WILL NOT INVENT AN ID. An unknown id writes a key nobody will
      ever read and the buyer gets nothing for their coins.
   3. IT WILL NOT ANNOUNCE. A level-up fires unlockCbs and the reward
      screen throws the whole ceremony — light, a sound, "something new
      on the shelf". That ceremony is the PAYOFF FOR PLAYING, and
      spending coins has its own feedback at the till. Firing it here
      would let anybody buy the feeling of levelling up, which is
      exactly the feeling this file exists to protect. So a purchase
      fires equipCbs only: the wardrobe repaints and the counts move,
      and nothing pretends you earned it.

   Idempotent by construction: already owned, or free to begin with,
   comes back {ok:true, already:true} — never an error, and never a
   second write, so a double-tapped buy button cannot double-charge. */
function grant(id){
  var d = DEFS[String(id == null ? '' : id)];
  if (!d) return { ok:false, why:'unknown' };
  if (d.earn) return { ok:false, why:'earned', how:d.earn.how };
  var p = root();
  if (p.own[d.id]) return { ok:true, already:true, id:d.id, def:d };
  /* free from the first minute — there is nothing to give */
  if (d.level <= 1) return { ok:true, already:true, free:true, id:d.id, def:d };
  p.own[d.id] = 1;
  commit();
  /* the pointer to it lives in the save, so push it the way a photo
     change does rather than waiting for the next scheduled sync — a
     thing you paid for must not vanish on the other phone */
  syncNow();
  fire(equipCbs, { granted:true, id:d.id, slot:d.key, game:d.game, def:d });
  return { ok:true, id:d.id, def:d };
}

/* The earned ones have to be CHECKED, or a player who does the thing
   only finds out next time they open the wardrobe. Run after every
   award — once a game, and only over the handful of defs that have an
   `earn` at all. owns() does the writing and the announcing. */
function sweepEarned(){
  var i, list = ORDER;
  for (i = 0; i < list.length; i++){
    var d = DEFS[list[i]];
    if (d && d.earn && !root().own[d.id]) owns(d.id);
  }
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

    sweepEarned();
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
  /* ── the eight you start with ── */
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
  { id:'suq',    name:'Tas-Suq',         lvl:0, ax:'#FF9E2C',
    blurb:'"Fresh this morning." It was fresh yesterday morning. Buy it anyway.' },
  { id:'parrukkiera', name:'Il-Parrukkiera', lvl:0, ax:'#FF8FA0',
    blurb:'The wash is optional. The news is not.' },
  { id:'talhanut', name:'Tal-Ħanut',     lvl:0, ax:'#3DDC84',
    blurb:'Sells bread, milk, and everything she knows about you.' },

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
  { id:'zija',   name:'Iż-Żija',         lvl:7,  ax:'#FF7A5C',
    blurb:'"And when is YOUR wedding?" Wrong answer. All answers are wrong.' },
  { id:'qarnita',name:'Il-Qarnita',      lvl:8,  ax:'#FF5468',
    blurb:'Eight arms, eight problems, one very small rock pool.' },
  { id:'bandist',name:'Il-Bandist',      lvl:10, ax:'#FFC542',
    blurb:'In tune by the third street. Mostly.' },
  { id:'kuntrat',name:'Il-Kuntrattur',   lvl:12, ax:'#D8C79B',
    blurb:'Started in March. It is November. "Next week, sur."' },
  { id:'surmastra', name:'Is-Surmastra', lvl:13, ax:'#4FA9E8',
    blurb:'Retired twenty years. You will still stand up straighter.' },
  { id:'ministru',name:'Il-Ministru',    lvl:14, ax:'#B7A8E0',
    blurb:'Promises everything, delivers nothing, somehow still winning.' },
  { id:'papocc', name:'Il-Papoċċ',       lvl:17, ax:'#FF8FA0',
    blurb:'Accurate from ten metres. Never misses. You will apologise.' },
  { id:'gharusa',name:'L-Għarusa',       lvl:18, ax:'#F2E4C4',
    blurb:'Two hundred guests, one seating plan, zero mercy.' },
  { id:'petard', name:'Il-Petardist',    lvl:20, ax:'#FF9E2C',
    blurb:'Louder than the band. Deafer than the band.' },
  { id:'kampjun',name:'Il-Kampjun',      lvl:25, ax:'#FFE9B0',
    blurb:'Twenty-five levels. Somebody has been extremely busy.' },
  { id:'lottu',  name:'Tal-Lottu',       lvl:27, ax:'#8A5CFF',
    blurb:'Same numbers since 1998. She fills in the slip without asking.' },
  { id:'kantanta', name:'Il-Kantanta',   lvl:35, ax:'#FFC542',
    blurb:'Nobody asked. She is on the second verse already.' },
  { id:'sindku', name:'Is-Sindku',       lvl:42, ax:'#FFD979',
    blurb:'Won by nine votes. Remembers all nine names.' }
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
   THIS IS describe() AND NOTHING ELSE. It used to be its own copy of
   the who-is-this logic, which is exactly the kind of second answer
   that let three avatar surfaces disagree in one day; now it is a
   convenience spelling of the one answer and cannot drift from it. */
function avatarFor(name, hint){
  return describe(name, { hint: hint }).face;
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
function repaintAvatars(root){
  try { if (UI && typeof UI.repaintAvatars === 'function') UI.repaintAvatars(root); } catch (e){}
}

/* ═══════════════════════════════════════════════════════════════════
   8b. THE PHOTOGRAPH
   "Anyone can upload one photo there choice boss."

   ONE PHOTO PER ACCOUNT, ON THE PI, NOT IN THE SAVE. A picture in the
   save blob would only ever reach that player's own phones; the whole
   point of a face is that other people see it, so the bytes go to the
   relay and everything else here is a pointer to them:

     POST   /karti/avatar        {token, img}  -> {ok, ver}
     GET    /karti/avatar/<who>?v=<ver>        -> the bytes, or 404
     DELETE /karti/avatar        {token}       -> {ok}

   `ver` increments on every change and is published beside a player's
   name, so a URL carrying it can be cached hard and can never be
   stale. It is also the thing that makes a missing photo FREE: no
   ver, no request. A leaderboard of twenty-five players with no
   photos makes zero avatar requests, not twenty-five 404s.

   THE DRAWN FACE IS THE TRUTH ON THE PHONE. His relay is unreachable
   from his own devices most of the time — a public https page cannot
   open a connection to a private address at all — so every avatar in
   this app is finished before any photograph is fetched, and the
   picture is mounted over it only after a real load event. There is
   no path here that shows a broken image, and there is no path that
   leaves somebody without a face because the Pi was off.
   ═══════════════════════════════════════════════════════════════════ */
var PIC_MAX_CHARS = 20000;       /* data-URL ceiling. A 128x128 JPEG at
                                    q0.7 lands near 7 KB ≈ 9500 chars,
                                    so this is generous — but it is a
                                    HARD stop, and the upload refuses
                                    with a sentence rather than posting
                                    four megabytes over a funnel. */
var PIC_SIDE = 128;
var PIC_Q = [0.7, 0.6, 0.5, 0.42];

/* Same derivation as js/stats.js's baseURL(), off the one login that
   js/sync.js already owns. There is no second copy of a server
   address and no second copy of a token. */
function picBase(){
  var u = '';
  try {
    if (window.KARTI_SYNC && typeof KARTI_SYNC.baseURL === 'function') u = KARTI_SYNC.baseURL() || '';
  } catch (e){}
  if (u) return u.replace(/\/acct$/i, '') + '/avatar';
  if (location.protocol === 'http:' && location.hostname)
    return 'http://' + location.hostname + ':8101/karti/avatar';
  return 'https://raspberrypi.silverside-tench.ts.net:8443/karti/avatar';
}

function session(){
  var s = null;
  try { s = lsGet('karti_sync_' + activeKey(), null); } catch (e){}
  if (!s || typeof s !== 'object' || typeof s.tok !== 'string' || !s.tok) return null;
  return s;
}

/* A photo is keyed to an account, so a guest cannot have one. That is
   not hidden — js/progress-ui.js says so and offers the account,
   because "make one and your face follows you" is a better reason to
   sign up than anything on the sign-up screen. */
function canPhoto(){ return !!session(); }

/* THE NAME THE PHOTO IS FILED UNDER IS THE ACCOUNT, NOT THE PROFILE.
   A local profile and a cloud account are two different things with two
   different names — you can make an account called "terence" from a profile
   called anything at all, and the relay files the photograph under the
   ACCOUNT (lower-cased). Building the URL from the profile key therefore
   asked the Pi for a player that does not exist, got a 404, and fell back to
   the drawn face — with the photograph sitting on the server the whole time,
   uploaded perfectly, reachable by everybody except its owner.
   The session carries the account key as `u`; use it, and only fall back to
   the profile key when there is no account (where a photo is impossible
   anyway, so the fallback can never be wrong). */
function accountKey(){
  var s = session();
  if (s && typeof s.u === 'string' && s.u) return s.u;
  /* signed out on this device leaves a residue with the name but no token —
     still the right key for a photo that is still on the Pi */
  try {
    var r = lsGet('karti_sync_' + activeKey(), null);
    if (r && typeof r.u === 'string' && r.u) return r.u;
  } catch (e){}
  return activeKey();
}

function picURL(who, ver){
  if (!who || !ver) return '';
  return picBase() + '/' + encodeURIComponent(String(who)) + '?v=' + (ver | 0);
}

/* My own photo, kept as a data URL in a key of ITS OWN — deliberately
   not in the save, so it can never count against the 128 KB the Pi
   allows a save and can never be pushed anywhere. It exists so my own
   face is instant and correct with no network at all; for everybody
   else's, the relay is the only source. */
function myPicKey(){ return 'karti_pic_' + activeKey(); }
function myPic(){
  var p = root();
  if (!p.pv || !p.usePic) return '';
  var v = lsGet(myPicKey(), null);
  return (v && typeof v.img === 'string' && v.ver === p.pv) ? v.img : '';
}

/* ── decoding, and the two things that actually go wrong ──
   ORIENTATION. Photos off a phone carry an EXIF rotation and a canvas
   does not honour it for free; drawing one straight gives a sideways
   face, which is the single likeliest way this feature fails on his
   first try. createImageBitmap(blob,{imageOrientation:'from-image'})
   is the clean route. The <img> fallback is not a guess either: every
   engine this app runs on now defaults to image-orientation:from-image
   for <img>, so naturalWidth/Height and drawImage are both already
   rotated.
   HEIC. iOS hands out .heic and Safari decodes it in an <img> — which
   is exactly the fallback path — so a canvas round-trip converts it to
   JPEG for us. Chrome on Android cannot decode HEIC at all, and both
   paths fail; that is not guessed at either, it is caught and said out
   loud in a sentence. */
function decode(file){
  return new Promise(function(resolve, reject){
    var done = false;
    function viaImg(){
      var url = '', im = new Image();
      try { url = URL.createObjectURL(file); } catch (e){ reject('read'); return; }
      im.onload = function(){
        if (done) return; done = true;
        try { URL.revokeObjectURL(url); } catch (e){}
        if (!im.naturalWidth || !im.naturalHeight) return reject('format');
        resolve(im);
      };
      im.onerror = function(){
        if (done) return; done = true;
        try { URL.revokeObjectURL(url); } catch (e){}
        reject('format');
      };
      im.src = url;
    }
    if (typeof createImageBitmap === 'function'){
      var pr = null;
      try { pr = createImageBitmap(file, { imageOrientation:'from-image' }); } catch (e){ pr = null; }
      if (pr && pr.then){
        pr.then(function(b){ if (!done){ done = true; resolve(b); } }, function(){ if (!done) viaImg(); });
        return;
      }
    }
    viaImg();
  });
}

/**
 * shrink(file) -> Promise<{img, bytes, w}>
 * Centre-crop to a square, down to 128x128, JPEG. Quality is stepped
 * down and then the side after that, because a picture that will not
 * fit must come back smaller rather than come back refused.
 */
function shrink(file){
  return decode(file).then(function(src){
    var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    if (!w || !h) throw 'format';
    var side = Math.min(w, h);
    var sx = Math.floor((w - side) / 2), sy = Math.floor((h - side) / 2);
    var out = '', px = PIC_SIDE, qi, tries = 0;
    for (px = PIC_SIDE; px >= 80; px -= 24){
      var c = document.createElement('canvas');
      c.width = c.height = px;
      var g = c.getContext('2d');
      if (!g) throw 'canvas';
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, sx, sy, side, side, 0, 0, px, px);
      for (qi = 0; qi < PIC_Q.length; qi++){
        tries++;
        var d = c.toDataURL('image/jpeg', PIC_Q[qi]);
        if (d.length <= PIC_MAX_CHARS){ out = d; break; }
      }
      if (out) break;
    }
    try { if (src.close) src.close(); } catch (e){}
    if (!out) throw 'toobig';
    return { img:out, chars:out.length, bytes:Math.round(out.length * 0.75), tries:tries };
  });
}

function post(route, body, method){
  var ctrl = null, timer = null;
  try { ctrl = new AbortController(); } catch (e){}
  var o = { method: method || 'POST', headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify(body || {}), credentials:'omit', cache:'no-store', mode:'cors' };
  if (ctrl){ o.signal = ctrl.signal; timer = setTimeout(function(){ try { ctrl.abort(); } catch (e){} }, 20000); }
  return fetch(picBase() + (route || ''), o).then(function(r){
    return r.text().then(function(t){
      var j = null; try { j = JSON.parse(t); } catch (e){}
      return { status:r.status, d: j || {} };
    });
  }).then(function(r){
    if (timer) clearTimeout(timer);
    if (r.status >= 200 && r.status < 300) return { ok:true, d:r.d };
    return { ok:false, status:r.status, why:r.d.why || '' };
  }, function(){ if (timer) clearTimeout(timer); return { ok:false, status:0, offline:true }; });
}

/* A SERVER STRING IS NOT A SENTENCE FOR A PERSON. The relay answers a
   route it does not have with things like "GET only." — which is
   perfectly true and completely useless to somebody who has just
   picked a photo of themselves. Every failure is turned into a
   sentence here, by status, and the two that will actually happen are
   the two that read best:
     · the Pi is unreachable, which is the normal state of affairs from
       his own phone, and
     · the Pi is reachable but is an OLDER BUILD with no photo routes
       on it yet — which is exactly where this lands until the relay is
       restarted, so it says so instead of blaming the picture. */
function sayWhy(res){
  if (res.offline || !res.status)
    return 'Cannot reach the Pi from here, so the photo has nowhere to go yet. ' +
           'Your drawn face still works everywhere.';
  var st = res.status;
  if (st === 404 || st === 405 || st === 501 || st === 400)
    return 'This Pi does not do photos yet — it needs the newer server. ' +
           'Your drawn face works everywhere in the meantime.';
  if (st === 401 || st === 403)
    return 'This phone is not signed in to the Pi any more. Log in again, then try the photo.';
  if (st === 413) return 'The server says that picture is still too big.';
  if (st === 415) return 'The server would not take that kind of picture.';
  if (st === 429) return 'Too many tries at once. Give it a minute.';
  return 'The server would not take that picture.';
}

/**
 * uploadPhoto(file) -> Promise<{ok, ver, bytes, why}>
 * Never throws. Every failure comes back as a sentence a person can
 * read, because "it did not work" on a photo somebody just chose of
 * themselves is the worst possible answer.
 */
/* Push the save the moment the face changes, rather than waiting for the next
   scheduled sync. The photograph's BYTES live on the Pi, but the pointer to
   them — pv, and whether it is in use — lives in the save, so without this a
   player who set or removed a photo on one phone would keep seeing the old one
   on the other until something else happened to trigger a push. Fire and
   forget: it is a convenience, and a failed push must never make setting your
   own face look broken. */
function syncNow(){
  try {
    if (window.KARTI_SYNC && typeof KARTI_SYNC.push === 'function')
      Promise.resolve(KARTI_SYNC.push({ quiet:true })).catch(function(){});
  } catch (e){}
}

function uploadPhoto(file){
  var s = session();
  if (!s) return Promise.resolve({ ok:false, why:'You need an account for a photo — it is kept for you, not on this phone.' });
  if (!file) return Promise.resolve({ ok:false, why:'No picture was chosen.' });
  return shrink(file).then(function(r){
    return post('', { tok:s.tok, token:s.tok, img:r.img }).then(function(res){
      if (!res.ok) return { ok:false, bytes:r.bytes, why: sayWhy(res) };
      var ver = (res.d && res.d.ver) | 0;
      if (!ver) ver = (root().pv | 0) + 1;
      var p = root();
      p.pv = ver; p.usePic = 1;
      commit();
      lsSet(myPicKey(), { ver:ver, img:r.img });
      fire(equipCbs, { slot:'karti.avatar', game:'karti', id:'photo', photo:true });
      repaintAvatars();
      syncNow();
      return { ok:true, ver:ver, bytes:r.bytes, chars:r.chars };
    });
  }, function(why){
    var msg = why === 'toobig' ? 'That picture will not shrink small enough. Try a different one.'
            : why === 'format' ? 'This phone cannot read that picture. A JPEG or a PNG will work.'
            : why === 'canvas' ? 'This browser will not let the app resize a picture.'
            : 'That picture could not be read.';
    return { ok:false, why:msg };
  });
}

/* Back to a drawn face. The Pi is told, but a delete that cannot reach
   it still takes the photo off THIS phone — refusing to undo a choice
   because a server is off is the wrong way round. */
function removePhoto(){
  var p = root();
  p.usePic = 0; p.pv = 0;
  commit();
  try { localStorage.removeItem(myPicKey()); } catch (e){}
  repaintAvatars();
  var s = session();
  if (s) post('', { tok:s.tok, token:s.tok }, 'DELETE');
  fire(equipCbs, { slot:'karti.avatar', game:'karti', id:avatar(), photo:false });
  syncNow();
  return { ok:true };
}

function usePhoto(on){
  var p = root();
  if (on && !p.pv) return { ok:false, why:'no-photo' };
  p.usePic = on ? 1 : 0;
  commit();
  repaintAvatars();
  return { ok:true };
}

/* ═══════════════════════════════════════════════════════════════════
   8c. WHO SOMEBODY LOOKS LIKE
   One descriptor, used by every avatar this app draws: the face, the
   ring round it, and the photograph if there is one to be had. Built
   here rather than at each call site so the leaderboard, the lobby
   roster and a seat plate cannot disagree about what a player looks
   like.
   ═══════════════════════════════════════════════════════════════════ */
function describe(name, opts){
  var o = opts || {};
  var me = '';
  try { if (window.KARTI && KARTI.displayName) me = KARTI.displayName(); } catch (e){}
  var mine = o.me === true ||
             (!o.who && name && me && String(name).toLowerCase() === String(me).toLowerCase());

  if (mine){
    var p = root();
    /* An explicit border/pic wins over what is equipped. A caller that asks for
       a specific one — the customisation previews, a picker tile, anything
       showing what a border WOULD look like — was silently given the equipped
       one instead, so every preview drew the same ring and choosing looked
       broken. `face` was already honoured; the other two were not, which is the
       kind of asymmetry that only shows up once somebody tries to preview. */
    return {
      face: o.face || avatar(),
      border: bareBorder(o.border || equipped('border', 'karti')),
      lvb: bareBadge(o.lvb || equipped('badge', 'karti')),
      pic: (o.pv === 0) ? ''
         : (o.pv ? picURL(accountKey(), o.pv)
                 : ((p.usePic && p.pv) ? (myPic() || picURL(accountKey(), p.pv)) : '')),
      mine: true
    };
  }
  /* somebody else. Everything comes from what the relay published
     beside their name — and if it published nothing, they still have
     a face, because a stable hash of a name is a face and a blank
     circle is not. NO ver, NO request: a board of twenty-five people
     with no photos costs zero image loads, which is the whole reason
     the version number is worth carrying. */
  return {
    face: (o.hint && FACE_BY[o.hint]) ? o.hint : defaultFaceFor(name),
    border: (o.border && FACES_BORDER(o.border)) ? o.border : '',
    lvb: (o.lvb && FACES_BADGE(o.lvb)) ? o.lvb : '',
    pic: (o.who && o.pv) ? picURL(o.who, o.pv) : '',
    mine: false
  };
}
function FACES_BORDER(id){
  try { return !!(window.KARTI_FACES && KARTI_FACES.border(id)); } catch (e){ return false; }
}
/* A border is registered as the cosmetic id 'border.gold', because
   every cosmetic id in the registry is namespaced. The RING is drawn
   from the bare word — a CSS class, and a value small enough to put
   on the wire beside a player's name. One place converts, so the two
   can never drift. (They did once: the ladder equipped correctly and
   nothing appeared, because 'border.gold' is not a class name.) */
function bareBorder(id){
  if (!id) return '';
  var bare = String(id).replace(/^border\./, '');
  return FACES_BORDER(bare) ? bare : '';
}
function FACES_BADGE(id){
  try { return !!(window.KARTI_FACES && KARTI_FACES.badge(id)); } catch (e){ return false; }
}
function bareBadge(id){
  if (!id) return '';
  var bare = String(id).replace(/^badge\./, '');
  return FACES_BADGE(bare) ? bare : '';
}

/* ═══════════════════════════════════════════════════════════════════
   8d. THE BORDER LADDER
   Registered through the SAME register() every game uses, so a border
   is a cosmetic like any other and turns up in the inventory beside
   the chess boards with no special case anywhere in the UI.

   It is its own slot because a ring is not a face: it draws OVER
   whatever is underneath, which is what makes it work over a
   photograph as well as over a drawn face — and that is what makes
   the photo feature better rather than redundant.
   ═══════════════════════════════════════════════════════════════════ */
function bestStreakAnywhere(){
  var best = 0;
  try {
    var all = window.KARTI_STATS && KARTI_STATS.all ? KARTI_STATS.all() : {};
    for (var k in all) if (all[k] && all[k].bestStreak > best) best = all[k].bestStreak;
  } catch (e){}
  return best;
}
function storyDone(){
  try {
    var S = window.KARTI_STORY;
    if (!S || typeof S.clearedCount !== 'function' || !S.BOSSES) return false;
    return S.clearedCount() >= S.BOSSES.length && S.BOSSES.length > 0;
  } catch (e){ return false; }
}

/* ── THE ONE THAT IS NOT EARNED ────────────────────────────────────
   Tempesta belongs to the account that owns the game. The test is the
   signed-in account NAME, normalised — not the local device, because
   the whole point is that it follows him onto any phone he signs into,
   and not the display name, because that is free to change.

   ADMIN_NAMES is an exact list, not a prefix match: `startsWith` would
   hand a one-of-a-kind border to anybody who registered "terence2",
   which is precisely the failure a one-of-a-kind item cannot have. If
   his relay account turns out to be spelled differently, this list is
   the one line to change. */
var ADMIN_NAMES = { terence:1, terencecamilleri:1, terencecamilleripesci:1 };
function isAdmin(){
  try {
    var k = String(accountKey() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    /* an unsigned-in device falls back to a local key, which must never
       match — so a guest on his own phone does not inherit it */
    if (!k || !session()) return false;
    return !!ADMIN_NAMES[k];
  } catch (e){ return false; }
}

var EARN_TEST = { streak: function(){ return bestStreakAnywhere() >= 10; },
                  story:  storyDone,
                  admin:  isAdmin };
var EARN_HOW  = { streak: 'Win ten in a row in any one game',
                  story:  'Clear every boss in Story Mode',
                  admin:  'Not available. There is one, and it is spoken for.' };

function registerBorders(){
  var B = [];
  try { B = (window.KARTI_FACES && KARTI_FACES.BORDERS) || []; } catch (e){}
  if (!B.length) return 0;
  return register(B.map(function(b){
    return {
      id: 'border.' + b.id,
      game: 'karti',
      slot: 'border',
      name: b.name,
      blurb: b.blurb,
      level: b.lvl || 0,
      /* the one-of-one sorts last of all, below even the earned ones */
      sort: b.id === 'none' ? -1 : (b.solo ? 99 : (b.earn ? 90 : (b.lvl || 0))),
      earn: b.earn ? { how: EARN_HOW[b.earn], test: EARN_TEST[b.earn],
                       live: b.earn === 'admin' } : null,
      /* the preview is the border doing its actual job: a real
         medallion, wearing the player's own face, at the size the
         inventory draws it. Nothing to imagine. */
      preview: (function(id){
        return function(size){
          var el = document.createElement('span');
          try {
            el.innerHTML = KARTI_FACES.frame(avatar(), {
              size: size || 62, accent: (FACE_BY[avatar()] || {}).ax, border: id });
          } catch (e){}
          return el;
        };
      })(b.id)
    };
  }));
}

/* ── THE LEVEL-BOX LADDER ──────────────────────────────────────────
   The same register() again, one slot along. It exists because the
   border ladder alone is too coarse to grind against: twelve entries
   spread over twenty-five levels means long stretches with nothing
   coming, and the stretch between 20 and 25 is where a player decides
   the wardrobe is finished.

   This ladder is deliberately TIGHTER and deliberately OFFSET — 3, 6,
   9, 12, 16, 20, 24, 30 against the borders' 2, 4, 7, 10, 13, 16, 20,
   25 — so the two interleave and there is nearly always something four
   or five levels out. It is also the cheaper of the two to want: a
   border is how you look to the room, a level box is your own number,
   and people will grind for their own number.

   The preview is the real medallion wearing the player's real border,
   so what is being chosen is visible in the place it will live. */
function registerBadges(){
  var B = [];
  try { B = (window.KARTI_FACES && KARTI_FACES.BADGES) || []; } catch (e){}
  if (!B.length) return 0;
  return register(B.map(function(b){
    return {
      id: 'badge.' + b.id,
      game: 'karti',
      slot: 'badge',
      name: b.name,
      blurb: b.blurb,
      level: b.lvl || 0,
      sort: b.solo ? 99 : (b.earn ? 90 : (b.lvl || 0)),
      earn: b.earn ? { how: EARN_HOW[b.earn], test: EARN_TEST[b.earn],
                       live: b.earn === 'admin' } : null,
      preview: (function(id){
        return function(size){
          var el = document.createElement('span');
          try {
            /* a real level, not a placeholder: the box is drawn at the
               number the player actually has, because "how does MY
               level look in this" is the only question being asked.
               Floored at 1 so a brand-new player sees the box at all —
               lvHTML draws nothing for level 0. */
            el.innerHTML = KARTI_FACES.frame(avatar(), {
              size: size || 62, accent: (FACE_BY[avatar()] || {}).ax,
              border: bareBorder(equipped('border', 'karti')),
              lv: Math.max(1, level()), lvb: id });
          } catch (e){}
          return el;
        };
      })(b.id)
    };
  }));
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
    /* Report the duel through the record book, not straight into award():
       the card duel was the one game that paid XP here but never landed in
       js/stats.js, so a duel win or loss never showed on the profile and the
       account never went up on the leaderboard. record() forwards a COUNTED
       result back through _fromStats -> award(), so the XP is paid exactly
       as before and paid only once. If the record book is not loaded we still
       award directly, so a stripped build never loses the XP. */
    var booked = false;
    try {
      if (window.KARTI_STATS && KARTI_STATS.record){
        KARTI_STATS.record(game, { result: res, ms: ms });
        booked = true;
      }
    } catch (e){}
    if (!booked) award(game, res, { ms: ms });
  } catch (e){}
}

/* ═══════════════════════════════════════════════════════════════════
   10. BOOT
   ═══════════════════════════════════════════════════════════════════ */
var UI = null;                   /* filled by js/progress-ui.js        */

/* The wrappers are applied on load and re-checked on a timer: this file
   now loads BEFORE party.js and klabb.js (it moved up the loader so the
   home pill has a face on the frame home first paints), so the first
   pass finds nothing and the timer does the real wiring as those files
   land. It stands down the moment all three hooks are on, and gives a
   slow connection a full minute rather than twelve seconds — a phone
   that takes 20s to fetch party.js must not quietly lose party XP. */
registerBorders();
registerBadges();

function wireAll(){
  var ok = 0;
  ok += wrapRecorder(window.KARTI_PARTY, 'record', 'party') ? 1 : 0;
  ok += wrapRecorder(window.KARTI_KLABB, 'record', 'klabb') ? 1 : 0;
  ok += wrapPartyUI() ? 1 : 0;
  return ok;
}
function allWired(){
  try {
    return !!(window.KARTI_PARTY && KARTI_PARTY.record && KARTI_PARTY.record.__kx &&
              window.KARTI_KLABB && KARTI_KLABB.record && KARTI_KLABB.record.__kx &&
              KARTI_PARTY.ui && KARTI_PARTY.ui.result && KARTI_PARTY.ui.result.__kx);
  } catch (e){ return false; }
}
wireAll();
var tries = 0;
var wireT = setInterval(function(){
  wireAll();
  if (allWired() || ++tries > 60) clearInterval(wireT);
}, 1000);

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
  /* same rule as js/stats.js: going somewhere closes the sheet you
     went from, or it is left hanging over the destination */
  try { if (window.KARTI && KARTI.closeSheet) KARTI.closeSheet(); } catch (e){}
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
  /* the collections. defsInSet('summer') is every item in the summer
     set across every game; sets() is every set name that exists, in
     first-registration order, so a shop can build its shelves without
     being told what the shelves are. */
  defsInSet: function(name){
    name = String(name || '').toLowerCase();
    return defsAll().filter(function(d){ return d.set === name; });
  },
  sets: function(){
    var seen = {}, out = [], list = defsAll(), i;
    for (i = 0; i < list.length; i++)
      if (list[i].set && !seen[list[i].set]){ seen[list[i].set] = 1; out.push(list[i].set); }
    return out;
  },

  /* wearing it */
  owns: owns,
  /* being GIVEN it — the shop's door. grant(id) -> {ok, already, why}.
     Refuses an unknown id and refuses anything with an `earn`; never
     fires the level-up ceremony. See the note over the function. */
  grant: grant,
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
  /* the whole look of one player — face, ring and photograph — for a
     caller that draws its own box (a seat plate, the lobby roster):
       KARTI_XP.describe(name, {who, hint, border, pv})            */
  describe: describe,
  /* paint(root) — draw every avatar inside a node this file did not
     build, and mount any photographs that have arrived. The observer
     covers #app, #sheet and #modal on its own; this is for a caller
     that wants it NOW, or that renders into a detached node. */
  paint: function(root){ repaintAvatars(root); },

  /* the photograph. One per account, on the relay, never in the save. */
  photo: function(){ var p = root(); return (p.usePic && p.pv) ? (myPic() || picURL(accountKey(), p.pv)) : ''; },
  hasPhoto: function(){ return !!root().pv; },
  usingPhoto: function(){ var p = root(); return !!(p.usePic && p.pv); },
  canPhoto: canPhoto,
  uploadPhoto: uploadPhoto,
  removePhoto: removePhoto,
  usePhoto: usePhoto,
  photoVer: function(){ return root().pv | 0; },
  photoURL: picURL,
  PIC: { MAX_CHARS: PIC_MAX_CHARS, SIDE: PIC_SIDE, Q: PIC_Q },

  /* borders — registered through register() like anything else, so
     KARTI_XP.defsFor('karti') lists them with the faces */
  borders: function(){ return defsFor('karti').filter(function(d){ return d.slot === 'border'; }); },
  /* the BARE id — what goes on the wire and what names the CSS class */
  border: function(){ return bareBorder(equipped('border', 'karti')); },
  borderDef: function(){ return equipped('border', 'karti') || ''; },

  /* the level box — the same slot mechanism one along, so it needs no
     new equip path: KARTI_XP.equip('badge.neon') already works */
  badges: function(){ return defsFor('karti').filter(function(d){ return d.slot === 'badge'; }); },
  badge: function(){ return bareBadge(equipped('badge', 'karti')); },
  badgeDef: function(){ return equipped('badge', 'karti') || ''; },

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
  _defaultFaceFor: defaultFaceFor,
  _sweepEarned: sweepEarned,
  _shrink: shrink,
  _decode: function(f){ return decode(f).then(function(b){
    var r = { w:b.width||b.naturalWidth, h:b.height||b.naturalHeight };
    try { if (b.close) b.close(); } catch(e){} return r; }); },
  _registerBorders: registerBorders
};

})();
