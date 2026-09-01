# HUD_SPEC — the HUD contract for Il-Qawmien

Four agents build against this file **in parallel, without talking to each other**.
Everything here is a decision, not an option. If this file and the code disagree,
fix the code. Shared constants live in `hud-types.js` (`window.HUDT`) — that file
is part of this contract and is **read-only** to all agents; changing it means
changing this spec first.

Palette (exact, already in both html `:root` blocks and `HUDT.C`):
`--bg #0E0B1A · --panel #171331 · --ink #EDEAF6 · --dim #9C97B8 · --gold #FFC542 ·
--ap #8A5CFF · --mp #3DDC84 · --you #4FA9E8 · --foe #E8455F`

---

## §0 Architecture: two documents, one hud.js

The game is **two documents**: `world.html` (explore) and `index.html` (combat),
the latter opened full-screen in an iframe over the former (`#cbf`, z 45, opaque).
There is **no** single bar that literally morphs across documents — pretending
otherwise produces cross-frame DOM surgery. Instead:

- **`hud.js` (`window.HUD`) is ONE file loaded by BOTH documents.** In
  `world.html` it boots in `explore` mode; in `index.html` it boots in `combat`
  mode. Because both instances use the same `HUDT` geometry, the explore bar and
  the combat bar are **pixel-identical where they overlap** (same bar chrome,
  same three orbs in the same screen positions). Continuity is real, not faked.
- The perceived "bar grows" moment (§7.1) is played **inside the combat
  document** on entry: the bar renders at explore height (`HUDT.BAR.H` 64px) and
  grows to combat height (`HUDT.BAR.COMBAT_H` 134px) over 220ms.
- **Each document reads its own state, never across the frame boundary:**
  - `world.html` → `window.PLAYER` (the HERO view; see §8).
  - `index.html` → the snapshot `tactics.js` passes to `HUD.combatPaint()` (§7.4).
  - The only things that cross documents are the ones that already do:
    `localStorage` (sound + visited keys) and `postMessage` (KARTI close, §4).

### File ownership — nobody touches another agent's files

| Agent | Builds | Owns (exclusive write access) |
|---|---|---|
| **A — bar, orbs, settings** | `window.HUD` incl. combat-bar *rendering* | `hud.js` (new), `hud.css` (new), **all edits to `world.html`**, the one edit to `../karti-malta/js/qawmien.js` (§4.3) |
| **B — minimap** | `window.MINIMAP` | `minimap.js` (new), the one CSS line in `quest.js` (§5.4) |
| **C — spells tab** | `PANELS` gains a Spells tab | `panels.js`, `panels.css` |
| **D — combat integration** | tactics → HUD wiring, DOM removal | `tactics.js`, `index.html` |

Boundary between A and D: **A implements how the combat bar looks and behaves**
(inside `hud.js`, driven purely by the snapshot); **D implements what it knows**
(builds the snapshot, wires actions, deletes the old DOM). Neither edits the
other's files. `hud-types.js` and this spec are frozen.

Script order (both documents): `hud-types.js` → *(world only: `world-types.js`
etc. as today)* → `minimap.js` (world only) → `hud.js` → page scripts. Both
documents add `<link rel="stylesheet" href="hud.css">`.

### z-index (existing values are law — `HUDT.Z`)

`HUD 30 · TOOLTIP 36 · PANELS 40 · MENU 44 · CBF 45 · DLG 50 · REINC 60 ·
LOADER 100` (quest coach toast stays 9999). The settings menu (44) deliberately
sits **below** the combat iframe (45): combat covers explore chrome entirely.

### Breakpoints and safe areas

- `≤359px` wide: SMALL sizes (`HP_SMALL` 60, `SIDE_SMALL` 40, `BTN_SMALL` 48).
- `≥600px`: bar content capped at `HUDT.MAXW` 560px, centered (matches `#wrap`).
- Every fixed strip uses `env(safe-area-inset-*)`; bottom bar padding-bottom is
  `max(10px, env(safe-area-inset-bottom))`.
- `hud.js` maintains `--hud-bar-h` and `--hud-top-h` on `:root` (measured total
  heights including safe insets, updated on resize and mode change). Pages use
  them to keep content clear of the chrome (§2.5, §7.1).

Reduced motion: **every** animation in this spec is disabled or reduced to an
opacity change under `prefers-reduced-motion: reduce`. Named exceptions appear
inline; anything unnamed = off.

---

## §1 window.HUD — the API (implemented by Agent A)

```js
HUD.init({ mode, onAction })   // mode: 'explore'|'combat'. Builds all HUD DOM
                               // (bottom bar, and in explore: top bar+settings).
                               // onAction(action, arg) — see action table.
HUD.setMode(mode)              // animates bar height 220ms (HUDT.BAR.MODE_MS);
                               // instant under reduced motion.
HUD.refresh()                  // explore: re-read window.PLAYER now and repaint.
                               // (HUD also polls every HUDT.POLL_MS = 300ms.)
HUD.combatPaint(snap)          // combat: full repaint from the snapshot (§7.4).
                               // HUD diffs snap.hero.hp between calls and fires
                               // the damage/heal orb reactions itself — tactics
                               // never calls a reaction function.
HUD.soundOn()                  // -> boolean (reads HUDT.KEYS.SOUND live).
HUD.sfx(name)                  // 'tap'|'select'|'damage'|'heal'|'error' — tiny
                               // WebAudio blips (§4.2), gated by soundOn().
```

`onAction` actions: explore → `'bag'`, `'hero'`; combat → `'spell'` (arg =
spell id, fired on tap that wasn't a long-press), `'end'`, `'map'`. Settings
actions are handled inside `hud.js` itself (§4) and do NOT go through
`onAction`.

All HUD DOM is built by `hud.js` (no markup added to the html files beyond
script/link tags); ids are prefixed `hud-`. `hud.css` owns all its styling —
tokens from `:root`, no raw hex except the palette values above.

---

## §2 The bottom bar — explore mode

### 2.1 Order, and why

```
[ Bag ]   (AP orb)   ((( HP crystal ball )))   (MP orb)   [ Hero ]
```

- **Edges = tapped, centre = read.** Bag and Hero are the only tappable things
  in explore, so they take the two thumb-easiest positions at the bar's edges
  (reachable one-handed from either grip on a phone).
- **HP is the most-read number in the game** → dead centre, biggest, raised.
- **AP left of HP, MP right** — the same AP-then-MP reading order the combat
  top pools have always used; players already learned it.
- In combat the two edge slots swap for the combat verbs (§7.2) while the three
  orbs **do not move** — that fixed centre is the visual anchor across modes.

### 2.2 Bar chrome

Full-width fixed strip, height `HUDT.BAR.H` 64px + safe inset. Background
`rgba(23,19,49,.92)` (panel at 92%), 1px top border `--line`,
`backdrop-filter: blur(8px)` (with a solid fallback — the rgba alone must be
legible). Content row: `max-width 560px`, centered, `padding 0 10px`.

Bag/Hero: the existing `.btn` language — 48px tall, min-width 64, radius 12,
border `--line`, bg `rgba(23,19,49,.88)`, weight 800, `:active` scale .96,
`aria-label="Open inventory"` / `"Open character sheet"`. The old top-right
`#hud` div and its CSS **are deleted from world.html** (Agent A).

### 2.3 The crystal ball (HP) — the centrepiece

A `<canvas>` (DPR-scaled ×2 max) inside a 68px circle (`HUDT.ORB.HP`; 60 on
SMALL), centered on the bar, its centre sitting `HUDT.ORB.HP_OVERHANG` 22px
**above** the bar's top edge so it reads as the jewel of the bar. Wrapped in a
`role="img"` element with live `aria-label="Health 37 of 95"`. Not a button.

Drawn layers, back to front:
1. outer glow: radial, the current fluid colour at 18% alpha;
2. glass ball: dark base `#0B0916`, inner rim shadow;
3. **fluid**: fills to `hp/hpMax` of the ball's height. Surface is two sine
   waves (main + 60%-alpha echo, phase-offset, ±2px amplitude,
   `HUDT.ORB.WAVE_MS` 2.4s loop). Fluid colour from `HUDT.ORB.hpColor(frac)`:
   `>60% → #4FA9E8` (the player's own blue), `30–60% → #FFC542`,
   `<30% → #E8455F`. Colour AND level move together — never colour alone;
4. meniscus highlight: 1px lighter line along the fluid surface;
5. glass: top-left specular ellipse (white 22%), 2px rim `rgba(255,255,255,.25)`;
6. the number: current HP, centered, 700 weight, 20px, tabular numerals,
   `--ink` fill with a 2px `#0E0B1A` stroke behind it — the outline is what
   guarantees ≥4.5:1 against any fluid colour at any level.

Reactions (HUD detects by diffing hp — in explore via the 300ms poll, in combat
via consecutive `combatPaint` snaps):
- **damage**: fluid level eases down 300ms; white flash overlay 120ms; ball
  shakes ±3px for 250ms. Reduced motion: level snaps, flash only, no shake.
- **heal**: level eases up 300ms + soft green (`--mp` at 25%) shimmer 300ms.
- **critical** (<30%): the outer glow pulses at 1.2s. Reduced motion: steady
  glow, no pulse (colour+level already say it).

The ball's rAF runs only while the tab is visible; it pauses on
`document.hidden`. Never attach to the page's game loop.

### 2.4 AP / MP orbs

44px circles (`HUDT.ORB.SIDE`; 40 SMALL), flanking the ball with 12px gaps.
Style: same glass language as the ball, smaller — dark base, a **conic-gradient
ring** (3px) showing `current/max` in the pool colour (`--ap` violet / `--mp`
green), the number centered (700, 15px, tabular, `#C9B4FF` / `#8CF0BC` — both
≥4.5:1 on the dark base), and a tiny letter label under the number ("AP"/"MP",
9px, `--dim`). `role="img"`, `aria-label="Action points 6 of 6"` /
`"Movement points 3 of 3"`. Not buttons. In explore they show the derived base
values from `PLAYER` (full ring); they exist in explore so the bar doesn't
reshuffle when combat starts.

### 2.5 Making room

`world.html` (Agent A) changes `#wcv` to `top:0; bottom:var(--hud-bar-h,64px)`.
`WORLD.draw()` refits the whole-map camera every frame from the canvas box, so
the framed 10×10 map re-centres in the remaining space automatically — do not
touch world.js. Verify no tile sits under the bar in the screenshot pass (§10).

---

## §3 The top strip — explore mode

Layout (all `HUDT.Z.HUD` 30): **minimap top-left** (§5) · **top-centre KEPT
EMPTY** — when embedded, KARTI's own "✕ KARTI" escape button floats there
(`js/qawmien.js` places it top-centre, z 9000-relative; nothing of ours may sit
under it) · **settings gear top-right** (§4).

The quest pill `#qhud` moves down below the minimap (§5.4).

---

## §4 Settings (Agent A)

### 4.1 The gear

Top-right, at `calc(8px + env(safe-area-inset-top)) / calc(8px + env(safe-area-inset-right))`
— the slot Bag/Hero vacated. 48×48 icon-only button, same `.btn` chrome, inline
SVG gear (stroke 2, no emoji), `aria-label="Settings"`,
`aria-expanded`/`aria-haspopup="menu"`. Tap toggles the menu.

### 4.2 The menu

A dropdown card anchored under the gear: `--panel` bg, 1px `--line`, radius 14,
`box-shadow 0 12px 32px rgba(0,0,0,.5)`, min-width 224px, z `HUDT.Z.MENU` 44,
with a full-screen transparent backdrop that closes on tap. Opens 160ms
scale(.96→1)+fade from the gear (reduced motion: instant). `role="menu"`;
items are 48px-tall `role="menuitem"` buttons; Escape closes and refocuses the
gear; focus is trapped inside while open.

Items — exactly these two (plus a divider):

1. **Sound** — a labelled switch row ("Sound", `role="menuitemcheckbox"`,
   `aria-checked`). Persists `HUDT.KEYS.SOUND` (`'0'` = muted, default ON).
   This toggle is REAL, not a stub: `hud.js` ships a tiny WebAudio SFX kit
   (`HUD.sfx`) — `tap` (short 880Hz tick on every HUD button press), `select`
   (two-note up-chirp on spell select), `damage` (110Hz thud, fired with the
   orb damage reaction), `heal` (soft 660Hz sine), `error` (dull 220Hz, §7.6).
   Master gain 0.15, envelope ≤120ms, AudioContext lazily created on first
   user gesture. `soundOn()` reads localStorage **at play time**, so muting in
   explore silences the combat document instantly too.
2. **Back to KARTI** — posts
   `window.parent.postMessage({ type: HUDT.MSG.CLOSE, v: 1 }, location.origin)`.
   **Standalone fallback:** when `window.parent === window`, this row is not
   rendered at all — the menu shows Sound only. (Never a dead button.)

### 4.3 The parent-side handler (edit in `../karti-malta/js/qawmien.js`)

KARTI's `onMsg` currently ignores everything but `hello`. Agent A makes this
exact change inside `onMsg` (the frame/origin guards above it stay untouched):

```js
// before:
if (!d || d.type !== 'qawmien:hello') return;
// after:
if (!d) return;
if (d.type === 'qawmien:close') { close(); return; }
if (d.type !== 'qawmien:hello') return;
```

`close()` already handles history/popstate. Per the KARTI standing rules: bump
the KARTI build number AND the sw cache version together when touching
karti-malta.

---

## §5 window.MINIMAP (Agent B) — which box you are on

### 5.1 Representation

The world is a 5×3 field grid **plus** two ruin rooms chained onto it
(`ruin-01 ─e─ ruin-02 ─exit─ field-0-0`, which is grid 0,0 = top-left). The
minimap draws exactly that topology, left to right, on ONE small canvas:

```
[r1][r2]──[f00][f10][f20][f30][f40]
          [f01][f11][f21][f31][f41]
          [f02][f12][f22][f32][f42]
```

- Field cells: 16px squares, 2px gaps (`HUDT.MMAP`), 3px corner radius.
- Ruin cells: **12px** squares, top-aligned with the grid's top row, joined to
  `field-0-0` by a 6px-long 2px connector line (`--line` colour). The smaller
  size + the visible connector + the gap is what says "a separate wing reached
  through a door", honestly, without inventing a fake 6th column.
- Content is 120×52 (`HUDT.MMAP.W/H`); panel adds 6px padding → 132×64 box.

### 5.2 Cell states (fill + outline together — never colour alone)

- **current**: filled `--gold`, plus a 6px gold outer glow. The one lit box.
- **visited**: filled `#2A2450` (panel-light), no glow.
- **unvisited**: no fill, 1px outline `rgba(255,255,255,.14)`.

### 5.3 Panel & behaviour

Fixed top-left at `calc(8px + env(safe-area-inset-top)) / calc(8px + env(safe-area-inset-left))`,
z 30, chrome matching the buttons: `rgba(23,19,49,.88)`, 1px `--line`, radius
10. **Display-only** — not a button, no pointer handlers,
`role="img"` with live `aria-label="World map — you are in " + HUDT.mapLabel(id)`.

- `MINIMAP.init()` — builds DOM, loads visited set from `HUDT.KEYS.VISITED`
  (JSON array of map ids), then **polls `WORLD._map && WORLD._map.id` every
  `HUDT.MMAP.POLL_MS` 400ms** (redraws only on change). Polling means no claim
  on `WORLD.onExit` — that single-callback slot belongs to world.html's glue
  and must not be stolen.
- `MINIMAP.setCurrent(id)` — public for tests: marks `id` current + visited,
  persists, redraws.
- Draw cost: one ≤264×128 canvas (DPR 2), redrawn only on change. No rAF.

### 5.4 The quest pill moves down

`#qhud` (quest.js, currently `top:8px;left:8px`) would sit under the minimap.
Agent B changes exactly one line in quest.js's injected CSS:
`'#qhud{position:fixed;top:8px;left:8px;…'` →
`'#qhud{position:fixed;top:calc(env(safe-area-inset-top,0px) + 80px);left:8px;…'`
(80 = 8 + 64 panel height + 8 gap). Nothing else in quest.js changes.

---

## §6 PANELS gains a Spells tab (Agent C)

The Hero sheet (`#panel-stats`) gets a 2-tab header at its top: **Character |
Spells** (48px-tall tab buttons, `role="tablist"`/`tab`/`tabpanel` wiring,
selected tab: `--gold` underline 2px + `--ink` text; unselected `--dim`;
arrow-key switching). "Character" is today's sheet content, untouched. Bag stays
its own panel.

API additions (existing contract style):
```js
PANELS.openSpells()        // opens the hero panel on the Spells tab
PANELS.toggle('spells')    // same toggle semantics as 'inventory'/'stats'
```
`PANELS.openStats()` keeps opening the Character tab (always, not last-used).

Spells tab content — one card per spell of `HERO.spells()` (order preserved):
- 40px icon: `HUDT.spellIcon(sp.id, 28, HUDT.ELEM[HUDT.elemOf(sp)])` on a dark
  rounded tile — the **same glyph the combat bar shows**, so the tab is where
  players learn the icons;
- name (700, `--ink`) + element chip (element tint, 11px);
- fact row, 12px `--dim`, tabular: `3 AP · Range 2–6 · needs sight · Cooldown 2`
  (range `min`==`max` shows one number; `min 0` shows "Self–N"; `los:false`
  shows "ignores walls"; omit cooldown when `cd` 0). Extension effects get one
  word each: `aoe`→"area", `push`/`pull`→"pushes N"/"pulls N", `heal`→"heals",
  `tp`→"teleport", `trap`→"trap", `summon`→"summons", `swap`→"swaps",
  `shield`→"shields";
- the `hint` line, 13px `--dim`, full width.

Pre-choice (`!HERO.chosen()`) this tab shows a real in-fiction state, not a
stub: the class emblem area empty, headline "Not yet awakened", body "Reach the
Elder in the ruin — your class chooses your spells." — same empty-state styling
panels.js already uses.

---

## §7 Combat: the bar grows (Agents A render / D wire)

### 7.1 Grow / shrink

`index.html` boots, `tactics.js` calls `HUD.init({mode:'combat', onAction})`
**before** `newMatch()`. HUD renders the bar at explore height, and on the
first `combatPaint` grows it to `HUDT.BAR.COMBAT_H` 134px over 220ms
(`HUDT.BAR.EASE`), the skill row fading in translateY(8px→0) with 20ms/icon
stagger. Because the world's bar (identical geometry) is still sitting under
the opaque iframe, the player sees *their* bar sprout a skill row. Fight end is
handled as today (world.html tears the iframe down; no shrink animation needed
— the world bar underneath IS the shrunk state). Reduced motion: everything
appears in place. Height changes animate `height` on the fixed bar only — the
board above never reflows mid-fight (`--hud-bar-h` is set once per mode).

`index.html` (Agent D): `#wrap` gets `padding-bottom: var(--hud-bar-h, 134px)`
so `fit()` sizes the board clear of the bar. D **deletes** from index.html: the
`#top` AP/MP `.pool` divs, `#spells`, `#bar` (Map/Cancel/End) and all their
CSS. `#who` is also deleted — the turn line moves into HUD (§7.3). `#toast`,
`#float`, `#over` stay (game-owned).

### 7.2 Combat bar layout (rendered entirely by hud.js)

```
row 1:  [sp1] [sp2] [sp3] [sp4] [sp5]           ← skill icons, left-aligned
row 2:  [Map]  (AP orb) ((HP ball)) (MP orb)  [End turn]
```

- Row 2 is the explore bar with the edge slots swapped: **Map** (56×56
  icon-only ghost button, grid glyph, `aria-label="Toggle painted map"`,
  `aria-pressed`) left; **End turn** right — the most-tapped combat action gets
  the strongest thumb position (the same reasoning as Bag/Hero at edges). End
  turn: the gold `.go` treatment (gradient `#FFD979→#FFC542`, ink `#1A1206`,
  ≥7:1), 48px tall, label text "End turn", disabled (opacity .38 + `disabled`)
  when `!snap.mine || snap.over`.
- The three orbs keep their exact explore positions and sizes. **Cancel/Skip
  buttons are gone**: tapping the selected spell icon deselects it (already
  tactics' `sel` toggle), and "skip" IS "End turn".

### 7.3 The turn strip

HUD renders a small top-LEFT strip in combat (`#hud-turn`, z 30): name line
(700 15px `--ink`) + hint line (11px `--dim`, wraps, never truncates) from
`snap.turn`. Top-left because when embedded, **KARTI's ✕ button owns
top-centre** — even over the combat iframe. `aria-live="polite"` on the name
line only.

### 7.4 The snapshot — the single combat state pipe

`tactics.js` `paint()` deletes all its `getElementById` DOM writes and instead
builds this and calls `if (window.HUD) HUD.combatPaint(snap);` (guarded — lab
pages load tactics.js without hud.js):

```js
{
  over: G.over,                    // 0 running, 1 won, -1 lost
  round: G.round,
  mine: /* me().side === 0 && !me().auto && !G.over */,
  hero: { hp, hpMax, ap, apMax, mp, mpMax },   // §8: ALWAYS the hero unit
  turn: { name, hint },            // exactly the strings #who used to show
  sel,                             // selected spell id or null
  mapMode,                         // current painted-map state (Map button)
  spells: HERO_SPELLS.map(s => ({
    id, name, ap, min, max, los,   // copied from the spell
    cd:  u.cd[s.id] || 0,          // turns remaining, 0 = ready
    off: /* the existing disable rule: !mine || u.ap < s.ap || cd > 0
            || (s.summon && !!liveSummonOf(u)) */,
    hint: s.hint
  }))
}
```

`apMax`/`mpMax` are the values the pools reset to at the hero's turn start.
HUD hooks up: `'spell'`→ toggle `sel` + `paint()`, `'end'`→ the existing
end-turn guard block, `'map'`→ the existing mapMode flip (D wires all three in
`onAction`; the old `#end/#undo/#map/#again` handlers for removed elements are
deleted — `#again` stays, it lives in `#over`).

### 7.5 Skill icons — icons ONLY

- 56×56 buttons (`HUDT.SKILL.BTN`; 48 on SMALL), radius 12, 8px gaps, dark tile
  `rgba(255,255,255,.045)` + 1px `--line`. **No name on the button.**
- Glyph: `HUDT.spellIcon(id, 30, HUDT.ELEM[HUDT.elemOf(sp)])` — the shared
  stroke-glyph set, tinted by element. `aria-label` = `name + ', ' + ap + ' AP'`.
- **AP cost badge ON the icon**: 18px circle pinned bottom-right (offset −2px
  past the tile edge), bg `rgba(14,11,26,.95)`, 1px border
  `rgba(138,92,255,.6)`, numeral 11px 700 tabular `#C9B4FF`. Cost only — no
  "AP" text (the violet ring IS the unit; the tooltip and Spells tab teach it).
- States: selected = the existing gold ring treatment (`border --gold`, bg
  `rgba(255,197,66,.16)`, ring shadow); cooling = dark overlay
  `rgba(14,11,26,.72)` + centered gold cd numeral 16px 800 (badge stays);
  unaffordable/`off` = opacity .34 + `disabled`; `:active` scale .96.

### 7.6 Press-and-hold reveals the truth

- **Touch:** press ≥350ms (`LONGPRESS_MS`) with <10px drift → tooltip; a
  10ms `navigator.vibrate` if available. While held, the tooltip stays;
  release hides it and **does not select**. A release before 350ms is a tap →
  `'spell'` action. Disabled/cooling icons still long-press (reading is always
  allowed; `error` sfx + toast only on *tap* of a disabled icon — reuse the
  game's `#toast`).
- **Tooltip** (`#hud-tip`, z 36, one reused element): anchored above the icon,
  clamped ≥8px from viewport edges, `--panel` bg, 1px `--line`, radius 12,
  max-width 280px, `role="tooltip"`. Content: **name** (700 `--gold`) · cost
  chip "3 AP" (violet chip) · fact line as §6 ("Range 2–6 · needs sight",
  "· ignores walls", "Ready in N" when cooling) · the `hint` (13px `--dim`).
- **Non-touch equivalent (defined, since long-press has no keyboard analogue):**
  the icons are real buttons in Tab order; **keyboard focus shows the tooltip
  immediately** (`focus` → show, `blur` → hide, `aria-describedby="hud-tip"`);
  Enter/Space = select; **Escape** hides the tooltip and clears the current
  selection. Mouse hover shows it after 450ms (`HOVER_TIP_MS`) — hover is an
  enhancement, never the only path.

---

## §8 Who the orbs read — the one rule

- **Explore (world.html): `window.PLAYER`** — `hp/hpMax/ap/mp` (PLAYER is the
  live HERO view; quest/panels mutate it directly, HUD's 300ms poll catches
  it). Never read `HERO.cls()` for vitals, never cache.
- **Combat (index.html): the HERO UNIT, always** — `snap.hero` built by
  tactics from `G.units.find(u => u.side === 0 && !u.auto)`. NOT "the acting
  unit": on an enemy's turn the ball still shows YOUR hp (and visibly reacts
  when their hit lands — that is the point of the ball); a summoned ram's turn
  does not hijack your orbs. When `!snap.mine`, HUD dims the AP/MP orbs to 40%
  opacity (numbers stay — dimming marks "not yours right now").
- If the hero unit is dead/absent, orbs show `hp 0` empty ball; never NaN.

---

## §9 Art manifest

| Asset | Form | Why |
|---|---|---|
| HP crystal ball | **canvas**, drawn by hud.js | animates every frame; a PNG can't ripple, costs a download |
| AP/MP orbs | **CSS** (conic ring + gradients) | static shape, dynamic fill |
| Spell icons (all 27) | **inline SVG glyphs from `HUDT.SPELL_GLYPHS`** — ONE shared source in hud-types.js, already written | zero downloads, crisp at any DPR, tinted per element, same 2px-stroke language as panels.js's icon set. This intentionally supersedes "one sprite sheet": one *source*, no sheet file at all |
| Gear / grid / tab glyphs | inline SVG in their owning module | matches panels.js convention |
| Minimap | canvas | 132×64, redrawn on map change only |

**No new image files. No emoji anywhere.** If a glyph in `SPELL_GLYPHS` renders
badly at 30px, refine the path *in hud-types.js* and note it in the report —
ids and the single-source rule are the contract, individual path data is not.

---

## §10 Definition of done (every agent, before reporting)

1. `node --check` every touched `.js`; `python3 tools/checkhover.py` exits 0;
   `node tools/checkmaps.js` and `python3 tools/checkatlas.py` pass.
2. Screenshot pass at 390×800 (headless chromium per the project rules,
   virtual-time clock override where walks/turns must complete) of: explore
   with the new bar + minimap + settings menu open; combat with the grown bar,
   a selected spell, and a long-press tooltip; the Spells tab. **Read the
   PNGs.** Judge clipping only via `getBoundingClientRect` vs
   `window.innerWidth` in a pinned-width iframe.
3. Temporary harnesses named `_*.html` and deleted before finishing.
4. Touch targets ≥44px, focus visible on every control, contrast per this spec,
   reduced-motion verified (emulate and screenshot once).
5. Standalone `index.html` still plays with the stock kit; standalone
   `world.html` shows no "Back to KARTI" row; `lab.html`/`rigger.html` still load.
