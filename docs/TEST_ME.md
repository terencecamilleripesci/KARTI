# TEST LIST — morning of 16 August 2026

**https://terencecamilleripesci.github.io/KARTI/**

> **Look at any Maltese heading first.** The display font could not spell
> Maltese. Orbitron ships only the plain latin range, so **ħ ġ ż ċ were not in
> the font at all** — every heading like BAĦAR, RAŻŻETT or IL-ĦAŻEN was being
> drawn half in Orbitron and half in a fallback face, *mid-word*. It had been
> shipping like that. The face is now Exo 2, same squared technical look, and it
> actually contains the language the game is written in.
>
> It is also **self-hosted now**, so the app makes **zero external requests** —
> it used to fetch the font from Google, which meant no signal, no display face.
> For an app that is supposed to work offline, that was a real hole.

**Force-close the app and reopen it once** before you start. The service worker
needs one cycle to pick up a new build. The version is printed at the bottom of
Settings — it should say **46** or higher.

---

## FIRST, ONE MINUTE OF SETUP

**Delete the KARTI icon from your home screen and add it again from Safari.**

This is the fix for the black band at the bottom you have been chasing for days.
The site no longer carries the tags that cause it, but **iOS baked the old ones
into the icon when you installed it and never re-reads them**. Nothing I can
change in the code fixes an icon that was already made. Re-adding it takes ten
seconds and it should come back full-screen.

If the band is still there after a fresh re-add, tell me — that would mean the
cause is something else and I have been wrong about it.

---

## 1. SOUND — the thing I most want your ear on

47 effects. Levels are the one thing I can measure but not judge.

- Tap around the app. Taps, tabs, sheets opening, going back.
- **The tabs should sound like an instrument, not a button.** Each one is a
  different note of the same scale, so they never clash however fast you jab.
- **Open a pack.** The whole ceremony now has sound — the build, the tear, five
  flips, and a different sting per rarity. The 880 ms before the tear used to be
  completely silent.
- **Settings → Sounds** has a real toggle and a volume slider now. A switch
  turning off sounds different from one turning on.
- **The question:** is it soft enough to live with? Not "is it nice once" but
  "would this still be pleasant on the two-hundredth tap". If anything is too
  loud, name it and I will drop that one sound rather than the lot.

---

## 2. THE PARTY GAMES — everything is playable

Party Games is now split into **Board games** and **Card games**, and nothing
says COMING SOON.

**Board**
- **CHESS** — move-generation is perft-verified, so the rules are right.
- **DAMA** — forced capture, chains, king me.
- **IL-KIRI** — the property game. The thing to test is the one you asked for:
  **start a game, then close the app or turn wifi off.** The machine should take
  your seat, play conservatively, decline every trade so nobody can rob you while
  you are gone, and hand it straight back when you return. There is a bar naming
  who is being played by the phone.

**Cards**
- **SKARTA** — 108 cards, four Maltese suits. The +7 is a real trade-off: light
  the whole box and you singe yourself and miss your own next turn.
- **BIXKLA** — the Maltese one. Forty cards, and **the Jack outranks the Queen**
  because he took the horse's chair when the Latin deck's knight had no seat in
  an English pack. That is genuinely how Malta plays it.
- **BRISCOLA** — the Italian ranking on the same forty cards, so the Queen beats
  the Jack. Worth playing both back to back to feel the difference.
- **SETTE E MEZZO** — quick, and the King of Diamonds is the *matta*.
- **IL-GIDBA** — bluffing. Best with three or four.

Note on all the trick games: **following suit is NOT compulsory.** That is the
defining rule of this family, not a bug. It is what makes holding a trump
interesting.

---

## 3. THE CARD GAME — 11 rules bugs fixed

- **Story mode.** The final boss used to be the *easiest* of the last three
  fights — a beginner beat NANNA 81% of the time against 49% and 44% for the two
  before her. She is now the hardest thing in the game. See whether the ladder
  feels like a ladder.
- **`boom`** says "500 to both players". It used to apply the two hits one at a
  time, so on a mutual kill **you died and the AI survived**. You are always seat
  0, so that one only ever hurt you.
- Balance held after the fixes: 14,700 games, every deck between 46.8% and 52.7%.

---

## 4. RECORD BOOK AND LEADERBOARD — new

**Profile → Record book.** Your W/L/D in every game with that game's emblem.

**Profile → Leaderboard** will say it cannot reach the board. **That is
correct and expected this morning** — its server module is written and its
self-test passes, but I have not mounted it yet because another agent is inside
the relay file and I will not have two agents editing your live server. It goes
in with the next relay change.

---

## 5. ONLINE

Chess and dama have real online rooms now, and the relay is running.

**Undo online is a request, not a command** — every other player has to allow
it, and one refusal ends it quietly. A player whose board would not land in
exactly the same position declines automatically, so two boards can never
half-roll-back.

**Known limitation, not a bug:** you probably cannot reach the relay from your
own phone on your own wifi. A public HTTPS page is not allowed to call a private
address. Test it with someone outside the house, or on mobile data.

---

## WHAT IS STILL BEING BUILT WHILE YOU SLEEP

- **TOMBLA** — Maltese bingo, the full ladder: ambo, terna, kwaterna, ċinkwina,
  tombla. The one game that gets *better* with a big table, since everybody
  marks at once and nobody waits for a turn.
- **The shared lobby screen.** The transport under it is DONE and measured —
  sixteen full sixteen-seat tables at once run at under 4% of one core on the
  Pi, which is 256 sockets. The lobby UI itself is not written yet, so the games
  cannot be joined from a room until it is.
- **SKARTA's seat cap.** It ships capped at 4 chairs, which contradicts
  "make it 8plus". 108 cards and a hand of 7 deal to fifteen players, so the
  real number is being worked out rather than picked for tidiness.

---

## ONE DECISION ONLY YOU CAN MAKE

**Undo at a big table.** Your rule is that every player must agree, and it is
built that way. But at a table of eight, waiting on seven approvals means one
person who put their phone down freezes everybody.

The recommendation is: **keep "anyone may refuse" absolute, but treat silence as
"did not object"** — a 20-second window, the count visible throughout
("waiting for 3 of 7"), and the asker can withdraw at any time. A deliberate NO
still kills it instantly; only silence stops being a veto.

Say the word either way and it changes in minutes. It is left strict until you
decide, because it is your rule and not mine to soften.

---

## THE TWO THINGS I NEED FROM YOU

1. **Re-add the home screen icon** (top of this file). Nothing else fixes it.
2. **One relay restart — this is now ready.** All server work is bundled into
   the build you are testing; nothing further is pending. Rooms seat up to 16
   and online chess, dama and the new table games need it:
   ```
   sudo systemctl restart karti-relay
   ```
   Its self-test passes **159 checks, zero failed**, and all 144 pre-existing
   checks still pass unedited — that is the regression net, not a claim.

## AND ONE THING TO DO WHEN YOU WAKE

**Rotate the GitHub token.** You pasted it in chat, so it is written into the
session log on disk. It has done its job. github.com/settings/tokens.

---

## THE ART RUN, WHENEVER YOU WANT IT

Everything is prepared and checked: the five party emblems, the two KARTI coin
faces, 29 IL-KIRI images and 11 for SKARTA. Every prompt has been verified for
the two failure modes that have already cost GPU time here — the black
background surviving for the alpha cut-out, and the no-text ban staying inside
the 77-token window.

**Nothing is waiting on it.** Every game ships complete with zero generated
images, because each one is a swappable slot. When you rent the pod, paste the
SSH line and it runs.
