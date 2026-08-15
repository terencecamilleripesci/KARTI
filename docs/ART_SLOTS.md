# KARTI — ART SLOTS

**The shared visual template, and the map from every slot to the file that will
replace it.**

Owner: `js/artkit.js` (`window.KARTI_ART`) · consumed by every game screen
Read with: `docs/ART_STYLE_BIBLE.md` (the look) and `docs/RUNPOD_PARTY.md` (the run)

---

## 0. The one-line answer

> Nothing in KARTI waits for a picture. Every visual is **finished in CSS and SVG
> first**, and the generated image is a layer that fades in on top of it only after
> a real `load` event. A missing file is invisible. A present file is an upgrade.

That is the whole architecture. The registry in `js/artkit.js` — reproduced below —
says, for every visual in the app, *what it looks like today* and *which file
replaces it tomorrow*. The wiring is already done; the art run generates against
this table and the slots light up one at a time.

---

## 1. Why probe-then-mount, and not `onerror`

The obvious way to do this is to put the `<img>` in the page and hide it when it
errors. Three things go wrong with that on a phone, and all three have already
happened on this project:

1. **The broken-image glyph flashes.** Between the failed request and the error
   handler, iOS paints its own torn-page icon. On a screen of eleven tiles that is
   eleven torn pages.
2. **Layout moves.** An `<img>` with no intrinsic size is 0×0 until it fails, then
   the alt text arrives, then it is removed. Three reflows for a picture that never
   existed.
3. **N requests for one missing file.** Twenty chess tiles is twenty 404s.

So `artkit.js` inverts it. A slot is probed **once for the whole app** with a bare
`new Image()`. Only if that decodes does an `<img>` enter the document, and it
enters at `opacity:0` and is promoted to `1` a frame later so the fade actually
runs. There is no code path that can show a broken image, because a failed slot
never gets an element at all.

A failed probe is retried when the network returns or the app is restored from the
back/forward cache, **capped at four goes** — an uncapped re-arm on every `pageshow`
means the phone re-requests thirty missing files on every navigation, which is the
exact cost this file exists to avoid.

---

## 2. The API games call

```js
KARTI_ART.html(id, opts)   // markup string — for modules that build innerHTML
KARTI_ART.el(id, opts)     // a live element, already wired
KARTI_ART.row(id, opts)    // emblem + name + one line under it
KARTI_ART.wire(root)       // call ONCE after inserting html() output into the DOM
KARTI_ART.mark(name)       // a bare 24x24 silhouette, no medallion round it
KARTI_ART.surface(name)    // -> 'ka-s-felt'  (a class, so the caller owns the box)
KARTI_ART.paint(el, name)  // adds the surface class and probes its texture
KARTI_ART.path(id)         // 'art/ui/logo-chess.png' — the future file
KARTI_ART.status(id)       // 'ok' | 'no' | 'try' | 'none'
KARTI_ART.list(kind)       // slot ids, optionally filtered by kind
KARTI_ART.SLOTS            // the registry itself
KARTI_ART.PALETTE          // the extracted colour tokens
KARTI_ART.SCALE            // the extracted type scale
```

`opts`: `{ size, accent, ink, mono, text, mark, cls, style, label }`.
`size` is one number in px; everything inside scales off it.
`label` makes the thing `role="img"` with that accessible name; without it the
element is `aria-hidden` (correct for decoration beside real text).

**The contract is two lines.** Build with `html()`, then `wire()` the container:

```js
el.innerHTML = '<span class="pt-tio">' + KARTI_ART.html('logo-chess', { size:34 }) + '</span>';
KARTI_ART.wire(el);
```

`el()` does both for a single node. Nothing else is required — no preloading, no
`ART.base` check, no fallback of your own.

---

## 3. What makes it one family

Taken from `ART_STYLE_BIBLE.md` and the `:root` tokens in `index.html`. Nothing here
is a new look; it is the existing look written down as code.

| | |
|---|---|
| **The ink outline** | Every mark is a **filled silhouette** painted with `paint-order:stroke fill` and a warm near-black stroke (`#150C22`). That is the bible's "thick uniform black ink outline" expressed as vector, so a drawn emblem and a generated one sit on the same shelf without a seam. |
| **Two tones, one light** | Recessed parts of a mark are the same colour at `fill-opacity` .45–.75 — the bible's "exactly two shadow tones". Every frame and surface carries one warm key light from the **upper left**. |
| **One frame** | Emblems, avatars and property tiles are the same rounded square at the same radius ratio (`27%` of size), with the same hairline, the same 3px diagonal grain and the same engraved bottom edge. |
| **No emoji, ever** | Unicode pictographs render as emoji or tofu on some phones — it has bitten this project twice, on the chess glyphs and the playing-card characters. Every mark is a path in a private `#ka-sprite`. |
| **Cheap** | Gradients, never images. No `filter`, no `backdrop-filter`, no `transform` — a transform makes a containing block and has moved this app's fixed tab bar before. Depth is `box-shadow` only. |

### Palette (`KARTI_ART.PALETTE`)

Shell `bg #0E0B14` · `panel #1B1430` · `panel2 #241A3E` · `txt #F4EFFF` · `dim #A093C4`
Brand `gold #FFC542` · `hot #E8452C` · `neon #8A5CFF` · `ok #3DDC84` · `bad #FF5468`
Ink `#150C22` — the outline colour, the only value not already on `:root`
Materials `stone #E7D6AC` · `felt #123B2A` · `wood #6B4423` · `night #1B1038` · `paper #F2E4C4`

### Type scale (`KARTI_ART.SCALE`)

`micro 9.5` (uppercase label, ls .14em) · `label 10.5` (ls .12em) · `small 11.5` (ls .06em) ·
`body 12.5` · `read 13.5` · `sub 15` · `title 17` · `hero clamp(21px,7vw,30px)`
Display face `var(--disp)` (Orbitron) for anything shouted; body face for anything read.

---

## 4. THE REGISTRY

`kind` decides what the art run does with a slot:

* **emblem** — a game mark in the standard medallion. One square alpha-keyed png.
* **object** — a drawn object (coin, card back) with a future png.
* **surface** — a CSS material. The future file is an **optional seamless tile**, so
  these can ship for ever without one.
* **shape** — **vector for ever. Do not generate.** SVG is sharper at every size,
  weighs nothing, and these are tinted per player or per square at runtime.

### 4a. Emblems — 11 slots

Square `1024x1024`, alpha-keyed (generate on flat black, `alpha:true`).
**Wordmark is CSS text, never generated** (`RUNPOD_PARTY.md` rule 1).

| slot | future file | accent | drawn today | generation brief |
|---|---|---|---|---|
| `emblem` | `art/ui/emblem.png` **(exists)** | `#8A5CFF` | two thrown cards behind the eight-pointed cross | the KARTI mark: two thrown playing cards behind an eight-pointed Maltese cross |
| `logo-party` | `art/ui/logo-party.png` | `#FFC542` | a five-pip die overlapping a card | a battered Maltese bar table seen from above with a deck of cards, two dice and a bottle cap on it, warm overhead light |
| `logo-chess` | `art/ui/logo-chess.png` | `#D8C79B` | the knight silhouette from `party.js` | a single carved limestone chess knight in three-quarter view, chipped and old, a Maltese cross faintly cut into its base |
| `logo-dama` | `art/ui/logo-dama.png` | `#3DDC84` | three stacked discs, top one crowned | three stacked draughts pieces in olive green and terracotta, the top one crowned, low angle on a worn wooden board |
| `logo-skarta` | `art/ui/logo-skarta.png` | `#FF5468` | four cards thrown down, one face-up, dust | a fan of four bold blank playing cards thrown down hard, one landing face-up, motion lines and a small dust puff |
| `logo-kiri` | `art/ui/logo-kiri.png` | `#FFC542` | townhouse with the enclosed gallarija | a small honey-limestone Maltese townhouse with an enclosed wooden balcony, a for-rent post with a BLANK face, a crane behind |
| `logo-klabb` | `art/ui/logo-klabb.png` | `#E8452C` | a squared stack, pip cut out of the top card | a worn deck of ordinary playing cards squared up on a green felt table, top card face down, one card slipping off the stack |
| `logo-bixkla` | `art/ui/logo-bixkla.png` | `#8A5CFF` | three cards held up in a tight fan | a hand of three blank playing cards held up in a tight fan, seen from the player side, warm lamp light |
| `logo-briscola` | `art/ui/logo-briscola.png` | `#3DDC84` | the stock standing on the crosswise trump | a face-down deck squared on felt with one blank card laid crosswise underneath it as the trump |
| `logo-sette` | `art/ui/logo-sette.png` | `#E8452C` | a struck coin resting on two cards | two blank playing cards with a worn gold coin resting on top of them, small stack of coins behind |
| `logo-cheat` | `art/ui/logo-cheat.png` | `#FF5468` | a domino mask lying across a card | a black domino mask lying across a face-down playing card, one card being slipped underneath the pile |

Style suffix for all eleven — **the same one as the card art**:

```
funny colourful cartoon comic illustration, thick black outline, flat bright
colours, cel shaded, centred, generous empty margin, isolated on pure flat black
background
```

Negative: `photorealistic, photograph, 3d render, oil painting, text, letters,
numbers, watermark, signature, logo, blurry, cluttered, nsfw`

### 4b. Objects — 4 slots

| slot | future file | drawn today | brief |
|---|---|---|---|
| `coin-face` | `art/ui/coin-face.png` | struck gold disc, rim of twelve tiny Maltese crosses, raised centre holding a letter **or** the cross | worn gold coin face on, rim ringed with tiny Maltese crosses, centre a smooth **BLANK** disc, no design in the middle |
| `coin-back` | `art/ui/coin-back.png` | same disc with the luzzu eye in the centre | worn gold coin face on, a luzzu with the painted eye on its prow in relief, laurel wreath inside the rim |
| `cardback` | `art/ui/cardback.jpg` **(exists)** | indigo field, gold diagonal lattice, double gold rule, cross medallion | card back pattern: deep indigo field, fine gold diagonal lattice, gold Maltese cross medallion centred, double gold rule inset |
| `cardback-klabb` | `art/ui/cardback-klabb.png` | the same back in deep red / cream | card back pattern: deep red field, fine cream diagonal lattice, cream Maltese cross medallion centred |

> **The coin composite.** `coin-face.png` is minted with a blank middle *on purpose*
> so `emblem.png` drops into it (`RUNPOD_PARTY.md` §1b). `artkit.js` only performs
> that composite when **both** files are present — dropping a square emblem into the
> middle of the CSS coin puts a picture with its own background on top of a struck
> disc, and it looks like a sticker. Until the obverse lands, the coin's crest is the
> vector cross it is struck with. **Check the obverse before accepting it:** if the
> model decorated the centre, the composite has nowhere to go.

### 4c. Surfaces — 6 slots

These **ship complete without a file**. The future png is a small **seamless tile**
laid over the gradient, never a full-bleed photograph — a tile is ~30 KB and never
crops wrong on a phone. A probed tile becomes a custom property
(`--ka-tex-felt` …), exactly the way `js/game.js` turns `board.jpg` into
`--art-playmat`.

| slot | class | future file | drawn today |
|---|---|---|---|
| `tex-felt` | `.ka-s-felt` | `art/ui/tex-felt.png` | dark green lit from above, 2px crosshatch nap |
| `tex-limestone` | `.ka-s-limestone` | `art/ui/tex-limestone.png` | honey stone, courses across and joints down on a longer period |
| `tex-wood` | `.ka-s-wood` | `art/ui/tex-wood.png` | warm brown, irregular vertical grain |
| `tex-night` | `.ka-s-night` | `art/ui/tex-night.png` | indigo sky, six stars, one warm firework glow at the bottom |
| `tex-paper` | `.ka-s-paper` | `art/ui/tex-paper.png` | aged cream, faint diagonal fibre |
| `tex-bar` | `.ka-s-bar` | `art/ui/tex-bar.png` | dark varnish with an overhead pool of warm light |

Brief for all six: `seamless tiling texture, <material>, flat even lighting, no objects`.

### 4d. Shapes — vector for ever

| slot | what it is | why it is never generated |
|---|---|---|
| `token` | pawn silhouette on a coloured disc | tinted per seat at runtime |
| `avatar` | monogram in the accent medallion | the letters are the player's name |
| `tile-deed` | limestone tile with a group colour band | the band is **data** — which group the square is in |
| `crown` | king / penthouse marker | 4 paths, sharper than any raster |
| `house` | built-floor marker | ditto |

Chess pieces and dama stones stay in `js/party.js` and are also never generated
(`RUNPOD_PARTY.md` §2) — `artkit.js` reuses the knight path so the emblem and the
piece are the same animal.

### 4e. The mark set (`KARTI_ART.mark(name)`)

Brand and games: `karti party chess dama skarta kiri klabb bixkla briscola sette cheat`
Coin: `coin` (the crest) · `luzzu` (the eye)
Furniture: `token crown house`
Civic (for the IL-KIRI board): `ferry bus water power shop crane gate gavel coffee key wrench eye`

All 24×24, filled, `currentColor`, in `#ka-sprite`. The app's own `#karti-sprite` is
**not** touched — `index.html` owns it and two other modules already append to it.

---

## 5. WIRING — the exact lines

`js/artkit.js` is a **new file and edits nothing.** These are the lines to add once
the other agents have landed.

### `index.html` — the loader, line 1537

```js
  var files = ['js/artkit.js','js/cards.js','js/set2.js','js/set3.js','js/game.js',
```

First in the list on purpose: it has no dependencies, and everything after it may
ask it for a visual. It also self-injects its stylesheet on `DOMContentLoaded`, so a
game that renders before its first `html()` call still gets the CSS.

### `sw.js` — `CORE`, a new line 12, straight after `'./css/cardview.css',` (line 11)

```js
  './js/artkit.js',
```

Nothing else. The kit ships **no image files**, which is the point — it adds ~59 KB
of JS to the precache (most of it comment) and removes the app's dependence on
roughly a megabyte of art it does not have.

### Per-game call sites

| file | line | today | ask the kit for |
|---|---|---|---|
| `js/party.js` | 264 | `'<span class="pt-tio" data-logo="…">' + (g.sprite ? pieceSVG(g.sprite) : ico(g.icon)) + '</span>'` | `'<span class="pt-tio">' + KARTI_ART.html('logo-' + g.id, { size:34 }) + '</span>'`, then `KARTI_ART.wire(b)` in place of `logoInto(...)` on line 277. `logoInto()` (125–140) and `LOGO_DIR`/`logoSeen` (123–124) can then go. |
| `js/party.js` | 920–921 | `.pt-sq{background:var(--lite)}` / `.pt-sq.d{background:var(--dark)}` | add `KARTI_ART.surface('limestone')` / `KARTI_ART.surface('wood')` to the square's class list in `paint()` (chess 715, dama 383) and drop the two colour vars. This is the single biggest visible win in the party section. |
| `js/chess.js` | 1244 | `sprite:'pt-p-k'` | unchanged — the kit reads `logo-chess` off the id |
| `js/dama.js` | 867 | `sprite:'pt-crown'` | unchanged |
| `js/stats.js` | 396 `tile()` | its own `<img>`-with-error markup | `KARTI_ART.html(def.logo, { size:48, mono:1, accent:def.accent })` + `KARTI_ART.wire(root)`; `artOK`/`wireArt` (394, 411–424) go with it |
| `js/stats.js` | 430 `coin()` | its own CSS coin | `KARTI_ART.html('coin-face', { size:62, text:initial })` |
| `js/klabb.js` | 336 `cardBack()` | inline SVG lattice + `#kb-cross` | keep for the 40-card pack **or** `KARTI_ART.html('cardback-klabb', { size:w })` — both are the same design; pick one and delete the other |
| `js/klabb.js` | 493 `.kb-table` | hard-coded green radial | `KARTI_ART.surface('felt')` on the table element |
| `js/klabb.js` | 1282 | three real card faces as the mode mark | `KARTI_ART.html('logo-' + g.id, { size:34 })` beside them, or instead of them on the narrow tile |
| `js/skarta-ui.js` | 481 `backHTML()` | `sk-a-wild` glyph + CSS text | `KARTI_ART.html('cardback', { size:w })` with the SKARTA wordmark still CSS text over it |
| `js/skarta-ui.js` | 189 | dark radial table | `KARTI_ART.surface('felt')` |
| `js/skarta-ui.js` | 534 | `<h2>SKARTA</h2>` | `KARTI_ART.html('logo-skarta', { size:34 })` before the `<h2>` |
| `js/kiri-ui.js` | 645–673 `renderCells()` | **emoji** in `.kr-e` | `KARTI_ART.mark(<civic name>)` — see §6 |
| `js/kiri-ui.js` | 629, 864 | **emoji** in `.kr-tok` | `KARTI_ART.html('token', { size:22, accent:seat.c })` |
| `js/kiri-ui.js` | 662 | `.kr-lvl` text badge | `KARTI_ART.mark('house')` / `KARTI_ART.mark('crown')` for the penthouse |
| `js/kiri-ui.js` | 525 | `<h2>IL-KIRI</h2>` | `KARTI_ART.html('logo-kiri', { size:34 })` |
| `js/kiri-ui.js` | square detail sheet | `art/kiri/*.jpg` wash (never built) | `KARTI_ART.html('tile-deed', { size:88, accent:group.c, mark:…, text:name })` |
| `js/mp.js` | `.onrow .onmark` | icon in a rounded box | `KARTI_ART.html('avatar', { size:22, text:name })` |
| `js/game.js` | 4020 `ui` probe map | `--art-*` custom properties | unchanged — the two systems are deliberately independent; `artkit` never writes an `--art-*` var |

---

## 6. IL-KIRI still has emoji, and that is the biggest outstanding risk

Thirty-two board squares (`js/kiri.js` 115–226), four seat tokens (381–384) and two
card decks (257, 317) are still Unicode pictographs: `🏁 🔧 👀 🛞 🧾 ⛴️ 🏪 🥖 🎫 💦
🚚 🪣 🚪 🚌 🐎 🏛️ ☕ 🏗️ 🏠 🌅 🐴 🌊 🔌 🚦 🏢 🪟 🕯️` and `🔑 🛵 🧱 🐐`.

**This will render as tofu or as the wrong colour on some phones**, which is the
exact failure this project already paid for twice. The twelve civic marks in §4e
cover the recurring kinds of square — ferry, bus, water, power, shop, construction,
gate, court, café, key, garage, gossip — and the four seat tokens are covered by
`token` in the seat colour. The remaining squares need either a mark of their own or
a two-letter code; **that is a real pass of work and it is not done.**

---

## 7. HONEST ASSESSMENT — what to generate first

Judged on a 440×894 phone at 3× against the contact sheet, not on a laptop.

### Ship as-is. Do not spend GPU on these.

* **`logo-chess`** — the knight is the sharpest mark in the set and it is already
  the piece on the board. A generated one would be *different*, not better.
* **`logo-dama`** — three discs and a crown. Unambiguous at 26px.
* **`coin-face` / `coin-back`** — the struck CSS coin with the cross rim looks
  genuinely minted. This is the best-looking thing in the kit. Generating it risks
  going backwards, and the composite adds a failure mode for no gain.
* **`cardback` / `cardback-klabb`** — a drawn lattice stays crisp at 3× where a JPEG
  goes soft, and it is free.
* **All six surfaces** — the limestone/wood board reads as a real board. A tiling
  texture would add polish, not capability. Low priority.
* **`token`, `crown`, `house`, `tile-deed`, `avatar`** — vector for ever, by design.

### Worth generating — the drawn version is *fine*, art would make it *good*

* **`logo-skarta`** — the thrown fan reads, but "cards hitting a table hard" is
  motion, and motion is what a cartoon does better than a silhouette.
* **`logo-kiri`** — the townhouse and gallarija read, but the whole joke of IL-KIRI
  is *Maltese* property, and a limestone facade with the crane behind it carries
  that in a way a two-tone silhouette cannot.
* **`logo-cheat`** — the mask is good; a face doing the lying would be better.

### Really does need tomorrow's art

* **`logo-party`** — the hub. The die works as a *marker* but the hub is the front
  door of the whole section and deserves the bar table with real light on it. This
  is the one slot where the procedural version is clearly the weakest thing on the
  screen.
* **`logo-klabb` / `logo-bixkla` / `logo-briscola` / `logo-sette`** — four card games
  whose emblems are, unavoidably, four arrangements of rectangles. They are
  *distinguishable* — a stack, a fan, a cross, a coin — but they are not
  *memorable*, and four near-identical marks in one shelf is the weakest part of
  the family. Generated art can give each one a different subject entirely.
* **`emblem`** — already exists and already loads. Leave it.

**Suggested order for the run:** `logo-party` → the four card emblems → `logo-kiri`
→ `logo-skarta` → `logo-cheat`. Everything else is optional. Total: nine images,
well under a minute of GPU.

---

## 8. Testing a slot after the art lands

```
python3 -m http.server 8830      # preview on http://100.96.95.99:8830
```

For each new file, check three things and nothing else:

1. it **appears** — `KARTI_ART.status('logo-party')` returns `'ok'` in the console;
2. it **fits** — the drawn version under it is the right size, so the png must be
   square and alpha-keyed with a generous margin, or it will crop;
3. **removing it again is invisible** — rename the file, hard-reload, and the drawn
   version must come back with no gap, no glyph and no console error.

Point 3 is the one that matters. If a slot cannot survive its file being deleted,
the wiring is wrong, not the art.
