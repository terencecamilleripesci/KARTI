# The tavern: quest, key, shop, chat — and KARTI coins

The owner's design, and the decision to let the RPG both earn and spend KARTI
coins. Written down before any of it is wired, because it crosses into a live
app.

## The quest

1. Leaving the ruin, the player already meets **Vell the Outfitter**, who gives
   the novice set.
2. Vell points them to **Wayrest**, the village, and to its **tavern** on the
   square.
3. The **tavern keeper** gives the quest: *kill the boss in the Sunken Crypt*.
4. He hands over — or sells — the **dungeon key**. Without it the crypt door
   does not open.
5. He also runs a **shop** (bread, potions, the key) and the tavern hosts the
   **chat room**.

### Why the key matters more than it looks

Right now the crypt is a bare **level gate** — reach 10 and walk in. That makes
the entire overworld skippable: nothing between the ruin and the dungeon has to
be touched.

Incarnam does not work that way. There, **the key drops from the zone's
monsters**, so the open world is the way in rather than a formality. Routing
the key through the tavern keeps that property and adds a reason to visit the
village. The level check stays as a floor; the key becomes the door.

## KARTI coins — earn and spend

The owner chose a full economy over spend-only. The relevant facts, checked
rather than assumed:

**The wallet is already client-side.** `js/progress.js` keeps it in
localStorage via `KARTI.save()`. So the RPG paying out coins does **not**
introduce a new class of exploit — anyone who wanted to edit the balance can
already do it in devtools today. That materially softens the warning that was
raised before the decision, and it is the honest position.

**KARTI already has anti-farm machinery.** §7b: chips carry the *"same WEIGHT,
same speed factor, same daily taper as the XP, so the anti-farm machinery is
shared and cannot drift."* Every KARTI game's payout is tapered daily.

**So the rule for the RPG is: go through the same door, respect the same
taper.** Not because coins are secret, but because the party games' payouts are
balanced against that taper, and an untapered RPG would quietly rebalance them.

### The API — the only door

`js/progress.js` exposes four verbs. None can go negative, none can move an
insane amount (`moveOK` caps a single transaction at `CHIPS_MAX_TXN`), each
fires exactly one wallet event, and each returns a reason on refusal:

```js
KARTI_XP.addCoins(n, reason)    // -> {ok, added, balance} | {ok:false, why}
KARTI_XP.spendCoins(n, reason)  // -> {ok, spent, balance} | {ok:false, why:'coins', short}
KARTI_XP.coinsBal()
KARTI_XP.chipsBal()
```

The RPG runs in a same-origin iframe, so it reaches these through
`parent.KARTI_XP`. **It must never touch `wallet()` or localStorage directly** —
that would skip the cap, the commit and the event the home wallet's animation
hangs off.

### What this changes in the RPG

`quest.js` and `world-types.js` both currently say, in comments, that rewards
are *"XP and ITEMS only — never currency… the wallet belongs to KARTI, and a
reward that mints a second one would have to be unpicked when this ships."*
That was the right call when the RPG was standalone and had no way to reach the
real wallet. It is now superseded — those comments must be corrected rather
than left to contradict the code, or the next reader will trust them.

### Standalone

The RPG also runs outside KARTI (world.html direct, for testing). With no
parent there is no wallet. Prices and payouts must degrade to a **local
practice purse** rather than throwing or silently doing nothing, so the tavern
is still testable without the host app.

## Shop stock

| item | price | notes |
|---|---|---|
| Bread | small | heals a little out of combat |
| Potion | small | the 30 HP potion the tutorial already gives |
| Crypt Key | medium | the quest hands the first one over; further runs buy it |
| Necropolis Key | larger | gated behind the crypt being cleared |

Keys are consumed on entry, which is what makes a dungeon run a decision rather
than a habit.

## Chat room

The tavern is the natural place: a room you walk into, with the other players
who are in it. It rides the existing **relay** (`qawmien_relay.py`), which
already carries the spar rooms, rather than a second transport.

## Order of work

1. Correct the two stale "never currency" comments.
2. `shop.js` — stock, prices, the buy verb, the standalone purse.
3. Tavern NPC + the quest step, in `quest.js`.
4. The key: an item, consumed at the dungeon mouth, replacing the bare gate.
5. Chat room on the relay.
