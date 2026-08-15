# SKARTA — ART BRIEF
**Eleven images. One small run on the same pod, the same checkpoint, the same style.**

Consumed by `scripts/make_skarta_prompts.js` → `art/skarta-prompts.jsonl`.
Style source of truth is still **`docs/ART_STYLE_BIBLE.md`** — this document does not
invent a look, it applies the existing one to a second game.

> ### Before anything else
> **The game already ships without any of this.** Every card, every suit mark and the
> back are drawn in CSS and SVG in `js/skarta-ui.js`. Nothing below is on the critical
> path. This is a skin, and it is designed to be dropped in on a day the GPU is already
> rented for something else.

---

## ⛔ RULE ZERO, AGAIN — WE GENERATE THE ART WINDOW ONLY. NEVER A WHOLE CARD.

No card frame, no border, no numeral, no card name, no suit letter, **no text of any
kind**. `js/skarta-ui.js` draws the card in HTML around the art, exactly the way
`css/cards.css` does for the duel game, and for exactly the same reason:

> **so we can tweak or nerf easy.**

In SKARTA that is not theoretical. The Kaxxa Infernali currently reads **4 / 7**. If the
+7 turns out to be too strong and becomes a +6, that is one character in `js/skarta.js`
— *unless* somebody baked a **7** into a JPEG, in which case it is another pod rental.
Same for the **+2** on the Kunjata, every numeral 0–9, the word **SKARTA** on the back,
and the four suit names.

**Any generated image with a number, a letter or a frame in it is an automatic reject.**

Enforced in three places, none of which trust the other two:

1. **positively** — the framing clause in every prompt
2. **negatively** — `text, letters, numbers, watermark, signature, logo` in the shared
   negative, which `scripts/make_skarta_prompts.js` copies **verbatim** from
   `art/prompts.jsonl` and *fails the build* if the two ever drift apart
3. **mechanically** — `scripts/postprocess.py` only crops, resizes and compresses

---

## 1. What the game needs, and why it is only eleven files

A 108-card deck. The naïve manifest is 108 images. This one is **11**, because the
game's markup was built to make that possible:

| Instead of | We generate | Because |
|---|---|---|
| 40 number cards × art | **4 suit windows** | the numeral is CSS on top, so all 25 FESTA cards share one painted window |
| 12 suit-coloured action cards | **5 cut-out subjects** | the subject is an alpha PNG dropped on a card that is *already* the right colour |
| a suit symbol per card | **nothing at all** | the marks are SVG — see §2b |

Eleven images is roughly **four minutes** on the 4090 the runbook already specifies.
If the pod is up for the card game anyway, this is a rounding error on the bill.

There is also a **merge-ready copy** of this manifest at **`art/party-skarta.json`**,
in the flat shape the party-games prompt pipeline takes (`subject` is the visual
description only — the pipeline prepends the house style and appends the black
background itself).

---

## 2. The manifest

Regenerate any time with `node scripts/make_skarta_prompts.js`. The prompts themselves,
in full, with their seeds, are in **`art/skarta-prompts.txt`** — skim that before you
rent anything.

### Family A — card-shaped windows · `832 × 1216` → `590 × 860` jpg

| id | file | what it is |
|---|---|---|
| `sk-back` | `art/skarta/back.jpg` | the card back — **sentinel 1** |
| `sk-face-festa` | `art/skarta/face-festa.jpg` | window behind every FESTA number — **sentinel 2** |
| `sk-face-bahar` | `art/skarta/face-bahar.jpg` | window behind every BAĦAR number |
| `sk-face-razzett` | `art/skarta/face-razzett.jpg` | window behind every RAŻŻETT number |
| `sk-face-bajtra` | `art/skarta/face-bajtra.jpg` | window behind every BAJTRA number |

**The four faces must have an empty middle third.** A numeral sits there at 52 % of the
card width. That is a hard framing requirement, not a preference — it is in the
*required* half of the prompt and cannot be dropped by the token fitter. The **back** is
the exception and asks for the opposite: dense pattern, edge to edge.

### Family B — cut-out subjects on flat black · `1024 × 1024` → `512 × 512` png, alpha

| id | file | the card, and the joke |
|---|---|---|
| `sk-act-skip` | `act-skip.png` | **Erġa' Ejja Għada** — the clerk slams the shutter on your form |
| `sk-act-reverse` | `act-reverse.png` | **Dawra ta' Marsa** — two cars into the same U-turn |
| `sk-act-draw2` | `act-draw2.png` | **Il-Kunjata** — she brought two bags you did not ask for |
| `sk-act-kazin` | `act-kazin.png` | **Il-Każin** — four club scarves over one bar |
| `sk-act-kaxxa` | `act-kaxxa.png` | **Il-Kaxxa Infernali** — the crate going off, and a man running |

This is where the game's comedy actually lives, so these five are the ones worth a
second take if a take is disappointing. The **+2** on the Kunjata and the **4 / 7** on
the Kaxxa are CSS text drawn over the top of the picture. Never generated. If the +7 is
ever rebalanced to a +6 that must be one character of JavaScript.

### 2b. What this pack deliberately does NOT generate

**The four suit marks.** They are SVG in `js/skarta-ui.js` and they are staying that way.
The size that decides the game is **13 px in a card corner** — a player matches by suit
forty times a round at that size — and a 512 px raster scaled down to 13 is worse there
and no better in the picker at 24. Chess and dama generate nothing at all for the same
reason (`docs/RUNPOD_PARTY.md` §2), and filler makes a pack harder to judge as well as
slower to make.

**The hub tile emblem.** `art/ui/logo-skarta.png` is real and is 404ing today, but it
belongs to `docs/RUNPOD_PARTY.md` §1, which lists it beside the other four tile emblems
so the whole shelf is generated in one consistent batch. Two prompts for one filename is
how you end up with a shelf where one tile does not match the rest.

### Family C — the felt · `1216 × 832` → `1200 × 820` jpg

| id | file | what it is |
|---|---|---|
| `sk-table` | `art/skarta/table.jpg` | worn green baize seen from above |

The draw pile and the discard pile sit dead centre and the chain badge sits along the
top, so the middle stays plain.

---

## 3. The 77-token wall

CLIP reads 77 tokens and **silently discards the rest**. It does not warn you; it just
returns something that ignored half of what you asked for. On the first KARTI smoke test
the full style block ran past token 77 and the pod came back with oil paintings.

So in `scripts/make_skarta_prompts.js`:

- **the style leads** — it is the one thing that must survive, so it goes first
- every prompt is assembled by `fitPrompt()` against a budget of **74**
- framing is split into **`must`** (in the required list, never dropped) and **`nice`**
  (in the optional tail, first to go)

That split exists because the first cut of this file put *all* the framing in the tail
and every prompt over sixty tokens silently lost it. On a JPEG that costs a little
composition. **On an alpha PNG it costs the whole asset**, because
`scripts/postprocess.py` keys the cut-out from a pure black background — so
`isolated on pure flat black background` is not a stylistic wish, it is the thing that
makes the file work.

`node scripts/make_skarta_prompts.js --check` therefore refuses to pass unless:

```
over the 77-token wall       : 0   OK
subjects asking for lettering: 0   OK
alpha cut-outs               : 5   black-background clause intact on all
required framing survived    : all
```

Run it and read those four lines. It is a two-second check and it is the whole reason
this pack cannot repeat a mistake that has already been paid for once.

---

## 4. Running it

Everything is the runbook you already have — `docs/RUNPOD_RUNBOOK.md`, §1 through §8 —
with one flag changed. Both scripts take `--prompts`.

**On the Pi, before you rent anything:**

```bash
cd /home/foxhound/webclients/karti-malta
node scripts/make_skarta_prompts.js --check   # read the four lines above
node scripts/make_skarta_prompts.js           # writes the .jsonl and the .txt
less art/skarta-prompts.txt                   # and actually skim it
```

**On the pod**, after the install in runbook §3:

```bash
scp -P <port> art/skarta-prompts.jsonl root@<pod-host>:/workspace/karti/art/

# on the pod
python3 scripts/runpod_batch.py --prompts art/skarta-prompts.jsonl --limit 4
```

Pull those four back and look at them **before** the other seven. Then:

```bash
python3 scripts/runpod_batch.py --prompts art/skarta-prompts.jsonl
```

**Back on the Pi:**

```bash
scp -P <port> 'root@<pod-host>:/workspace/karti/art/raw/sk-*.png' art/raw/
python3 scripts/postprocess.py --prompts art/skarta-prompts.jsonl
```

The raw files are all prefixed `sk-`, so they cannot collide with the 200 card images
in the same folder — which is also what makes that one `scp` glob safe.

**Do not change the checkpoint.** `RunDiffusion/Juggernaut-XL-v9`, the same one the card
art was made with. A different checkpoint here means the party hub has two games in two
different styles sitting next to each other on the same shelf.

---

## 5. The verdict — what to reject

The generic checks from `ART_STYLE_BIBLE.md` §8 all still apply. These three are the ones
specific to this pack:

| Look at | Reject if |
|---|---|
| **the four faces, with a big numeral over the middle** | the middle third has anything in it the numeral has to fight |
| **the five cut-outs, at 100 % zoom on the alpha** | a rectangle of scenery survived the key — that means the black background clause did not land |
| **anywhere at all** | a number, a letter, a border or a card frame |

There is a fast way to do the second one: open the finished PNG over a bright background.
Any grey box around the subject is a fail.

---

## 6. How the art actually reaches the screen

There is no build step and no code change. `js/skarta-ui.js` probes **two** sentinel
files on open:

```
art/skarta/back.jpg
art/skarta/face-festa.jpg
```

Both must decode — a real `load` event, not a guess. Only then does `.sk-art` go onto
the wrapper, and only then do the CSS rules that reference `art/skarta/*` apply. Until
then the finished CSS card underneath is all there is, and it is meant to be looked at
rather than apologised for. Two sentinels rather than one
because a half-uploaded folder that half-skins the game looks broken in a way that is
genuinely hard to diagnose on a phone.

Every one of those rules **layers** the generated image over the CSS look rather than
replacing it:

```css
background-image: url("art/skarta/table.jpg"),
                  radial-gradient(120% 90% at 50% 30%, #20323A, #0B1216);
```

So a single missing file falls back to the placeholder underneath it instead of to a
blank rectangle, and a broken-image glyph can never appear. That is deliberate, and it
is why you can ship six of the eleven and come back for the rest.

The one thing the art **replaces** is the line glyph in the middle of an action card —
the painted subject stands in for it. The CSS caption, the **+2** and the **4 / 7** stay
exactly where they were, drawn as text over the top of the picture, in every case.

---

## 7. What must never be generated for this game

- the word **SKARTA**, on the back, the logo, or anywhere else
- **AĦĦAR WAĦDA**, **QABADTEK**, **IL-KATINA**, **IL-LIMITU**, or any card name
- the numerals **0–9**, the **+2**, or the **4** and **7** of the Kaxxa
- a card frame, a border, a rounded rectangle around the art, or a nameplate
- a fifth suit — there are four and the engine will never know about a fifth
- a suit mark of any kind — see §2b, those are SVG on purpose
- anything resembling the colour-block-and-white-oval face of the game this one is
  deliberately not. The card face in `js/skarta-ui.js` is a **tilted Maltese tile
  panel** with the suit mark in two corners. Keep it that way. The mechanics of a
  shedding game are nobody's property; a card design is.
