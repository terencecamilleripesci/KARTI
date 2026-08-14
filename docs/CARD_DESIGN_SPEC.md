# KARTI — CARD DESIGN SPEC

**The bible.** Every KARTI card, forever, looks like this. If a new card breaks a rule
in here, the card is wrong — not the spec.

Implementation: [`css/cards.css`](../css/cards.css) (self-contained, no framework, no webfont).
Card authoring kit: [`docs/CARD_GENERATION.txt`](CARD_GENERATION.txt).
Data source of truth: `js/cards.js` + `js/set2.js` + `js/set3.js`.
Art pipeline: `docs/ART_STYLE_BIBLE.md` owns the illustration style — **§4 below owns the geometry it has to fit.**

Everything below was measured in Chromium 146 against **all 200 shipped cards**
(`cards.js` + `set2.js` + `set3.js`).
**0 / 200 cards clip or overflow at any size. 0 / 200 exceed the reserved text box.**

---

## 1. THE PHILOSOPHY IN ONE LINE

> The joke is the product. Everything else on the card exists to get out of its way.

Practical consequence: the **text plates are always light and always matte**. Frame colour,
attribute colour and rarity foil all live on the *frame and the art window*, never under a
letter. That is why every string on this card measures **6.8 : 1 or better** against its
background — well past WCAG AA.

---

## 2. CARD ANATOMY

```
        ┌──────────────────────────────────────────┐
        │ ╔══════════════════════════════════╦═══╗ │◄── 1  OUTER FRAME
   1 ───┤ ║  T H E   K U N J A T A           ║ 🎆║ │       type colour, rounded,
        │ ║                                  ║   ║ │       inner bevel + drop shadow
   2 ───┤ ╚══════════════════════════════════╩═══╝ │
        │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │◄── 3  ATTRIBUTE ACCENT
        │ ○○                       ★★★★★★★★        │◄── 4  LEVEL / TRIBUTE ROW
        │ ┌──────────────────────────────────────┐ │
        │ │                                      │ │
        │ │                 👵                   │ │◄── 5  ART WINDOW  (5:3)
        │ │                                      │ │
        │ └──────────────────────────────────────┘ │
        │ ┌──────────────────────────────────────┐ │
        │ │ [Festa / Effect]                 ◆   │ │◄── 6  TYPE LINE  + 7 RARITY GEM
        │ │──────────────────────────────────────│ │
        │ │ Opponent discards 1 card each of     │ │◄── 8  RULES BOX  (cards.js `eff`)
        │ │ your turns.                          │ │
        │ │ - - - - - - - - - - - - - - - - - - -│ │
        │ │ Your mother-in-law. Criticises       │ │◄── 9  JOKE BOX   (cards.js `txt`)
        │ │ everything. She never stops.         │ │
        │ │──────────────────────────────────────│ │
        │ │ KRT-007        ATK/3000  DEF/2500    │ │◄── 10 SET CODE + 11 ATK/DEF BAR
        │ └──────────────────────────────────────┘ │
        └──────────────────────────────────────────┘
                                                    59 : 86  (real TCG proportion)
```

| # | Zone | Class | Purpose | Shown at sm? |
|---|------|-------|---------|---------------|
| 1 | Outer frame | `.card__frame` | Carries the **card type** colour. First read, from across the room. | ✅ |
| 2 | Name plate | `.card__namebar` | Light tinted plate. Dark ink, always ≥ 7.4 : 1. | ✅ |
| 2a | Name | `.card__name` | Serif, bold. The card's identity. | ✅ |
| 2b | Attribute badge | `.card__attr` | Round gem, attribute colour + attribute emoji. | ✅ |
| 3 | Attribute accent | `.card__accent` | Full-width glowing stripe in the attribute colour. The "which deck" read. | ✅ |
| 4 | Level row | `.card__levelrow` | Tribute pips left, gold stars right. Monsters only. | ✅ |
| 4a | Tribute markers | `.card__tributes > i` | 0 / 1 / 2 silver pips — the summon cost. | ✅ |
| 4b | Level stars | `.card__stars > i` | 1–8 gold stars, laid out **right-to-left**. | ✅ |
| 5 | Art window | `.card__art` | Emoji (or `<img class="card__img">`). Attribute-tinted vignette. **The only elastic block.** | ✅ |
| 6 | Type line | `.card__type` | `[Attribute / Effect]`, `[Spell]`, `[Trap]`. | ❌ |
| 7 | Rarity gem | `.card__gem` | Rotated diamond in the rarity colour. | ❌ |
| 8 | Rules box | `.card__rules` | **What the card does.** Semibold, upright. `eff` field. | ❌ |
| 9 | Joke box | `.card__flavour` | **The punchline.** Italic, one ink-step back. `txt` field. | ❌ |
| 10 | Set code | `.card__set` | `KRT-###`. Mono, muted. | ❌ |
| 11 | ATK / DEF bar | `.card__stats` | Tabular numerals, right-aligned. Monsters only. | ✅ (numbers only) |

`.card--sm` is a **board slot / deck-grid tile**: art-forward, no reading matter.
The text lives at `--md` and `--lg`. Nothing is truncated — it is simply not rendered.

### Zone order is fixed
Name → accent → level → art → type line → rules → joke → stats. Never reorder. A player
scanning a hand relies on always finding ATK in the same place.

---

## 3. COLOUR — EXACT HEX

### 3.1 Card type frames (Yu-Gi-Oh convention, kept)

| Type | Class | Plate (name bar) | Highlight | Base | Shadow | Trim / border |
|------|-------|------------------|-----------|------|--------|---------------|
| **Normal monster** — warm sand/amber | `.card--normal` | `#E0C182` | `#EBD6A6` | `#D0A455` | `#96702E` | `#5E4318` |
| **Effect monster** — orange | `.card--effect` | `#EE9C63` | `#F6B98F` | `#DC6E2C` | `#9C4310` | `#5C2607` |
| **Spell** — green | `.card--spell` | `#5FC49E` | `#93D8BE` | `#189A70` | `#0B6446` | `#073A2A` |
| **Trap** — magenta/pink | `.card--trap` | `#E084C6` | `#EDACD9` | `#BE3E9B` | `#7E2264` | `#4A1139` |

Frame body = `linear-gradient(166deg, highlight 0%, base 30%, shadow 100%)` + a top gloss.
Name plate = a lighter, more saturated tint so dark ink always clears AAA.

**Normal vs Effect rule:** a monster is `.card--effect` when `fx` is a non-empty string,
`.card--normal` when `fx` is `''`. Nothing else decides it.

### 3.2 Attributes

`-core` is the value in `js/cards.js` `ATTR[x].c` — use it for deck banners and UI chrome.
`-badge` is the on-card fill; only **TROUBLE** differs, because `#37474F` is nearly invisible
on a `#0E0B14` table. `-lite` is the highlight used in the badge gem and accent stripe.

| Attribute | Deck | Class | `-core` (cards.js) | `-badge` (on card) | `-lite` | Emoji |
|-----------|------|-------|--------------------|--------------------|---------|-------|
| Festa | `festa` | `.card--attr-festa` | `#E8452C` | `#E8452C` | `#FF8A72` | 🎆 |
| Farm | `razzett` | `.card--attr-farm` | `#4CAF50` | `#43A047` | `#8FE093` | 🐇 |
| City | `belt` | `.card--attr-city` | `#9C27B0` | `#9C27B0` | `#D983E8` | 🏰 |
| Sea | `bahar` | `.card--attr-sea` | `#2196F3` | `#1E88E5` | `#7EC4FA` | 🌊 |
| Trouble | `hazen` | `.card--attr-trouble` | `#37474F` | **`#4E6470`** | `#9FB4C0` | 😈 |

Spells and traps have no attribute — they inherit their own frame colour for the accent stripe.

### 3.3 Rarity

| Rarity | Key (cards.js) | Class | Colour | Highlight | Treatment |
|--------|----------------|-------|--------|-----------|-----------|
| Common | `komuni` | `.card--r-common` | `#9E9E9E` | `#D6D6D6` | Flat. Nothing. Gem only. |
| Rare | `rari` | `.card--r-rare` | `#2196F3` | `#A8D8FF` | Still blue sheen band + blue inner ring. No motion. |
| Epic | `epiku` | `.card--r-epic` | `#9C27B0` | `#E2A6F0` | Purple shimmer panning 5s + violet ring + breathing glow. |
| Legendary | `leggendarju` | `.card--r-legendary` | `#FFB300` | `#FFE9A8` | Gold holo-foil (two layers, 3.6s) + gold ring + glow + travelling sheen on the name plate. |

### 3.4 Ink and surfaces

| Token | Hex | Used for | Measured contrast |
|-------|-----|----------|-------------------|
| `--ink-hard` | `#16110A` | Name, type line, ATK/DEF | 16.4 : 1 on parchment · 7.4–10.8 : 1 on the four name plates |
| `--ink-body` | `#221B12` | Rules box | **14.9 : 1** |
| `--ink-flavour` | `#3B3126` | Joke box (italic) | **11.1 : 1** |
| `--ink-soft` | `#5C5044` | Set code | **6.8 : 1** |
| `--plate` | `#F6EFDF` | Parchment text panel | — |
| `--plate-edge` | `#C9BA9C` | Parchment keyline | — |
| `--plate-rule` | `rgba(22,17,10,.30)` | Divider rules inside the panel | — |
| `--karti-bg` | `#0E0B14` | The table | — |
| `--karti-bg-raise` | `#171122` | Raised UI surfaces behind cards | — |

**Worst text/background pair on the entire card is 6.8 : 1.** WCAG AA needs 4.5 : 1.

### 3.5 Name-plate contrast, measured

| Frame | Plate | `#16110A` on it |
|-------|-------|-----------------|
| Normal | `#E0C182` | 10.83 : 1 |
| Effect | `#EE9C63` | 8.56 : 1 |
| Spell | `#5FC49E` | 8.83 : 1 |
| Trap | `#E084C6` | 7.41 : 1 |

---

## 4. SIZES

One number drives a card: `--cw` (card width). Everything derives from `--u = --cw / 12`.
No `em` compounding — every child is `calc(var(--u) * n)`.

| Class | Width | Height | `--u` | Job |
|-------|-------|--------|-------|-----|
| `.card--sm` | **112 px** | 163 px | 9.33 px | Board slots and deck grid. 3-up at 390 px. |
| `.card--md` | **190 px** | 277 px | 15.83 px | Hand rail (horizontal scroll), pack results. Full text. |
| `.card--lg` | **320 px** | 466 px | 26.67 px | Full view, card inspector, pack reveal. |
| `.card--fit` | 100 % | — | `8.333cqw` | Custom slot. Parent needs `container-type: inline-size` (use `.card-slot`). |

Aspect ratio is `59 / 86` — the real physical TCG ratio. Never override it.

### Art-window geometry (for the art pipeline)

`.card__art` has `aspect-ratio: 5 / 3` and `flex: 1 1 auto`, so it is the one block that
gives up height when text runs long. Measured against the shipped CSS:

| Card size | Art window (CSS px) | Aspect w:h |
|-----------|---------------------|------------|
| `.card--sm` | 103 × 114 | 0.90 (portrait — text is hidden, so art grows) |
| `.card--md` | 175 × 105 | 1.67 |
| `.card--lg` | 293 × 178 | 1.65 |

Real art ships **square (1:1)** and is drawn with `object-fit: cover`, so:

* the worst landscape window (1.67) crops a square to the middle **60 % of its height**
* the worst portrait window (0.90) crops a square to the middle **90 % of its width**

> **SAFE ZONE = central 60 % of height × 88 % of width.** Anything the joke depends on —
> face, hands, the object — lives inside that band. This supersedes any earlier figure;
> the art window got wider when the card grew a second text zone.

---

## 5. TYPOGRAPHY

**No webfont.** Cards must render identically offline, first paint, on a cheap Android.

```css
--card-font-display: "Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua","URW Palladio L",Georgia,"Times New Roman",serif;
--card-font-body:    system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
--card-font-num:     ui-monospace,"SF Mono","Roboto Mono","DejaVu Sans Mono",Menlo,Consolas,monospace;
```

Serif for **name + type line** (instant "this is a trading card"), sans for **rules + joke**
(legibility at 8 px), mono with `tabular-nums` for **ATK/DEF + set code** (numbers never jitter
between cards).

| Zone | Family | Weight | Style | Multiplier | sm | **md** | **lg** |
|------|--------|--------|-------|-----------|-----|--------|--------|
| Name | display | 700 | — | `.84u` (`.86u` at sm) | 8.0 px | **13.3 px** | **22.4 px** |
| Attribute badge glyph | — | — | — | `.52u` | 4.9 px | 8.2 px | 13.9 px |
| Type line | display | 700 | — | `.50u` (`.47u` at lg) | hidden | 7.9 px | 12.5 px |
| Rules box | body | 600 | upright | `.58u` | hidden | **9.2 px** | **15.5 px** |
| Joke box | body | 500 | *italic* | `.52u` | hidden | **8.2 px** | **13.9 px** |
| ATK / DEF | num | 700 | tabular | `.62u` (`.80u` at sm) | 7.5 px | 9.8 px | 16.5 px |
| Set code | num | 600 | — | `.40u` | hidden | 6.3 px | 10.7 px |

Line-height is `1.26` everywhere in the text block. `text-wrap: pretty`, `hyphens: auto`,
`overflow-wrap: break-word` — a long Maltese word can never punch a hole in the frame.

> **The md sizes are deliberately small.** `--md` is a *hand card*, meant to be tapped to
> open `--lg`. If a screen's only job is reading the card, use `--lg`.

---

## 6. LEVEL STARS AND TRIBUTES

* Levels run **1 – 8**. Level `0` means "not a monster" (spell/trap) and hides the whole row.
* Stars are laid out **right-to-left** (`flex-direction: row-reverse`) — Yu-Gi-Oh convention.
  Star 1 sits hard against the right edge; the row grows leftward.
* Gold radial gradient, star clip-path, double drop-shadow so they read on the pale
  sand frame as well as the dark magenta one.
* **Tribute markers** are silver pips on the **left** of the same row:

| Level | Tributes | Pips rendered |
|-------|----------|---------------|
| 1 – 4 | 0 (free summon) | *(none — `.card__tributes:empty` collapses)* |
| 5 – 6 | 1 | `<i></i>` |
| 7 – 8 | 2 | `<i></i><i></i>` |

Source of truth is `tributesFor(lvl)` in `js/cards.js`. Markup must match it; the CSS does
not compute anything.

Both markers sit **above the art window and below the accent stripe** — the whole summon cost
is read in one horizontal sweep before the eye reaches the picture.

---

## 7. ATK / DEF FORMATTING

```html
<span class="card__atk"><i>ATK/</i>3000</span>
<span class="card__def"><i>DEF/</i>2500</span>
```

* Format is `ATK/3000` — slash, no space. Yu-Gi-Oh house style.
* The words go in `<i>`. `.card--sm` hides them and inserts a `/`, so a tile reads `3000/2500`.
* **Never** pad with leading zeros, thousands separators, or a `?`. Four digits max.
* Values are multiples of **100** (a handful of 50-steps exist and are tolerated). Range 0–3000.
* Tabular numerals mean columns line up across a whole hand. Do not change the font.
* Spells and traps: `.card__atk` / `.card__def` are hidden; the bar shows only the set code.
* Buffed / debuffed values are the **engine's** job, not the frame's. If the engine wants to
  show a modified ATK it should swap the text content and add its own colour class — do not
  invent a second stat zone.

---

## 8. RARITY GEM AND HOLO RULES

* The gem is a 45°-rotated rounded square at the **right end of the type line**, in the rarity
  colour with a soft same-colour glow. Every rarity gets one, including common.
* Rare / epic / legendary also get a hairline **inner ring** (`outline`, drawn inward) in the
  rarity highlight colour. The **border stays the card-type colour** — type identity always
  wins over rarity identity.
* Foil lives on `.card__frame::after` at `z-index: 3`, `mix-blend-mode: screen`.
* **The name plate and the parchment panel sit at `z-index: 4`.** A passing holo band physically
  cannot touch a letter. This is the single most important rule in this section — it is why
  a legendary card has the same text contrast as a common one.
* Only `background-position`, `transform` and `opacity` are ever animated. Never
  `width`, `height`, `top`, `left`, or `box-shadow`.
* The outer glow is a separate `::after` layer whose **opacity** breathes (2.8 s). It never
  animates a shadow.

### Reduced motion
`@media (prefers-reduced-motion: reduce)` freezes every animation **and parks each foil at a
flattering background-position**, so rarity is still instantly legible without a single frame
of movement. Never let reduced-motion make a legendary look common.

### Forced colours
`@media (forced-colors: active)` strips the foil and falls back to `Canvas`/`CanvasText`.

---

## 9. TEXT LENGTH LIMITS — MEASURED, NOT GUESSED

The joke is the punchline. It must never clip. So the layout is built to make clipping
*impossible*: the **art window is the only elastic block**. If text runs long, the art gives up
height. Only after the art hits its floor could anything clip — and that point is listed below
as *hard clip*.

All numbers measured in Chromium 146 with the shipped system font stack.

| Zone | `.card--sm` | `.card--md` | `.card--lg` |
|------|-------------|-------------|-------------|
| **Name — single line** | ~26 | **22 chars** | **22 chars** |
| **Name — hard cap** (wraps, trims art slightly) | 63 | ~40 | ~40 |
| **Rules box `eff`** (reserved, art untouched) | *hidden* | **91 chars** | **91 chars** |
| **Joke box `txt`** (reserved, art untouched) | *hidden* | **116 chars** | **116 chars** |
| **`eff` + `txt` combined, reserved** | *hidden* | **207 chars** | **207 chars** |
| **Hard clip — monster** | n/a | 249 chars | 249 chars |
| **Hard clip — spell / trap** | n/a | 316 chars | 316 chars |

### The rules you actually write to

| Field | Recommended | Never exceed |
|-------|-------------|--------------|
| `n` (name) | **≤ 22 chars** — stays one line | 34 |
| `eff` (rules) | **≤ 85 chars** | 91 |
| `txt` (joke) | **≤ 105 chars** | 116 |
| `eff` + `txt` | **≤ 190 chars** | 207 |

Current shipped pool (200 cards): longest name **32**, longest `eff` **78**,
longest `txt` **112**, longest combined **173**.
**0 / 200 cards exceed the reserved box at any size.** Keep it that way.

> Between 207 and 249 characters the card still renders perfectly — it just quietly eats
> art height. Between 249 and infinity you lose the last line. Do not go there.

---

## 10. MARKUP CONTRACT

```html
<article class="card card--md card--effect card--attr-festa card--r-legendary card--tap"
         tabindex="0" aria-label="THE KUNJATA, Festa Effect monster, level 8, ATK 3000 DEF 2500">
  <div class="card__frame">

    <header class="card__namebar">
      <h3 class="card__name">THE KUNJATA</h3>
      <span class="card__attr" title="Festa" aria-hidden="true">🎆</span>
    </header>

    <div class="card__accent" aria-hidden="true"></div>

    <div class="card__levelrow">
      <span class="card__tributes" title="2 tributes"><i></i><i></i></span>
      <span class="card__stars" aria-label="Level 8">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </span>
    </div>

    <div class="card__art"><span class="card__emoji" aria-hidden="true">👵</span></div>

    <div class="card__panel">
      <div class="card__typeline">
        <span class="card__type">[Festa / Effect]</span>
        <span class="card__gem" title="Legendary" aria-hidden="true"></span>
      </div>
      <div class="card__rules">Opponent discards 1 card each of your turns.</div>
      <p class="card__flavour">Your mother-in-law. Criticises everything. She never stops.</p>
      <div class="card__stats">
        <span class="card__set">KRT-007</span>
        <span class="card__atk"><i>ATK/</i>3000</span>
        <span class="card__def"><i>DEF/</i>2500</span>
      </div>
    </div>

  </div>
</article>
```

### Type-line strings
| Card | String |
|------|--------|
| Monster, `fx` set | `[Festa / Effect]`, `[Farm / Effect]`, `[City / Effect]`, `[Sea / Effect]`, `[Trouble / Effect]` |
| Monster, `fx: ''` | `[Festa / Normal]` … |
| Spell | `[Spell]` |
| Trap | `[Trap]` |

### Optional state classes
| Class | Effect |
|-------|--------|
| `.card--tap` | Pointer cursor + `scale(.972)` press feedback. Put it on anything clickable. |
| `.card--dim` | Greyed + darkened. Unplayable / not owned. |
| `.card--face-down` | Hides all children, paints the KARTI card back. Child `<div class="card__frame"></div>` is enough. |

### Layout helpers
`.card-grid` (auto-fill grid of tiles) · `.card-rail` (snap-scrolling hand) · `.card-slot`
(container-query wrapper for `.card--fit`).

---

## 11. ACCESSIBILITY REQUIREMENTS

* Every text/background pair on the card is **≥ 6.8 : 1**. Do not introduce a new one below 4.5 : 1.
* `aria-label` on `.card` carries the whole card in one sentence. `.card__attr`, `.card__gem`,
  `.card__accent` and `.card__emoji` are decorative — `aria-hidden="true"`.
* `.card__stars` carries `aria-label="Level N"`. Never make the player count star glyphs.
* Rarity is **never colour-only** — gem + ring + foil + the rarity word in the `title`/label.
* `tabindex="0"` + `:focus-visible` gives a two-tone ring (table colour then rarity colour) and
  a 3 px lift. Never remove it.
* Touch targets: `.card--sm` at 112 × 163 px clears 44 × 44 comfortably. If you ever build a
  smaller tile, wrap it in a ≥ 44 px hit area.
* `box-sizing` is pinned inside `.card` so a host page's reset can never shift the geometry.

---

## 12. DO'S AND DON'TS

### Do
* **Do** put the mechanic in `eff` and the joke in `txt`. Two zones, two jobs.
* **Do** keep the joke's last word the funniest word. The eye lands there.
* **Do** let the art window shrink. That is what it is for.
* **Do** use `.card--lg` any time reading is the point.
* **Do** test a new card at `--md` before shipping — it is the tightest size that shows text.
* **Do** keep names in Title Case, or ALL CAPS for legendaries only (`THE KUNJATA`, `THE MINISTER`).
* **Do** re-use an existing `fx` string. New `fx` values need engine work.

### Don't
* **Don't** put light text on a frame colour. Text goes on a plate. Always.
* **Don't** animate `width`, `height`, `top`, `left` or `box-shadow`. Foils pan
  `background-position`; glows breathe `opacity`.
* **Don't** let a foil layer sit above a text plate. `z-index: 4` on plates is load-bearing.
* **Don't** recolour the border by rarity. The border is the **card type**.
* **Don't** write the mechanic into `txt` ("…, deal 500 damage"). It will be duplicated
  on-card and the joke will lose its ending.
* **Don't** exceed 91 chars of `eff` or 116 of `txt`.
* **Don't** use `#37474F` for a Trouble badge on the dark table — use `#4E6470`.
* **Don't** add a second accent colour. One attribute, one stripe, one badge.
* **Don't** ship a card whose name needs three lines.
* **Don't** use an emoji that renders as a monochrome glyph on Android (see the generation kit).

---

## 13. DELIBERATE DEVIATIONS FROM YU-GI-OH

These were choices, not accidents. Overrule any of them and the CSS is a two-line change.

| # | Deviation | Why |
|---|-----------|-----|
| 1 | **Separate light name plate** instead of the name sitting directly on the frame. | Yu-Gi-Oh's name-on-frame drops to ~4 : 1 on the trap magenta. The plate buys 7.4–10.8 : 1 at every frame colour, at phone size. |
| 2 | **Legendary foil is on the name *plate*, not the name *text*.** | Gold gradient-clipped text measures ~3.7 : 1 — it fails AA at `--md`. The plate sheen uses `mix-blend-mode: screen`, so it only ever *lightens* the background behind dark ink. Contrast can only improve. |
| 3 | **Art window is 5 : 3, not square.** | Our text block is two zones (rules + joke) and the jokes are long. A square window left ~2 lines. This is the price of the punchline. |
| 4 | **Trouble attribute badge is `#4E6470`, not `#37474F`.** | `#37474F` on a `#0E0B14` table is a black hole. `-core` is unchanged in `cards.js` for deck banners. |
| 5 | **`.card--sm` shows no rules or joke text.** | 5 px text is a lie, not a feature. The tile is art + name + ATK/DEF; the player taps for the rest. |
| 6 | **Rarity uses an inner ring, not a coloured border.** | Yu-Gi-Oh has no rarity border at all. A ring adds a grid-size rarity read without stealing the type colour. |
| 7 | **Set code lives in the ATK/DEF bar**, not a corner watermark. | One mono row at the bottom; no extra zone, no extra height. |
| 8 | **No webfont.** | The app has to work offline on a mid-range Android with zero FOIT. |
