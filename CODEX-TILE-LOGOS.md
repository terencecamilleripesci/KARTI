# Codex brief — eleven shelf tile logos for KARTI

Eleven of the thirty-nine party-game tiles have no emblem. Ten are the games
added in builds 414–423; the eleventh is MIMIKA, which never had one. This
brief is everything needed to draw them so they sit beside the existing
twenty-seven without looking like a different box.

**Images only.** No code, no config, no edits to anything in `js/`. Drop the
PNGs in and stop.

---

## The hard requirements

| | |
|---|---|
| **Size** | **512 × 512** PNG. (A few old ones are 256; 512 is the standard now.) |
| **Background** | **Transparent.** Measured across the existing set: 24–63% of pixels are fully transparent. `logo-bomba.png` has an opaque backdrop — it is the odd one out, do not copy it. |
| **Filename** | `logo-<id>.png`, lowercase, exactly the id in the table below. |
| **Where** | `art/ui/` |
| **Weight** | Existing ones are 15–75 kB. Stay under ~90 kB. |

## The one thing that decides whether these work

**They are displayed at 34 × 34 CSS pixels.** Not 512. The 512 is only so the
art survives a high-DPI screen — on a phone this is a 34px disc next to two
lines of text.

So the test for every one of these is: **shrink it to 34px and can you still
tell what it is?** That rules out scenes, crowds, small text, thin lines and
fine detail, and it rules in **one bold object, one silhouette, high contrast**.
Look at `logo-bomba.png` — a black sphere, a lit fuse, a spark. Three shapes.
That is the right level of complexity. `logo-kelma.png` is about the maximum:
five letter tiles, and it only works because they are chunky and overlapping.

## The style, from the existing set

Look at these three before starting — they are the reference, not this prose:

- `art/ui/logo-kelma.png` — Scrabble tiles, warm wood, gold sparkles
- `art/ui/logo-bomba.png` — the bomb, on a blue disc
- `art/ui/logo-serp.png` — the snake curled round an apple, on a purple disc

The shared language:
- **Bold cartoon illustration.** Thick dark outline, saturated colour, glossy
  highlights. Mobile-game emblem, not flat vector and not photoreal.
- **Chunky, rounded forms.** Nothing spindly.
- **Lit from above** — a bright rim on the top of every form, shadow beneath.
- Many sit on a **coloured disc** with a soft white sticker edge. Optional, but
  it helps a busy subject read at 34px. Use it where the subject is complex.
- **No text in the image.** The tile prints the game's name underneath already,
  in two languages. Letters as *objects* (Kelma's tiles) are fine; a title is
  not.

## The eleven

Maltese names — these are Maltese games. Keep the subject literal and simple.

| id | game | what it is | the emblem |
|---|---|---|---|
| `kwizz` | IL-KWIŻŻ | trivia on the buzzer | A big red buzzer being palmed, with a gold question mark bursting off it. |
| `lewwel` | L-EWWEL | reaction duel — first to tap when it turns green | A traffic light gone green with two hands lunging at it, motion lines. |
| `oghla` | OGĦLA JEW INQAS | higher or lower on a card | Two playing cards, one face up, with a big gold up-arrow and down-arrow crossing behind them. |
| `tpingija` | TPINĠIJA | draw it, they guess it | A fat pencil drawing a looping line that becomes a question mark. |
| `falz` | L-ARTIST FALZ | everyone draws one stroke, one is faking | A paintbrush wearing a small black domino mask; one bristle-stroke of paint below. |
| `minlaktar` | MIN L-AKTAR? | "who is most likely to…" | Three speech bubbles overlapping, the front one holding a pointing finger. |
| `katina` | KATINA | word chain, each word starts with the last letter | Three chunky chain links, the middle one made of a wooden letter tile. |
| `pari` | PARI | memory pairs | Two face-down cards, one flipping to show a gold star; a soft glow between them. |
| `emoji` | EMOJI | guess the film/song/qawl from emoji | Three classic emoji faces stacked in a fan — grin, wink, shock — with a magnifying glass over the front one. |
| `ritmu` | RITMU | tap the beat, it speeds up | A hand-drum with two gold sound-rings pulsing off it and a single music note. |
| `mimika` | MIMIKA | charades | A mime's white-gloved hands pressed flat against invisible glass. |

## When they are in

Drop them in `art/ui/` and that is the whole job — nothing needs wiring.
`js/party.js` probes `art/ui/logo-<id>.png` per tile and swaps the art in the
moment it loads; a game with no file falls back to a struck-gold medallion
(build 426), which is what all eleven are wearing now.

To check your work: serve the folder and open the Party Games shelf on a
**390 × 844** phone viewport. The new emblems should be indistinguishable in
weight and finish from CHESS, IL-BOMBA and SERP sitting next to them. If one
looks muddier or busier than its neighbours at that size, it is too detailed —
take something out of it.
