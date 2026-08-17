# KARTI — the ladder

XP from every game, a level that pays out, a face for every player, and one
registry the eleven games hang their customisation on.

**Files:** `js/progress-faces.js` (the twenty-six faces) → `js/progress.js`
(the engine and the whole API) → `js/progress-ui.js` (the reward screen, the
customisation screen, the face picker). Load them in that order.

---

## 1. The rule that outranks everything else

**Nothing here ever gates a game.** Levels unlock cosmetics, coins and card
packs. Not a game, not a mode, not a difficulty, not an opponent. Somebody
opening this app for the first time can play all eleven games immediately.
A cosmetic whose `slot` is `mode`, `difficulty`, `opponent`, `game` or `level`
is a bug, and the verification suite asserts there are none.

**Coins are not XP.** `S.coins` already exists and already buys card packs;
it keeps that job untouched. XP is a second, slower track earned by playing,
and a level-up *pays into* the coin purse. Two currencies, two jobs.

---

## 2. The API

```js
window.KARTI_XP = {
  level(), xp(), xpInto(), xpNeeded(), progress(), atMax(), MAX_LEVEL,

  award(game, result, opts) -> {counted, xp, level, from, levelled, unlocked[], coins, packs},
  finish({game, result, table})            // the same thing, with standings

  register(defs) -> n,                     // a game declares its cosmetics
  forGame(id)   -> bound facade            // ← what a game should actually use
  defs(), defsFor(game), def(id), games(), nextUnlock(game), unlocksAt(level),
  defsInSet(name), sets(),                 // the collections, e.g. 'summer'

  owns(id), equip(slot, id), equipped(slot, game), equippedDef(slot, game),
  unequip(slot, game),
  grant(id) -> {ok, already, why},         // ← the ONLY way to be GIVEN one

  onLevel(cb), onUnlock(cb), onEquip(cb), onAward(cb),   // each returns an off()

  open(tab), pickAvatar(opts),             // the screens

  faces(), face(id), ownsFace(id), avatar(), setAvatar(id),
  avatarFor(name, hint), avatarHTML(name, {size, hint, border, who, pv, cls, label}),
  describe(name, {who, hint, border, pv}) -> {face, border, pic, mine},
  paint(root),                             // draw avatars in a node you built

  photo(), hasPhoto(), usingPhoto(), canPhoto(), photoVer(), photoURL(who, ver),
  uploadPhoto(file) -> Promise<{ok, ver, bytes, why}>, removePhoto(), usePhoto(on),
  borders(), border(),                     // border() is the BARE id, for the wire

  ECON: { WEIGHT, RESULT, TAPER, FIRST_WIN, SPEED_FLOOR, MAX_LEVEL,
          need(L), cum(L), payout(L), par(game), weight(game), levelFromXp(xp) }
};
```

### A cosmetic definition

```js
{
  id:     'chess.board.pink',   // unique, /^[a-z0-9][a-z0-9._-]{0,47}$/i
  game:   'chess',              // a record-book id (below), or 'karti' for global
  slot:   'board',              // WHAT IT REPLACES — board pieces felt back table tokens…
  name:   'Pink Balcony',       // two or three words, shouted in var(--disp)
  blurb:  'Sliema pink. Somebody will complain.',
  level:  4,                    // 0 or 1 = free from the start
  sort:   0,                    // optional, orders within a slot
  earn:   { how:'Win ten in a row', test(){…} },   // optional: EARNED, not levelled
  accent: '#FFD6E2',            // optional
  set:    'summer',             // optional: a COLLECTION that runs across games
  preview(size) { return el; }  // an Element or an HTML string, ~size×size
}
```

### grant(id) — being GIVEN one

Three ways to come by a cosmetic: the ladder pays it out, an `earn` test
passes, or somebody is **given** it (today: the shop sold it). That third way
is `grant(id)`, and it is the only supported one — writing `own[id]` through
`_state()` is a test hook doing production work and will break on the next
rename.

It refuses three things on purpose:

| refuses | why |
|---|---|
| an unknown id | the buyer pays and gets nothing |
| anything with an `earn` | Tempesta, Ten In A Row and the Story ring mean *you went and did the thing*. An item that can be bought is not that item. |
| to announce | `grant` fires `onEquip` only, never `onUnlock` — the level-up ceremony is the payoff for **playing**, and buying it would let anyone purchase that feeling. |

Idempotent: already owned, or free from the start, returns `{ok:true,
already:true}` — so a double-tapped buy button cannot double-charge.

### Collections

`set:'summer'` groups items **across** games into one named collection;
`defsInSet('summer')` returns them and `sets()` lists every set that exists,
so a shop builds its shelves from what it finds rather than from a hard-coded
list. A set is curatorial, not schema — it deliberately is not an enum.

`preview()` is the whole point of the registry: the inventory draws a pink
chess board without knowing what a chess board is. It must not throw and must
not depend on a file existing — a preview that fails degrades to the game's
two letters, never to a hole in the list.

`register()` is idempotent by `id`: registering again **replaces**. Call it at
load time, every load. Only the player's *choice* is persisted, so deleting a
cosmetic from a game simply makes it stop existing.

### Slots are namespaced — use `forGame()`

Chess's `board` and dama's `board` are different objects, so a slot is stored
internally as `game.slot`. The public calls resolve `'board'`, `'chess.board'`
and `('board','chess')`; a **bare slot that two games both declare is refused,
not guessed at**. So do this and stop thinking about it:

```js
const KIT = KARTI_XP.forGame('chess');

KIT.register([ …defs without a `game` field… ]);
const board = KIT.equipped('board');       // id or null
const def   = KIT.def('board');            // the whole definition or null
KIT.onChange(() => redraw());              // fires on equip/unequip/register
```

`equipped()` returns `null` for anything unregistered or not owned, so a save
from a different build, or a shared account, reads as "nothing on" rather than
as a crash. **Always have a working default for a null slot.**

### Game ids

`cards-solo` · `cards-story` · `cards-mp` · `chess` · `dama` · `skarta` ·
`kiri` · `tombla` · `bixkla` · `briscola` · `sette` · `cheat`
(the `js/stats.js` shelf, plus `tombla`). Use `'karti'` for anything that is
not one game's.

---

## 3. The economy

**One number per game** — `WEIGHT`, roughly how long a game of it takes — drives
three things, so they cannot drift apart: the XP it pays, the XP a win pays,
and how long a game has to last to count as a real one (`par = weight × 15s`).

```
XP = max(1, round( weight × result × speed × taper × firstWin ))

result    loss 1.0   draw 1.4   win 2.0
speed     clamp(length / par, 0.25, 1)
taper     1st–8th game of that game today ×1 · 9th–16th ×0.6 · 17th+ ×0.35
firstWin  the first WIN of the day in each game ×1.5
```

| game | weight | par | loss | draw | win | win + first-of-day |
|---|---|---|---|---|---|---|
| Sette e Mezzo, Il-Gidba | 5 | 75s | 5 | 7 | 10 | 15 |
| Tombla | 5.5 | 83s | 6 | 8 | 11 | 17 |
| Bixkla, Briscola | 6 | 90s | 6 | 8 | 12 | 18 |
| Dama, SKARTA | 6.5 | 98s | 7 | 9 | 13 | 20 |
| Chess, KARTI Duel | 7 | 105s | 7 | 10 | 14 | 21 |
| KARTI Story, KARTI Online | 9 | 135s | 9 | 13 | 18 | 27 |
| IL-KIRI | 10 | 150s | 10 | 14 | 20 | 30 |

A real mixed player averages **≈13–14 XP a game** — the first-win bonus lifts
it above the raw table because playing several different games a day is the
best thing you can do.

### The curve

Quadratic to 25, **linear after**, capped at **level 50**.

```
L < 25    need(L) = 110 + 22(L−1) + round(2.1(L−1)²)
L ≥ 25    need(L) = 1848 + 95 × (L − 25)
```

The first 25 levels are **unchanged** — nobody's level moved when the ceiling
did. Past 25 the quadratic's own growth (~120 XP more per level, and rising)
would have made 26–50 a wall nobody climbs, so the top half freezes the slope
at **+95 a level** — a whisker *less* than the step from 24 to 25 was. "The next
one is a bit more than the last one" stays true at every rung.

| to reach | XP | games at ≈13.5 XP |
|---|---|---|
| 2 | 110 | **≈ 9** |
| 5 | 601 | ≈ 45 |
| 10 | 2 211 | ≈ 164 |
| 20 | 10 282 | ≈ 762 |
| 25 | 17 793 | ≈ 1 320 |
| 30 | 27 983 | ≈ 2 070 |
| 40 | 55 488 | ≈ 4 110 |
| 50 | 92 493 | ≈ 6 850 |

- **About eight to nine games for the first level**, the number he was promised.
- **Level 25 is still ~1 320 games** — the old ceiling, still about a year.
- **Levels 26–50 are the long game**, and every one of them pays and drops
  cosmetics. XP is deliberately kept low so there is always something to grind.

### What a level pays

`coins = 100 + 50 × L`, plus a pack every 3rd level and two every 5th. Over the
whole ladder to 50: **68 600 coins** and 33 free packs, on
top of whatever cosmetics the games have declared at those levels. Coins and
packs go into `S.coins` / `S.packs` — the same purse the pack shop spends from.

### Anti-farm, and why it is mostly a carrot

1. **Speed.** A game that ends faster than par pays proportionally less, floored
   at a quarter. A ten-second chess win pays 4 where a real one pays 14, so
   *farming is slower than playing*. Measured: 50 nine-second wins = 83 XP;
   50 real games across all twelve = 567 XP — **6.8× slower**.
   Length comes from the game's own clock (`opts.ms`), or the gap since the last
   result in that game, or — for a card duel — `D.turnCount`. A first game with
   no history gets the benefit of the doubt.
2. **Taper.** The 9th game of the *same* game in a day pays 60%, the 17th 35%.
   Generous on purpose: a party night of twenty tombla cards is not a crime.
3. **First win of the day, per game, ×1.5.** The real defence, and it is a
   reward rather than a punishment: eleven first wins beat fifty repeats of one
   game, so the optimal play and the fun play are the same play.
4. **Never zero.** Every award is at least 1 XP. The bar moves when you lose.
5. **Paid once.** An explicit match `id` is remembered across reloads; without
   one, the same game reporting the same result inside ten seconds is the same
   match being announced twice.

---

## 4. Where the XP comes from

Four funnels, one dedupe. **Not one game file had to learn a new call.**

| # | funnel | covers | how |
|---|---|---|---|
| 1 | `KARTI_STATS.record()` | tombla, anything future | four lines added in `js/stats.js`, after a **counted** result |
| 2 | `KARTI_PARTY.record()` | chess, dama, IL-KIRI, bixkla, briscola, sette, cheat | wrapped from `progress.js`, no edit |
| 3 | `KARTI_PARTY.ui.result()` | **SKARTA**, which reports nowhere else | wrapped; the game id comes from the `ui.frame({title})` before it |
| 4 | `KARTI.onDuelEvent({type:'over'})` | the card duel in all four modes | one line in `js/game.js`; `D.mode` picks solo / story / mp |

Chess calls #2 *and* #3 for one match and is paid once.

> **Audit note.** The brief said every game already reports to
> `KARTI_STATS.record()`. It does not: only `js/tombla-ui.js` does. Chess, dama,
> IL-KIRI and the klabb four report to `KARTI_PARTY.record()`, which is a
> *local* ledger that never reaches the record book, and SKARTA reports to
> neither. XP is paid correctly for all of them via the wrappers above, but the
> **record book and the leaderboard are still missing nine games**. The fix is
> one line per game file and belongs to those files' owners:
> `if (window.KARTI_STATS) KARTI_STATS.record('<id>', {result, id, ms});`

---

## 5. Faces

Seventeen SVG templates in `js/progress-faces.js`, drawn in the `js/artkit.js`
idiom — filled silhouette, warm near-black `#150C22` rim, two shadow tones, the
same medallion at the same radius ratio. **No upload**, ever: it would mean
storage, sizes and moderating what lands on a shared leaderboard.

Five free (In-Nanna, Tal-Każin, Tal-Linja, Il-Pastizz, Il-Baħar), then twelve on
the ladder at levels 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 20 and 25.

```js
KARTI_XP.avatarHTML(name, { size: 34 })   // a string, drop it anywhere
```

Somebody with no chosen face still has one — a stable hash of their name — so
nobody is a blank circle and nobody has to make a decision before playing. For
another player, `avatarFor(name, hint)` prefers a server-supplied `hint` if
there ever is one (`js/stats.js` already pushes `av` and `lv`; the relay
ignores them today).

**Painted automatically** on `.avatar` (the profile chip and the log-in list) and
on anything carrying `data-kx-av="<name>"`, via one debounced observer on
**`#app`, `#sheet` and `#modal`** — three roots, because the sheet and the modal
are *siblings* of `#app` in `index.html`, and an observer on `#app` alone left
the face in the profile sheet an empty box.

**Still to do, one line each in files this task could not touch:**

| where | file | line |
|---|---|---|
| the online lobby roster | `js/mp.js` | `'<span data-kx-av="' + esc(name) + '" data-kx-size="30"></span>'` |
| seat plates | `js/chess.js`, `js/dama.js`, `js/skarta-ui.js`, `js/kiri-ui.js`, `js/tombla-ui.js` | same |

The observer paints them. If you render into a detached node, call
`KARTI_XP.paint(node)`.

---

## 5b. Photographs

**One photo per account, on the relay — never in the save.** A picture in a save
blob only ever reaches that player's own phones, which is no use to a
leaderboard. Built against:

```
POST   /karti/avatar        {token, img:"<data URL>"}  -> {ok, ver}
GET    /karti/avatar/<who>?v=<ver>                     -> bytes, or 404
DELETE /karti/avatar        {token}                    -> {ok}
```

`S.prog.pv` holds *only* the version integer. `js/stats.js` pushes `av`, `bd`,
`lv` and `pv` beside the player's name so other phones can build the URL.

**Measured, with a photographic test image (gradients, noise, edges):**

| in | out | passes |
|---|---|---|
| 4032×3024, 5 496 KB | **3.9 KB** | 1 encode |
| 3000×3000, 4 111 KB | **4.3 KB** | 1 encode |
| 1080×1920, 999 KB | **4.3 KB** | 1 encode |

Centre-cropped square, 128×128, JPEG q0.7, against a hard **20 000-character**
ceiling (≈14.6 KB). Quality steps 0.7→0.42 and then the side steps 128→80
before it refuses — a picture that will not fit comes back *smaller*, not
rejected. Nothing over the wire is ever the original.

- **EXIF orientation** — `createImageBitmap(blob, {imageOrientation:'from-image'})`,
  falling back to an `<img>`, which every engine this app runs on now decodes
  already-rotated. **Verified with a real EXIF `Orientation=6` JPEG**: a 240×120
  landscape comes back 120×240 upright. This was the likeliest first-try failure.
- **HEIC** — Safari decodes it in the `<img>` fallback, so the canvas round-trip
  converts it. Chrome on Android cannot, both paths fail, and it says
  *"This phone cannot read that picture. A JPEG or a PNG will work."*
- **404 is free.** No `ver` published means no URL built, so a board of
  twenty-five players with no photos makes **zero** requests (measured). One
  absent photo across twenty-five rows makes **one** request, remembered.
- **Probe, then mount** — the drawn face is always in the markup; the `<img>` is
  only inserted after a real load event. No broken-image glyph exists anywhere.
- **Server errors become sentences**, by status. The one that matters today:
  a relay without the routes yet answers `"GET only."`, which is turned into
  *"This Pi does not do photos yet — it needs the newer server."*
- **A guest is told why**, and offered the account, rather than shown a dead
  button.

---

## 5c. The border ladder

`slot: 'border'`, `game: 'karti'` — a real cosmetic in the registry, so it
appears in the inventory like a chess board. It draws **over** whatever is
underneath, which is what makes it work over a photograph as well as a drawn
face, and is why photos and borders make each other better.

Separated by **colour and thickness**, because at 26 px on a leaderboard row
that is all that survives — the pattern is texture that only resolves at 76 px
on the profile. Thickness is `max(2px, size × .075)`, so one rule covers both.

| border | at | look |
|---|---|---|
| Hairline | free | one white line |
| Twine | 2 | double, warm brown |
| Brass | 4 | bevelled, with a highlight |
| Limestone | 7 | pale stone, dark inner |
| Sea Glass | 10 | blue gradient |
| Neon Sign | 13 | purple, with a glow |
| Milled Metal | 16 | 32 knurled segments |
| Festa Burst | 20 | 16 orange/red spokes |
| **Kampjun Gold** | **25** | **the only one that moves** |
| Ten In A Row | **earned** | ten wins on the trot in one game |
| Village Champion | **earned** | every boss in Story Mode |

The two **earned** ones are not on the ladder at all — no amount of XP produces
them, and level 25 does not grant them (asserted in the suite). `owns()` runs the
predicate until it passes and then writes it down, so a border won with a
ten-game streak is not taken away by the eleventh game being a loss.

### The top: Kampjun Gold

A slow highlight travelling the ring — a `conic-gradient` on a rotating
pseudo-element, masked to the band by the same rule as every other pattern.
**The animated property is `transform` and nothing else**, so the paint happens
once and every frame after is the compositor turning an already-rasterised
layer. No JavaScript timer, no per-avatar state, no `will-change` (25 promoted
layers would trade an unmeasurable cost for real memory).

**Measured, 25 of them on screen at 440×894:**

| | median frame | p95 |
|---|---|---|
| 25 animated rings | **16.7 ms** | 16.7 ms |
| same page, motion off | 16.7 ms | 16.8 ms |

Solid 60 fps, and *indistinguishable from the still version*.

`prefers-reduced-motion` **and** the app's own Reduce motion setting park the
sweep at `rotate(-.12turn)` — the highlight sits top-left, where the key light
is on every other surface in this app. A beautiful still border, not a disabled
one.

> A border is registered as `border.gold` but the ring is drawn from the bare
> word `gold` — one function, `bareBorder()`, converts, and it is also what goes
> on the wire. They drifted once: the ladder equipped correctly and nothing
> appeared, because `border.gold` is not a CSS class name.

---

## 6. The end-of-game screen

`js/progress-ui.js`, fired automatically by `award()` — one component, all
eleven games. It is a **banner**, not a wall: it slides down over the top of
whatever the game put on screen, counts the XP in, states the standings, and
takes itself away. **1.95s, no tap, and the game's own result card is never
covered.** Tap anywhere to skip; skip lands on the *finished* state.

A level-up is the exception and is allowed to be an event: the banner opens out
into a card that holds, with the payout and the thing you unlocked drawn — its
actual `preview()`, not its name — and one button.

**Sound, timed to the trimmed lengths of the real files:**

| when | id | why |
|---|---|---|
| 300ms, once | `xp.fill` | the 1.14s swell *under* everything; the 880ms bar is timed to it so its last quarter carries under the standings instead of trailing off |
| 445–1145ms | `xp.tick` ×6 | rate climbing 1.00→1.21, so it rises rather than rattles. Frame-driven, not `run()`, for one reason: **skip must silence the rest** |
| the crossing, ~865ms | `xp.level` | one sound, the loudest in the set because it is the rarest |
| +900ms | `xp.unlock` | on `xp.level`'s clean tail, as the preview finishes expanding. Only when there is something to show |
| 1230ms | `ui.note(0)` | the full stop — and only when no level landed, or it is litter over `xp.level` |

No coin run under a level-up: the coins are drawn, and a third sound there is
four sounds near each other pretending to be one cue. Nothing was added to
`audio/`. The gains in `js/sfx.js` are a measured ladder and are not overridden
here except to duck the whole thing on a loss.

---

## 7. Storage

Inside `js/game.js`'s own save object, as **`S.prog`** — deliberately, because
`js/sync.js` pushes `karti_save_<profile>` wholesale to the Pi. Anywhere else
would mean levelling up on the phone and starting again on the tablet.
`load()` there does `Object.assign` over the defaults, so `S.prog` needs no
migration, and the guest→account upgrade carries the save across wholesale.

Nothing is cached in a module variable: every read goes through `root()` to the
live `S`, so a cloud pull or a profile switch changes what this file sees on the
very next call, with no listener to forget to fire.

```
S.prog = { v, xp, av, eq:{'chess.board':id}, own:{}, day, n:{}, fw:{}, last:{}, seen:[] }
```

---

## 8. Wiring

### The profile sheet

The avatar **is** the customise button — there is no "Customise" row. Name,
then face, then a caption, with a gold badge and a press state so it can never
be a hidden hotspot. Tapping it opens the You tab.

Every destination now **closes the sheet behind it**. That was fixed once in
each delegated handler (`js/stats.js` for `data-karti-stats`, `js/progress.js`
for `data-karti-xp`) rather than per button, so it holds everywhere the
attributes are ever used. It also fixes a navigation oddity: `js/nav.js` closes
an open sheet before leaving a screen, so a sheet left hanging over a
destination meant one back press landed you on a screen you never knowingly
went to.

```js
'js/progress-faces.js','js/progress.js','js/progress-ui.js',
```

`sw.js` — in `CORE`, and **bump `CACHE`**:

```js
'./js/progress-faces.js',
'./js/progress.js',
'./js/progress-ui.js',
```

The four `audio/xp-*.mp3` files are deliberately *not* precached, like the rest
of `audio/`.

Buttons anywhere, pure markup, no JavaScript on the caller's side:

```html
<button data-karti-xp>Customise</button>
<button data-karti-xp="chess">Customise chess</button>
<button data-karti-xp="avatar">Change your face</button>
```
