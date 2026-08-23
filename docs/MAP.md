# Where everything is

Read this **before** searching. It exists so you spend your context on the
fix instead of on finding the thing. Line numbers drift — treat them as
"look near here", and grep the named symbol to confirm.

If you learn something that belongs here, add it.

## The shape of it
A PWA served from GitHub Pages. `index.html` inlines the layout CSS, holds
`var KARTI_BUILD`, the splash, and a loader that appends every `js/*.js`.
`sw.js` precaches the shell (~40 entries — a new module must be added to
**both** the loader and the precache or it works online and dies offline).
A Python relay on the Pi (`server/`) carries rooms, accounts and photos.

## The core modules
| file | owns |
|---|---|
| `js/progress.js` | XP, wallet, cosmetics registry, exclusives, the award rules |
| `js/progress-ui.js` | how a PERSON is drawn — `avatarHTML`, the photo probe |
| `js/progress-faces.js` | the faces, borders and badges themselves |
| `js/mp.js` | transport, lobby, roster, staking, the leave sheet |
| `js/party.js` | the game shelf, the shared result card, the shared frame |
| `js/rebbieh.js` | IR-REBBIEĦ — the one winner screen, used by all games |
| `js/game.js` | store, home, wallet pills, the solo card duel |
| `js/mail.js` | the gift mailbox and the owner's send console |
| `js/deck-kit.js` | the ONE shared deck every card game wears |
| `js/<game>-ui.js` | one game's screens; `js/<game>.js` its pure engine |

## Landmarks worth knowing
- **Economy:** `awardPlay()` and the double-pay guard `fresh()` in
  `progress.js`. `fresh()` takes a match id as absolute, else a
  "same game+result inside 10s" signature — **both**, since they used to
  disagree and pay twice.
- **Exclusives:** the `EXCLUSIVES` registry in `progress.js`. Every set needs
  BOTH a wins milestone and coins. Art at `art/cosm/<key>-exclusive-<slot>.png`.
- **Who a player looks like:** `describe()` in `progress.js` is the single
  statement, fed by `avatarHTML()` in `progress-ui.js`. Photos are probed
  once per URL and mounted only after decoding; failures expire on a backoff
  (they used to be remembered for ever, which hid photos after a relay
  restart).
- **Seat leaving:** `tableSeatGone()` in `mp.js` — the one place a departure
  arrives, and where the 1v1 auto-win is decided.
- **Private deals:** `startDeal()` in `mp.js`. The relay reshuffles a pool
  with its own entropy, so not even the host learns who got what.
- **Wire contracts:** each game publishes its own field list on its lobby.
  `mp.js` prefers the published list over its internal mirror.
- **Relay:** `server/karti_server.py` — account routes under `/acct`
  (register, login, pull, push, gift, mail, claim, players), the room roster
  seat build, the private deal, the rate buckets.
  `server/karti_stats.py` — the leaderboard store.

## Testing
Harnesses live in the session scratchpad, never in the repo. There are
working examples there for: driving two real clients into a room, exercising
the account API, and measuring wallet movement. Ask for the path rather than
rewriting one.

Gates: `node --check` per file, and
`python3 server/karti_server.py --selftest` (279 checks) for anything
server-side.
