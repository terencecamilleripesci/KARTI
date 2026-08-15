# RUNPOD — PARTY GAMES ART RUN

Everything to generate for the party-games section, ready to paste and run.
Read `docs/RUNPOD_RUNBOOK.md` first — pod spec, connection, and the batch script
are all there and unchanged. This file is only *what* to generate.

---

## ⚠️ READ THIS BEFORE WRITING ANY PROMPT

Three rules, each one already paid for in wasted GPU time on this project:

**1. Never ask a model for text.** No names, no letters, no numbers, no
wordmarks. Image models render lettering as convincing garbage — you get
something that *looks* like writing until you read it. Every "logo" below is an
**emblem only**; the game's name is set as real text in CSS beside or under it.
This is exactly how the KARTI emblem works today (`art/ui/emblem.png` + a CSS
wordmark), and it is the only approach that survives contact with a phone.

**2. CLIP truncates at 77 tokens and silently bins the rest.** The first KARTI
run came back as oil paintings and photographs because the entire style block
sat past the cutoff. Style leads every prompt; `fitPrompt()` in
`scripts/make_prompts.js` enforces the budget. The negative prompt has the same
limit — a ban sitting past token 77 is not a ban.

**3. Generate the art window, never a finished object.** No card frames, no
board tiles with labels, no packaging. Frames, borders, prices and names are
drawn in HTML on top so a card can be renamed or rebalanced without
regenerating a single image.

---

## 1. LOGOS / EMBLEMS — 5 images

Square, `1024x1024`, alpha-keyed (generate on flat black, `alpha:true`).
Shipped at `art/ui/logo-<id>.png`. Wordmark is CSS text, never generated.

| id | game | subject |
|---|---|---|
| `logo-party` | Party Games (hub) | a battered Maltese bar table seen from above with a deck of cards, two dice and a bottle cap arranged on it, warm overhead light, thick black outline |
| `logo-chess` | Chess | a single carved limestone chess knight in three-quarter view, chipped and old, a Maltese cross faintly cut into its base, dramatic side light |
| `logo-dama` | Dama | three stacked draughts pieces in olive green and terracotta, the top one crowned, seen at a low angle on a worn wooden board |
| `logo-skarta` | SKARTA | a fan of four bold blank playing cards thrown down hard, one landing face-up, motion lines and a small dust puff |
| `logo-kiri` | IL-KIRI | a small honey-limestone Maltese townhouse with an enclosed wooden balcony, a "for rent" sign post with a BLANK face, a crane looming behind |

Style suffix for all five — same look as the card art:

```
funny colourful cartoon comic illustration, thick black outline, flat bright
colours, cel shaded, centred, generous empty margin, isolated on pure flat black
background
```

Negative: `photorealistic, photograph, 3d render, oil painting, text, letters,
numbers, watermark, signature, logo, blurry, cluttered, nsfw`

---

## 2. PER-GAME ASSETS

Each game's own brief lists its images. Generate these together in one batch so
the whole section shares a look:

| file | game | status |
|---|---|---|
| `docs/SKARTA_ART.md` | SKARTA | written by the SKARTA build |
| `docs/KIRI_ART.md` | IL-KIRI | written by the IL-KIRI build |
| — | Chess | needs **nothing** — pieces are hand-drawn SVG on purpose, because some phones render the unicode chess glyphs as emoji |
| — | Dama | needs **nothing** — pieces are CSS discs |

Chess and dama are deliberately art-free. Do not generate pieces for them; SVG
is sharper at every size and weighs nothing.

---

## 3. RUNNING IT

1. `node scripts/make_prompts.js` — regenerates `art/prompts.jsonl` including
   anything the game briefs added.
2. Follow `docs/RUNPOD_RUNBOOK.md` §1–§3 to rent and connect.
3. **Smoke-test 5 images and LOOK at them before the full run.** This has caught
   a wrong art style, a wrong subject and a wrong framing on this project — each
   time in under a minute, each time saving the whole batch.
4. Full run, pull the images back, `scripts/postprocess.py`, commit.
5. **Terminate the pod** — not Stop. Stop still bills for storage.

**Transfer note:** the RunPod SSH proxy needs `-tt`, ignores remote commands
(feed them on stdin), and **scp does not work**. Move files as gzip+base64
through the shell in chunks, verified with sha256 — `docs/RUNPOD_RUNBOOK.md` §7
has the exact commands. Do **not** put a GitHub token on the pod to push from
there; pull the art down and push from the Pi.

---

## 4. ROUGH COST

Card art was 245 images in ~20 minutes for about $0.25 on an RTX 4090/5090.
The party set is far smaller — the 5 emblems plus whatever the two game briefs
ask for, realistically well under 100 images, so **under 10 minutes of GPU**.
The bottleneck is deciding what to draw, not drawing it.
