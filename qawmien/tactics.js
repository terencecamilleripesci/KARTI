/* ═══════════════════════════════════════════════════════════════════
   TACTICS TESTBED — the Dofus-shaped combat loop, and nothing else.

   WHAT THIS IS FOR: finding out whether action points, movement points,
   line of sight and range are FUN on a phone, before a line of Unity is
   written. The art is coloured shapes on purpose. If the loop is only
   fun once it is pretty, it is not fun.

   WHAT PORTS TO UNITY: everything in RULES and the AI — those are
   DESIGN. The rendering does not port and does not need to.

   THE FOUR THINGS THAT MAKE IT FEEL LIKE DOFUS
     1. TWO separate pools. AP buys spells, MP buys steps. Deciding how
        to split a turn between reach and damage IS the game. One pool
        collapses that decision and the tactics go with it.
     2. Range has a MINIMUM as well as a maximum. A ranged spell you
        cannot fire point-blank is what stops "stand next to it and hold
        the button", and it is why stepping BACK is a real move.
     3. Line of sight. Obstacles are cover, so the map is an argument.
     4. Positioning beats damage. Push, and being surrounded, matter more
        than raw numbers.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/* ── the board ─────────────────────────────────────────────────── */
/* THE BOARD IS THE SCREEN RECTANGLE — the same shape the world walks on,
   defined once in grid.js. It used to be an 11x11 grid of tiles, which
   projects to a DIAMOND: aspect locked at 62:46 by the projection, so a
   third of a phone held sideways however many tiles were in it. Making it
   13x13 measured the identical fraction of the screen and only shrank the
   tiles; that is why the comment here used to argue for fewer.
   Staggered rows fill the screen instead, so the tile can stay big AND
   the board can reach the corners.

   NOTHING IN THE RULES CHANGES. Coordinates are still (c,r), range is
   still Manhattan on (c,r), line of sight still walks the same line. All
   that changed is which (c,r) are on the board — inBoard() answers that
   now instead of a pair of bounds. */
const BOARD = (typeof GRID !== 'undefined') ? GRID : null;
const W = BOARD.N, H = BOARD.N;  /* the bounding box the board sits in  */
const TW = BOARD.TW, TH = BOARD.TH;

/* ── RULES (this is the part that ports) ───────────────────────── */
const RULES = {
  you:   { hp: 100, ap: 6, mp: 3 },
  grunt: { hp: 58,  ap: 4, mp: 3 },   /* skeleton warrior — closes and hits */
  archer:{ hp: 44,  ap: 4, mp: 2 },   /* skeleton archer  — holds its range */
  mage:  { hp: 40,  ap: 5, mp: 2 },   /* skeleton mage    — fewer hp, more AP */
  sheep: { hp: 52,  ap: 4, mp: 4 },   /* charges: fast, melee only */
  /* THE FIRST TWO OF THE BESTIARY. Each gets a job, not just a stat line —
     a roster where everything walks up and hits you is one monster wearing
     different hats, and that is exactly what the island has today.
       goat  — a wall. Slow (mp 2) and tough (hp 74), so it soaks a turn and
               teaches you to step around something rather than through it.
       gecko — a skirmisher. Fast (mp 5), fragile (hp 30), hits from 2 tiles,
               so it punishes standing in the open and dies if you catch it. */
  goat:  { hp: 74,  ap: 4, mp: 2, level: 3 },
  gecko: { hp: 30,  ap: 4, mp: 5, level: 2 },
  /* THE GOBLIN — the second lesson, and the first thing that can actually
     kill you. The dummy taught the buttons; this teaches that they matter.
     Deliberately между the two: enough hp (46) that one bad turn does not
     end it, enough damage that standing still is punished, and mp 3 so it
     closes at the same speed you retreat. It carries the helmet and blade
     it drops, which is why it is the fight that dresses your head and hand. */
  goblin:{ hp: 46,  ap: 4, mp: 3, level: 2 },
  /* THE TRAINING DUMMY — the first fight, per the owner's design: it hits
     back for exactly 1 so the game can teach mechanics without any real
     threat. 90 hp = ~3 player turns for a bruiser, ~4 for the healer —
     enough to try moving, casting and ending a turn; not a slog. mp 1: it
     waddles one tile a turn, never chases anyone down. ap 4 = one padded
     swat per turn, and only if it STARTED the turn adjacent (it telegraphs
     the turn before). */
  dummy: { hp: 90,  ap: 4, mp: 1 },
  /* the shepherd's summon (CLASSES.SUMMONS.ram — numbers are the spec's) */
  ram:   { hp: 40,  ap: 4, mp: 4 },

  /* ── THE TWO DUNGEON BOSSES ────────────────────────────────────────
     `big` is a draw multiplier, not a stat: a boss has to READ as a boss
     from the first frame, before the player has seen a single number.

     The hp figures are set against what a player actually arrives with.
     At level 10 in the novice set a character has roughly 150-170 hp and
     lands 25-40 a cast, so 300 is about eight or nine clean turns — long
     enough to have to think, short enough that losing does not cost an
     evening. The Choir is set the same way against level 25.

     Both are SLOW on purpose. mp 2 and 3 against a player's 3-5 means the
     boss cannot simply walk you down, so the fight is a question about
     position rather than a race of health bars. */
  warden_boss: { hp: 300, ap: 6, mp: 2, level: 12, big: 1.45 },
  choir_boss:  { hp: 520, ap: 8, mp: 3, level: 27, big: 1.5 }
};

/* Spells. `min`/`max` are RANGE in tiles (Chebyshev-free: we use real
   grid distance, see dist()). `los` means it needs a clear line.
   `aoe` 1 = the four orthogonal neighbours too (a cross). */
const SPELLS = [
  { id:'strike', name:'Strike', ap:3, min:1, max:1, los:false, dmg:[18,25], cd:0,
    hint:'Next to you. Cheap and certain.' },
  { id:'bolt',   name:'Bolt',   ap:4, min:2, max:5, los:true,  dmg:[21,29], cd:0,
    hint:'Needs 2 tiles of space and a clear line.' },
  { id:'blast',  name:'Blast',  ap:5, min:2, max:4, los:true,  dmg:[15,21], cd:2, aoe:1,
    hint:'Hits the target and everything beside it.' },
  { id:'shove',  name:'Shove',  ap:2, min:1, max:3, los:true,  dmg:[6,9],  cd:1, push:2,
    hint:'Knocks them back. Into a wall, it hurts more.' }
];

/* ── WHO IS FIGHTING — read from the parent page when embedded ─────
   world.html opens this page in an iframe when a fight marker is tapped.
   The parent owns the hero's identity (window.HERO, chosen at the
   reincarnation moment) and the fight's roster (QUEST.currentFight(), the
   tapped marker's foes list). Standalone index.html has no parent and
   keeps the stock testbed match — nothing here may break that page. */
function parentWin(){
  try { if (window.parent && window.parent !== window) return window.parent; }
  catch (e){}
  return null;
}
const HCFG = (function(){
  const p = parentWin();
  try {
    if (p && p.HERO && p.HERO.chosen && p.HERO.chosen() && p.CLASSES){
      const c = p.HERO.cls();
      return { cls:c, level:p.HERO.level, stats:c.stats, spells:c.spells,
               name:c.name, sheets:p.HERO.sheets(),
               hpMax:p.CLASSES.maxHp(c, c.stats, p.HERO.level),
               /* the wounds you walked in with. A fight that always starts
                  full makes damage meaningless between fights — you would
                  never need a potion and never need to retreat. */
               hp:(p.PLAYER && typeof p.PLAYER.hp === 'number') ? p.PLAYER.hp : null };
    }
  } catch (e){}
  return null;
})();
/* the spell BAR is the chosen class's kit; pre-choice / standalone it is
   the stock four above */
const HERO_SPELLS = HCFG ? HCFG.spells : SPELLS;

/* enemy-only kits. The dummy's swat is the owner's design verbatim: a
   basic ability that deals exactly 1 hp, so the fight teaches mechanics,
   not fear. The ram is CLASSES.SUMMONS.ram's one spell. */
const AI_SPELLS = {
  dummy: [ { id:'thwack', name:'Padded Swat', ap:4, min:1, max:1, los:false,
             dmg:[1,1], cd:0,
             hint:'A padded arm. Exactly 1 damage, every time.' } ],
  ram:   [ { id:'ramhorn', name:'Ram', ap:3, min:1, max:1, los:false,
             dmg:[8,12], cd:0, elem:'earth', scalesOffOwner:true,
             hint:'The flock defends its own.' } ],
  goat:  [ { id:'butt', name:'Head Butt', ap:4, min:1, max:1, los:false,
             dmg:[10,15], cd:0, elem:'earth',
             hint:'Slow, heavy, and it does not move out of your way.' } ],
  /* 'taillash', not 'lash': the tidebinder already owns 'lash', and a shared
     id makes spellOf() hand this creature her range and her damage. */
  gecko: [ { id:'taillash', name:'Tail Lash', ap:3, min:1, max:2, los:true,
             dmg:[6,10], cd:0, elem:'air',
             hint:'Strikes from two tiles and is gone before you turn.' } ],

  /* ── THE BOSSES ────────────────────────────────────────────────────
     A boss is not a monster with a bigger number. Each of these asks one
     question the island's ordinary fights never ask, and a player who has
     only ever walked up and swung will lose to it the first time.

     THE DROWNED WARDEN (Sunken Crypt, level 10) asks: can you control
     where you stand? It is slow (mp 2) and cannot chase, so the whole
     fight is about distance — and Undertow exists to take that choice
     away, dragging you back into reach of a melee hit that genuinely
     hurts. Kiting works, but only if you spend the AP to re-open the gap
     every single turn. */
  warden_boss: [
    { id:'undertow', name:'Undertow', ap:3, min:2, max:5, los:true,
      dmg:[8,14], cd:2, elem:'water', pull:2,
      hint:'The water takes hold and drags you two paces closer.' },
    /* 'deadweight', not 'crush': the warden CLASS already owns 'crush'. */
    { id:'deadweight', name:'Crushing Weight', ap:4, min:1, max:1, los:false,
      dmg:[26,38], cd:0, elem:'earth',
      hint:'What it does to anything within arm’s reach.' }
  ],

  /* THE UNQUIET CHOIR (Necropolis, level 25) asks the opposite: can you
     stop bunching up? Dirge is an AoE, so a summoner standing next to
     their own summon takes it twice. It reaches six tiles and the Choir
     moves 3, so there is no running out of range — only spreading out.
     Antiphon is the punish for closing to melee instead. */
  choir_boss: [
    { id:'dirge', name:'Dirge', ap:4, min:2, max:6, los:true,
      dmg:[22,31], cd:1, elem:'air', aoe:1,
      hint:'A note that lands on everything standing together.' },
    { id:'antiphon', name:'Antiphon', ap:3, min:1, max:1, los:false,
      dmg:[30,44], cd:1, elem:'fire', push:2,
      hint:'Sung into your face, and it shoves you off the note.' }
  ]
};
/* EVERY spell anything can cast, DERIVED. This used to name each creature's
   list by hand — AI_SPELLS.dummy, .ram, .goat, .gecko — which meant adding a
   monster required editing a second place with no error if you forgot.
   spellOf() would simply not find the spell, and a boss would stand there
   doing nothing with no clue as to why. Deriving it cannot fall behind. */
const ALL_SPELLS = HERO_SPELLS.concat(SPELLS,
  ...Object.keys(AI_SPELLS).map(k => AI_SPELLS[k]));
function aiSpellsOf(u){ return AI_SPELLS[u.kind] || SPELLS; }

function fightRoster(){
  const p = parentWin();
  try {
    if (p && p.QUEST && p.QUEST.currentFight){
      const m = p.QUEST.currentFight();
      if (m && Array.isArray(m.foes)){
        const foes = m.foes.filter(k => RULES[k]);
        if (foes.length) return foes;
      }
    }
  } catch (e){}
  return ['grunt', 'sheep', 'archer'];   /* the stock testbed match */
}

/* ── THE ARENA: you fight ON the map you met them on ────────────────
   The owner: "combat has to play in the same map you spar or engage with
   mobs — same obstacles, same water, same everything."

   That is how Dofus works and it was not possible before: a fight was a
   separate 11x11 board with eight hand-placed pillars, because the board
   and the map were different shapes and there was no honest way to carry
   one into the other. They are the same shape now (grid.js) — the same
   188 cells, the same (c,r), the same rectangle — so the fight can simply
   BE the screen you are standing on.

   Nothing is copied or converted. The combat page is a same-origin iframe
   of world.html, so it reads the live map object straight out of the
   parent: the very arrays world.js just drew. A rock is in the same place
   because it IS the same rock.

   Absent a parent (index.html opened on its own, which is still the
   combat testbed) this is null and the old hand-placed board is used. */
const ARENA = (function(){
  const p = parentWin();
  try {
    const W = p && p.WORLD, WT = p && p.WT;
    const id = W && W._map && W._map.id;
    const map = id && p.MAPS && p.MAPS[id];
    if (!map || !WT || !map.block) return null;
    const mk = (p.QUEST && p.QUEST.currentFight && p.QUEST.currentFight()) || null;
    const at = (mk && typeof mk.c === 'number') ? { c: mk.c, r: mk.r } : null;
    const hero = (W.playerAt && W.playerAt()) || null;
    return { map: map, WT: WT, at: at, hero: hero, id: id };
  } catch (e){ return null; }
})();

/* THE MAP'S PAINTING, when it has one. A painted screen is drawn by
   world.js as a SINGLE illustration; the fight was still rebuilding it out
   of atlas tiles, which is wrong twice over. Wrong to look at — you tap a
   painted ruin and the fight opens on a different picture of the same
   place — and expensive: several thousand drawImage calls every frame,
   plus the surround lattice around them, where one drawImage would do.
   That is the shape of the hang this file has already had once. */
const WORLD_BG = { img: null, ready: false };
if (typeof parentWin === 'function') { /* set below, once ARENA is known */ }

/* the world's own tile atlas — the same file world.js draws with, so it
   is already in cache and the two screens cannot drift apart */
const WORLD_ATLAS = { img: null, ready: false };
if (ARENA) (function(){
  const im = new Image();
  im.onload = () => { WORLD_ATLAS.img = im; WORLD_ATLAS.ready = true; draw(); };
  im.onerror = () => { WORLD_ATLAS.ready = false; };
  im.src = (ARENA.map.atlas || ARENA.WT.ATLAS_SRC);
  if (ARENA.map.bg){
    const bg = new Image();
    bg.onload = () => { WORLD_BG.img = bg; WORLD_BG.ready = true; draw(); };
    bg.onerror = () => { WORLD_BG.ready = false; };   /* tiles carry on */
    bg.src = ARENA.map.bg;
  }
})();

/* ── stat scaling (CLASSES_SPEC §2) — 1 point = +1% of the roll ──── */
const STAT_OF_ELEM = { earth:'str', fire:'int', water:'cha', air:'agi' };
function statsFor(u, sp){
  if (sp && sp.scalesOffOwner && u.owner) return u.owner.stats || null;
  return u.stats || null;
}
function scaleRoll(u, sp, roll){
  const st = statsFor(u, sp);
  const key = sp && sp.elem ? STAT_OF_ELEM[sp.elem] : null;
  if (!st || !key) return roll;
  return Math.round(roll * (1 + (st[key] | 0) / 100));
}
function scaleHealRoll(u, roll){          /* all healing scales off Chance */
  const st = u.stats;
  return st ? Math.round(roll * (1 + (st.cha | 0) / 100)) : roll;
}

/* ── state ─────────────────────────────────────────────────────── */
let G = null;                    /* the whole match                    */
let sel = null;                  /* selected spell id, or null         */
let anim = null;                 /* a walk in progress                 */
let busy = false;                /* the enemy is thinking              */

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const $ = s => document.querySelector(s);

/* ── geometry ──────────────────────────────────────────────────── */
let ORX = 0, ORY = 0, DPR = 1, SC = 1;   /* SC: board zoom, so it FITS */

function iso(c, r){                     /* grid -> screen (tile centre) */
  return { x: ORX + (c - r) * (TW / 2), y: ORY + (c + r) * (TH / 2) };
}
function unIso(x, y){                   /* screen -> grid               */
  const dx = (x / SC - ORX) / (TW / 2), dy = (y / SC - ORY) / (TH / 2);
  return { c: Math.round((dy + dx) / 2), r: Math.round((dy - dx) / 2) };
}
/* on the board = inside the screen rectangle. The cells of the bounding
   box that fall outside it are void: nothing stands there, nothing is
   drawn there, no spell may be aimed there. */
function inBoard(c, r){ return BOARD.has(c, r); }
const key = (c, r) => c + ',' + r;

/* REAL grid distance, not diagonal. Dofus is orthogonal — you cannot
   cut a corner — and that is what makes cover and flanking mean
   something. Chebyshev distance would quietly make every wall useless. */
function dist(a, b){ return Math.abs(a.c - b.c) + Math.abs(a.r - b.r); }

function fit(){
  const box = document.getElementById('boardwrap');
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const w = box.clientWidth, h = box.clientHeight;
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
  /* FRAME THE RECTANGLE when it fits, FOLLOW when it does not — the same
     rule world.js uses, and for the same reason. A board is a Dofus map
     now: 1.5:1 and bigger than a phone, so framing it whole would mean a
     32x16 cell. You cannot play a tactics fight on cells you cannot hit,
     and half a fingertip is not a cell. Below the floor the zoom stops
     shrinking and the view starts moving instead. */
  const R = BOARD.RECT;
  const fitS = Math.min(w / R.w, h / R.h);
  FRAMED = fitS >= MIN_SC;
  SC = Math.min(2, Math.max(fitS, MIN_SC));
  ctx.setTransform(DPR * SC, 0, 0, DPR * SC, 0, 0);
  camera();
  draw();
}

const MIN_SC = 0.80;          /* a 51x26 cell: the floor is a fingertip */
let FRAMED = true;            /* does the whole board fit at SC?        */

/* WHERE THE VIEW SITS. Centred on the board when the whole thing fits;
   otherwise on whoever is acting — yours or theirs, because a fight you
   cannot see is worse than one you cannot reach — and clamped so the
   camera never shows past the board's own edges. */
function camera(){
  const w = cv.width / DPR, h = cv.height / DPR;
  const R = BOARD.RECT, vw = w / SC, vh = h / SC;
  let cx = R.cx, cy = R.cy;
  if (!FRAMED && G && G.units && G.units.length){
    const u = G.units[G.turn] || G.units[0];
    const f = { x: (u.c - u.r) * (TW / 2), y: (u.c + u.r) * (TH / 2) };
    cx = vw >= R.w ? R.cx
       : Math.min(R.x + R.w - vw / 2, Math.max(R.x + vw / 2, f.x));
    cy = vh >= R.h ? R.cy
       : Math.min(R.y + R.h - vh / 2, Math.max(R.y + vh / 2, f.y));
  }
  ORX = vw / 2 - cx;
  ORY = vh / 2 - cy;
}

/* ── units ─────────────────────────────────────────────────────── */
/* ── the sprite sheet, loaded once and shared by every unit ────────
   SPRITE.spawn gives each unit its own playhead over the same image, so
   one can be walking while another swings, without a second download. */
/* ONE SHEET PER KIND. A hue-shifted hero was a stand-in; a sheep and a
   skeleton are different creatures and have to be different drawings —
   silhouette is what a player actually reads on a small tile, and no
   amount of recolouring changes a silhouette.
   Every entry is OPTIONAL: a kind whose sheet is missing falls back to
   the hero sheet, and if that is missing too, to the drawn shapes. */
/* WHICH CREATURE A RULES-KIND WEARS.
   The rules know 'grunt' and 'archer'; the art knows skeletons and sheep.
   Keeping the two apart means a monster can be re-skinned — or a whole
   new one added — without touching a line of combat logic. */
const WEARS = { you:'you', grunt:'skeleton', archer:'skelarcher', mage:'skelmage',
                sheep:'sheep', dummy:'dummy', ram:'sheep',
                goat:'goat', gecko:'gecko',
                /* NO GOBLIN SHEET YET. It wears the skeleton until one is
                   drawn — a stand-in that at least has the right silhouette
                   class (upright, armed) rather than falling through to the
                   hero sheet, which would put the player's own body in front
                   of them. Swapping it later is this one word. */
                goblin:'skeleton',
                /* Both bosses have their own sheets now. Promoting them was
                   one word each here, which is what this indirection is for:
                   the fights were real and playable for a day before any of
                   the art existed. */
                warden_boss:'warden_boss', choir_boss:'choir_boss' };

const SHEETS = {}, DIRS = {}, IDLES = {};
let SHEET = null, DIRSHEET = null;
try {
  /* LOAD ONLY THIS FIGHT'S CREATURES. The roster is known before a
     single byte of art is requested — fightRoster() reads the tapped
     marker's foes — so a tutorial scrap against a straw dummy no longer
     downloads every monster in the game (~7 MB of sheets for a fight
     whose own art is 26 KB). The hero's possible summons count as
     present. Sheets stay OPTIONAL: a kind whose sheet is missing falls
     back to the hero sheet, and if that is missing too, to the drawn
     shapes. */
  const CREATURE_ART = { skeleton:1, skelarcher:1, skelmage:1, sheep:1, dummy:1,
                         goat:1, gecko:1, warden_boss:1, choir_boss:1 };
  /* WHICH OF THEM ALSO HAVE A DIRECTIONAL WALK SHEET. Not all do: the goat
     never had one and the Drowned Warden does not have one yet. The engine
     copes either way — useDir requires dspr.ready, so a creature without one
     simply animates from its action sheet — but asking for a file we know is
     absent means a 404 on every fight containing a goat, and a permanent
     failure counted against the loading ring. Ask only for what exists. */
  const DIR8_ART = { skeleton:1, skelarcher:1, skelmage:1, sheep:1, dummy:1,
                     gecko:1 };
  const need = new Set();
  for (const k of fightRoster()) need.add(WEARS[k] || k);
  for (const sp of HERO_SPELLS) if (sp && sp.summon) need.add(WEARS[sp.summon] || sp.summon);

  /* a CHOSEN hero wears the class's own sheets — this is the first time
     the player sees their class actually fight, so it must be THEIR
     character on the board, not the stock hero. Classes have no drawn
     directional idle sheet (sheets().idle === null): standing still holds
     the measured stand frame, same as the world does. */
  if (HCFG){
    SHEETS.you = SPRITE.make(HCFG.sheets.action, { cols:6, rows:4 });
    DIRS.you   = SPRITE.make(HCFG.sheets.dir8,   { cols:6, rows:4, clips: SPRITE.CLIPS_DIR });
    IDLES.you  = HCFG.sheets.idle
      ? SPRITE.make(HCFG.sheets.idle, { cols:6, rows:4, clips: SPRITE.CLIPS_IDLE })
      : null;
  } else {
    SHEETS.you = SPRITE.make('art/hero-sheet.png', { cols:6, rows:4 });
    /* THE 5-ANGLE WALK SHEETS -> 8 FACINGS, ONE PER CREATURE.
       The rule is that anything that moves turns to face where it is
       going. Each sheet is optional and independent: a creature without
       one still mirrors left/right off its single-angle sheet. */
    DIRS.you  = SPRITE.make('art/hero-dir8.png',
      { cols:6, rows:4, clips: SPRITE.CLIPS_DIR });
    /* the DRAWN idle sheet. Optional: without one a unit simply holds
       its measured both-feet-down walk frame. */
    IDLES.you = SPRITE.make('art/hero-idle.png',
      { cols:6, rows:4, clips: SPRITE.CLIPS_IDLE });
  }
  SHEET = SHEETS.you;                  /* the universal fallback base    */
  DIRSHEET = DIRS.you;
  for (const c of need){
    if (!CREATURE_ART[c] || DIRS[c]) continue;
    if (DIR8_ART[c])
      DIRS[c] = SPRITE.make('art/' + c + '-dir8.png',
        { cols:6, rows:4, clips: SPRITE.CLIPS_DIR });
    SHEETS[c] = SPRITE.make('art/' + c + '-sheet.png', { cols:6, rows:4 });
  }
} catch (e){ SHEET = null; }

function mk(kind, side, c, r){
  const b = RULES[kind];
  const u = { kind, side, c, r, hp:b.hp, hpMax:b.hp, ap:b.ap, apMax:b.ap,
              mp:b.mp, mpMax:b.mp, cd:{}, bob: Math.random() * 6.28, flash:0,
              shieldHp:0, face: side === 0 ? 1 : -1,
              /* LEVEL AND SIZE CARRY OVER FROM THE RULES. They did not, and
                 `level` had been declared on the goat and the gecko and never
                 read by anything: fightSpoils does `f.level | 0 || 1`, so
                 every kill in the game has been paying level-1 XP — 20 for a
                 goat that is written as level 3 and should pay 36. Silent,
                 because the fallback is a plausible number rather than a
                 crash. A boss would have paid the same 20. */
              level: b.level | 0 || 1,
              big: b.big || 1 };
  /* the chosen class overrides the stock hero's numbers */
  if (kind === 'you' && HCFG){
    u.hp = u.hpMax = HCFG.hpMax;
    /* start on the hp you actually have, clamped and never at zero — you
       cannot walk into a fight already dead */
    if (typeof HCFG.hp === 'number' && HCFG.hp > 0)
      u.hp = Math.max(1, Math.min(u.hpMax, HCFG.hp | 0));
    u.ap = u.apMax = HCFG.cls.base.ap;
    u.mp = u.mpMax = HCFG.cls.base.mp;
    u.stats = HCFG.stats;
    u.name = HCFG.name;
  }
  /* enemies wear the same sheet through a hue rotation — one drawing, four
     characters. Cheap, and it keeps sides readable without a second sheet. */
  const own = SHEETS[WEARS[kind] || kind];
  u.spr = SPRITE.spawn(own && own.img !== undefined ? own : SHEET);
  u.own = own || null;
  /* THE RULE APPLIES TO EVERYTHING THAT MOVES. Any creature with a
     five-angle sheet gets all eight facings; the rest mirror. */
  const dirSheet = DIRS[WEARS[kind] || kind] || null;
  u.dspr = dirSheet ? SPRITE.spawn(dirSheet) : null;
  const idleSheet = IDLES[WEARS[kind] || kind] || null;
  u.ispr = idleSheet ? SPRITE.spawn(idleSheet) : null;
  /* the directional sheet names its clips idle.f / idle.b, so a playhead
     spawned on the default "idle" points at a clip that does not exist and
     draws NOTHING — the character simply disappears, leaving only its ring
     and health bar. Start it on a real clip. */
  if (u.dspr) SPRITE.play(u.dspr, 'walk.0', true);
  u.dir = side === 0 ? 'SE' : 'NW';   /* start facing the other side */
  /* hue is now only a fallback tint, used when a kind has no sheet of its
     own and is borrowing the hero's */
  u.hue = 0;
  return u;
}

/* THE LAYOUT WAS AUTHORED ON AN 11x11 GRID and is worth keeping — where
   the cover stands is a tactical decision, not a coordinate. This carries
   each position into the screen rectangle proportionally, so a pillar that
   stood two tiles left of centre still stands two tiles left of centre. */
function cell11(c10, r10){
  const V = BOARD.V;
  let v = Math.max(0, Math.min(V - 1, Math.round(r10 * (V - 1) / 10)));
  const m = BOARD.span(v);
  let u = Math.round((c10 - 5) / 5 * m);
  if ((u - v) % 2) u += (u >= m) ? -1 : 1;       /* snap to the row's parity */
  u = Math.max(-m, Math.min(m, u));
  return { c: BOARD.cOf(u, v), r: BOARD.rOf(u, v) };
}

/* ── standing room on a REAL map ────────────────────────────────────
   The hand-placed board could promise that its start squares were clear.
   A field cannot: the mob group you tapped may be standing against a
   cliff, in a wood, or in a village street. So both sides are placed by
   looking, not by arithmetic — nearest free cells outward from where the
   monsters actually are, and a spot for the hero far enough back that his
   first turn is a decision rather than a swing. */
function freeSpots(blocked, from, want, minD, maxD, near){
  const out = [], seen = new Set([key(from.c, from.r)]);
  const q = [{ c: from.c, r: from.r, d: 0 }];
  while (q.length && out.length < want * 12){
    const n = q.shift();
    if (n.d >= minD && n.d <= maxD && !blocked.has(key(n.c, n.r)))
      out.push({ c: n.c, r: n.r, d: n.d });
    if (n.d >= maxD) continue;
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const c = n.c + dc, r = n.r + dr, k = key(c, r);
      if (!inBoard(c, r) || seen.has(k) || blocked.has(k)) continue;
      seen.add(k); q.push({ c, r, d: n.d + 1 });
    }
  }
  /* two units with equal (c - r) render on the SAME iso column and stack,
     so prefer spots that do not share one — the old board's rule, now
     enforced instead of hand-checked */
  const used = new Set();
  const pick = [];
  const score = (s) => near ? Math.abs(s.c - near.c) + Math.abs(s.r - near.r) : s.d;
  out.sort((a, b) => score(a) - score(b));
  for (const s of out){
    if (pick.length >= want) break;
    if (used.has(s.c - s.r)) continue;
    used.add(s.c - s.r); pick.push(s);
  }
  for (const s of out){                      /* a stacked spot beats none */
    if (pick.length >= want) break;
    if (!pick.some(p => p.c === s.c && p.r === s.r)) pick.push(s);
  }
  return pick;
}

function newMatch(){
  fightReset();
  const blocked = new Set();
  if (ARENA){
    /* THE MAP IS THE BOARD. Every cell the world calls blocked is blocked
       here — rocks, trees, fences, buildings, cliffs and the lake — so
       cover in the fight is the cover you could see before it started. */
    const m = ARENA.map;
    for (const cell of BOARD.CELLS)
      if (m.block[cell.r][cell.c]) blocked.add(key(cell.c, cell.r));
  } else {
    /* A HAND-PLACED map, not a random one. Cover only teaches you
       anything if it is somewhere deliberate: two pillars in the middle
       that both sides can use, and a short wall that punishes charging
       straight down the lane. Standalone only — index.html on its own is
       still the combat testbed, and it has no map to borrow. */
    [[5,3],[5,7],[4,5],[6,5],[2,2],[8,8],[2,8],[8,2]]
      .map(p => cell11(p[0], p[1]))
      .forEach(p => blocked.add(key(p.c, p.r)));
  }

  /* START POSITIONS, and one rule that is easy to miss: two units whose
     (c - r) is equal render on the SAME iso column and visually stack.
     The grunt and the archer used to do exactly that.
     The roster comes from the tapped fight marker when embedded (a lone
     dummy stands mid-board, where every class can reach or sight it);
     standalone keeps the stock trio at the stock spots. */
  const foes = fightRoster();
  /* CLOSE ENOUGH TO FIGHT ON TURN ONE. The player stood at (1,5) and the
     enemies at (9,4)/(8,7)/(9,6) — eight tiles apart, and with 3 MP that is
     three turns of walking before anybody can swing. The owner's note:
     "the fight, make them easy, box near each other". A tactics fight is
     about what you do with your action points, not about crossing an empty
     board first.
     Four to five tiles now: a bruiser closes and hits in the first turn or
     two, a caster is already in range, and the gap is still wide enough that
     WHERE you step matters. The (c - r) rule below still holds — two units
     with equal (c - r) share an iso column and visually stack, so no two
     spots here do. */
  let spots, home;
  if (ARENA){
    /* THE MONSTERS ARE WHERE YOU SAW THEM. The marker's own cell first,
       then outward from it — so the group stands where it was standing on
       the map, and the fight opens on the picture you tapped.
       YOU STEP BACK. Walking up to a marker leaves you ADJACENT to it
       (world.js routes to a neighbouring tile), and starting a tactics
       fight already in contact throws the first turn away. So the hero
       takes the free cell nearest to where he actually stood that is four
       or more away — his own tile if it already is. */
    const mid = BOARD.CELLS[Math.floor(BOARD.CELLS.length / 2)];
    const at = ARENA.at && inBoard(ARENA.at.c, ARENA.at.r)
      ? ARENA.at : { c: mid.c, r: mid.r };
    spots = freeSpots(blocked, at, foes.length, 0, 4, null);
    /* a group backed into a corner needs a wider look, or two of them are
       given the same cell and one is invisible underneath the other */
    if (spots.length < foes.length)
      spots = freeSpots(blocked, at, foes.length, 0, 9, null);
    const heroAt = ARENA.hero || null;
    const mine = freeSpots(blocked, at, 1, 4, 7, heroAt);
    home = (heroAt && inBoard(heroAt.c, heroAt.r) &&
            !blocked.has(key(heroAt.c, heroAt.r)) &&
            Math.abs(heroAt.c - at.c) + Math.abs(heroAt.r - at.r) >= 4)
      ? heroAt : (mine[0] || heroAt || { c: at.c, r: at.r });
  } else {
    spots = (foes.length === 1
      ? [[6,5]]
      : [[6,4],[6,7],[6,6],[7,3],[5,8]]).map(s => cell11(s[0], s[1]));
    home = cell11(3, 5);
  }
  const units = [ mk('you', 0, home.c, home.r) ];
  foes.forEach((k, i) => {
    const s = spots[i % spots.length] || spots[0] || home;
    units.push(mk(k, 1, s.c, s.r));
  });
  /* COVER MAY NOT STAND ON A FIGHTER. Both lists are carried over from the
     old grid independently, so a rounding that puts a pillar on a start
     tile is possible — and would embed a unit in stone before the first
     turn. The fighters win; the pillar is simply not placed. */
  for (const u of units) blocked.delete(key(u.c, u.r));
  G = {
    blocked,
    units,
    traps: [],        /* armed tiles ({c,r,owner,sp}) — Ember Snare      */
    turn: 0,          /* index into units, whose turn it is */
    round: 1,
    over: 0           /* 0 running, 1 you won, -1 you lost */
  };
  sel = null; anim = null; busy = false;
  /* face off from the first frame, rather than from the first move */
  for (const u of G.units) watchFoe(u);
  document.getElementById('over').classList.remove('on');

  /* ── READY BEFORE THE FIRST BLOW ──────────────────────────────────
     The owner: the player must press Ready to start the fight. Dofus does
     the same, and the reason is not ceremony — a fight that begins the
     instant you touch a monster gives you no moment to LOOK at it. Who is
     here, how many, where they stand, whether this is a fight you want.

     So the board is drawn, the enemies are there and facing you, and
     nothing moves until the player says go. It also fixes a smaller thing:
     the first turn used to begin while the map was still fading in. */
  G.ready = false;
  showReady();
}

function showReady(){
  const el = document.getElementById('ready');
  if (!el){ G.ready = true; return startTurn(); }   /* no markup: play on */
  const foes = G.units.filter(u => u.side === 1 && u.hp > 0);
  const lv = foes.map(u => u.level | 0).filter(Boolean);
  const line = foes.length === 1 ? 'One enemy'
             : foes.length + ' enemies';
  const el2 = document.getElementById('readysub');
  if (el2) el2.textContent = line +
    (lv.length ? ' · level ' + Math.min.apply(null, lv) +
                 (Math.max.apply(null, lv) !== Math.min.apply(null, lv)
                   ? '-' + Math.max.apply(null, lv) : '') : '');
  el.classList.add('on');
  paint();
}

function beginFight(){
  const el = document.getElementById('ready');
  if (el) el.classList.remove('on');
  G.ready = true;
  startTurn();
}

const me = () => G.units[G.turn];
/* the HERO — a summon (u.auto) on side 0 is an ally, not the player */
const you = () => G.units.find(u => u.side === 0 && !u.auto && u.hp > 0);
const alive = s => G.units.filter(u => u.side === s && u.hp > 0);
function unitAt(c, r){ return G.units.find(u => u.hp > 0 && u.c === c && u.r === r); }
function solid(c, r){ return G.blocked.has(key(c, r)) || !!unitAt(c, r); }

/* ── movement: BFS over walkable tiles, up to MP ───────────────── */
function reach(u){
  const seen = new Map(); seen.set(key(u.c, u.r), { d:0, from:null });
  const q = [{ c:u.c, r:u.r, d:0 }];
  while (q.length){
    const n = q.shift();
    if (n.d >= u.mp) continue;
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const c = n.c + dc, r = n.r + dr, k = key(c, r);
      if (!inBoard(c, r) || solid(c, r) || seen.has(k)) continue;
      seen.set(k, { d:n.d + 1, from:key(n.c, n.r) });
      q.push({ c, r, d:n.d + 1 });
    }
  }
  seen.delete(key(u.c, u.r));
  return seen;
}
function pathTo(u, c, r){
  const seen = reach(u), end = key(c, r);
  if (!seen.has(end)) return null;
  const out = []; let cur = end;
  while (cur && cur !== key(u.c, u.r)){
    const [cc, rr] = cur.split(',').map(Number);
    out.unshift({ c:cc, r:rr });
    cur = seen.get(cur) ? seen.get(cur).from : null;
  }
  return out;
}

/* ── line of sight: Bresenham, blocked by walls AND bodies ─────── */
function los(a, b){
  let x0 = a.c, y0 = a.r; const x1 = b.c, y1 = b.r;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, guard = 0;
  while (guard++ < 200){
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy){ err -= dy; x0 += sx; }
    if (e2 < dx){ err += dx; y0 += sy; }
    if (x0 === x1 && y0 === y1) return true;
    /* the ORIGIN and the TARGET never block themselves */
    if (G.blocked.has(key(x0, y0))) return false;
    const u = unitAt(x0, y0);
    if (u) return false;
  }
  return false;
}

function spellOf(id){ return ALL_SPELLS.find(s => s.id === id); }

/* the shepherd's one-at-a-time rule */
function liveSummonOf(u){ return G.units.find(v => v.owner === u && v.hp > 0); }
function trapAt(c, r){ return (G.traps || []).find(t => t.c === c && t.r === r); }

/* Can `u` cast `sp` at (c,r)? One function, used by the UI to paint the
   range AND by the AI to choose — so what you are shown and what is
   allowed can never disagree. */
function canCast(u, sp, c, r){
  if (!inBoard(c, r)) return false;
  /* a WALL is never a target. Aiming at one used to be legal and simply
     resolved as "miss", quietly eating the AP — the range overlay was
     inviting a tap that could only ever waste your turn. */
  if (G.blocked.has(key(c, r))) return false;
  if (u.ap < sp.ap) return false;
  if ((u.cd[sp.id] || 0) > 0) return false;
  const d = dist(u, { c, r });
  if (d < sp.min || d > sp.max) return false;
  if (sp.los && !los(u, { c, r })) return false;
  /* the extension mechanics each have their own idea of a legal target
     (CLASSES_SPEC §4) — checked here so the painted range and the AI can
     never disagree with what resolves */
  const t = unitAt(c, r);
  if (sp.heal)   return !!t && t.side === u.side;     /* a friendly UNIT   */
  if (sp.swap)   return !!t && t.side === u.side && t !== u;
  if (sp.tp)     return !t;                           /* an EMPTY tile     */
  if (sp.summon) return !t && !liveSummonOf(u);       /* one at a time     */
  if (sp.trap)   return !t && !trapAt(c, r);
  if (sp.shield) return c === u.c && r === u.r;       /* self only         */
  return true;
}

function castTiles(u, sp){
  const out = [];
  for (let c = 0; c < W; c++) for (let r = 0; r < H; r++)
    if (canCast(u, sp, c, r)) out.push({ c, r });
  return out;
}

/* ── doing damage ──────────────────────────────────────────────── */
function rng(a, b){ return a + Math.floor(Math.random() * (b - a + 1)); }

/* ── EVERYTHING WATCHES ITS ENEMY ──────────────────────────────────
   A unit that is standing still faces the thing it intends to kill, not
   the camera. Without this a monster keeps whatever direction its last
   step happened to leave it in, so the board fills up with creatures
   staring out of the screen while a fight goes on beside them — which
   reads as scenery, not as a threat.
   Recomputed every frame for whoever is idle, which is four cheap
   comparisons and means a mob turns its head the moment YOU move,
   without anything having to remember to tell it. */
function nearestFoe(u){
  let best = null, bd = 1e9;
  for (const v of G.units){
    if (v === u || v.hp <= 0 || v.side === u.side) continue;
    const d = dist(u, v);
    if (d < bd){ bd = d; best = v; }
  }
  return best;
}
function watchFoe(u){
  if (!u || u.hp <= 0) return;
  const f = nearestFoe(u);
  if (f) faceToward(u, f);
}

/* ── the sprite reacts to what the RULES did ───────────────────────
   Every clip below is triggered by a real game event, never by a timer:
   you see 'attack' because a spell was cast, 'hit' because damage
   landed, 'die' because hp reached zero. That is what makes animation
   read as consequence rather than decoration. */
function clip(u, name, restart){
  /* `restart` defaults to TRUE for one-shots (a second swing must start
     from the beginning) but a WALK is re-asserted on every tile, and
     restarting it there resets the playhead every 130ms while a frame
     lasts 100ms — so the cycle never got past its first frame and the
     character slid along the ground with its legs still. Continuing
     movement passes false. */
  if (restart === undefined) restart = true;
  try {
    if (u && u.spr) SPRITE.play(u.spr, name, restart);
    /* walk and idle also exist on the directional sheet, as front/back */
    /* the directional sheet only carries WALK; idle and the one-shots
       stay on the action sheet, which is why a still unit never uses it */
    if (u && u.dspr && name === 'walk'){
      const D = SPRITE.DIR[u.dir] || SPRITE.DIR.SE;
      SPRITE.play(u.dspr, 'walk.' + D.row, restart);
    }
  } catch (e){}
}
function faceToward(u, t){
  if (!u || !t) return;
  /* pick the DOMINANT axis: a target mostly to the east faces you east,
     even if it is a little north as well */
  const dc = t.c - u.c, dr = t.r - u.r;
  const d = Math.abs(dc) >= Math.abs(dr) ? SPRITE.dirOf(dc, 0) : SPRITE.dirOf(0, dr);
  if (d) u.dir = d;
  u.face = faceSign(u, t);
}

/* WHICH WAY IS "RIGHT" ON AN ISO BOARD? It is (c - r), not (c + r).
   Screen x = (c - r) * TW/2 and screen y = (c + r) * TH/2 — so c+r is
   DEPTH, toward or away from the camera, and c-r is the horizontal.
   Using c+r meant a unit flipped when it walked nearer or further and
   NOT when it walked left or right: the sheep kept facing the screen
   while it trotted sideways. */
function faceSign(from, to){
  return (to.c - to.r) >= (from.c - from.r) ? 1 : -1;
}

/* PROJECTILES. A ranged spell that deals damage with no travel reads as a
   number appearing out of nowhere. The damage still applies immediately —
   the state must never wait on an animation — but the FLOATING TEXT is
   held until the shot lands, so what you see and what happened agree. */
const SHOTS = [];
function shoot(from, to, colour, ms, then){
  SHOTS.push({ a:iso(from.c, from.r), b:iso(to.c, to.r), t0:performance.now(),
               ms:ms || 260, col:colour || '#FFC542', then:then || null });
}
function drawShots(){
  const now = performance.now();
  for (let i = SHOTS.length - 1; i >= 0; i--){
    const s = SHOTS[i];
    const k = Math.min(1, (now - s.t0) / s.ms);
    const x = s.a.x + (s.b.x - s.a.x) * k;
    /* a shallow arc, so it reads as thrown rather than slid */
    const y = s.a.y + (s.b.y - s.a.y) * k - Math.sin(k * Math.PI) * 26 - 22;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 6.283);
    ctx.fillStyle = s.col; ctx.shadowColor = s.col; ctx.shadowBlur = 10; ctx.fill();
    ctx.restore();
    if (k >= 1){ if (s.then) try { s.then(); } catch (e){} SHOTS.splice(i, 1); }
  }
}

/* ── THE FIGHT TALLY ─────────────────────────────────────────────
   What the end-of-battle screen reports. Kept as raw counts recorded
   where the events actually happen, so the screen never has to guess or
   reconstruct anything after the fact — a results screen that infers what
   happened will eventually infer wrong. */
const FIGHT = { dealt: 0, taken: 0, casts: 0, kills: 0, killer: null, xp: 0 };
function fightReset(){
  FIGHT.dealt = 0; FIGHT.taken = 0; FIGHT.casts = 0;
  FIGHT.kills = 0; FIGHT.killer = null; FIGHT.xp = 0;
}

function hurt(t, n, why, delay){
  /* Bulwark: the shield eats damage first, until the caster's next turn.
     State resolves NOW (never waits on an animation); only showing waits. */
  if (t.shieldHp > 0 && n > 0){
    const ab = Math.min(t.shieldHp, n);
    t.shieldHp -= ab; n -= ab;
    if (n <= 0){
      const blocked = () => { t.flash = 0.4; floatText(t, 'blocked', '#7FD4C1'); };
      if (delay) setTimeout(blocked, delay); else blocked();
      return;
    }
  }
  const before = t.hp;
  t.hp = Math.max(0, t.hp - n);
  {
    const real = before - t.hp;              /* after shields, not the roll */
    if (t.side === 1) FIGHT.dealt += real; else FIGHT.taken += real;
    if (t.hp <= 0 && before > 0 && t.side === 1){
      FIGHT.kills += 1; FIGHT.killer = why || 'a blow';
    }
  }
  const land = () => {
    t.flash = 1;
    floatText(t, '-' + n, why === 'wall' ? '#FFC542' : '#FF6B84');
    if (t.hp <= 0){ floatText(t, 'down', '#9C97B8'); clip(t, 'die');
                    if (window.HUD) HUD.sfx('die'); }
    else clip(t, 'hit');
  };
  /* the hp is already gone; only the SHOWING of it waits */
  if (delay) setTimeout(land, delay); else land();
}

function pushFrom(src, t, n){
  const dc = Math.sign(t.c - src.c), dr = Math.sign(t.r - src.r);
  /* push along the dominant axis only — a diagonal shove would let you
     move a unit through a corner it could never walk through */
  let ac = dc, ar = dr;
  if (Math.abs(t.c - src.c) >= Math.abs(t.r - src.r)) ar = 0; else ac = 0;
  if (!ac && !ar) return;
  /* A PUSHED UNIT TURNS. Movement points buy orthogonal steps only, so in
     combat nothing ever WALKS diagonally — but a shove moves you without
     your consent, and whatever moves must face where it went. This is one
     of the two places the diagonal facings earn their keep (the other is
     free movement outside combat). */
  const pd = SPRITE.dirOf(ac, ar);
  if (pd) t.dir = pd;
  let moved = 0;
  for (let i = 0; i < n; i++){
    const c = t.c + ac, r = t.r + ar;
    if (!inBoard(c, r) || solid(c, r)){
      /* SLAMMED. The tiles it could not travel become damage — this is
         what makes shoving into a wall a real tactic rather than a
         weaker attack. */
      const left = n - moved;
      if (left > 0) hurt(t, left * 5, 'wall');
      return;
    }
    t.c = c; t.r = r; moved++;
    checkTrap(t);                       /* shoved onto a mine? it goes off */
    if (t.hp <= 0) return;
  }
}

/* PULL — the inverse of push (Rootgrasp): drag the target up to n tiles
   TOWARD the caster along the dominant axis, stopping at the first blocked
   tile (the caster's own body included, so it lands adjacent). No wall
   bonus, deliberately — walls stop a pull, they do not hurt, or every pull
   into melee would double-dip (CLASSES_SPEC §4). */
function pullTo(src, t, n){
  const dc = Math.sign(src.c - t.c), dr = Math.sign(src.r - t.r);
  let ac = dc, ar = dr;
  if (Math.abs(src.c - t.c) >= Math.abs(src.r - t.r)) ar = 0; else ac = 0;
  if (!ac && !ar) return;
  const pd = SPRITE.dirOf(ac, ar);
  if (pd) t.dir = pd;
  for (let i = 0; i < n; i++){
    const c = t.c + ac, r = t.r + ar;
    if (!inBoard(c, r) || solid(c, r)) return;
    t.c = c; t.r = r;
    checkTrap(t);
    if (t.hp <= 0) return;
  }
}

/* ── traps (Ember Snare) ───────────────────────────────────────────
   One armed tile per caster; re-casting moves it. Drawn visible (spec:
   invisibility is out of scope). The first unit to ENTER the tile — by
   walking, being pushed, pulled or teleporting — detonates it: the trap's
   damage, scaled by the OWNER's element stat, in a cross. */
function setTrap(u, sp, c, r){
  G.traps = (G.traps || []).filter(t => t.owner !== u);
  G.traps.push({ c, r, owner: u, sp });
  floatAt(c, r, 'armed', '#FFC542');
}
function checkTrap(t){
  const tr = trapAt(t.c, t.r);
  if (!tr || t.hp <= 0) return;
  G.traps.splice(G.traps.indexOf(tr), 1);
  if (window.HUD) HUD.sfx('trap');
  const sp = tr.sp;
  const hits = [{ c: tr.c, r: tr.r }];
  if (sp.trap.aoe) for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]])
    hits.push({ c: tr.c + dc, r: tr.r + dr });
  for (const h of hits){
    const v = unitAt(h.c, h.r);
    if (!v) continue;
    hurt(v, scaleRoll(tr.owner, sp, rng(sp.trap.dmg[0], sp.trap.dmg[1])));
  }
  checkOver();
}

/* ── the summon (Call Ram) ─────────────────────────────────────────
   A real unit on the turn track, inserted right after its owner (it acts
   next), wearing the sheep sheets. AI-driven even on the player's side —
   the flock has its own ideas. Dies for good. */
function spawnSummon(u, what, c, r){
  const v = mk(what, u.side, c, r);
  v.auto = true;
  v.owner = u;
  const idx = G.units.indexOf(u);       /* summoning happens on u's turn,
                                           so G.turn === idx stays correct */
  G.units.splice(idx + 1, 0, v);
  watchFoe(v);
  floatAt(c, r, 'baa!', '#F2E6C8');
}

function cast(u, sp, c, r){
  u.ap -= sp.ap;
  if (u.side === 0) FIGHT.casts += 1;
  if (sp.cd) u.cd[sp.id] = sp.cd + 1;   /* +1: ticked down at turn start */
  faceToward(u, { c, r });
  clip(u, 'attack');
  /* every cast speaks — hud.js owns the per-spell voice (element family
     + role variation), and the same line covers enemy casts for free */
  if (window.HUD) HUD.sfx('cast:' + sp.id);

  /* ── the extension mechanics (CLASSES_SPEC §4) ─────────────────── */
  if (sp.tp){                           /* Wind Step: blink to an empty tile */
    u.c = c; u.r = r;
    floatAt(c, r, 'whoosh', '#7FD4C1');
    checkTrap(u);
    return checkOver();
  }
  if (sp.swap){                         /* Flockmate: trade places          */
    const t = unitAt(c, r);
    if (t){
      const uc = u.c, ur = u.r;
      u.c = t.c; u.r = t.r; t.c = uc; t.r = ur;
      floatText(t, 'swap', '#7FD4C1');
      checkTrap(u); checkTrap(t);
    }
    return checkOver();
  }
  if (sp.summon){ spawnSummon(u, sp.summon, c, r); return; }
  if (sp.trap){ setTrap(u, sp, c, r); return; }
  if (sp.shield){                       /* Bulwark: scales off Strength     */
    u.shieldHp = scaleRoll(u, sp, rng(sp.shield[0], sp.shield[1]));
    floatText(u, 'shield ' + u.shieldHp, '#7FD4C1');
    return;
  }
  if (sp.heal){                         /* Mending Spring / Spring Blessing.
       The cross applies to FRIENDLY units only — a heal never benefits
       the opposing side (the spec's side filter, on top of the
       side-blind damage cross below). */
    const hits = [{ c, r }];
    if (sp.aoe) for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]])
      hits.push({ c:c + dc, r:r + dr });
    for (const h of hits){
      const t = unitAt(h.c, h.r);
      if (!t || t.side !== u.side || t.hp <= 0) continue;
      const n = scaleHealRoll(u, rng(sp.heal[0], sp.heal[1]));
      t.hp = Math.min(t.hpMax, t.hp + n);
      floatText(t, '+' + n, '#3DDC84');
    }
    return;
  }

  /* ── damage — a spell with reach gets a shot that travels ──────── */
  const ranged = sp.min > 1;
  const fly = ranged ? 240 : 0;
  if (ranged) shoot(u, { c, r }, sp.aoe ? '#FF6B84' : '#FFC542', fly);
  const hits = [{ c, r }];
  if (sp.aoe) for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) hits.push({ c:c + dc, r:r + dr });
  let any = false;
  for (const h of hits){
    const t = unitAt(h.c, h.r);
    if (!t) continue;
    any = true;
    hurt(t, scaleRoll(u, sp, rng(sp.dmg[0], sp.dmg[1])), null, fly);
    if (sp.push && t.hp > 0) pushFrom(u, t, sp.push);
    if (sp.pull && t.hp > 0) pullTo(u, t, sp.pull);
  }
  if (!any) floatAt(c, r, 'miss', '#9C97B8');
  checkOver();
}

function checkOver(){
  if (G.over) return;
  /* the fight is lost when the HERO falls — a surviving summon does not
     keep a headless side alive */
  if (!you()){ G.over = -1; showOver(); }
  else if (!alive(1).length){ G.over = 1; showOver(); }
}

/* ── turns ─────────────────────────────────────────────────────── */
function startTurn(){
  const u = me();
  if (!u || u.hp <= 0) return nextTurn();
  u.ap = u.apMax; u.mp = u.mpMax;
  u.shieldHp = 0;                /* Bulwark lasts until the caster's next
                                    turn STARTS — which is now */
  /* a quiet two-note nudge when the turn comes back to YOU */
  if (u.side === 0 && !u.auto && window.HUD) HUD.sfx('turn');
  for (const k in u.cd) if (u.cd[k] > 0) u.cd[k]--;
  sel = null;
  paint();
  if (u.side === 1 || u.auto){   /* enemies AND auto allies (the ram) */
    busy = true;
    setTimeout(() => aiTurn(u), 420);
  }
}
function nextTurn(){
  if (G.over) return;
  let guard = 0;
  do {
    G.turn = (G.turn + 1) % G.units.length;
    if (G.turn === 0) G.round++;
  } while (G.units[G.turn].hp <= 0 && guard++ < 20);
  startTurn();
}

/* ── the AI ────────────────────────────────────────────────────────
   Deliberately simple and READABLE, because its job is to make the
   player's decisions matter, not to win. It: fires if it already can,
   otherwise walks to the best tile it can reach and fires from there.
   "Best" prefers a tile it can actually shoot from — which is what
   makes an archer back away from you instead of hugging you. */
/* ── THE TRAINING DUMMY'S TURN — a lesson, not an opponent ─────────
   Predictable and gentle by construction:
   · It only swings if it can swing NOW — and its whole turn is either
     ONE 1-damage swat or ONE waddled tile, never both. So the turn it
     closes the distance it does NOT hit you: it "winds up", telegraphed
     in floating text, and you always get a full turn to respond.
   · mp 1 means it can never chase anything down.
   · Its only ability is the 1-damage Padded Swat: no burst exists. */
function dummyTurn(u){
  const target = nearestFoe(u);
  if (!target || G.over){ busy = false; return nextTurn(); }
  const sp = aiSpellsOf(u)[0];
  if (canCast(u, sp, target.c, target.r)){
    cast(u, sp, target.c, target.r);
    paint();
    return setTimeout(() => { busy = false; nextTurn(); }, 520);
  }
  /* out of reach: ONE slow hop along the real shortest path (full-board
     BFS — greedy distance-chasing wedged it behind a pillar forever,
     since with mp 1 every step around cover is momentarily "worse") */
  const to = u.mp > 0 ? stepToward(u, target) : null;
  if (to){
    u.mp = 0;
    return walk(u, [to], () => {
      if (dist(u, target) === 1 && !G.over)
        floatText(u, 'winds up…', '#FFC542');     /* the telegraph */
      paint();
      setTimeout(() => { busy = false; nextTurn(); }, 260);
    });
  }
  busy = false;
  setTimeout(nextTurn, 260);
}

/* first step of the shortest orthogonal path to any tile ADJACENT to the
   target (mp is not a limit on the search, only on the walking) */
function stepToward(u, target){
  const seen = new Map(); seen.set(key(u.c, u.r), null);
  const q = [{ c: u.c, r: u.r }];
  let goal = null;
  while (q.length){
    const n = q.shift();
    if (dist(n, target) === 1 && !(n.c === u.c && n.r === u.r)){ goal = n; break; }
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const c = n.c + dc, r = n.r + dr, k2 = key(c, r);
      if (!inBoard(c, r) || solid(c, r) || seen.has(k2)) continue;
      seen.set(k2, key(n.c, n.r));
      q.push({ c, r });
    }
  }
  if (!goal) return null;
  let cur = key(goal.c, goal.r), prev = null;
  while (cur && cur !== key(u.c, u.r)){ prev = cur; cur = seen.get(cur); }
  if (!prev) return null;
  const [c, r] = prev.split(',').map(Number);
  return { c, r };
}

function aiTurn(u){
  if (u.kind === 'dummy') return dummyTurn(u);
  /* an auto ally (the ram) runs the same brain at its nearest FOE, so
     one AI serves both sides of the board */
  const target = u.side === 1 ? (you() || nearestFoe(u)) : nearestFoe(u);
  if (!target || G.over){ busy = false; return nextTurn(); }

  const usable = aiSpellsOf(u).filter(s => u.ap >= s.ap && !(u.cd[s.id] > 0));
  /* the archer prefers reach; the grunt prefers the biggest hit it can land */
  /* a unit's identity is the spell it leads with — the archer holds range
     with Bolt, the mage opens with Blast, the warrior and the sheep close
     and Strike. This is also what decides where each will STAND. */
  const ORDER = {
    archer: ['bolt', 'shove', 'strike', 'blast'],
    mage:   ['blast', 'bolt', 'shove', 'strike'],
    grunt:  ['strike', 'blast', 'bolt', 'shove'],
    sheep:  ['strike', 'shove', 'bolt', 'blast'],
    goblin: ['strike', 'shove', 'bolt', 'blast'],
    ram:    ['ramhorn'],
    /* EVERY CREATURE WITH ITS OWN KIT NEEDS A LINE HERE. Five did not have
       one — goat, gecko, dummy and both bosses — and fell through to the
       grunt's list, so they decided where to stand using `strike`: a spell
       none of them owns. The consequences were not cosmetic.

       The gecko is a range-2 skirmisher whose whole design is punishing you
       for standing in the open; it was walking into melee like a warrior.
       The Unquiet Choir is a ranged AoE caster you are meant to be unable to
       outrun — it was closing to arm's length, which throws away the entire
       fight. The goat and the Warden were accidentally fine, being melee
       anyway, which is why this survived: four fifths of it looked correct. */
    goat:        ['butt'],
    gecko:       ['taillash'],
    dummy:       ['thwack'],
    /* the Warden wants you ADJACENT — Undertow exists to drag you there */
    warden_boss: ['deadweight', 'undertow'],
    /* the Choir wants distance; Antiphon is only the punish for closing */
    choir_boss:  ['dirge', 'antiphon']
  };
  /* and a creature with no line still leads with a spell it OWNS, in the
     order its kit is written. A missing entry should mean "use the obvious
     default", never "borrow a warrior's identity". */
  const order = ORDER[u.kind] ||
                (AI_SPELLS[u.kind] ? AI_SPELLS[u.kind].map(s => s.id)
                                   : ORDER.grunt);
  const rank = s => order.indexOf(s.id);

  const shot = usable.filter(s => canCast(u, s, target.c, target.r))
                     .sort((a, b) => rank(a) - rank(b))[0];
  if (shot){
    cast(u, shot, target.c, target.r);
    paint();
    return setTimeout(() => { busy = false; if (!G.over) aiTurn(u); else nextTurn(); }, 480);
  }

  /* NO SHOT: move. And the whole trick is WHERE.
     The first version of this walked toward the ENEMY, which looks
     sensible and is wrong: an archer that closes distance ends up
     standing on top of you, inside its own minimum range, unable to
     fire — and if a wall is in the way it walks one greedy step, runs
     out of MP, and dithers on the spot for ever. (Measured: the archer
     did 0 damage in five rounds, oscillating between two tiles.)
     It must walk toward A PLACE IT CAN SHOOT FROM, which is a
     different destination entirely, and often BACKWARDS. */
  if (u.mp <= 0){ busy = false; return setTimeout(nextTurn, 220); }

  /* Every tile it could fire from — judged on the AP it will have NEXT
     turn, not the AP left now.
     This distinction is the difference between an archer and a confused
     swordsman. Using current AP, a unit that has just spent everything
     on a Bolt finds NO tile it can fire from, concludes there is nowhere
     good to stand, and walks into your face with its leftover MP. It was
     doing exactly that: bolt from range, then stroll into melee, and by
     round 7 it was poking with Strike. Where it wants to STAND is a
     question about next turn; whether it can shoot RIGHT NOW is the
     separate question above. */
  /* WHERE IT WANTS TO STAND is decided by the ONE spell this unit leads
     with — not by every spell it can afford.
     Using "any affordable spell" looked harmless and quietly ended the
     fight: a grunt's 4 max AP affords Bolt (range 2-5), so a grunt
     standing five tiles away counted as ALREADY WELL PLACED, held, and
     never advanced again. Both grunts camped at range, one of them
     parked on the archer's only way west, and the archer — walled in
     behind its own team — oscillated between two tiles for eight rounds.
     Measured: archer damage 121 -> 0, grunts never closed to melee once.
     A grunt's identity is Strike (range 1), so it must stand ADJACENT;
     an archer's is Bolt, so it must stand in the 2-5 band. Same code,
     opposite behaviour, which is what makes them feel like two things. */
  /* RESOLVE AGAINST THE UNIT'S OWN KIT FIRST. spellOf() searches every spell
     in the game and returns the first id match, so a shared id silently hands
     a creature someone else's numbers — the gecko's Tail Lash resolving to the
     tidebinder's Lash, with her range and her damage. The ids are unique again
     (see below), but resolving locally means a future collision cannot reach
     in here at all, rather than being a naming rule someone has to remember. */
  const own = AI_SPELLS[u.kind] || null;
  const find = id => (own && own.find(s => s.id === id)) || spellOf(id);
  const holds = order.map(find)
                     .filter(s => s && u.apMax >= s.ap && !(u.cd[s.id] > 0))
                     .slice(0, 1);
  const firing = [];
  for (let c = 0; c < W; c++) for (let r = 0; r < H; r++){
    if (!inBoard(c, r)) continue;              /* void: not a place to stand */
    if (solid(c, r) && !(c === u.c && r === u.r)) continue;
    const from = { c, r };
    if (holds.some(s => {
      const d = dist(from, target);
      return d >= s.min && d <= s.max && (!s.los || los(from, target));
    })) firing.push(from);
  }

  /* ALREADY WELL PLACED? Then hold. reach() excludes the unit's own tile,
     so without this the scoring can only ever choose somewhere ELSE, and
     a unit standing in a perfect firing lane would step out of it to
     score a fractionally shorter walk. Standing still is a move. */
  if (firing.some(f => f.c === u.c && f.r === u.r)){
    busy = false;
    return setTimeout(nextTurn, 260);
  }

  const opts = reach(u);
  let best = null;
  for (const [k, v] of opts){
    const [c, r] = k.split(',').map(Number);
    const here = { c, r };
    /* can I shoot from this very tile? that is worth more than anything */
    const shoots = firing.some(f => f.c === c && f.r === r);
    /* otherwise: how much CLOSER does this tile get me to any firing
       spot? Steps toward a shot, not steps toward the body. */
    let toFire = Infinity;
    for (const f of firing) toFire = Math.min(toFire, dist(here, f));
    if (!firing.length) toFire = dist(here, target);   /* nowhere to fire from: close in */
    const score = (shoots ? 1000 : 0) - toFire * 10 - v.d * 0.1;
    if (!best || score > best.score) best = { c, r, score };
  }

  if (best){
    const p = pathTo(u, best.c, best.r);
    if (p && p.length){
      u.mp -= p.length;
      /* MOVED is committed for the whole turn: after arriving it may
         SHOOT, but it may not choose a second destination. That single
         flag is what stops the re-plan-after-every-step dither. */
      walk(u, p, () => {
        paint();
        setTimeout(() => {
          busy = false;
          if (G.over) return nextTurn();
          u.mp = 0;              /* spent its move for this turn */
          aiTurn(u);             /* one more pass: can it fire from here? */
        }, 200);
      });
      return;
    }
  }
  busy = false;
  setTimeout(nextTurn, 260);
}

/* ── walking (pure presentation, but it is what sells a move) ──── */
function walk(u, path, done){
  let i = 0;
  const step = () => {
    if (i >= path.length){ anim = null; u.c = path[path.length - 1].c; u.r = path[path.length - 1].r;
      clip(u, 'idle'); paint(); return done && done(); }
    const from = i === 0 ? { c:u.c, r:u.r } : path[i - 1];
    const to = path[i];
    const a = anim = { u, from, to, t:0, step:i };
    /* THE WALK ANIMATION LIVES HERE, and for a while it did not: an earlier
       edit aimed at `anim = {...}` after a crash fix had already turned that
       line into `const a = anim = {...}`, so the replace silently matched
       nothing and every character slid across the board with its legs still.
       restart=false keeps the cycle running from tile to tile — restarting
       it each step resets a 100ms frame every 130ms, which looks identical
       to no animation at all. */
    const d8 = SPRITE.dirOf(to.c - from.c, to.r - from.r);
    if (d8) u.dir = d8;
    u.face = faceSign(from, to);
    clip(u, 'walk', false);
    /* 210ms a tile, not 130. Two reasons to slow it down: a six-frame
       cycle cannot read at all if a whole tile passes in 130ms, and on a
       tactical board you want to SEE the path being walked — the move is
       information, not a teleport with a smear. */
    const T0 = performance.now(), DUR = 210;
    const tick = now => {
      /* the match can be restarted mid-walk (Again), which clears anim —
         the frame already queued must then just stop, not crash */
      if (anim !== a) return;
      const k = Math.min(1, (now - T0) / DUR);
      anim.t = k; draw();
      if (k < 1) requestAnimationFrame(tick);
      else {
        u.c = to.c; u.r = to.r; anim = null;
        /* ENTERING a tile is what detonates a trap — mid-path included */
        checkTrap(u);                      /* hurt() plays 'die' if lethal */
        if (u.hp <= 0){ paint(); return done && done(); }
        i++; step();
      }
    };
    requestAnimationFrame(tick);
  };
  step();
}

/* ── THE TWO MODES ─────────────────────────────────────────────────
   Dofus ships both and lets you flip between them, and the reason is
   sound: painted ground is what you want to look at, and bare tiles are
   what you need when a turn actually matters and you are counting range.
   Neither is a compromise on the other, so both exist.

   MAP MODE draws a painted tile per CELL rather than one big picture of
   the arena. That is the only way to keep the owner's hard rule — the map
   must match the layout — true by construction instead of by eye: tile
   (c,r) is painted at iso(c,r), so it CANNOT drift out of alignment, at
   any zoom, on any screen. A single background image would only ever be
   approximately right. */
let mapMode = true;
const TILESET = { img:null, ready:false, cols:2, rows:2, cw:0, ch:0 };
(function loadTiles(){
  const im = new Image();
  im.onload = () => {
    TILESET.img = im;
    /* the sheet is 2x2 cells in the TOP 3/4 of a square image */
    TILESET.cw = Math.floor(im.width / TILESET.cols);
    TILESET.ch = Math.floor(im.height * 0.75 / TILESET.rows);
    TILESET.ready = true;
  };
  im.onerror = () => { TILESET.ready = false; };
  im.src = 'art/tiles.png';
})();

/* ── the obstacles ─────────────────────────────────────────────────
   Boulders, rocks, a mossy stump and a bush, one per blocked cell.
   They REPLACE the purple blocks only in map mode: in tactical mode the
   blocks stay, and that is deliberate rather than lazy. A rock drawn in
   the same palette as the ground is scenery; the block is a statement
   that a tile is impassable. When you are counting range mid-turn you
   want the statement, which is the whole reason both modes exist. */
const PROPS = { img:null, ready:false, cw:0, ch:0 };
(function loadProps(){
  const im = new Image();
  im.onload = () => { PROPS.img = im; PROPS.cw = Math.floor(im.width/2);
                      PROPS.ch = Math.floor(im.height/2); PROPS.ready = true; };
  im.onerror = () => { PROPS.ready = false; };
  im.src = 'art/props.png';
})();

function drawProp(c, r){
  if (!PROPS.ready) return false;
  const p = iso(c, r);
  const t = Math.abs((c * 40503) ^ (r * 12289)) % 4;
  const sx = (t % 2) * PROPS.cw, sy = Math.floor(t / 2) * PROPS.ch;
  /* drawn with its BASE on the tile centre, standing up out of the floor,
     and a little wider than the tile so it overlaps its own ground */
  const w = TW * 1.25, h = w * (PROPS.ch / PROPS.cw);
  /* a soft contact shadow, or the object looks pasted on rather than
     standing on the grass */
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.42);
  ctx.beginPath(); ctx.arc(0, 0, TW * 0.34, 0, 6.283);
  ctx.fillStyle = 'rgba(0,0,0,.30)'; ctx.fill(); ctx.restore();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(PROPS.img, sx, sy, PROPS.cw, PROPS.ch,
                p.x - w / 2, p.y + TH * 0.30 - h, w, h);
  return true;
}

/* which of the four painted tiles a cell wears. Deterministic from the
   coordinates — a tile must never change when the board repaints. */
function tileOf(c, r){
  const h = (c * 73856093) ^ (r * 19349663);
  return Math.abs(h) % 4;
}

function drawGroundTile(c, r){
  if (!TILESET.ready) return false;
  const p = iso(c, r), t = tileOf(c, r);
  const sx = (t % 2) * TILESET.cw, sy = Math.floor(t / 2) * TILESET.ch;
  /* +1 on each side hides the seam that appears between two scaled
     diamonds when the board zoom lands on a fraction of a pixel */
  ctx.drawImage(TILESET.img, sx, sy, TILESET.cw, TILESET.ch,
                p.x - TW / 2 - 1, p.y - TH / 2 - 1, TW + 2, TH + 2);
  return true;
}

/* ── drawing ───────────────────────────────────────────────────── */
const COL = {
  floor:'#241F44', floorAlt:'#2A2450', edge:'rgba(255,255,255,.055)',
  wall:'#4A3F7A', wallTop:'#6B5CA8',
  move:'rgba(61,220,132,.30)', moveEdge:'rgba(61,220,132,.85)',
  cast:'rgba(255,107,132,.26)', castEdge:'rgba(255,107,132,.9)',
  hover:'rgba(255,197,66,.30)'
};

function diamond(p){
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - TH / 2);
  ctx.lineTo(p.x + TW / 2, p.y);
  ctx.lineTo(p.x, p.y + TH / 2);
  ctx.lineTo(p.x - TW / 2, p.y);
  ctx.closePath();
}

/* the three commonest grounds on this map, for the surround. Water and
   the cliff rim are the island's EDGE — repeating them outward would draw
   a sea of cliffs rather than more country. Same rule as world.js. */
let SURROUND_FILL = null;
function surroundFill(){
  if (SURROUND_FILL) return SURROUND_FILL;
  const T = ARENA.WT.TILES, n = {};
  for (const cell of BOARD.CELLS){
    const i = ARENA.map.ground[cell.r][cell.c];
    if (!i || i === T.WATER || i === T.CLIFF) continue;
    n[i] = (n[i] || 0) + 1;
  }
  const best = Object.keys(n).map(Number).sort((a, b) => n[b] - n[a]).slice(0, 3);
  return (SURROUND_FILL = best.length ? best : [T.GRASS]);
}

let hoverTile = null, moveSet = null, castSet = null;

function draw(){
  const w = cv.width / DPR, h = cv.height / DPR;
  camera();            /* the turn may have passed to someone else */
  ctx.clearRect(0, 0, w / SC, h / SC);   /* ctx is scaled by SC */

  /* floor — the MAP's own ground when the fight is on a map, the generic
     painted tiles on the standalone board, or bare diamonds in tactical
     mode. On a map the blocked cells are drawn too: water and cliff are
     ground you can see and not walk on, and skipping them left holes in
     the lake. */
  const onMap = mapMode && ARENA && WORLD_ATLAS.ready;
  /* THE PAINTING FIRST, AND THEN NOTHING ELSE OF THE GROUND. Registration
     is the same arithmetic world.js uses — GRID.RECT is the picture — so
     the fight opens on exactly the screen the player tapped, and the whole
     ground pass and its surround are skipped. */
  const onPaint = mapMode && ARENA && WORLD_BG.ready;
  if (onPaint){
    const R = BOARD.RECT, b = WORLD_BG.img;
    const kk = Math.max(R.w / b.width, R.h / b.height);
    const pw = b.width * kk, ph = b.height * kk;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(b, ORX + R.x + R.w / 2 - pw / 2,
                     ORY + R.y + R.h / 2 - ph / 2, pw, ph);
  }
  const painted = mapMode && TILESET.ready;
  /* THE SURROUND, exactly as world.js draws it: the map's own ground
     continued past the board until the screen is covered. Without it the
     fight sat in a dark frame while the screen you started it from did
     not, and the two are supposed to be the same place. Nothing here is
     walkable — it is drawn first and everything paints over it. */
  /* ONLY WHEN THERE IS SOMETHING TO SURROUND. The board is bigger than a
     phone now, so the usual case is that it covers the screen completely
     and every one of these tiles is off-camera — thousands of drawImage
     calls a frame for nothing, which on a Pi is the difference between a
     fight that runs and one that hangs. */
  const R0 = BOARD.RECT;
  const covers = (ORX <= -R0.x && ORY <= -R0.y &&
                  w / SC - ORX <= R0.x + R0.w && h / SC - ORY <= R0.y + R0.h);
  if (onMap && !onPaint && !covers){
    const fill = surroundFill();
    const halfW = (w / SC) / 2, halfH = (h / SC) / 2;
    const pad = Math.ceil((halfW / (TW / 2) + halfH / (TH / 2)) / 2) + 2;
    for (let r = -pad; r < H + pad; r++)
      for (let c = -pad; c < W + pad; c++){
        if (inBoard(c, r)) continue;
        const p = iso(c, r);
        if (p.x < -TW || p.x > w / SC + TW || p.y < -TH || p.y > h / SC + TH) continue;
        const i = fill[(((c * 7 + r * 13) % fill.length) + fill.length) % fill.length];
        ARENA.WT.drawTile(ctx, WORLD_ATLAS.img, i, p.x, p.y);
      }
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++){
    if (!inBoard(c, r)) continue;              /* outside the rectangle */
    const p = iso(c, r), k = key(c, r);
    if (onPaint){
      /* THE PICTURE DREW THE GROUND; THE FIGHT STILL OWES YOU A GRID. A
         tactics fight is played by counting tiles, and a painting has no
         tiles in it — this faint lattice on the walkable cells is the one
         thing combat adds to the screen the player tapped. */
      if (!G.blocked.has(k)){
        diamond(p);
        ctx.strokeStyle = 'rgba(0,0,0,.20)'; ctx.lineWidth = 1; ctx.stroke();
      }
      continue;
    }
    if (onMap){
      const g = ARENA.map.ground[r][c];
      if (g) ARENA.WT.drawTile(ctx, WORLD_ATLAS.img, g, p.x, p.y);
      /* the same whisper of a grid the painted board gets: enough to
         count squares with, faint enough that the ground still reads as
         ground. A tactics fight is played by counting, and the map does
         not draw one — this is the one thing the fight adds to it. */
      if (!G.blocked.has(k)){
        diamond(p);
        ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.stroke();
      }
      continue;
    }
    if (G.blocked.has(k)) continue;
    if (painted){
      drawGroundTile(c, r);
      /* a whisper of a grid: enough to count squares, faint enough that
         the ground still reads as ground */
      diamond(p);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.stroke();
    } else {
      diamond(p);
      ctx.fillStyle = ((c + r) & 1) ? COL.floor : COL.floorAlt;
      ctx.fill();
      ctx.strokeStyle = COL.edge; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  /* overlays: movement, then cast range on top */
  if (moveSet) for (const k of moveSet.keys()){
    const [c, r] = k.split(',').map(Number), p = iso(c, r);
    diamond(p); ctx.fillStyle = COL.move; ctx.fill();
    ctx.strokeStyle = COL.moveEdge; ctx.lineWidth = 1.2; ctx.stroke();
  }
  if (castSet) for (const t of castSet){
    const p = iso(t.c, t.r);
    diamond(p); ctx.fillStyle = COL.cast; ctx.fill();
    ctx.strokeStyle = COL.castEdge; ctx.lineWidth = 1.4; ctx.stroke();
  }
  if (hoverTile && inBoard(hoverTile.c, hoverTile.r)){
    const p = iso(hoverTile.c, hoverTile.r);
    diamond(p); ctx.fillStyle = COL.hover; ctx.fill();
    ctx.strokeStyle = '#FFC542'; ctx.lineWidth = 2; ctx.stroke();
  }
  /* armed traps — drawn VISIBLE (spec: invisibility is out of scope) */
  if (G.traps) for (const t of G.traps){
    const p = iso(t.c, t.r);
    diamond(p); ctx.fillStyle = 'rgba(232,98,45,.30)'; ctx.fill();
    ctx.strokeStyle = '#E8622D'; ctx.lineWidth = 2; ctx.stroke();
  }

  /* walls + units, PAINTER'S ORDER (back rows first) or they overlap wrong */
  const things = [];
  for (const k of G.blocked){
    const [c, r] = k.split(',').map(Number);
    things.push({ c, r, wall:true });
  }
  /* THE DEAD ARE STILL DRAWN. This said `if (u.hp > 0)`, so the instant a
     unit's hp hit zero it stopped being rendered — hurt() set the 'die'
     clip and nothing ever showed it. Characters simply vanished mid-blow,
     which is why the death animation existed and was never seen.

     They are drawn but not otherwise present: unitAt(), alive() and the
     targeting all still filter on hp > 0, so a body blocks nothing, can be
     walked over, and cannot be hit again. The 'die' clip holds on its last
     frame (sprite.js CLIPS.die.hold), so the fallen stay fallen on the
     board for the rest of the fight instead of blinking out. */
  for (const u of G.units){
    let c = u.c, r = u.r;
    if (anim && anim.u === u){
      c = anim.from.c + (anim.to.c - anim.from.c) * anim.t;
      r = anim.from.r + (anim.to.r - anim.from.r) * anim.t;
    }
    things.push({ c, r, u });
  }
  things.sort((a, b) => (a.c + a.r) - (b.c + b.r));
  for (const t of things){
    if (!t.wall) { drawUnit(t.u, t.c, t.r); continue; }
    /* THE MAP'S OWN SCENERY, in painter's order with the fighters, so a
       tree stands in front of what is behind it and behind what is in
       front. A blocked cell with no decor is water or cliff — its ground
       already said so, and stamping a purple block on the lake would be
       the board disagreeing with the picture underneath it. */
    /* ON A PAINTED MAP THE SCENERY IS ALREADY IN THE PICTURE. Stamping an
       atlas rock on top of a painted rock draws the same boulder twice, in
       two different styles, half a tile apart. */
    if (onPaint){ continue; }
    if (onMap){
      const d = ARENA.map.decor[t.r][t.c];
      if (d){
        const p = iso(t.c, t.r);
        ARENA.WT.drawTile(ctx, WORLD_ATLAS.img, d, p.x, p.y, true);
      }
      continue;
    }
    /* scenery in map mode, the unmistakable block in tactical mode */
    if (!(mapMode && drawProp(t.c, t.r))) drawWall(t.c, t.r);
  }
  drawShots();
}

function drawWall(c, r){
  const p = iso(c, r), hgt = 26;
  ctx.fillStyle = COL.wall;
  ctx.beginPath();
  ctx.moveTo(p.x - TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2);
  ctx.lineTo(p.x, p.y + TH / 2 - hgt); ctx.lineTo(p.x - TW / 2, p.y - hgt);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3C3266';
  ctx.beginPath();
  ctx.moveTo(p.x + TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2);
  ctx.lineTo(p.x, p.y + TH / 2 - hgt); ctx.lineTo(p.x + TW / 2, p.y - hgt);
  ctx.closePath(); ctx.fill();
  const q = { x:p.x, y:p.y - hgt };
  diamond(q); ctx.fillStyle = COL.wallTop; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.stroke();
}

function drawUnit(u, c, r){
  const p = iso(c, r);
  const t = performance.now() / 1000;
  const bob = Math.sin(t * 2.2 + u.bob) * 1.8;
  const mine = u.side === 0;

  /* THE PAINTED SPRITE, when the sheet has arrived. The drawn shape below
     stays as the fallback so the game is never blank waiting on art. */
  if (u.spr && u.spr.ready){
    /* shadow first, on the floor */
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.283);
    ctx.fillStyle = 'rgba(0,0,0,.36)'; ctx.fill(); ctx.restore();

    /* borrowed the hero sheet? then tint it so the sides still read */
    if (u.own && !u.own.ready && u.side === 1)
      u.hue = (u.kind === 'archer' ? 200 : 130);
    else if (u.own && u.own.ready) u.hue = 0;
    ctx.save();
    if (u.hue) ctx.filter = 'hue-rotate(' + u.hue + 'deg)';
    if (u.flash > 0){ ctx.filter = (u.hue ? 'hue-rotate(' + u.hue + 'deg) ' : '') +
      'brightness(' + (1 + u.flash * 1.6) + ')'; }
    /* the sheet cell is 256 tall for a ~62px tile, so the character stands
       about a tile and a half high — big enough to read, small enough that
       the board is still the thing you are looking at */
    /* walking and standing use the two-angle sheet when it is loaded, so
       a unit heading away shows its BACK instead of moon-walking toward
       you; everything else (attack, hit, die) stays on the action sheet */
    const D = SPRITE.DIR[u.dir] || SPRITE.DIR.SE;
    /* STANDING STILL MUST ALSO FACE THE RIGHT WAY.
       This used to read `clip === 'walk'`, so the directional sheet was
       only consulted during the second or so a unit was actually moving.
       Every other frame fell through to the action sheet, which is drawn
       front-on only — so everyone snapped back to facing the camera the
       instant they stopped, which is most of the time.
       Idle now uses the directional sheet too, held on its first frame:
       a standing pose that faces the enemy it is watching. The cost is
       that such a unit does not breathe, and that is the right trade —
       facing is information, breathing is only texture. */
    const still = (u.spr.clip === 'idle');
    const useDir = u.dspr && u.dspr.ready && (u.spr.clip === 'walk' || still);
    if (useDir && still){
      const DD = SPRITE.DIR[u.dir] || SPRITE.DIR.SE;
      if (u.dspr.clip !== 'walk.' + DD.row) SPRITE.play(u.dspr, 'walk.' + DD.row, true);
      /* IDLE MEANS STILL. Held on the measured both-feet-down frame and
         nothing else.
         A previous version alternated two frames of the walk cycle to fake
         breathing, and that was simply walking on the spot — the only
         frames available are strides, so any two of them swapped in place
         read as marching, not as standing. A real idle is a DRAWN pose,
         not a borrowed one; until those exist, a still figure standing
         squarely on both feet is honest and the movement stays meaningful. */
      u.dspr.frame = (u.dspr.stand && u.dspr.stand[DD.row] != null)
                     ? u.dspr.stand[DD.row] : 0;
      /* a DRAWN idle beats a held walk frame whenever one exists */
      if (u.ispr && u.ispr.ready){
        const want = 'idle.' + DD.row;
        if (u.ispr.clip !== want) SPRITE.play(u.ispr, want, true);
      }
    }
    if (useDir && still && u.ispr && u.ispr.ready)
      SPRITE.draw(ctx, u.ispr, p.x, p.y + 3, 0.30 * (u.big || 1), D.flip);
    else if (useDir) SPRITE.draw(ctx, u.dspr, p.x, p.y + 3, 0.30 * (u.big || 1), D.flip);
    else {
      /* swap onto the kind's own sheet the moment it finishes loading */
      if (u.own && u.own.ready && u.spr.img !== u.own.img){
        const keep = { clip:u.spr.clip, t:u.spr.t, frame:u.spr.frame, done:u.spr.done };
        u.spr = SPRITE.spawn(u.own); Object.assign(u.spr, keep);
      }
      /* monsters have no back-view sheet, but they must still TURN: the
         same direction table decides their mirror, so a sheep walking
         west faces west instead of staring at the camera */
      /* `big` scales a boss up. It is a draw multiplier and touches
         nothing else — hit boxes, ranges and tiles are all grid maths, so
         a larger drawing cannot desync from where the unit actually is. */
      SPRITE.draw(ctx, u.spr, p.x, p.y + 3, 0.30 * (u.big || 1), D.flip);
    }
    ctx.restore();
    if (u.flash > 0) u.flash = Math.max(0, u.flash - 0.06);

    /* Bulwark up? a steady teal ring says "braced" until it fades */
    if (u.shieldHp > 0){
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, 6.283);
      ctx.strokeStyle = '#7FD4C1'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    /* turn ring + HP bar, same as before */
    if (G.units[G.turn] === u && !G.over){
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, 16 + Math.sin(t * 4) * 1.5, 0, 6.283);
      ctx.strokeStyle = mine ? '#FFC542' : '#FF6B84'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
    /* CLAMPED. hp/hpMax is only 0..1 while nothing ever exceeds its
       maximum — the moment a heal (or a test harness) pushes hp above it,
       an unclamped bar draws thousands of pixels wide, straight across the
       board. Cheap to guard, invisible until it is not. */
    const bw2 = 30, hp2 = Math.max(0, Math.min(1, u.hp / u.hpMax)), cy2 = p.y - 62;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(p.x - bw2 / 2, cy2, bw2, 5);
    ctx.fillStyle = hp2 > .5 ? '#3DDC84' : hp2 > .25 ? '#FFC542' : '#FF6B84';
    ctx.fillRect(p.x - bw2 / 2 + 1, cy2 + 1, (bw2 - 2) * hp2, 3);
    return;
  }

  const body = mine ? '#4FA9E8' : (u.kind === 'archer' ? '#E88B45' : '#E8455F');
  const dark = mine ? '#2E6FA8' : (u.kind === 'archer' ? '#A55D24' : '#A32B40');

  /* shadow first, on the floor */
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, 0.5);
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.283);
  ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.fill();
  ctx.restore();

  const cy = p.y - 20 + bob;
  /* body */
  ctx.beginPath();
  ctx.moveTo(p.x - 10, p.y - 2);
  ctx.lineTo(p.x - 7, cy);
  ctx.lineTo(p.x + 7, cy);
  ctx.lineTo(p.x + 10, p.y - 2);
  ctx.closePath();
  ctx.fillStyle = body; ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.stroke();
  /* head */
  ctx.beginPath(); ctx.arc(p.x, cy - 7, 7.5, 0, 6.283);
  ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = dark; ctx.stroke();

  /* the hit flash — the only feedback that says "that landed" */
  if (u.flash > 0){
    ctx.save(); ctx.globalAlpha = u.flash * 0.75;
    ctx.beginPath(); ctx.arc(p.x, cy - 4, 17, 0, 6.283);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    u.flash = Math.max(0, u.flash - 0.06);
  }
  /* turn marker: a ring under whoever is acting */
  if (G.units[G.turn] === u && !G.over){
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
    ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(t * 4) * 1.5, 0, 6.283);
    ctx.strokeStyle = mine ? '#FFC542' : '#FF6B84'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  /* HP bar — always visible. Hunting for a health number is not tactics. */
  const bw = 30, hp = Math.max(0, Math.min(1, u.hp / u.hpMax));
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(p.x - bw / 2, cy - 22, bw, 5);
  ctx.fillStyle = hp > .5 ? '#3DDC84' : hp > .25 ? '#FFC542' : '#FF6B84';
  ctx.fillRect(p.x - bw / 2 + 1, cy - 21, (bw - 2) * hp, 3);
}

/* keep the bob, the flash, the sprite playheads and the shots alive */
let lastT = performance.now();
let paused = false;
/* hold a sprite on its standing frame — the pose a character keeps whenever
   nothing is happening to it. */
function holdStill(s){
  if (!s) return;
  s.frame = (s.stand && s.stand[0] != null) ? s.stand[0] : 0;
  s.t = 0;
}

function loop(now){
  now = now || performance.now();
  /* PAUSED MEANS PAUSED, not hidden. The rotate gate covers the fight with a
     card; without this the match underneath keeps stepping sprites and
     burning battery behind an opaque panel. lastT is reset on the way out so
     the first frame back does not see a dt of however long the phone was
     upright and snap every animation forward. */
  if (paused){ lastT = now; requestAnimationFrame(loop); return; }
  const dt = Math.min(64, now - lastT); lastT = now;
  if (G && G.units) for (const u of G.units){
    if (!u.spr) continue;
    /* NOBODY BREATHES. STANDING IS A POSE.
       The owner's rule, and it is Dofus's: a character animates when it MOVES
       or ATTACKS, and otherwise holds a position. Not in the overworld, not in
       combat, not while it is someone's turn.

       This used to breathe the active unit as a turn indicator. That is a
       real problem solved the wrong way — the turn is already shown by the
       turn strip, the highlighted tiles and the spell bar, and an idling
       sprite is a fourth signal nobody asked for. Costing frames of art and
       CPU for it is exactly the complexity the owner is cutting: the more
       elaborate the RPG, the less of it is worth the time.

       A unit MID-ACTION still animates — walking, swinging, being hit, dying
       are consequences playing out and must never freeze. That is the whole
       distinction: motion is for things that are happening. */
    /* standing still? then turn and look at your enemy. A unit that is
       mid-walk or mid-swing keeps the facing its action gave it. */
    const busyNow = (anim && anim.u === u) || (u.spr.clip !== 'idle' && !u.spr.done);
    /* MONSTERS WATCH YOU. YOUR CHARACTER KEEPS THE WAY YOU SENT HIM.
       Auto-facing was applied to everything, which meant that the moment
       your walk ended he spun back to point at the nearest enemy — so
       walking north and stopping looked like turning round to face the
       camera. The player's facing is an OUTCOME OF YOUR ORDERS: it is
       whatever his last walk or spell left it as, and nothing overrides
       that behind your back. The AI has no orders to remember, so it
       tracks its target instead. */
    if (!busyNow && u.hp > 0 && (u.side !== 0 || u.auto)) watchFoe(u);
    /* mid-action only. Whose turn it is no longer makes a sprite move. */
    if (!busyNow){
      /* the MEASURED standing frame, not frame 0: in a walk cycle frame 0 is
         a contact pose with a foot in the air, and holding it is what made
         everything look like it was hovering (see sprite.js standingFrames). */
      holdStill(u.spr);
      if (u.dspr) holdStill(u.dspr);
      if (u.ispr) holdStill(u.ispr);
      continue;
    }
    /* WHILE WALKING, THE LEGS ARE DRIVEN BY THE MOVEMENT, NOT BY A CLOCK.
       A tile takes 210ms and a six-frame cycle on a timer takes 750ms, so a
       single-tile move used to start the walk, get 1.7 frames in, and snap
       back to standing mid-stride — which is the jerk you get when you move
       one square. Tying the frame to how far along the tile the unit is
       makes ONE TILE EXACTLY ONE FOOTFALL: it always ends on a planted
       foot, two tiles complete the cycle, and the feet stop sliding
       because they are no longer racing the movement. */
    if (anim && anim.u === u && u.dspr){
      const PER = 3;                                  /* frames per tile */
      const base = ((anim.step || 0) * PER) % 6;
      u.dspr.frame = (base + Math.min(PER - 1, Math.floor(anim.t * PER))) % 6;
      SPRITE.step(u.spr, dt);
    } else {
      SPRITE.step(u.spr, dt);
      if (u.dspr) SPRITE.step(u.dspr, dt);
    }
    if (u.ispr) SPRITE.step(u.ispr, dt);
    /* a one-shot clip falls back to idle, except death, which stays down */
    if (u.spr.done && u.spr.clip !== 'die' && u.hp > 0) clip(u, 'idle');
  }
  draw();
  requestAnimationFrame(loop);
}

/* ── floating text ─────────────────────────────────────────────── */
function floatAt(c, r, txt, col){
  const p = iso(c, r), host = document.getElementById('float');
  const box = document.getElementById('boardwrap').getBoundingClientRect();
  const e = document.createElement('div');
  e.className = 'dmg'; e.textContent = txt; e.style.color = col;
  e.style.left = (p.x * SC) + 'px'; e.style.top = (p.y * SC - 34) + 'px';
  host.appendChild(e);
  setTimeout(() => { try { e.remove(); } catch (err){} }, 1050);
}
function floatText(u, txt, col){ floatAt(u.c, u.r, txt, col); }

let toastT = null;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1700);
}

/* ── input ─────────────────────────────────────────────────────── */
function tileFromEvent(ev){
  const rect = cv.getBoundingClientRect();
  const pt = ev.touches ? ev.touches[0] : ev;
  return unIso(pt.clientX - rect.left, pt.clientY - rect.top);
}

function onTap(ev){
  if (busy || anim || G.over || !G.ready) return;
  const u = me();
  if (!u || u.side !== 0 || u.auto) return;
  const t = tileFromEvent(ev);
  if (!inBoard(t.c, t.r)) return;

  if (sel){
    const sp = spellOf(sel);
    if (canCast(u, sp, t.c, t.r)){
      cast(u, sp, t.c, t.r);
      sel = null;
      paint();
    } else {
      toast('Out of range, or no clear line.');
    }
    return;
  }
  /* no spell chosen: this is a move */
  const p = pathTo(u, t.c, t.r);
  if (!p || !p.length){
    if (unitAt(t.c, t.r)) toast('Pick a spell first to attack.');
    else toast('Too far — you have ' + u.mp + ' MP.');
    return;
  }
  u.mp -= p.length;
  walk(u, p, paint);
}

function onHover(ev){
  if (busy || anim || G.over) return;
  const u = me(); if (!u || u.side !== 0 || u.auto) return;
  hoverTile = tileFromEvent(ev);
  draw();
}

/* ── painting the UI ───────────────────────────────────────────── */
const NAMES = { grunt:'Grunt', archer:'Archer', mage:'Mage', sheep:'Sheep',
                dummy:'The dummy', ram:'Your ram' };

/* the HERO unit, dead or alive. The orbs ALWAYS read your vitals, never
   the acting unit's (HUD_SPEC §8): on an enemy's turn the crystal ball
   still shows YOUR hp — and visibly reacts when their hit lands — and a
   summoned ram's turn does not hijack your pools. you() filters hp > 0,
   which is right everywhere else and wrong here: a dead hero must read
   as an empty ball, not a missing one. */
function heroUnit(){ return G.units.find(v => v.side === 0 && !v.auto); }

/* ONE snapshot is the whole combat UI (HUD_SPEC §7.4). tactics owns the
   rules and says what it knows; hud.js owns every pixel of the chrome —
   the grown skill bar, the icon buttons with their AP badges, the
   long-press tooltips, the orbs, Map and End turn. Guarded: lab pages
   load tactics.js without hud.js and must keep working. */
function paint(){
  const u = me();
  if (!u) return;
  const mine = u.side === 0 && !u.auto && !G.over;

  moveSet = (mine && !sel && u.mp > 0) ? reach(u) : null;
  castSet = (mine && sel) ? castTiles(u, spellOf(sel)) : null;
  hoverTile = null;

  if (window.HUD){
    const h = heroUnit();
    HUD.combatPaint({
      over: G.over,
      round: G.round,
      mine,
      hero: h ? { hp: h.hp, hpMax: h.hpMax, ap: h.ap, apMax: h.apMax,
                  mp: h.mp, mpMax: h.mpMax }
              : { hp: 0, hpMax: 1, ap: 0, apMax: 6, mp: 0, mpMax: 3 },
      /* exactly the strings the old #who line showed */
      turn: {
        name: G.over ? (G.over > 0 ? 'You won' : 'You lost')
            : mine ? 'Your turn' : (NAMES[u.kind] || 'Grunt') + ' is moving',
        hint: G.over ? 'Tap Again'
            : mine ? (sel ? spellOf(sel).hint
                          : 'Tap the floor to move · pick a spell to attack')
            : 'Round ' + G.round
      },
      sel,
      mapMode,
      /* the chosen class's kit (HERO_SPELLS). `off` is the OLD disable
         rule verbatim — Call Ram greys out while its ram is alive: one
         summon per caster, spec rule. The rules did not move. */
      spells: HERO_SPELLS.map(s => {
        const cd = u.cd[s.id] || 0;
        return { id: s.id, name: s.name, ap: s.ap, min: s.min, max: s.max,
                 los: s.los, cd,
                 off: !!(!mine || u.ap < s.ap || cd > 0 ||
                         (s.summon && liveSummonOf(u))),
                 hint: s.hint };
      })
    });
  }
  draw();
}

/* ── XP AND DROPS ────────────────────────────────────────────────
   What a fight pays. XP is per FALLEN ENEMY and scales with its level, so
   a harder group is worth more without anyone maintaining a second table.

   The client computing this is a KNOWN, TEMPORARY hole: once the relay is
   authoritative it hands down the reward and this becomes display only
   (see TODO.md section 4). It is written as one function so there is
   exactly one place to cut over. */
function fightSpoils(){
  const foes = G.units.filter(u => u.side === 1);
  let xp = 0, coins = 0;
  const drops = [];
  for (const f of foes){
    if (f.hp > 0) continue;                       /* only the fallen pay */
    if (f.kind === 'dummy') continue;             /* the drill pays nothing */
    const lvl = Math.max(1, f.level | 0 || 1);
    xp += 12 + lvl * 8;
    coins += (window.PURSE ? PURSE.forKill(lvl) : 0);
    if (f.drop) drops.push(f.drop);

    /* THE RARE OPEN-WORLD ROLL, once PER FALLEN ENEMY: a four-mob group is
       four rolls, which is why 5% is not as stingy as it reads. The table
       lives in gear.js so the game's generosity is one edit rather than a
       hunt through the mob roster. */
    if (window.GEAR && !bossId()) {
      const g = GEAR.mobDrop(lvl);
      if (g) drops.push(GEAR.record(g));
    }
  }

  /* THE BOSS PAYS ONCE FOR THE FIGHT, not once per corpse.
     The first version keyed this off a `boss` flag on the fallen UNIT, which
     nothing ever sets — units are built from a list of kind strings — so it
     could never have fired at all. Worse, had it fired it would have sat
     inside the per-enemy loop and paid a piece for every minion in the boss
     room. The owner's rule is one piece per boss kill: that is what makes a
     set take several runs to assemble, and it is the whole reason to go back.
     The encounter marker is the authority, so it is read once, out here. */
  const boss = bossId();
  if (boss && window.GEAR && foes.every(f => f.hp <= 0)) {
    const g = GEAR.bossDrop(boss);
    if (g) drops.push(GEAR.record(g));
  }
  return { xp, coins, drops };
}

/* which boss fight this is, from the marker the world handed us, or null */
function bossId(){
  try {
    const p = parentWin();
    const m = p && p.QUEST && p.QUEST.currentFight && p.QUEST.currentFight();
    return (m && m.boss) || null;
  } catch (e){ return null; }
}

function showOver(){
  const won = G.over > 0;
  const drill = G.units.some(u => u.kind === 'dummy');   /* the practice bout */
  const spoils = won ? fightSpoils() : { xp: 0, drops: [] };

  /* WHERE THE CHARACTER ACTUALLY LIVES. Combat runs as an index.html iframe
     inside world.html, and index.html does not load player.js — so HERO and
     PANELS are on the PARENT. Granting against window alone worked in the
     standalone testbed and would have silently paid nothing in the real
     game, which is the kind of bug that only surfaces when someone asks
     why they never level up. Same-origin, so reaching up is safe; guarded
     because standalone has no parent to reach. */
  function host(name){
    try { if (window[name]) return window[name]; } catch (e) {}
    try { if (window.parent && window.parent !== window && window.parent[name])
            return window.parent[name]; } catch (e) {}
    return null;
  }

  /* GRANT FIRST, DISPLAY SECOND. If the screen is dismissed early, or the
     tab dies mid-animation, the player still keeps what they earned — the
     same ordering rule KARTI's chip payouts use. */
  let lv = null;
  const HEROx = host('HERO'), PANELSx = host('PANELS');
  if (won && spoils.xp && HEROx && HEROx.gainXp) lv = HEROx.gainXp(spoils.xp);
  if (won && spoils.drops.length && PANELSx && PANELSx.give)
    spoils.drops.forEach(d => { try { PANELSx.give(d); } catch (e) {} });
  /* COINS: REPORT WHAT WAS PAID, NOT WHAT WAS ROLLED. PURSE.earn returns the
     amount that actually reached the wallet, which is less than asked once
     the day's ceiling is hit and nothing at all beyond it. Showing the rolled
     figure would promise coins the player never received — and they would
     check, because it is the same wallet the party games fill. */
  const P$ = host('PURSE') || window.PURSE;
  FIGHT.coins = (won && spoils.coins && P$)
    ? P$.earn(spoils.coins, 'qawmien-kill') : 0;
  FIGHT.xp = spoils.xp;

  /* HP PERSISTS OUT OF THE FIGHT. The owner's rule: you leave a fight on
     whatever hp you finished with and regenerate slowly in the world, unless
     you drink something. Healing to full on victory would make every fight
     free and every potion pointless.
     A LOSS leaves you on 1, not 0 — dying to a wandering group should cost
     you time and a potion, not your character. */
  try {
    const meU = you() || G.units.find(u => u.side === 0);
    const H = host('HERO');
    if (H && H.setHp && meU)
      H.setHp(won ? Math.max(1, meU.hp | 0) : 1);
  } catch (e) {}

  const t = document.getElementById('ovt');
  const p = document.getElementById('ovp');
  t.textContent = won ? (lv && lv.levels ? 'Level ' + lv.to + '!' : 'You won')
                      : 'You lost';

  if (!won){
    p.textContent = 'They closed the distance. Did you have a way out you did not see?';
  } else {
    /* Per-FIGHTER xp, not one lump. There is one fighter today; writing it
       as a list now is what makes a party read correctly later instead of
       needing the screen rebuilt. */
    const rows = [];
    const me = you() || G.units[0];
    rows.push(['<b>' + esc(me && me.name ? me.name : 'You') + '</b>',
               '+' + spoils.xp + ' XP']);
    if (lv && lv.levels)
      rows.push(['Level ' + lv.from + ' &rarr; ' + lv.to,
                 '+' + (lv.points || 0) + ' points']);
    if (spoils.drops.length)
      rows.push(['Found', spoils.drops.map(d => esc(d.name || d.id)).join(', ')]);
    /* Coins, and the truth when the day's ceiling has stopped them. Saying
       nothing would read as the drop being broken; saying the rolled number
       would be a lie about the same wallet the party games fill. */
    if (FIGHT.coins) rows.push(['Coins', '+' + FIGHT.coins]);
    else if (spoils.coins)
      rows.push(['Coins', 'none left today']);
    rows.push(['Damage dealt', String(FIGHT.dealt)]);
    rows.push(['Damage taken', String(FIGHT.taken)]);
    rows.push(['Spells cast', String(FIGHT.casts)]);
    rows.push(['Rounds', String(G.round)]);

    p.innerHTML =
      (drill ? '<div style="margin-bottom:8px">The stuffing is everywhere. ' +
               'You know the moves now.</div>' : '') +
      '<div class="res">' + rows.map(r =>
        '<div class="res-r"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>'
      ).join('') + '</div>';
  }
  document.getElementById('over').classList.add('on');
  paint();
}

/* THE HOST WAITS FOR THIS, not for G.over. world.html used to poll G.over and
   tear the fight down the moment it flipped — inside half a second — so the
   results screen was destroyed before anyone could read what they had won.
   Now the fight stays up until the player presses OK. */
function closeResults(){
  G.closed = true;
  document.getElementById('over').classList.remove('on');
}

function esc(v){
  return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/* ── wiring ────────────────────────────────────────────────────── */
cv.addEventListener('click', onTap);
cv.addEventListener('mousemove', onHover);
cv.addEventListener('touchstart', e => { onHover(e); }, { passive:true });
{ const rb = document.getElementById('readygo');
  if (rb) rb.onclick = beginFight; }
document.getElementById('again').onclick = newMatch;
{ const d = document.getElementById('done');
  if (d) d.onclick = closeResults;
  /* 'AGAIN' IS A TESTBED CONTROL, NOT A GAME ONE. In the real game you do not
     replay a fight you just won — you take your xp and walk away — so it is
     hidden whenever combat is running inside the world. It stays for
     index.html on its own, where restarting is the only way to try something
     twice. */
  const a = document.getElementById('again');
  if (a && window.parent !== window) a.style.display = 'none'; }
window.addEventListener('resize', fit);

/* THE HUD IS THE COMBAT CHROME (HUD_SPEC §7). Booted before newMatch so
   the very first paint() lands on a live bar and plays the grow. The
   actions carry the exact guards the deleted #end/#undo/#map handlers
   had — Cancel and Skip are gone on purpose: re-tapping the selected
   icon deselects (the sel toggle below), and "skip" IS End turn. hud.js
   itself refuses taps on `off` icons (toast + error sfx), so 'spell'
   only ever arrives for a castable one; the side re-check is against a
   stale snapshot, not a second rule. */
if (window.HUD) HUD.init({ mode: 'combat', onAction: (action, arg) => {
  if (action === 'spell'){
    const u = me();
    if (G.over || busy || !u || u.side !== 0 || u.auto) return;
    sel = (sel === arg) ? null : arg;
    paint();
  } else if (action === 'end'){
    if (busy || anim || G.over) return;
    if (me().side !== 0 || me().auto) return;
    sel = null; nextTurn();
  } else if (action === 'map'){
    /* the tactical toggle. Dofus keeps this on the main bar rather than
       buried in settings, because you flip it mid-turn when a range
       suddenly matters. paint() carries the new state back to the HUD
       (aria-pressed on the Map button rides the snapshot). */
    mapMode = !mapMode;
    paint();
  }
}});

/* the headless harness drives these — and hud.js reads spellOf() to
   recover a spell's ELEMENT for the icon tint (the snapshot omits elem
   by contract, §7.4). Exported BEFORE newMatch(): the first paint()
   builds the skill icons exactly once, so window.T must already exist
   or every classed spell would render in the fallback gold for good. */
window.T = { _draw: draw, checkOver, closeResults, beginFight, _walk: walk, _SC: () => SC, _tiles: () => ({ready:TILESET.ready, cw:TILESET.cw, ch:TILESET.ch}), get G(){ return G; }, RULES, SPELLS, HERO_SPELLS,
             get HCFG(){ return HCFG; }, reach, pathTo, los, canCast,
             castTiles, dist, newMatch, nextTurn, cast, spellOf, me, you, iso, unIso,
             get sel(){ return sel; }, set sel(v){ sel = v; }, paint,
             /* onTap ignores a tap while either of these is set. Without a
                way to see them, a swallowed tap is indistinguishable from a
                broken one, and a test harness cannot wait for the moment the
                board is actually interactive. */
             get busy(){ return busy; }, get anim(){ return anim; },
             /* the rotate gate drives this — see landscape.js */
             setPaused(v){ paused = !!v; }, get paused(){ return paused; } };

newMatch();
fit();
loop();
