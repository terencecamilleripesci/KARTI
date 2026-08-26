# Agent log — mistakes already made, so nobody makes them twice

Append what cost you time. Newest at the top. Be blunt; this is worth more
than a tidy record.

Format: **what happened** → what it actually was → what to do instead.

---

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
