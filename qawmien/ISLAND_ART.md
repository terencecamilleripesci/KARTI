# Il-Qawmien — Beginner Island Art Direction

Concept set lives in `art/concept/`. This document is the deliverable; the images make it
concrete. Everything here follows `ISLAND_DESIGN.md`: Incarnam's *structure* (one floating
island, five named zones, differentiated by look and reward), our *own* theme — **Maltese
limestone**.

## The theme in one sentence

A slab of golden globigerina limestone torn out of the sea and left hanging in the sky — the
Mediterranean far below instead of clouds — sun-bleached, salt-worn, terraced and walled by
hands that are long gone, with the megalithic temple the player wakes inside built from the
island's own stone.

## Concept images

| file | shot | verdict |
|---|---|---|
| `island-hero.png` | establishing shot, island from below/aside over the sea | **strong** — sells the theme |
| `island-top.png` | high three-quarter, all five zones readable | **strong** — this is the world-map target |
| `zone-temple-approach.png` | ground level, outside the ruin gate | **strong** |
| `zone-terraces.png` | ground level, rubble walls + wild fields | **strong** |
| `zone-carob-wood.png` | ground level, inside the grove | good |
| `zone-salt-pans.png` | ground level, pans at the rim | **strong** — best "edge of the world" |
| `zone-necropolis.png` | ground level, rock-cut tombs | good, with one caution (see zone notes) |

Zone layout as drawn in `island-top.png` (use this for the world map):
**Temple Approach centre · Terraces SW · Carob Wood NE · Salt Pans SE rim · Necropolis NW spur.**

## Light — the one global rule

One warm sun, **upper-left**, hard confident shadows to the lower-right, in every tile and
every prop. All seven concepts obey it. Shadows are warm brown on stone (`#806941` territory),
never grey — grey-violet shadow is reserved for the Necropolis, where it is the point.

## Palette (hex values sampled from the concepts)

### Stone — the island's one material, four ages
| swatch | hex | use |
|---|---|---|
| limestone, full sun | `#f8e0a0` | cliff-top highlights, lit block faces |
| limestone, lit | `#d7b582` | temple pavement, default lit stone |
| limestone, mid | `#d5aa60` / `#d3af75` | path slabs, salt-pan ridges |
| limestone, weathered | `#b3843f` / `#af8748` | rubble walls, old megaliths |
| limestone, shadow | `#806941` | shadow side of every stone |
| raw torn rock (underside) | `#624a2d` | cliff underside, torn bedrock |
| bone limestone (Necropolis) | `#d0c8c0` lit / `#a69886` mid | tomb rock only |
| pit dark | `#303038` | tomb shafts, temple doorway depth |

### Ground and vegetation
| swatch | hex | use |
|---|---|---|
| gold grass, sunlit | `#c08820` | Terraces bright fields |
| dry grass | `#c69e57` | island-wide default ground |
| grass, parched | `#8a6b2d` / `#77613b` | scuffed and trampled variants |
| carob ground, lit | `#b07c38` | Carob Wood dirt |
| carob shade | `#584020` / `#483820` | dapple pools under canopies |
| olive green | `#504820` / `#484018` | prickly pear, scrub |
| carob canopy | `#383820` / `#342d18` | tree crowns — darkest green on the island |
| trunk / pods | `#3b2d1b` | carob wood, seed pods |
| poppy / fruit accent | `#a85810` | poppies, prickly-pear fruit — use sparingly |

### Water, salt, sky
| swatch | hex | use |
|---|---|---|
| sea, deep below | `#125c9b` | what you see past the rim |
| sea, mid | `#4882aa` | map-screen sea |
| sea haze | `#7ba9cd` | horizon, distance fade |
| sky | `#e6f5f3` / `#d4e8ed` | above the rim |
| pan water | `#b9b8ab` | still sky-mirror in the pans (NOT sea blue) |
| salt crust | `#f0e8e0` | pan rims |
| dried pan | `#eeeae3` | whole white pan floors |

### Arcane (magic only, nowhere else)
| swatch | hex | use |
|---|---|---|
| arcane violet | `#403860` core, `#384078` bloom | tomb-mouth glow, temple interior |
| sigil cyan | existing game cyan | keep the current interior sigil exactly as is |

Rule of thumb: the island is a **warm triad** (honey stone / gold grass / olive green) over a
**cool floor** (sea blue). Violet/cyan only where magic is; that is why it reads.

## The rim — the edge of the world

Where the grid ends, the ground ends. Per `zone-salt-pans.png` and `island-hero.png`:

- Top course: a lit lip of pale stone (`#f8e0a0`) with tufts of dry grass overhanging.
- Face: 2–3 visible strata of blocky weathered limestone (`#b3843f` → `#806941`), horizontal
  bedding lines, salt-staining streaks.
- Below the face: nothing — sky fading to sea (`#7ba9cd` → `#125c9b` with sun glitter).
- No fence, no water tile, no invisible wall. A rim tile = ground on top + cliff face + sky.
- Scatter one or two **drifting fragments** (small tumbled blocks, `#b3843f`, own tiny shadow
  side) in view past the rim — they sell "floating" from ground level.

**Underside** (map screen / hero art only): torn, not cut. Raw bedrock (`#624a2d`) tapering to
a ragged point, long hanging roots and dry vegetation trailing off it, fragments drifting in
its shadow. Never draw the underside as a clean slab.

## Ruin stone vs island stone — the continuity the owner asked for

Same stone, different age. The megaliths are the island's own limestone, quarried long ago:

- **Island stone**: crisp edges, warm lit faces `#d7b582`, thin weathering.
- **Ruin stone**: the same hues shifted one step darker/greyer (`#af8748`), edges rounded off,
  salt-pitted surface, lichen specks, some blocks leaning or fallen. It should look like the
  island stone after three thousand years, not like a different tileset.
- **Threshold contrast**: outside is warm and bright; through the trilithon doorway the value
  drops hard to `#303038` with the existing cold cyan/violet interior beyond. Walking out of
  the gate = walking out of cold torchlight into sun. Do not warm the interior to match; the
  contrast is the design.
- The existing grey ruin interior tiles are fine as-is — they read as the shaded, buried face
  of the same limestone. Exterior ruin tiles should sit between them and the island stone.

## Zones — materials, props, tile guidance

Every zone keeps the same sun, the same limestone, the same sea past the rim. Only the ground
dressing, density and one signature colour change.

### 1. Temple Approach (centre — arrival, safest)
- **Ground**: large cracked paving slabs `#d7b582`, joints dark `#806941`, dry grass and small
  wildflowers pushing through cracks. Calmest ground in the game — sprites must read here first.
- **Props**: fallen column drums (cylinder on its side), leaning megaliths, rubble piles,
  broken slab corners, one prickly-pear clump against the ruin wall.
- **Tiles**: pavement base ×3 variants (clean / cracked / grass-in-joints), pavement→grass
  transition, drum prop, megalith wall pieces matching the ruin atlas language.
- **Feel**: warm, open, safe. Reference: `zone-temple-approach.png`.

### 2. The Terraces (SW — open, gentle)
- **Signature**: the rubble wall (*ħajt tas-sejjieħ*): irregular fist-to-head stones, no
  mortar, knee-to-waist height, `#b3843f` lit / `#806941` shadow. Walls run along terrace
  steps and are the zone's cover/blocker element — one wall piece per tile edge, straight +
  corner + broken-gap variants.
- **Ground**: gone-wild gold grass `#c08820`/`#c69e57`, seeded and scruffy, thin poppy
  scatter `#a85810`, dusty path slabs `#d5aa60`.
- **Props**: prickly-pear clumps (paddles `#504820`, fruit `#a85810`) at wall corners, a lone
  wind-bent carob, terrace-step risers (half-height cliff lips).
- **Feel**: generous, sunny. Reference: `zone-terraces.png`.

### 3. The Carob Wood (NE — cover, ambush)
- **Signature**: carob trees — short thick gnarled trunks `#3b2d1b`, ALL bent the same way
  (prevailing wind = blowing from the lower-right, so crowns lean upper-left with the shot),
  dense dark crowns `#383820`, brown pods on branches and ground.
- **Ground**: dry dirt `#b07c38` with hard-edged dapple pools `#584020` under each crown —
  dapple is painted onto ground tiles as shadow shapes, not softened.
- **Props**: tree (the blocker; big canopy, sprite can stand behind trunk), limestone boulders
  breaking the soil, fallen pods, dry scrub.
- **Warning for tiles**: keep the shade pools big and readable; the concept's dapple is at the
  busy limit of what a sprite can stand on. Simplify, don't copy density.
- **Feel**: shade something could wait in — but still dry Mediterranean, never a lush forest.
  Reference: `zone-carob-wood.png`.

### 4. Salt Pans (SE rim — exposed, pretty)
- **Signature**: chequerboard of rectangular basins cut a hand-depth into the rock.
  Three pan states: water (still sky-mirror `#b9b8ab` — NOT sea blue), drying (crust ring
  `#f0e8e0` around shrinking water), dried (all-white floor `#eeeae3`).
- **Ground**: walkable stone ridges between pans `#d3af75`, salt-stained white at the pan lips.
- **The rim is part of this zone**: last row of pans, then cliff edge, then sea `#125c9b`
  far below with glitter, and one drifting fragment in the view.
- **Tiles**: pan tile ×3 states, ridge tile, ridge-cross tile, rim/cliff tiles. Pans are
  natural difficult/blocking terrain; ridges are the walkable lanes.
- **Feel**: dazzling, exposed — the brightest zone; nowhere to hide. Reference:
  `zone-salt-pans.png` (the best rim reference in the set).

### 5. The Necropolis (NW spur — hardest, best rewards)
- **Signature**: rock cut *down*, not built up — rectangular tomb shafts with descending
  steps, low rock-cut doorways in outcrops, sarcophagus lids ajar, small leaning standing
  stones like broken teeth.
- **Ground**: the palest stone on the island, bleached toward bone `#d0c8c0` lit /
  `#a69886` mid, drifted dust, one dead thorn bush per screen at most. Nearly no green.
- **Light**: same sun direction, but shadows shift grey-violet and values cool. Faint arcane
  glow `#403860` breathing from one or two open shafts — the only magic colour outdoors.
- **Caution from the concept**: `zone-necropolis.png` drifted colder/greyer than intended.
  For tiles, warm it ~10% back toward honey (keep lit faces nearer `#cfc0a0` than pure grey)
  so it still reads as *bleached island limestone*, not as the old grey interior tileset.
  The concept's *forms* (shafts, lids, doorways, standing stones) are exactly right.
- **Feel**: quiet menace; visibly the place worth the risk (the Cimetière lesson).
  Reference: `zone-necropolis.png`.

## Building tiles from this

1. **Base grounds** (2:1 iso diamonds, matching the existing `art/world.png` language):
   pavement, gold grass, carob dirt, salt-ridge stone, bone stone — five grounds, 2–3 low-noise
   variants each. Keep per-tile value range narrow; the sampled "lit" hexes above are the tile
   base colours, the "shadow" hexes are for edges and cracks only.
2. **Transitions**: every zone ground meets dry grass (`#c69e57`), the island-wide connective
   tissue — so one transition set per zone against grass is enough; zones never touch each
   other directly except through grass or a wall.
3. **Rim set**: straight edge, outer corner, inner corner — ground lip + cliff face + sky/sea
   below, per "The rim" above. This one set is what makes the island float in-game.
4. **Blockers by zone**: megalith/drum (Temple), rubble wall (Terraces), carob tree (Wood),
   water pan (Pans), shaft/sarcophagus (Necropolis). One silhouette each — that is how a
   player knows where they are with one glance at cover.
5. **Sprite check**: before accepting any ground tile, drop the existing hero sprite on it.
   If the sprite fights the ground, remove texture from the tile, not colour.
