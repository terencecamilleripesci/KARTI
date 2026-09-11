# Ten more party games — the plan

The shelf has 31. Read the whole catalogue first, because the point is to fill
gaps rather than add a thirty-second variant of something already there.

**Already covered, so NOT on this list:** cards (Skarta, Erbgħa, Gin, Poker,
Rummy, 21&31, Tombla) · board (Aqleb, Kaxxi, Il-Ħajt, Ludu, Serp, Konkwista,
Kiri) · action (Il-Bomba, Tankijiet, Il-Ballun, Tapp) · word (Kelma, Il-Kodiċi,
Il-Forka) · deduction (Min Hu?, Il-Misteru, Spy, Suspett) · mime (Mimika).

**The biggest hole is trivia.** Thirty-one games and not one quiz — it is the
single most-played party format there is, and the box does not have it.

---

## The ten

| # | name | what it is | seats | why |
|---|---|---|---|---|
| 1 | **KWIŻŻ** | trivia, buzzer, Maltese and general rounds | 2–6 | the gap. Every party box has one |
| 2 | **L-EWWEL** | reaction duel — tap first when the signal lands, false start loses | 2–6 | 30 seconds to learn, endlessly replayable |
| 3 | **OGĦLA JEW INQAS** | higher-or-lower streak on a shared deck | 2–6 | the format every phone game steals |
| 4 | **TPINĠIJA** | draw it, they guess it, timer running | 3–6 | Skribbl. Mimika is mime, this is the pen |
| 5 | **PARI** | memory pairs, but a race rather than turns | 2–4 | the oldest one, and still the loudest |
| 6 | **EMOJI** | guess the film/song/proverb from emoji only | 2–6 | pure phone-native, huge on socials |
| 7 | **MIN L-AKTAR?** | "who is most likely to…" — everyone votes, points for reading the room | 3–8 | the one that makes a room laugh |
| 8 | **KATINA** | word association chain, no repeats, clock ticking | 2–6 | trivial to learn, brutal at speed |
| 9 | **L-ARTIST FALZ** | everyone draws one stroke; one of them was never told the word | 4–8 | Fake Artist. Social deduction WITH a pen |
| 10 | **RITMU** | tap the beat, keep the beat, drop it and you are out | 2–4 | rhythm is the one genre the shelf has none of |

Maltese names are first-class here, not decoration: every existing game has one
and the shelf reads in Maltese.

## What "AA production" has to mean, per game

Not a prototype with a scoreboard. Each one ships with:

- **rules that hold up** — a real engine file, not logic smeared through the UI
- **a machine opponent with levels**, so one person alone still has a game
- **the shared frame** — same title bar, turn strip, board sizer, result screen
  as the other 31, so it feels like the same box
- **sound**, because a party game without it is a spreadsheet
- **online**, where the format allows it — and the wire contract obeyed: append
  fields, never insert, or an older build meets a field it cannot decode and
  the table stops
- **money wired once** — `KARTI_XP.awardPlay` with a stable match id, exactly
  once. Paying twice and not paying at all both look like nothing on screen
- **a shelf tile** with its own art and a tag line that says what it is

## Order, and why

**1 · KWIŻŻ** first. It is the missing format, it has the widest audience, and
it is the one Story Mode can lean on hardest — a quiz fits every character on
the road, where a rhythm game does not.

Then **2 · L-EWWEL** and **3 · OGĦLA JEW INQAS**: both are small, both are
instant to learn, and together they prove the pattern for fast rounds before
anything expensive gets built on it.

Then the pen games (**4**, **9**) as a pair — they share a canvas, a stroke
format and an undo, so building them apart would mean building that twice.

**10 · RITMU** last. Audio timing on a phone is the hardest thing on this list
to get right, and the honest risk is that it never feels tight enough to keep.
Better to find that out with nine already shipped.

## Story Mode's share of this

The road is fourteen characters, each with three games. New formats mean new
pairings that actually fit a character — a quiz for DORIS TAL-KUNSILL, who
answers everything with a form; MIN L-AKTAR? for the mother-in-law who has
already decided what you are. That is a separate pass once the games exist, and
it is cheap: `games:[first, second, decider]` per stop.
