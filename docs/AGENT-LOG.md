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
