# KARTI — ART STYLE BIBLE
**The one look that makes 200+ cards feel like a single printed set.**

Version 1.0 · owner: art pipeline · consumed by `scripts/make_prompts.js`
Do not change the style block after a batch has been generated — mixed batches will
look like two different games. If you must change it, regenerate **everything**.

---

## 0. The one-line answer

> **KARTI Poster Cartoon** — bold uniform ink outline, flat cel shading (two tones +
> one hot highlight), warm Mediterranean midday light, a locked palette per attribute,
> single subject dead-centre, simple graphic background. Think animated-series key art
> / silkscreen gig poster, **not** painting, **not** photo, **not** anime.

Everything below is the enforcement detail.

---

## 1. Why this style (and not a prettier one)

We are generating 200+ images in one unattended GPU hour. The style has to survive that.
Four hard constraints picked it:

**1. The thumbnail is 96 pixels wide.**
Measured from `css/cards.css` in a real browser: the `.card__art` window on a
`.card--sm` grid tile renders at **95.8 × 95.9 CSS px**. That is the size at which
players will meet most of these cards. A painterly or photoreal render at 96px is grey
mush. A **thick ink outline plus flat colour blocks** still reads as "angry farmer with
a tractor" at 96px, because the information is carried by silhouette and hue, not by
texture and micro-detail. This constraint alone eliminates every realistic option.

**2. Flat shading has fewer degrees of freedom, so it drifts less.**
Style drift across a long batch comes from the model re-deciding things: brush size,
light softness, colour temperature, depth of field, film grain. Cel shading removes
almost all of those decisions — there are two tones and a line. Two hundred images made
with "flat cel shading, 2 tone" land far closer together than two hundred made with
"digital painting", even on the same seed and checkpoint.

**3. It is dense in SDXL training data.**
Vector mascot art, comic covers, gig posters and animated-series key art are enormously
well represented. Prompt adherence is high and the model does not need a LoRA to find
the style, which means **zero extra setup risk on the pod** — no LoRA download, no
weight tuning, no "why does it look different now".

**4. It makes the jokes land and keeps them safe.**
KARTI is rude Maltese humour about in-laws, hangovers and traffic. Caricature reads as
affectionate; photorealism of the same joke reads as mockery of a real person.
Cartoon also structurally avoids the uncanny-valley and NSFW failure modes — a flat,
outlined, big-headed character is very hard to accidentally render explicit.

**Rejected alternatives:** oil painting / Magic-the-Gathering fantasy realism (dies at
96px, drifts badly), anime (wrong cultural register for Maltese village comedy, and
pulls in unwanted tropes), 3D render / Pixar (very slow to keep consistent without a
LoRA), pixel art (fights the ornate card frame in `cards.css`).

---

## 2. The locked style block

This exact text is the `STYLE` constant in `scripts/make_prompts.js`. Every single
prompt — card art and UI art — ends with it. **Do not edit one prompt's copy of it.**

```
bold-outline stylised cartoon caricature illustration, thick uniform black ink
outline, flat cel shading with exactly two shadow tones and one hot rim highlight,
no gradients inside shapes, limited flat colour palette, warm Mediterranean midday
sunlight from the upper left, crisp graphic shapes, subtle paper grain, animated
series key art, silkscreen poster look, high contrast, clean simple background,
strong readable silhouette, centred single subject
```

### Locked render settings (do not vary per card)
| Setting | Value | Why |
|---|---|---|
| Resolution | **1024 × 1024** | SDXL native bucket = best quality, fastest, no bucket-drift |
| Steps | **30** | Below 24 the outlines get soft; above 36 is wasted GPU |
| Sampler | **DPM++ 2M Karras** | Most stable, deterministic across restarts |
| CFG | **6.0** | High CFG (>8) burns colour and *increases* style variance |
| Seed | **deterministic per card id** | Same card always regenerates identically |
| Checkpoint | **one, for the whole batch** | See `docs/RUNPOD_RUNBOOK.md` §3 |

> **Token-budget rule.** The style block must dominate the prompt. Keep each card's
> subject description under ~20 words. A long, chatty subject dilutes the style block
> and is the single biggest cause of drift. `make_prompts.js` enforces this.

---

## 3. Palette per attribute

Locked to the attribute colours already in `js/cards.js` (`ATTR.c`) and `css/cards.css`
(`--attr-*-core`), so the art sits inside its own frame instead of fighting it.

| Attribute | id | Core colour | Palette prompt fragment | Mood |
|---|---|---|---|---|
| 🎆 FESTA | `festa` | `#E8452C` | `hot vermilion red and orange, deep indigo night sky, gold and white spark highlights, warm firelight glow` | Night. Loud. Lit from below by fireworks. |
| 🐇 FARM | `razzett` | `#4CAF50` | `olive and grass green, terracotta orange, straw yellow, dusty warm earth tones, bright dry daylight` | Hard noon sun, dust in the air. |
| 🏰 CITY | `belt` | `#9C27B0` | `violet and magenta, honey limestone beige, cool concrete grey, long dramatic shadows` | Late afternoon between tall buildings. |
| 🌊 SEA | `bahar` | `#2196F3` | `azure and turquoise blue, bleached white limestone, sun glare on water, bright airy light` | Blinding summer light off the water. |
| 😈 TROUBLE | `hazen` | `#37474F` | `slate blue grey, sickly yellow green, muted desaturated tones, cold overcast light, one small warm accent` | Grey, cold, faintly unpleasant. |
| 🟩 SPELL | *(no attr)* | `#189A70` | `emerald and jade green, warm cream, gold accents, clean bright light` | Positive, energetic, object-focused. |
| 🟥 TRAP | *(no attr)* | `#BE3E9B` | `magenta and hot pink, deep purple shadow, cold blue rim light, tense dramatic lighting` | Something is about to go wrong. |

**Rules**
- Maximum **5 hues** in any one image, plus black and white. This is the number-one
  thing keeping 200 cards looking like a set.
- The attribute hue must occupy roughly **a third of the frame** — usually the
  background — so a player can identify the attribute from colour alone at thumbnail size.
- Skin tones stay warm and simplified; never render realistic skin texture.
- Never use the *rarity* colours in the art. Rarity is carried by the frame and the
  foil in `cards.css`, not by the illustration.

---

## 4. Light, line and background

**Light.** One key light, upper-left, warm. One cool bounce fill. Exactly two shadow
tones — a mid and a dark. One hot rim highlight to pop the subject off the background.
No soft ambient occlusion, no volumetric god-rays (except Legendary, see §6).

**Outline.** Thick, uniform-weight black ink outline on the subject, ~1.5% of image
width. Do not ask for variable-width or sketchy lines — that is where the model starts
improvising. Interior detail lines stay thinner than the outer contour so the
silhouette wins at small sizes.

**Background.** This is where most card art dies. The rule:

> **One flat colour field + at most one simple silhouette shape + a soft vignette.**

Good: a flat orange sky with a black church-dome silhouette. Bad: a fully rendered
village square with fourteen people in it. The background exists to (a) state the
attribute colour and (b) push the subject forward. Anything more competes with the
subject and turns to noise at 96px. Add a gentle darkened vignette so the art window's
inner shadow in `cards.css` has something to sit against.

**Texture.** Subtle paper grain only, applied as an overall look. No canvas weave, no
heavy halftone, no chromatic aberration.

---

## 5. Composition rules

The art window is **not** a fixed aspect. Measured in Chromium against `cards.css`:

| Card size | Art window | Aspect |
|---|---|---|
| `.card--sm` (grid tile) | 95.8 × 95.9 – 95.8 × 109.8 | **0.87 – 1.00** |
| `.card--md` (hand) | 157.7 × 111.7 – 157.7 × 119.1 | **1.32 – 1.41** |
| `.card--lg` (full view) | 276 × 198 – 276 × 211 | **1.31 – 1.39** |

The window is taller when the joke text is short (`.card__art` is `flex:1`), and the
image is drawn with `object-fit: cover`. So one square image gets **centre-cropped
differently in three places**.

### → Generate square, protect the centre.

We generate and ship **1:1**. Doing the maths on `cover`:
- worst landscape window (1.412) crops a square down to the middle **70.8 %** of its height
- worst portrait window (0.872) crops it to the middle **87.2 %** of its width

**SAFE ZONE = central 70 % of height × 85 % of width.**
Everything that matters — face, hands, the object the joke is about — lives inside it.
Outside that band is disposable padding: background, hat brims, the bottom of a robe.

| Rule | Detail |
|---|---|
| **Subject count** | Exactly **one** clear subject. Two subjects only where the joke *is* the pair (e.g. a couple arguing) — then keep them shoulder to shoulder, both inside the safe zone. |
| **Framing** | Monsters: **chest-up three-quarter portrait** by default (biggest face = best at 96px). Full figure only for vehicles, animals and architecture. Spells/Traps: **single hero object, centred, floating**, slight low angle. |
| **Placement** | Subject centred horizontally. Eyeline / focal point at **45 % from the top**. |
| **Headroom** | Leave ~12 % clear above the head and ~15 % below the chin inside the square. This is the padding the crop eats. |
| **Scale** | Subject fills **55–70 %** of the square's height. Smaller reads as empty; larger gets its head cropped by the landscape window. |
| **Camera** | Eye level or very slightly low. No extreme wide-angle, no dutch tilt, no fisheye. |
| **NO TEXT** | Absolutely no lettering, signage, numbers, speech bubbles, logos, watermarks or signatures anywhere in the image. The card name and the joke are typeset by `cards.css`. Text is the #1 rejection reason. |
| **No frame** | Do not generate a border, card frame, vignette ring or ornamental edge — `cards.css` supplies the frame and would double it. |

**Faces.** Caricatured, warm, expressive, big features. Never a recognisable real
person. Never a public figure — for `belt` (CITY) cards about politicians, render a
generic pompous suited figure, never a likeness.

---

## 6. Rarity must be visible in the art

Frame foil already differentiates rarity in `cards.css`. The **art** reinforces it, so a
Legendary looks expensive even as a 96px tile. This is appended per card by
`make_prompts.js` from `card.r`.

| Rarity | id | Art direction fragment | Feel |
|---|---|---|---|
| **Common** | `komuni` | `simple flat background, plain even lighting, everyday casual pose, no effects` | A joke, plainly told. Deliberately quiet. |
| **Rare** | `rari` | `slightly dramatic lighting, one accent glow, subtle motion lines, confident dynamic pose` | A bit more attitude. |
| **Epic** | `epiku` | `dramatic rim lighting, glowing energy accents, dynamic low angle hero pose, swirling debris and sparks, strong shadow contrast` | Something is clearly happening. |
| **Legendary** | `leggendarju` | `epic dramatic hero shot, powerful low angle, brilliant golden god rays from behind, glowing aura, flying embers and swirling debris, deep dark background, intense cinematic contrast, awe inspiring presence` | Stop scrolling. This card is a problem. |

**The escalation is: light, angle, and air.**
Common = flat light, eye level, empty air. Legendary = backlight and god rays, low
heroic angle, air full of embers and debris. Colour palette does **not** escalate —
a Legendary FESTA card is still red-and-indigo, just far more dramatically lit.
That keeps rarity and attribute readable as two independent signals.

The 6 current Legendaries (`kunjata`, `ministru`, `nannaslip`, `zija`, `sirena`, `vat`)
are the set's poster children. If GPU time is tight, these get the extra variants.

---

## 7. Negative prompt (locked, applied to every image)

```
text, letters, words, writing, typography, caption, subtitle, signage, numbers,
watermark, signature, artist name, logo, brand, speech bubble, meme text,
border, frame, card frame, ornate border, picture frame, vignette ring, ui, hud,
photorealistic, photograph, photo, realistic skin texture, hyperrealism, 3d render,
octane render, cgi, dslr, film still,
anime, manga, chibi, waifu, sketch, unfinished lineart, rough draft, doodle,
soft gradient shading, airbrush, blurry, out of focus, depth of field, bokeh,
low contrast, washed out, muddy colours, oversaturated neon,
extra limbs, extra fingers, extra arms, extra heads, missing limbs, fused fingers,
deformed hands, malformed, mutated, disfigured, bad anatomy, long neck, cross eyed,
cropped head, out of frame, cut off,
nsfw, nude, nudity, naked, topless, lingerie, underwear, cleavage, suggestive,
sexual, erotic, fetish,
gore, blood, wound, injury, corpse, death, violence, weapon pointed at viewer,
horror, scary, creepy, disturbing,
real person, celebrity, politician likeness, portrait of a real individual,
cluttered background, busy background, crowd, many people, collage, multiple panels,
tiling, seamless pattern, duplicate subject, mirrored
```

Kept as one flat list on purpose — SDXL negatives are order-insensitive and a single
locked string is one less thing to get out of sync between runs.

---

## 8. What "good" looks like — the accept/reject checklist

Run this on the first 5 images off the pod (see runbook §6). Any **two** fails = stop
and fix the style block before burning the hour.

- [ ] Squint / shrink to 96px — can you still tell what it is?
- [ ] Is the outline thick, black and uniform?
- [ ] Two shadow tones, no soft gradients inside shapes?
- [ ] Five hues or fewer, and is the attribute hue obviously present?
- [ ] Is there exactly one subject, centred, inside the 70 % × 85 % safe zone?
- [ ] Any text, numbers, signature or border anywhere? → automatic reject
- [ ] Hands: are there five-ish fingers, or a hidden/simplified hand? (mitten hands are
      *fine* and on-style — melted claws are not)
- [ ] Does a Legendary obviously look more dramatic than a Common of the same attribute?
- [ ] Would you put this in front of a client without apologising for it?

---

## 9. Non-negotiables (the short version to remember at 2am)

1. **One style block, one negative, one checkpoint, one sampler.** Never mid-batch.
2. **Bold outline + flat cel shade.** It exists so the 96px tile works.
3. **Max 5 hues, attribute colour must be visible.**
4. **One subject, centred, in the middle 70 % × 85 %.**
5. **No text, no border, no real people.**
6. **Rarity = light and drama, never colour.**
7. **Subject description ≤ 20 words**, or the style block loses.
