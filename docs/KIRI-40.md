# IL-KIRI → the full 40

The board shipped as **32 spaces, 16 properties, 6 colour groups**. Real
Monopoly is **40 / 22 / 8**, and the owner's call was blunt and correct:
*"40 original otherwise they won't play."* People know this board. A board
that is nearly it reads as broken, not as a variant.

This is the spec. Prices, rents and build costs below are **Monopoly's own
numbers ×1000** — not numbers I invented. That matters: the ratios are what
make the game work, so multiplying every one of them by the same constant
changes the feel and nothing else. No rebalancing risk.

## The money

| | old | new |
|---|---|---|
| starting cash | 1,500 | **€1.5M** |
| passing GO | 200 | **€200k** |
| bail | 50 | **€50k** |
| cheapest property | 60 | **€60k** |
| dearest property | — | **€400k** |
| top hotel rent | — | **€2M** |

The owner asked for "millions, not thousands" and also "half a million to
start", which pull against each other. ×1000 resolves it: the expensive end
is genuinely in millions, the cheap end stays legible, and nothing needs
re-tuning. Format as `€1.5M` / `€200k` so a three-character box still fits
at 360px.

## The eight groups — a Maltese value ladder

Cheap to dear, which is the whole point of the colour order:

| # | group | colour | build | props | status |
|---|---|---|---|---|---|
| 1 | Marsa | `#9a6b3e` brown | €50k | 2 | existing |
| 2 | Ħamrun | `#a9d9ef` light blue | €50k | 3 | existing |
| 3 | Il-Birgu | `#d33d8a` pink | €100k | 3 | existing |
| 4 | Il-Gżira | `#e8912a` orange | €100k | 3 | **new** |
| 5 | Il-Mosta | `#d02f2f` red | €150k | 3 | **new** |
| 6 | Is-Swieqi | `#f2d43c` yellow | €150k | 3 | existing |
| 7 | Tas-Sliema | `#2f9e4f` green | €200k | 3 | existing |
| 8 | Il-Belt | `#2a5fd0` dark blue | €200k | 2 | existing |

Six of the eight already exist with their names, jokes and emoji written —
**all of that content carries over unchanged**. The work is two new groups
(six properties) plus repositioning, not a rewrite.

## The layout

Canonical Monopoly order, so a player who knows the board is never surprised:

```
0  GO          10 JAIL        20 FREE PARK   30 GO TO JAIL
1  prop        11 prop        21 prop        31 prop
2  chest       12 utility     22 chance      32 prop
3  prop        13 prop        23 prop        33 chest
4  tax         14 prop        24 prop        34 prop
5  rail        15 rail        25 rail        35 rail
6  prop        16 prop        26 prop        36 chance
7  chance      17 chest       27 prop        37 prop
8  prop        18 prop        28 utility     38 tax
9  prop        19 prop        29 prop        39 prop
```

22 properties · 4 rail · 2 utility · 3 chance · 3 chest · 2 tax · 4 corners.

## What must NOT move into a theme

The split is rules vs content, and the line is: **a theme may never change a
number.** Engine keeps indices, types, group membership, prices, rent
ladders, build costs, and every rule. A theme supplies only names, Maltese
names, group names, colours, icons and flavour text. That way a fantasy
theme cannot accidentally rebalance the game, and two players on different
themes can still agree on every outcome.

**Wire safety:** the HOST's theme id travels with the room and everybody
renders it. Themes are cosmetic, but a cosmetic that changes what a space is
CALLED would have two players describing different boards to each other —
so it travels, appended to the end of the contract, never inserted.

## Already in place — do not rebuild

Checked by loading the engine headless: **auctions, mortgages and trading all
exist** (`startAuction`, `mortgage`, `doTrade`). These are the three rules
homemade Monopoly clones usually skip. The rules foundation is good; this
job is the board's size, its content and its money — not its rulebook.
