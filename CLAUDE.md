# KARTI — what you must know before you change anything

An 18+ Maltese party-game PWA. **Live, with real players on it.** Served from
GitHub Pages; a relay runs on the Pi at **port 8101**.

Read this before writing code. Everything here was learned by breaking
something, and it is here so you do not have to break it again.

**Two more files, read on demand — not loaded into your context until you
open them, so opening them is cheap and searching blind is not:**
- **`docs/MAP.md`** — where everything lives. Read it BEFORE you go looking
  for anything. It turns a long hunt into a lookup.
- **`docs/AGENT-LOG.md`** — mistakes already made here, and what they
  actually turned out to be. Read it before you start; **append to it when
  something costs you time.** That is how the next agent avoids your hour.

## Never
- **`audio/`** — never touch, for any reason.
- **`server/karti_server.py`** — the LIVE relay. Never restart, redeploy or
  edit it unless you were explicitly told to. Connecting as an ordinary
  client is fine and expected.
- **`git commit` / `add` / `push`** — the coordinator commits. Not you.
- **Bumping `KARTI_BUILD` or the SW cache** — coordinator only.
- **Claiming a result you did not produce.** Two agents this week reported
  work that a `grep` showed had not happened. If you run out of road, say
  which parts you did and which you did not. A partial honest answer is
  worth more than a confident wrong one.

## The four ways online games die (all seen for real)
1. **Undeclared wire field.** Send a field the game's own published contract
   does not know and the whole table stops: *"this build does not know how to
   put undefined on the wire."* Killed ballun and tankijiet. **Append to the
   field list, never insert**, so an older build decodes and ignores the
   extra. Safest of all: ride an already-declared field as a new action
   (`js/bomba-ui.js`, `js/briks-ui.js`).
2. **onMove adapter shape.** mp.js hands `(move, info)`; a game that pushes
   its callback raw gets the event object instead and dies on the first move.
   `js/aqleb-ui.js` has the correct three-line adapter.
3. **The screen never shows.** `onlineStart()` builds the board but never
   calls `P.show()`, so guests sit on the ready roster while the game runs
   invisibly. **Asymmetric — invisible to any host-only or single-client
   test.** Always assert on the NON-HOST, and assert it is *visible*, not
   merely in the DOM.
4. **Relay message budget.** The per-room bucket is ~40/s sustained. One
   message per tick per phone is fine at 2 seats and drains the bucket at 3+;
   dropped bytes starve a lockstep for ever. Ship on CHANGE with a keepalive
   and a per-seat watermark (`js/tankijiet-ui.js`, `js/bomba-ui.js`).

## Money — the traps that pay twice, or not at all
- **`js/progress.js` pays as a SIDE EFFECT of the `KARTI_PARTY.ui.result`
  call.** So: moving a game off that call silently stops paying it, and
  calling both `awardPlay` and `record` pays twice. Neither shows an error.
- Use `KARTI_XP.awardPlay({game, won, draw, id, ms, ranked})` with a stable
  match `id`, exactly once. Want the shelf W/L badge without paying?
  `KARTI_PARTY.tally()`.
- **Never reuse the result card as a dialogue** — the wrapper would pay the
  player for reading a question. Build a sheet (`KARTI_MP.askLeave`).
- Staked tables: `KARTI_MP.stakeSettle(tone)`, or `stakeSettleTeam` when a
  SIDE wins — paying each of six winners a full pot mints currency.
- Prove money with numbers: count `counted` awards via `KARTI_XP.onAward`,
  and measure the wallet before and after.

## Cosmetics
**A cosmetic only its owner can see is a bug.** If the thing IS a player —
their snake, tank, paddle, tokens, fleet — other phones must see it, which
means the id has to travel. Shared furniture (arena, floor, board) may stay a
local choice; say which you chose and why. A CSS class on `<body>` is
page-global and can never differ per player — that is the usual cause.
**Where a cosmetic meets a game rule, the rule wins** (seat colours, team
paint) — no skin may cost the table its sides. Validate any id off the wire
before it reaches a selector or URL; it comes from another client.

## Testing
- puppeteer-core + `/usr/bin/chromium` live in the session scratchpad; put
  harnesses **there, never in the repo**.
- Real phone viewport: `{width:390,height:844,deviceScaleFactor:2,isMobile:true}`,
  and check 360x640. Abort `sw.js`, remove `#kl-splash`, entry is
  `[data-act="guest"]`.
- **Render and READ your screenshots.** A DOM assertion does not prove a
  visual, and has already passed while every phone showed the wrong screen.
- **Close every browser in a `finally`.** A leaked headless chromium burned
  133% CPU for seven hours.
- `node --check` every JS file you touch. The relay has its own gate:
  `python3 server/karti_server.py --selftest` (279 checks, all must pass).

## Cost
Scope tight and finish: name the files, do the work, stop. Do not re-read
half the repo to answer a question the brief already answered. If the job
turns out far bigger than the brief, **say so and stop** rather than
spending an hour discovering it.
