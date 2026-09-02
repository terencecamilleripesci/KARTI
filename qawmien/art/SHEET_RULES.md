# The sprite sheet contract

Every character sheet in this game obeys the rules below. They are not style
preferences — each one exists because breaking it produced a visible bug that
took a session to find. This file is prepended to every image brief by
`tools/brief.py`, and enforced on every generated sheet by
`tools/checksheet.py`. **A rule that nobody checks is a rule that gets broken**,
so the checker is the real contract and this document explains it.

---

## 1. The grid

- **1536 × 1024 pixels**, always.
- **6 columns × 4 rows** of **256 × 256** cells.
- Cells that are empty in the source stay empty. Not every cell is used.
- **Transparent background** — real alpha, not white, not magenta, not a colour
  that "looks transparent". No grid lines, no labels, no frame numbers, no
  drop shadow cast onto the background.

Two layouts exist:

| sheet | rows mean |
|---|---|
| `*-sheet.png` (action) | 0 idle ×4, 1 walk ×6, 2 attack ×5, 3 hit ×2 then death ×4 from column 2 |
| `*-dir8.png` (walk) | one facing per row: 0 south, 1 south-east, 2 east, 3 north-east — 6 walk frames each |

The engine mirrors the `dir8` rows to get the other four facings, which is why
there are four rows and not eight. It also means **off-centre detail flips when
the character turns** — keep the figure symmetric about its own centre line.

Four rows, never five. Five-row attempts overflow the 24 cells available.

## 2. The key colours — the most important rule

Character art is drawn in deliberately garish placeholder colours that the
engine swaps at runtime so players can choose their own look. **These are not
mistakes. Never naturalise them.**

| part | main | shadow |
|---|---|---|
| hair | `#FF00FF` magenta | `#A000A0` |
| skin | `#00FF00` green | `#00A000` |
| eyes | `#00FFFF` cyan | — |

Two tones per band, not one: the recolouring scales the player's chosen colour
by each pixel's brightness, so the shading survives the swap. A single flat tone
recolours to a flat, plastic-looking result.

The **garment** is any non-key pixel brighter than luminance 90. It gets tinted
per class, which is what turns one shared body into a warden or a tidebinder.
Consequences that have bitten:

- Keep the outline **darker than luminance 70**, or the outline tints too and
  the character gets a coloured halo.
- Do not draw clothing in a colour close to the key colours. A tidebinder's
  `#5a9cb5` dress once matched the cyan test and 64,961 pixels of dress were
  recoloured as *eyes*.

### The dead zone: luminance 70–90

This is the rule that is easiest to break by accident and hardest to see.

Garment is **brighter than 90**. Outline is **darker than 70**. Anything landing
*between* is neither: it will not take the player's class colour and it will not
read as a line. It just sits there, dirty.

A regenerated walk sheet once came back with framing that was perfect and shorts
that were speckled with mid-tones — **22 %** of its garment pixels fell in the
dead zone against 2 % in the sheet it replaced. Every class colour then rendered
those shorts as dark blotches while the shirt tinted correctly.

So: **flat shading, not dithering.** Two or three deliberate tones per material,
each clearly above 90 or clearly below 70. No noise, no stipple, no gradient, no
anti-aliasing between a garment and its outline. `checksheet.py` fails a sheet
whose garment is more than 10 % dead-zone.

## 3. One pose, shared by everything

All characters of a gender use **the same body sheet in the same pose**. The
class is a colour, not a redraw. This is the rule that makes gear affordable:
draw a helmet once and it fits every character.

It was learned the hard way — ten class sheets drawn separately drifted, five of
them past tolerance, and mechanical realignment helped some and made others
worse. So when a sheet is regenerated, **the pose is a hard constraint**, not a
suggestion.

## 4. Framing — the rules that break "angles"

Checked per cell by `checksheet.py`:

- **One consistent figure height across the entire sheet.** A profile view and a
  front view of the same person are the same height. A male walk sheet once had
  rows of 200, 246, 246 and 181 pixels — he grew and shrank as he turned.
  Tolerance: ±6 px.
- **Nothing touches the cell border.** Leave ~20 px of clear space above the
  hair. Two rows of that same sheet ran off the top and the character walked
  around with the top of his head sliced off.
- **The feet stand on exactly y = 246** within the 256 px cell — the lowest
  drawn pixel of the planted foot. A lifted foot mid-stride is fine; the
  planted foot defines the line.

  Not "about 20 px above the bottom": that instruction was actually given
  once, the sheet came back at y = 235, and it passed every framing rule while
  making the hero **hop 11 px** every time he switched between his walk sheet
  and any other animation. `checkhover.py` measures the ground line *across
  all sheets in the game*, and one sheet agreeing with itself is not enough —
  it has to agree with the other thirty. **246, exactly.**
- **Exactly one connected figure per cell.** No detached debris. Stray clumps
  below the feet are not merely untidy — the tools measure the standing line
  from the lowest pixel, so debris silently moves it and boots get strapped to
  the character's knees.

## 5. Gear overlays

Gear is a **separate transparent sheet on the same grid**, composited over the
body. It is produced by the three-step pipeline in `tools/`, because asking for
gear alone on transparency gives the generator nothing to align against:

1. **dress** — hand over the base sheet, ask for the character *wearing* the
   outfit (`tools/brief.py` + the image skill)
2. **align** — `tools/alignpose.py`, then `tools/checkpose.py`. **Feet must land
   within ~2 px.** Head and width are *expected* to differ: a cap is taller than
   a head and a cloak is wider than a body. The standing line is the one thing
   gear may not move.
3. **strip** — ask the generator to delete the body from *its own* image. It is
   editing a picture it just made, in place, so nothing shifts. Diffing the two
   images does **not** work: the generator repaints the body too, and even at a
   colour threshold of 210 the bodies differed across 40 % of the figure, so the
   diff returns a ghost of the character instead of his clothes.
4. **split** — `tools/splitgear.py` cuts the outfit into slots along lines
   measured from the body *per cell*, so a boss can drop one piece. Fixed
   fractions of the cell break on exactly the frames that kneel and fall. It
   **refuses** an outfit whose per-cell bounding box does not sit within the
   body's (±14 px standing, ±44 px for a body on the floor, where cloth
   spreads).

Run the whole thing with **`tools/makegear.sh BASE.png SETNAME`**. Nothing is
installed until every gate passes; a half-installed outfit is worse than none.

### The strip step is unreliable — gate it, and never trust its account

It produced a flawless set for one sheet and, on the very next, returned
clothing that had been silently **moved and rescaled**: garments spanning
y 9–256 against a body standing at 31–247. Cap the size of a shield, boots at
knee height. In isolation the art looked *perfect*.

On that same job the generator stated it was "keeping those source pixels
unchanged and adding only gear". A pixel-for-pixel comparison found **zero**
identical pixels. **Check the image, never the claim.**

What fixed it on the retry — worth reusing whenever a generator keeps missing a
constraint:

- give it the **measured test**, in the checker's own terms ("the bounding box
  must sit inside the body's, ±14 px, or it is rejected"), not the adjective
  ("don't move it")
- tell it **how**: apply a per-pixel alpha mask to the original data so
  surviving pixels are copied verbatim. Erasing, never redrawing.

### Gear overlays are not figures

The posture rules — one height, one standing line, one connected blob —
describe a *person*. A cap, a cloak, a belt and two boots are five separate
blobs at five different heights **by design**. `checksheet.py --gear` skips
those rules; running them over an overlay failed every correct sheet with
complaints like "a 1 px fragment below the figure" where the figure is a hat.

Gear keeps its own colours — it is **not** key-coloured and **not** class-tinted.

## 6. Style

Match the reference exactly: same pixel-art resolution and chunkiness, the same
dark outline weight, flat shading with one shadow and one highlight tone per
material. No gradients, no glow, no anti-aliasing, no extra rendering detail.
The game is viewed at roughly 40–60 px per character on a phone; detail that
does not survive that is weight, not quality.

---

*Checked by `python3 tools/checksheet.py <sheet.png>`. Run it before installing
any generated art.*
