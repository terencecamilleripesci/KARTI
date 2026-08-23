# Agent log — mistakes already made, so nobody makes them twice

Append what cost you time. Newest at the top. Be blunt; this is worth more
than a tidy record.

Format: **what happened** → what it actually was → what to do instead.

---

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
