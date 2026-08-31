# Agent log — mistakes already made, so nobody makes them twice

Append what cost you time. Newest at the top. Be blunt; this is worth more
than a tidy record.

Format: **what happened** → what it actually was → what to do instead.

---

## 2026-08-27 — MISTERU: a 7x8 grid has far less room for six rooms than it looks
Giving every case its own map. Three things cost real time:

**Rejection-sampling six non-touching rooms into 7x8 fails ~99% of the time.**
Two independent greedy packers (place a room, retry on clash) produced ZERO
valid boards in thousands of attempts, and a backtracking one took 0.7s per
case to produce nothing. The grid is much tighter than it reads: six rooms of
at least 2x2, none sharing a wall, is only 8119 packings in total, and only
about 29% of those survive validation.
→ **Enumerate the space before tuning a sampler against it.** A depth-first
walk of every packing, with each rectangle carrying two bitmasks (its cells,
and its cells plus their orthogonal ring — one AND catches overlap AND
touching), costs ~80ms once. `boardFor(caseId)` now hashes into that
catalogue. Deterministic, always valid, no search that can fail.

**Forbidding CORNER contact as well as wall contact collapses the grid to one
layout.** Inflate each room by one on two sides and the packing bound becomes
floor(9/3)*floor(8/3) = 6 — exactly six — which forces three tiers of 2-row
rooms at rows 0-1 / 3-4 / 6-7 and nothing else. Diagonal contact has to be
ALLOWED (you still cannot walk between them) or there is no variety to have.

**"Longest room-to-room walk <= 2.5x the shortest" is not achievable by any
layout on this grid, including the one already shipping.** Exhaustively, the
best ratio over all 4075 structurally valid packings is 3.50 — and the fixed
board this game has always used scores exactly 3.50 (2..7). The shortest walk
is 2 on essentially every board (out of a door, straight into the room
opposite), so the rule as written rejects everything.
→ Measured what the rule was actually protecting against instead: the MEAN
distance from each room to the other five, worst room vs best room. The fixed
board scores 1.57 there; the generator caps it at 2.0 and keeps the raw
ratio under 4.0 on top. **When a stated threshold rejects the thing you
already ship, measure the whole space and say so — do not quietly widen it.**

**A per-destination AI salt of `40 + position` was one board size away from
colliding.** POS_MAX was 25 so the range was 40..65 and salt 70 (the lvl1
"misses the secret passage" coin) was clear. Per-case boards take POS_MAX to
35, i.e. 40..75, and square 30 would have become the same coin as the passage
decision. Moved to `DEST_SALT + position` at 200. **Any salt derived from a
board coordinate has to be re-checked when the board stops being fixed.**

And the one the wire pass warned about, now closed: `posOK`/`POS_MAX` were a
load-time const and a no-arg function. They are per board now —
`posOK(board, p)`, and `encWire`/`decWire` resolve the board from the
`caseId` they already receive. 49 of the 50 cases have a POS_MAX above the
old 25, so a load-time bound would have silently refused legal destinations
on almost every case online. Proof in the session scratchpad
(`maps_prove.js`, `ms_online_maps.js`, `ms_bot_online.js`): a -2..258 sweep
through `decWire` per case in node AND in both live browsers, and a real
two-client match plus a machine chair on boards the old bound would have
frozen.

## 2026-08-26 — KELMA: delaying the hotseat handover leaked the next rack
Adding a ~1.1s play-theatre before the pass-the-phone handover sheet meant
the turn had ALREADY advanced when the post-play paint ran — so the NEXT
player's private rack was on screen for a full second before the sheet
covered it. Every DOM assertion passed; only READING the screenshot caught
tiles that belonged to the other player.
→ In any hotseat game, anything that defers the handover must also hide the
rack for that window (kelma: rackView returns [] while the time-based hold
is live). Time-based hold, not a flag — if the timer dies the hold expires
and input/rack come back by themselves (see the LUDU entry below).
Also: kelma's PREMIUM map uses '.' for a plain square — `if (premAt(r,c))`
is TRUE on every cell. Compare against '.' explicitly, or the "premium"
effect fires 225 times.

## 2026-08-26 — LUDU: a long animation gate starved the one-tap mover
Giving every seat's move a hop animation (ludu-ui theatre) made the
`sliding` flag long-lived, and the AI game froze at a HUMAN turn with one
legal move — intermittently, at a different move each run, no errors.
Two pre-existing assumptions broke, found only by dumping state at the
stall (turn/phase/timer/auto), not by reading code:
→ (1) `maybeAutoMove`'s delayed tap bailed when `sliding` was true but
left its `M._auto` stamp, so the same state never re-armed. Clear the
stamp when you swallow the shot.
→ (2) any render mid-flight (a player rolling during another's
animation) rebuilds the SVG and disconnects the flying clone; the
theatre then cancelled WITHOUT rendering — and since nothing re-ran
render, nothing ever re-armed the auto-mover. An orphaned animation must
SETTLE (cancel + render), never just cancel.
→ Rule of thumb: if an animation flag gates any deferred scheduler, the
animation's every exit path must end in the render that re-arms it.
Also found while here: the capture sound almost never fired — after a
capture that grants another roll the engine's `st.why` is
'captureagain', not 'capture', and the sound subscriber matched only the
latter. Match both (same for 'home' vs 'homeagain').

**A TEST RELAY DELETED EVERY REAL PLAYER'S PHOTOGRAPH.** Four accounts lost
their faces on 23 Aug and it read exactly like a display bug — three display
fixes were shipped for it.
→ A throwaway relay was started with `--accounts <scratch>.db` and **no
`--avatars`**, so it opened the DEFAULT `/var/lib/karti/avatars.db` — the
LIVE one — while its orphan sweeper asked a scratch accounts file whether
the real players existed. Told no, it swept all four. The two stores answer
for each other and only one of them was moved.
→ Fixed two ways in `server/`: a non-default `--accounts` now drags the
avatar store into the same directory, and `Store.prune()` refuses to delete
when EVERY row looks orphaned (>1 row) — "all of them are gone" is far more
often the wrong accounts database than a real mass deletion.
→ **When you point a test process at a scratch database, name EVERY store on
the command line.** The one you forget is the live one.

**"His photo still works, so photos work" — his own photo never touches the
relay.** A player's own face is drawn from `myPic()`, a data URL in that
phone's localStorage; everybody ELSE's comes from the relay. So a server-side
loss is invisible to every single player: each of them still sees themselves,
and nobody can report the thing they cannot see.
→ Never judge the photo feature from one phone, and never take "mine shows
up" as evidence the store is healthy. Ask the relay:
`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8101/karti/avatar/<who>`.
→ `js/progress.js` §8b-ii now self-heals: one HEAD per account per load, and
if the relay has no photo while the phone does, it quietly puts it back.

**The main SQLite file was 4 KB and looked empty — the data was all in the
WAL.** `/var/lib/karti/avatars.db` has never been checkpointed, so even the
`CREATE TABLE` lives in `avatars.db-wal`. Copying the `.db` on its own gives
a database with no tables at all, which reads as "this store was never used".
→ **Copy `-wal` and `-shm` with it, always** — and note that OPENING a copy
checkpoints and CONSUMES the WAL, so copy again before a second look. Deleted
rows are recoverable by replaying WAL frames one commit at a time.

**A summary said "nothing left hollow"; a grep said otherwise.**
Two reports this week claimed work that had not been done — briks was
reported as painted with zero cosmetic reads in the file, and serp was
described as "painted but only for you" when it painted nothing for anybody.
→ Both were caught by grepping the claim, not by reading the report.
→ **Verify your own claims before writing them down.** Grep for the symbol
you say you added.

**"The screens were never wired for photos" — they were, since build 137.**
Grepped for `avatarHTML` and `who:`/`pv:`, found none in `friends.js`, and
concluded two working screens had never been wired.
→ They draw through a declarative `data-kx-who` span, which that search never
looked for.
→ **A negative grep is not proof of absence.** Check how the file actually
does the thing before concluding it does not.

**Seven test suites started failing; blamed CPU, then "fixed" the tests.**
An Android build was hammering the Pi, so the timeouts looked like
starvation. Load dropped, they still failed. Then a wait pattern was widened
to make them pass — which made it worse, because the widened pattern matched
a state that occurs BEFORE the one being waited for, so every harness raced
ahead of the deal.
→ The real cause: a newly added fixed bar was covering the button under test.
→ **When tests fail, read the screen. Never loosen an assertion to make a
test pass.**

**A headless chromium leaked and burned 133% CPU for seven hours.**
A harness died before `browser.close()`.
→ **Close browsers in a `finally`.** Check for leftovers before you finish.

**A field was added to a wire message and the whole table stopped.**
*"this build does not know how to put undefined on the wire."* Hit ballun,
tankijiet and briks.
→ The field was not in the game's published contract.
→ **Append to the field list, never insert** — or better, ride an
already-declared field as a new action. An older build must be able to decode
your message and ignore what it does not know.

**A game paid nothing online, silently.** Then another paid twice.
→ `progress.js` pays as a SIDE EFFECT of the `KARTI_PARTY.ui.result` call.
Move a game off that call and it stops paying; call both doors and it pays
twice. No error either way.
→ **Count `counted` awards through `KARTI_XP.onAward` and measure the
wallet.** Never assume.

**A fix worked at two players and froze at three.**
Bomba shipped one message per tick per phone: 32/s fits the relay's bucket,
48/s does not, and dropped bytes starve a lockstep for ever.
→ **Test at the real seat count**, not just as a duel.

**A bug shipped three times because every test was run as the host.**
A guest sitting on the ready roster while the game runs invisibly is
undetectable from the host's phone.
→ **Assert on the NON-HOST, and assert the screen is visible** — not merely
present in the DOM. A DOM check has already passed while every phone showed
the wrong screen.

## 2026-08-24 — SQAQ: the wire codec carries NUMBERS ONLY
Building IS-SQAQ, the first two-client test stopped the table on the very
first move. Cause: `WIRE_FIELDS` included `t` and a string orientation
(`o:'h'`). mp.js's toWire() sends `mv.t` as the ACTION on its own, and every
listed field must be an integer 0..255 — anything else returns null and
tableStop fires ("this build does not know how to put ... on the wire").
The fix: field list is payload numbers only (`['r','c','o']`), orientation
packed 0/1, and doMove fires the ENCODED move at the subscribers so the raw
string shape never reaches the codec. If your new game's move has any
non-numeric field, encode it before it leaves the game.
Also: `KARTI_MP.start('create',...)` joins the room but never SHOWS the mp
screen — call `KARTI_MP.openFor(game)` first (the real menu path), or the
player sits on the home screen while the room runs unseen.

## 2026-08-27 — the record book PAYS, so where you put record() is the whole job
Ten games never called `KARTI_STATS.record(...)`, so playing them moved
nobody's W/L. The line to add is trivial; the danger is that
`record()` ends with `KARTI_XP._fromStats(...)` → `award()`. It is a
PAYMENT DOOR, not just a ledger. Adding it next to a game that already
pays is a double payment unless it lands inside progress.js's `fresh()`
guard, and `fresh()` behaves differently depending on whether an id is
passed:
- **id present** — absolute, matched on `p.seen['<game>:<id>']`. Safe ONLY
  if the existing payment used *that same id*. If it did not, the id
  SIDESTEPS the ten-second signature window and pays a second time.
- **id absent** — matched on the `game|result` signature inside 10s, the
  window every id-less payment stamps.
So the rule that came out of it: **record() goes AFTER the existing
payment; it carries the match id only when `awardPlay` used the same one,
and no id at all when the existing payment was id-less.** The six podium
games (ludu, kaxxi, erbgha, kodici, konkwista, tankijiet) hoist their
`mid` out of the `try` and share it. gharraq, kiri and rummy get no id —
their awards are deliberately id-less.

**Do not trust a grep for `KARTI_XP` to tell you a game does not pay.**
21 u 31 looked unpaid — no `awardPlay` anywhere — but it pays offline
through `P.record('cards2131', o)`, which progress.js wraps. Online it
genuinely paid nothing, because its frame is titled `KAŻINÒ` and
`titleToGame()` cannot resolve that, so the result-card wrapper had
nothing to award. Both doors matter: `awardPlay`, `P.record`, and the
`P.ui.result` wrapper.

**The profile named the new games badly and the fix was one word.**
`shelf()` built rows for unregistered ids with `defOf()`, which can only
pretty-print the id ("Erbgha", "Cards2131", "Kodici") — while `CATALOG`
in the same file already held the real names, icons and accents.
`richDef()` exists for exactly this and now backs `shelf()`. Related:
`TABLOGO` still pointed gharraq/poker/spy/tombla at the shared party
emblem long after their own art landed, and had no row at all for kaxxi,
konkwista, sqaq, kelma, aqleb, ballun, misteru or ilforka — all of which
have a `logo-*.png` on disk. Check `ls art/ui/logo-*` against that table
before assuming a chip has no picture.

Proof for any change in this area lives in the session scratchpad
(`prove.js`): it counts `counted` awards via `KARTI_XP.onAward`, measures
the wallet, and plays a real erbgha match against the machine so the new
line is shown to be REACHED and not merely correct on paper.

## 2026-08-27 — MISTERU: "append to WIRE_FIELDS" is not enough if the UI concats after it
Putting the board on the wire meant adding `to` to the engine's
`WIRE_FIELDS`. Appended at the end, exactly as the rule says. It still
broke every older phone, and not on the new action — on the OLD ones.
Because the list mp.js actually walks is the LOBBY's:
`wire:{fields: E.WIRE_FIELDS.concat(['sg'])}`. Appending inside
`E.WIRE_FIELDS` shoves `sg` from index 6 to 7, and index IS bit, so an
older build reading our mask decoded `sug`/`acc`/`pass` with the wrong seat
or none — i.e. it broke the four moves that already worked. Proved it by
loading `git show HEAD:js/misteru.js` next to the new one and running both
through copies of mp.js's toWire/fromWire.
→ **The wire order is the LOBBY's list, not the engine's.** Misteru now
declares one `WIRE_ORDER = ['s','w','l','by','cd','r','sg','to']` in
misteru-ui.js and both `hostBroadcast` and `lobby.wire.fields` read it, so
`to` really is last. If your game concatenates anything onto the engine's
field list, append there or you are inserting.
Also: do NOT write the board's top position (25) into the codec. Validate
with the engine's own `posOK`/`POS_MAX` — the map is about to become
per-case and a literal bound would start refusing legal squares silently.

**The relay echoes a whisper back to its sender** (`karti_server.chat()`:
`seats.add(conn.slot)`, "the sender's own receipt"). So when the host
whispered a refuted card privately to a remote suggester on `ms-show`, that
card came straight back to the HOST, which flip-revealed it to itself,
ticked its own notebook with a card it was never shown, and — `canAct()` is
false while a reveal is pending — sat behind a "Got it" it had to tap
before it could move again. The existing `if (M.reveal) return` guard never
fired, because on the host there is no reveal open. Data-dependent (it needs
the host to have a refuted suggestion of its own in the log), which is how it
survived. Fixed by refusing `ms-show` on the host and from anyone but the
referee — which also closes a forged reveal, since that channel is open to
every seat at the table.
→ **Any private channel needs a sender check.** The echo will find you.

Two-client proof in the session scratchpad (`ms_online.js`, `ms_three.js`,
`ms_mixed.js`, `ms_small.js`): real rooms on the live relay, the NON-HOST's
board asserted VISIBLE by rect + hit-test + screenshot, and a mixed-build
run that shows exactly what a stale phone does with an action it has never
heard of (refuses it, bails, both tables stop clean with "nobody lost
anything" — no drift, no fake result).

## IL-MISTERU — making OTHER seats' tokens walk (AI + remote)

The local walk shipped first; AI and remote seats still teleported. Two
things bite when you extend it.

**`render()` ends any walk in flight** ("a repaint rewrites every token tray").
`aiTurn()` and `onlineRemote()` both do `render(); afterMove();` — and
`afterMove()` renders AGAIN. So a walk started before `afterMove()` is killed
on the same tick and the token teleports anyway. Start it AFTER `afterMove()`.
→ but then `afterMove()` has already scheduled the next bot think (620ms) and
that think's own `render()` lands mid-walk. Hence `M.walkHold`: the caller
writes the walk's duration, `afterMove()` reads and clears it exactly once and
uses `Math.max(620, hold + 120)`. Capped at 900ms — it only ever delays THIS
phone's bot timer, never the table.

**The path must be captured BEFORE `doMove`.** `movePath()` reads `st.pos[seat]`
as the origin and `st.roll` as the budget; `apply()` sets pos to the destination
and roll to 0, so after the move the route is unrecoverable. There is nothing to
reconstruct — capture it or lose it. (`passage` is deliberately NOT walked: it
is a wall you step through, and the engine gives it no route.)

**Haptics are for the player only.** `startWalk(seat, path, done, silent)` — the
per-step `tick` and the arrival `thud` are gated on `!silent`, and so is the
cut-short arrival buzz in `endWalk()`. Measured, not asserted: patch
`KARTI_SFX.haptic` in the page and count by kind. A clean run reads
`tick + thud === the local seat's own walk steps`, exactly, with AI/remote steps
adding zero. Two clients: ALFA 35 tick/thud for 35 own steps while drawing 27
remote steps; BRAVO 27 for 27 while drawing 35.

Harnesses in the session scratchpad: `walk.js` (solo, `--reduced`, `--small`),
`walk_online.js` (two real clients on the live relay), `walkshot.js` (films one
AI walk frame by frame — the disc's label and `--sc` identify the seat, and its
real token is `visibility:hidden` underneath while it steps).

---

## KONKWISTA — the interactive pass (`js/konkwista-ui.js`)

**`el.hidden = true` did nothing in this file's banner, from day one.** The
class rules give `.kq-cards` and `.kq-step` `display:flex`, and a class rule
outranks the browser's own `[hidden]{display:none}`. So the cards button sat
in the phase banner as a dead cream slab in every game from the first frame,
and the reinforcement stepper stayed visible through Attack and Fortify. One
line fixes the lot: `#scr-party .kq-banner [hidden]{display:none}`. Any file
that sets `display:` on something it also toggles with `hidden` has this bug.

**A bounding box that fits proves nothing about the content inside it.** The
attack sheet's own rect measured comfortably inside a 360x640 viewport while
ATTACK and CANCEL were clipped below its internal scroll. Assert on the
BUTTON: fully on screen AND `document.elementFromPoint(centre)` is the button
itself. Both sheets are now `flex-direction:column` with a scrolling body and
pinned actions, and the attack sheet is anchored to `.kq-wrap`, not
`.kq-mapbox` — the map box is only ~366px tall on a 360x640 phone.

**A retina screenshot stalls the renderer for hundreds of ms.** Photographing
a fight mid-roll made an honest 850ms animation measure 1583ms. Do the whole
capture IN THE PAGE: a `MutationObserver` clones the overlay the instant the
dice settle, plus a 120ms timer clones the tumbling frame, and both clones are
photographed afterwards. Same DOM, just kept.

**Odds are enumerated, never remembered.** `exchangeOdds(nA,nD)` walks all
6^nA x 6^nD outcomes (7776 worst case, cached) rather than pasting a table.
It reproduces the classic values exactly — 3v2 = 37.17 / 33.58 / 29.26 — which
is how you know the pairing and the tie rule match the engine's. `pct()`
refuses to round 0.9994 up to "100%": a player who reads 100% and then loses
stops believing every number on the screen.

**Combat haptics carry a `mine` flag down from the caller.** `playBattle(battle,
done, mine)` — `launchAttack` passes true, `runAiStep` and `onlineRemote` pass
false. Measured by patching `KARTI_SFX.haptic` and stubbing
`navigator.vibrate`: a remote seat's attack driven straight down
`P.online.konkwista.remote()` animates 4 dice and produces zero haptic calls
and zero vibrate calls.

Harness in the session scratchpad: `konk-ui.js` (133 assertions — odds, the
turn readout, the attack sheet, the fight, haptic discipline, reduced motion,
Maltese at 360x640).

## The record book's blanket avatar rules ate the beta gem frames

**`img{width:100%;height:100%;border-radius:…}` inside an avatar host is a
statement about PHOTOGRAPHS, and it caught a FRAME.** All four avatar hosts on
`#scr-stats` (`.sx-coinav`, `.sx-lav`, `.sx-pav`, `.sx-pcav`) carried that
rule so a fetched face fills its tile. But `.kx-ring-art` — the painted beta
gem ring in `js/progress-faces.js` — is deliberately `inset:-9%; width:118%`
so the stones overhang and break the silhouette. Overridden to 100% with the
`-9%` left/top still in force, it landed **2px too small and 2px up-and-left**:
the jewellery sat crooked ON the face instead of around it, corners rounded
off. In a 38px ranked row that is the whole cosmetic, wrong. Fix is
`img:not(.kx-ring-art)` in all four, **not** a corrective rule — those rules
are `!important` and `#scr-stats .sx-pav .sx-face img` is (1 id, 3 classes,
1 type), so anything trying to out-shout it has to win a specificity fight it
does not need to have. Any new avatar host on this screen must carry the
`:not()` too.

**Stubbing the leaderboard: patch `fetch` in the page, not the wire.** The
board is a cross-origin POST with `Content-Type: application/json`, so it
preflights, and puppeteer request interception does not surface the OPTIONS —
`r.respond()` on the POST alone still fails the fetch and the screen says
"Cannot reach the board from here." `page.evaluateOnNewDocument` replacing
`window.fetch` for `/stats/board$` costs three lines and has no CORS at all.

**`.kx-av` is `overflow:hidden`, so a host's `overflow` is not what clips a
ring.** Worth knowing before you go removing `overflow:hidden` from
`.sx-lav`/`.sx-pcav` hunting a clipped frame — the medallion clips first, and
that is the same everywhere in the app including the profile, so it is the
intended look. The bug was geometry, not clipping.

## IL-ĦAJJA (js/hajja-ui.js) — three things that cost an hour

**A published `WIRE_FIELDS` can be a list that CANNOT GO ON THE WIRE, and
nothing says so until the table stops.** `js/hajja.js` publishes
`WIRE_FIELDS = ['t','v']`. Both names are wrong for `js/mp.js`'s codec:
`toWire()` runs `Math.floor(Number(x))` over **every** name in the list, and
`t` always holds the action word (`'spin'`) → `NaN` → the whole move is
refused, every time. The action is already carried separately in `a`
(`WIRE_SKIP`), which is why no other engine here lists `t` — check
`js/aqleb.js` (`['r','c']`), `js/kanun.js`, `js/bomba.js`. And `fromWire()`
ends with `if (mv.v !== undefined) mv.v = !!mv.v`, so `v` is a BOOLEAN on
arrival: a career id, a house id and a stock number 1..10 all become `true`.
Fix without touching the engine: the lobby publishes the corrected list
(`gameLobby()` prefers a published `wire` over mp.js's internal mirror) —
`['v','c']`, the un-sendable name dropped, `v` left declared so an older
decoder still lines up, and the payload riding one APPENDED integer field.
`encMove`/`decMove` in `js/hajja-ui.js` are the only two places that know the
codes. **Before you trust any engine's field list, run one of each of its
moves through toWire/fromWire.**

**`nextSpace()` only knows the ROAD, so it cannot animate a JUMP.** IL-ĦAJJA's
square 0 is a fork that teleports you to the head of one of two spurs.
Stepping from 0 with `nextSpace()` always walks the UNIVERSITY spur, so a car
that chose WORK was animated 46 spaces down the wrong road and past half the
board to arrive one square away — and with four machine seats doing it the
first turn took longer than the test would wait. Any board with a branch needs
its walk to check that the road actually LED there, and hop rather than lie
when it did not.

**puppeteer's `page.click()` hangs for the full protocolTimeout in a
BACKGROUND tab.** `ElementHandle.click()` waits on an IntersectionObserver
before it will click, and IntersectionObserver callbacks do not fire in a
backgrounded tab — so in any two-client test the FIRST page (backgrounded the
instant the second is created) stops dead in `Runtime.callFunctionOn`, and it
looks exactly like the game having frozen. Cost 2×180s before it was
recognised. Use `page.evaluate(s => document.querySelector(s).click(), sel)`
for every tap in a two-client harness, or `bringToFront()` first.

## IL-ĦAJJA's board: three things that made scenery look wrong (build 319)

**The squares were too big for the board, and that is why it looked like a
spreadsheet.** At 128x92 on a 960x1480 board the serpentine touched on every
side — 20px seams, 24px between columns — so there was physically nowhere for
land to be. No amount of art fixes that. The squares came down to 112x78 and
the board went up to 1680 with a 134 row pitch, which buys six 56px bands
across the full width, and only then was there a map to draw. **If scenery
looks cramped, measure the gaps before drawing anything.**

**A peaked shape filled with a light-to-dark vertical gradient reads as a
searchlight, not a hill.** Same for nested arcs that widen downward — five of
them under the city made an unmistakable beam. Real relief is a DARK mass with
the light on the RIDGE, on the edge facing whatever the light source is.

**Mdina floated because its base (y 398) sat above its own hill's crown
(y ~425).** Nothing in the code can catch that; it took cropping the render to
the hill and looking at it. Two earlier passes "looked fine" in the full-board
screenshot, where the whole hill is 40px tall.

The scene is one string built once, `pointer-events:none`, drawn under
`.hj-roads`. **If those pointer-events ever come back, every square on the
board silently stops working** — the harness asserts `elementFromPoint` over
12 squares hits `.hj-sq` and never `.hj-scene`.

## IL-ĦAJJA's board, take two: a real board is a RIBBON, not a grid (build 320)

Build 319 opened up the serpentine and painted scenery into the seams. It was
still wrong, and the reference photo showed why in one look: **a Game of Life
board is a narrow winding ribbon of small tiles through a landscape that owns
most of the board.** A 6-column grid of big buttons cannot get there by having
scenery added to it — the grid IS the problem.

So the route is three **splines** now (study loop west, work road down the
middle, the long meander they feed). Tiles are placed at even ARC LENGTH and
rotated to the tangent, which is what makes it read as a road you drive.
`along()` folds any heading past ±90° back, or every tile on a westbound leg
prints its word upside down.

Things worth knowing next time:

- **The curve exists for the POCKETS it leaves.** The landmarks are placed in
  them by hand. Move a waypoint and something in `sceneSVG()` ends up under a
  tile.
- **An ellipse cannot contain a route that fills a rectangle.** The far corner
  of the meander is at 83% of the half-width *and* 96% of the half-height at
  once — outside any ellipse, which is why two hand-drawn coastlines let the
  road run into the sea. The island is a generated **superellipse** (exponent
  0.2, i.e. a rounded rectangle) with a small wobble, so enclosure is a
  property of the shape rather than something to eyeball.
- **Daylight, not dusk.** 319 was painted dark to match the app chrome and
  therefore read as more app chrome. A printed board in a dark frame reads as
  a board on a table, which is the thing we actually want.
- **The white "here" outline stopped being a ring** the moment every tile got
  a white keyline. It is gold now.
- Lifting the current tile with `z-index` to clear its overlapping neighbours
  **hid the car standing on it** — the one car the player is looking for.
  `.hj-cars` has to sit above the ring.

## IL-ĦAJJA map: what an agent audit caught that eyeballing never would (324)

An audit agent rendered the board, cropped it and MEASURED it. Two of its P1s
were things I had looked straight at in a full-board screenshot and not seen,
because at fit-zoom the whole defect is a few pixels:

- **The road ran clean through the lake** — seven tiles floating on open
  water, the lake's own outline vanishing under the carriageway and
  reappearing on the far side.
- **The road ran clean through a mountain**, with a tile planted on the slope
  and the hill's silhouette continuing on both sides of it.

Same root cause: large scenery positioned BY EYE against a spline that is not
visible in the source. The fix is not "move it" — it is `routeRoom()`, which
returns the largest scale at which a shape keeps every sample of every road at
arm's length. The lake and the bay are now GROWN from their centres until the
route stops them. Placement can still look wrong; it can no longer BE wrong.

Also caught, and all real:
- **A tile that could not be tapped.** The START plate was 250×86 and the two
  spurs began at u=0.07, so tile 1 was underneath it — and `.hj-sq.here` has
  `z-index:3`, so on the opening turn of every game the plate won the hit
  test. `elementFromPoint` over all 58 tiles is now part of the harness.
- **Six "grass tone" ellipses painted over the whole scene** — they were
  emitted after the props, so they washed green over a mountain face, the
  bridge deck and both lakes. Ground tone belongs with the ground.
- **Three of five boats beached in fields**, one with a tree growing through
  its hull.
- **RETIRE dissolving into the road** — the carriageway went canonical gold
  and three tiles are gold; measured contrast 1.22. The square the whole board
  drives towards.
- **The weakest text on the board was on MARRY and BUY A HOUSE** (2.47:1), the
  two most consequential squares in the game.
- **Zoom could not reach legibility.** `ZMAX` was a constant, but `vw.k` is
  measured in whole-boards, so 4.5× means something different on a 360 phone
  than a 390 one — max zoom gave 6.7px of label. `zMax()` now returns whatever
  multiple puts a tile at ~86 CSS px.

**Lesson: for a screen whose whole job is visual, an agent that measures beats
an agent that looks — including when the one looking is me.**

---

## "Who did I play?" — where the account key was, and four traps around it (325)

Wiring match history to name your online opponents. Four things cost real time
and are worth an hour to the next agent.

- **`Room.roster()` only ever sent the account key as `av`, and only for
  accounts that had uploaded a PHOTO.** The seat's `n` is `s.conn.pname` — a
  CHOSEN display name — so it does not lower-case into an account key. Two
  strangers at one table can both be showing "GUEST". The roster seat now
  carries `acct` on every seat that has an account (appended, so an older
  client decodes it unchanged). Do NOT go looking at the `acct` near
  `push_view()` — that is web-push only and never reaches a phone.
- **Capture the roster at `began`, not at `record()`.** The roster mutates as
  chairs empty, so reading it at the end loses exactly the person you most
  want to add. `MP.began` survives `tableStop`/`endMatch` and is only cleared
  by `mpLeave`, which makes object identity (`MP.began === capture.src`) a
  clean "does this result belong to that match" test.
- **Do it in `js/stats.js`, never in the games.** `js/party.js` forwards to
  `record()` FIRST, so a game's own richer second call is dropped as a repeat.
  One hook in `mp.js`'s `onBegan` covers every game in the box.
- **`stats.js` caches the whole store in memory on first read.** Injecting a
  `karti_stats_v1` blob into localStorage and then calling `openProfile()`
  shows nothing. Reload the page after writing it.

Harness notes, all of which cost a run each:
- **IR-REBBIEĦ (`#kr-root`) is a fixed z-index 12000 overlay.** A screenshot of
  the record book taken straight after a match is a picture of the winner
  screen, and `elementFromPoint` correctly reports every row as invisible.
  Dismiss it via a button INSIDE `#kr-root` — a global text search for
  "leave" finds the lobby's button first.
- **Registration is rate-limited per caller IP: `REG_BURST` 3, then one every
  five minutes.** Three runs and every later sign-in is a 429. The buckets are
  in memory, so restarting your OWN test relay resets them.
- Test relay: a SECOND `karti_server.py` on another port with its own DB
  files, plus puppeteer request interception rewriting `:8101` -> that port,
  so `sync.js`'s hard-coded dev port and `stats.js`'s leaderboard push can
  never reach the live relay.

## The weekly champion borders (build 344)

`KARTI_XP.grantRank()` existed, was exported, and was called by NOTHING — so
no player could ever hold one of the three borders registered for every game.
Fixed with a `crowns` route on the stats server plus a reconcile in
`js/stats.js`. Four things cost time or nearly shipped a bug:

- **`week_start(now) - 7*86400` is the wrong way to get last week.** It is
  exactly the DST bug `week_start()`'s own docstring warns about. It matters
  more here than anywhere else because the value is matched for EQUALITY
  against a stored `wk`: an hour off does not crown the wrong player, it
  matches zero rows and crowns NOBODY, silently, on the two weeks a year that
  follow a clock change. Use `prev_week_start()` — step back half a day from
  this week's opening and re-run `week_start()`.
- **Award the LAST COMPLETED week, never the running one**, or the border
  moves between players all week and means nothing.
- **`grantRank` fires `unlockCbs`** — the "you won a border!" announcement. A
  reconcile that ran every boot would replay the celebration for ever, so the
  ledger is COMPARED first and an unchanged week makes no calls at all. This
  is the single most important property; it is asserted by counting unlock
  events across two identical runs.
- **`clean_games()` DROPS a row with `p == 0`.** A self-test that baselines an
  account with all-zero counters therefore pushes an EMPTY table, and `put()`
  responds by deleting that account's rows instead of baselining them. Baseline
  with 1-1, and put every game an account plays in ONE call — `put()` replaces
  the whole table, so a second call naming only a new game drops the first.

Harness note: `post()` in `stats.js` looks `fetch` up globally at call time, so
stubbing `window.fetch` in the page is enough to stand in for the Pi and drive
the reconcile through every branch — including the offline one, which must take
no border away.

## Deleting an account (`--delete-account`)

The owner CLI had list/grant/revoke/reset but no way to remove an account, so
five junk test accounts sat on a 12-account server. Two things to know:

- **An account lives in FOUR databases**, not one: `accounts.db`, `avatars.db`,
  `stats.db` (players + rows + `wrows`) and `push.db`. Each sibling store
  already had a `forget`/`drop` hook waiting — `karti_avatar.forget()` even
  documents itself as "the hook for when something does [delete an account]".
  Use them rather than writing new SQL.
- **Six tables in `accounts.db` are ordered PAIRS and need BOTH columns swept.**
  `played`/`friends`/`friend_msgs` carry `(uname, other)`, `mail` carries
  `(uname, sender)`, `knocks` and `friend_reqs` carry `(uname, fromk)`.
  Deleting only `uname = key` erases the account's own side and leaves it
  standing in every OTHER player's friends list, mail and scrollback — a
  deleted player visible on real screens that can never be removed, because
  the account that owned the row is gone. The selftest fills every one of
  those tables from the FAR side for exactly this reason.

Irreversible, so it needs `--yes`; a flag rather than a prompt so it still
works over a pipe. Verified end-to-end against a COPY of the live databases in
the scratchpad (never the live files): both refusal paths, then a real delete
with a residue sweep over all four files across every table above.

## The seven-day welcome streak (build 345)

A ONE-TIME onboarding streak (owner's call: "one time only... later we add
more"), separate from the daily spin — two keys in the save, two day counters,
neither knows about the other. Days 1-6 pay escalating chips (1500 total); day
7 opens a chest where the player PICKS a game and is given that game's whole
exclusive set.

- **Exclusives are NOT earn-only any more, whatever §9b's prose says.**
  `registerExclusives()` states it plainly: "No set carries an `earn` any
  more... the wins are checked by `exclPurchase()` at the counter instead."
  They are a wins milestone PLUS a coin price. So the gift
  (`KARTI_XP.exclusiveGift`) reuses `grant()` — the same call exclPurchase
  makes after taking the coins — and skips only the wins gate and the price.
  A gifted set is byte-for-byte a bought one; nothing downstream can tell.
- **`done` is written AFTER the grant, never before.** If the gift fails the
  chest stays openable instead of silently consuming the one prize.
- **The day number is an INTEGER, not a date string.** The grace rule is
  arithmetic and you cannot subtract '2026-8-30' from '2026-9-1'.
  `loginDay()` maps a LOCAL calendar date through `Date.UTC`, which cannot
  drift an hour on the two DST Sundays the way dividing ms would.
- **A decorative glow with `inset:-2px` counts toward scrollWidth** and reads
  as a clipped label to any overflow check. Bleed with box-shadow spread
  instead — shadows do not affect layout.

Harness note: `elementFromPoint` at a button's own centre is the definitive
occlusion test. A screenshot made the reveal's CTA look buried under the PWA
install banner; the hit test proved the button was topmost and the banner sat
below it.

## Chips that fly to the wallet (build 347)

The day 1-6 claim now arcs painted chips from the button to the `#w-chips`
pill on Home, which counts up and pops on arrival. Three things to keep:

- **The payment happens when the FIRST CHIP LANDS, not on the press.** That
  ordering is the safe one: if the app is closed or the screen changes
  mid-flight, nothing has been written, so the day is still pending and still
  claimable. Paying first and animating after risks taking the claim and
  losing the chips. There is also a 1400ms belt-and-braces timer, because a
  backgrounded tab never fires `onfinish`.
- **A fresh save has NO WALLET TO FLY TO.** `renderHome()` routes a player
  with no starters into IL-QASMA and returns *before* painting `#wallet`, so
  `#w-chips` does not exist and `getBoundingClientRect()` is 0x0. The flight
  degrades to paying at once, and `loginBoot()` now refuses to auto-open the
  sheet over the deck pick at all.
- Any harness for this must SEED a save (`karti_active` +
  `karti_save___guest__` with `starters`) before load. Screens are
  `#scr-home.on` where the base class is **`screen`**, not `scr` — a
  `.scr.on` selector silently matches nothing and every rect reads 0x0,
  which looks exactly like a broken animation.

## The splash gates on WAVE 2 — so "defer wave 2 harder" makes boot SLOWER, not faster

While cutting cold-load weight (build 353 → the big-image diet), a measured
audit recommended pushing the wave-2 game-module downloads further back so
they stop competing with Home's first paint. Before doing it, read
index.html around `MIN_MS`: **the loading splash holds until `karti:loaded`**
— the event that fires only when BOTH waves have landed (20s safety cap
aside) — because party.js must never let a tile open before its module
exists. So the player cannot SEE Home until wave 2 is done no matter how
early Home painted underneath, and Pages is HTTP/2, so serialising the waves
adds idle gaps without shrinking total bytes. Deferring wave 2 delays the
exact event that drops the curtain. The lever that actually works is bytes:
loading-bg/home-hero went WebP (1.9 MB → 365 KB, visually identical, probes
fall back to the designed gradients on a non-WebP browser).

Measured cold-load accounting for that diet (verified byte-exact against
HEAD 834ae52, and the trap it teaches): 12,453,302 B → **10,796,178 B, net
−1,657,124 B**. The four asset swaps alone are −1,657,664 B (loading-bg
1,188,482→195,154; home-hero 708,333→169,396; spin-wheel 140,364→77,412;
favicon 65,944→3,497) but the five EDITED files grew 540 B doing it
(index.html +141, sw.js +394, game.js +2, suspett-ui.js +2,
progress-ui.js +1). An earlier report quoted the asset-only figure as the
net saving. Rule: when you claim a cold-load delta, sum EVERY changed file
— the edits that carry a diet have weight too.

Convention set at the same time: the replaced originals
(art/ui/loading-bg.png, art/ui/home-hero.png, art/suspett/map-day.png,
art/suspett/map-night.png) are DELIBERATELY still on disk — clients holding
the previous index.html/game.js/suspett-ui.js (HTTP cache ≤10 min, offline
phones on carried-forward caches) still request the old names, and Pages
serving both makes the transition riskless. A later build can delete them
once v354+ is everywhere. Do not "clean them up" in the same build that
changes the references.
