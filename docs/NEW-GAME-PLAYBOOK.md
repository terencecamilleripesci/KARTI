# Building a new KARTI game — the playbook

Read this, `../CLAUDE.md`, `MAP.md` and `AGENT-LOG.md` before writing a line.
It exists so you spend tokens on the game, not on rediscovering how KARTI
works or on a mistake someone already paid for.

## What a game is made of
- `js/<id>.js` — the **pure engine**: rules only. No DOM, no clock, no
  `Math.random`/`Date.now`/float-trig in anything that affects state. Exports
  `window.KARTI_<ID>.engine`. Deterministic: same inputs → same state on every
  phone. Unit-test it headlessly with `node`, no browser.
- `js/<id>-ui.js` — the **screen, runner, online controller, lobby contract,
  shelf tile**. Mirrors `js/sqaq-ui.js` / `js/aqleb-ui.js` exactly.

## The contracts you must satisfy (copy sqaq-ui.js)
1. **Shelf tile** — `P.register(TILE)` with `{id, order, kind, name, mt, icon,
   status:'live', tag, open, seats, ...}`.
2. **Lobby contract** — `R.lobby = {id, name, mt, minSeats, maxSeats, levels,
   canStart, rulesHTML, blurb, start, myName, wire:{fields:E.WIRE_FIELDS},
   takeback}`. `js/mp.js` reads this.
3. **Online controller** — `P.online.<id> = {start, remote, note, stop, live,
   hooks}`. `hooks.onMove` MUST adapt mp.js's `(move, info)` shape (see below).
4. **Winner screen** — end into `window.KARTI_REBBIEH.show({title, rows, ...})`.
   Rows carry `av`/`pv` from the relay roster so **photos show for everyone**.

## The four ways online games die — all seen for real
1. **Undeclared wire field.** A field the game's published `WIRE_FIELDS` list
   does not know STOPS THE TABLE. **Append to the list, never insert.**
2. **Wire codec carries NUMBERS ONLY.** `mp.js`'s `toWire()` sends the action
   as `t`/`a`; every *other* field must be an integer 0..255. A string field
   (e.g. `o:'h'`) is refused and stops the table. **Encode before it leaves the
   game** — pack orientation/letters/flags as small ints. (Cost SQAQ a debug
   round; it's in AGENT-LOG.)
3. **The screen never shows.** `onlineStart()` MUST call `P.show()`, or guests
   sit on the ready roster while the game runs invisibly. **Invisible to any
   host-only test.** Always assert on the NON-HOST that the board is VISIBLE.
4. **`onMove` adapter shape.** mp.js hands `(move, info)`. Adapt:
   ```js
   onMove(fn){ const f = ev => { if (ev) fn(ev.move, {seat:ev.seat, src:ev.src}); };
     moveSubs.push(f); return () => { const i=moveSubs.indexOf(f); if(i>=0) moveSubs.splice(i,1); }; }
   ```
   And fire the ENCODED move to subscribers, not the raw one.

## Money — pays as a SIDE EFFECT, traps that pay twice or not at all
- `js/progress.js` pays through the `KARTI_PARTY.ui.result` call. Moving a game
  off it silently stops paying; calling `awardPlay` AND `record` pays twice.
- Pay **exactly once** with `KARTI_XP.awardPlay({game, won, draw, id, ranked})`
  under a **stable match id**. Ladder via `KARTI_STATS.record(game, {result, id})`
  under the SAME id (progress.js refuses the second payment, profile still counts).
- Staked tables: `KARTI_MP.stakeSettle(tone)`, or `stakeSettleTeam` when a SIDE
  wins. Never reuse the result card as a dialogue — build a sheet
  (`KARTI_MP.askLeave`).

## Cosmetics rule
A cosmetic only its owner can see is a bug. Where a cosmetic meets a game rule
(a functional marker, a reticle, seat colour), **the rule wins** — keep it
readable on any skin (e.g. an `outline` a skin can't override).

## Sound & eye candy (this is an AAA game)
- Sounds ONLY through existing `KARTI_SFX` ids — grep `js/sfx.js` for the
  registry; `S.play(id,{rate})` pitches, `S.note(step)` walks a pentatonic.
  **`audio/` is untouchable — never add a file.**
- Every effect respects `prefers-reduced-motion` (there's a `reduced()`
  convention). Compositor-cheap only (transform/opacity), no filters in
  animation loops — this runs on mid phones. Render-first: state is truth on
  screen before any animation clone flies, so an interrupt snap-forwards.
- The SAME theatre must play for OTHER players' moves online, not just yours.

## Testing — not optional
- `node --check` every JS file. `python3 server/karti_server.py --selftest`
  (279 checks) must still pass for anything server-side.
- puppeteer-core + `/usr/bin/chromium` live in the session scratchpad —
  harnesses go THERE, never in the repo. Viewport
  `{width:390,height:844,deviceScaleFactor:2,isMobile:true}`; also 360×640.
  Abort `sw.js`, remove `#kl-splash`, entry `[data-act="guest"]`.
- **Render and READ your screenshots.** A DOM assertion has passed here while
  every phone showed the wrong screen.
- Test ONLINE with TWO clients, assert on the NON-HOST, at 2 and at max seats.
- **Never loosen an assertion to make a test pass** (broke onboarding for two
  builds — AGENT-LOG).
- If you run a test relay it MUST pass ALL of `--accounts --avatars --stats` on
  throwaway files and a port that is NOT 8101 (omitting `--avatars` once
  destroyed every real player's photo). Close every browser in a `finally`.

## Never (agents)
`audio/` · `server/*` · `git add/commit/push` · bumping `KARTI_BUILD` or the sw
cache. The coordinator wires `mp.js`/`index.html`/the relay, commits and deploys.
If you run out of road, STOP and say which parts are done and tested. A partial
honest answer beats a confident wrong one — two agents reported work a grep
disproved.
