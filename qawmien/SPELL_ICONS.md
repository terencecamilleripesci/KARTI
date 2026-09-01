# SPELL_ICONS — the ability-bar icon sheet

`art/ui/spell-icons.png` + `art/ui/spell-icons.json`. One icon per spell id in
`classes.js` (all five classes **plus** the Ram's `ramhorn`). Produced via the
Codex image partner; verified for alpha, alignment and 44 px legibility.

## Geometry

| property | value |
|---|---|
| sheet size | **512 × 256** px (power of two), RGBA, true transparent background |
| cell size | **64 × 64** px |
| grid | **8 columns × 4 rows** (row-major) |
| filled cells | **0–21** (22 icons); cells 22–31 are fully transparent padding |
| inner padding | ~6 px inside each cell; no icon touches or crosses a cell border |

Cell `i` → source rect `x = (i % 8) * 64`, `y = floor(i / 8) * 64`, `w = h = 64`.

## Addressing from code

`spell-icons.json` carries the geometry plus two lookups:

- `index` — `{ spellId: cellIndex }`, e.g. `index.maul === 0`
- `order` — the same mapping as a flat array, `order[cellIndex] === spellId`

```js
const S = await (await fetch('art/ui/spell-icons.json')).json();
const i = S.index[spell.id];
ctx.drawImage(img, (i % S.cols) * S.cell, ((i / S.cols) | 0) * S.cell,
              S.cell, S.cell, dx, dy, 44, 44);
```

CSS sprite alternative (for a 44 px button, scale factor 44/64 = 0.6875 →
background-size `352px 176px`, position `-(col*44)px -(row*44)px`).

## The map

| # | id | class | glyph |
|---|---|---|---|
| 0 | `maul` | warden | war-maul striking down |
| 1 | `rootgrasp` | warden | root-hand + inward pull arrow |
| 2 | `quake` | warden | cracked rock / fissure shockwave |
| 3 | `crush` | warden | huge falling boulder |
| 4 | `bulwark` | warden | kite shield |
| 5 | `dart` | stormfletch | slim diagonal arrow |
| 6 | `pierce` | stormfletch | long arrow piercing two rings |
| 7 | `gust` | stormfletch | wind chevrons pushing a circle |
| 8 | `windstep` | stormfletch | dotted arc into a wind swirl (teleport) |
| 9 | `cinder` | cindermancer | fireball with tail |
| 10 | `pyre` | cindermancer | radial explosion starburst |
| 11 | `snare` | cindermancer | spiked mine on the ground (trap) |
| 12 | `flashburn` | cindermancer | flame flash + one big push chevron |
| 13 | `lash` | tidebinder | S-curved water whip |
| 14 | `mend` | tidebinder | droplet with a plus cross (heal) |
| 15 | `wavebreak` | tidebinder | breaking wave curl + push chevron |
| 16 | `blessing` | tidebinder | cross in a radiant sparkle ring (area heal) |
| 17 | `crook` | shepherd | shepherd's crook strike |
| 18 | `callram` | shepherd | front-facing ram head, curled horns (summon) |
| 19 | `whistle` | shepherd | concentric sound arcs |
| 20 | `flockmate` | shepherd | two curved swap arrows |
| 21 | `ramhorn` | ram (summon) | charging ram head in profile |

## Palette / usage notes

- Element accents: earth = amber `#d9a441` + stone grey, fire = `#e8622d`/`#f2c14e`,
  water = `#3d9bd1`/`#7fd4c1`, air = pale mint `#cfe8d8`/white. All hold contrast
  on the HUD background `#0E0B1A`.
- No text or numbers are baked in — draw AP cost / cooldown overlays in the UI.
- Icons are painted for ~44 px display; sample with smoothing (LANCZOS / default
  canvas smoothing), not nearest-neighbour.
- Silhouette audit (flat black at 44 px, all 231 pairs, IoU): worst pair is
  `snare`/`mend` at 0.72 — both centred round masses, but spiked-hemisphere vs
  smooth teardrop plus opposite element colours, and they never share a class
  bar. No within-class pair ranks in the top ten. `callram` vs `ramhorn` (0.64)
  are both ram heads by design; only `callram` appears on the shepherd's bar.
