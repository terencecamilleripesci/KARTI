# KARTI online — running the relay, and what it is actually safe against

Online play is two phones running the **same deterministic engine in lockstep**, with a
tiny **relay** in the middle that only passes moves along. This document covers how to
run and publish that relay, and — honestly — what someone on the internet can and
cannot do to it.

```
  phone A                          the Pi                          phone B
  ───────                          ──────                          ───────
  https://terencecamilleripesci.github.io/KARTI/   (GitHub Pages, static files)
        │                                                              │
        │  wss://raspberrypi.silverside-tench.ts.net:8443/karti/ws     │
        └──────────────►  Tailscale Funnel (public, TLS)  ◄────────────┘
                                    │
                          http://127.0.0.1:8101/karti/ws
                                    │
                       server/karti_server.py  ── relays moves. No files.
                                                  No rules. No database.
```

---

## 1 · The pieces

| Piece | Where | What it does |
|---|---|---|
| The game | GitHub Pages, `https://terencecamilleripesci.github.io/KARTI/` | All the HTML/JS/art. Static. |
| The relay | `server/karti_server.py` on the Pi, `127.0.0.1:8101` | Pairs two players and passes JSON moves between them, and answers `/presence` with who is connected **and which rooms are open**. |
| The tunnel | Tailscale Funnel, `:8443` under `/karti` | Gives the relay a public HTTPS/WSS address without opening a router port. |
| The client | `js/mp.js` | Knows the address, handles the lobby, reconnects, checks the other player's moves, and draws both the room list and the who's-online panel. |

**The endpoint lives in exactly one place.** Top of `js/mp.js`:

```js
const RELAY_URL      = 'wss://raspberrypi.silverside-tench.ts.net:8443/karti/ws';
const RELAY_HEALTH   = 'https://raspberrypi.silverside-tench.ts.net:8443/karti/health';
const RELAY_PRESENCE = 'https://raspberrypi.silverside-tench.ts.net:8443/karti/presence';
```

### The room list — the way in

**Nobody reads a code out.** Opening *Multiplayer › Online* shows every room that is
currently waiting for an opponent: who opened it and how long they have been sat there.
Tap one and you are in the duel. Opening a room of your own is one tap on **Open a room**,
which puts you in everybody else's list within a few seconds and shows you a plain
"waiting for someone" state with an obvious way to cancel. With nothing open the screen
says *"No rooms open — open one and wait"*, with the button right there; it never looks
broken or blank.

The room code has not gone away, it has just stopped being the front door. It lives under
**Other ways in**, where it does the one thing a list cannot: reach *one particular
person* when several rooms are open. Under the same heading, **Open a private room** opens
a room that is **not published at all** — no entry in the list, no join handle anywhere,
only its code gets in.

### One poller, two screens

There is exactly one timer and one beacon socket in `js/mp.js`, and both stop completely
the moment you leave Home *and* Online:

* a **beacon** — one WebSocket that sends a display name (`{"t":"name"}`, taken from the
  account or guest name that already exists, so nothing extra is ever asked for) and then
  a keep-alive every 45 s. It is what puts *you* in everyone else's list. Hiding the tab
  stops the polling immediately and hands the socket back after 60 s; `pagehide` hands it
  back at once.
* a **poll** — `GET /presence`, every 12 s while Home is up and every 5 s while the Online
  screen is up (a stale room list feels dead), and **never faster than once every 4 s** no
  matter what asks for it — refresh button included. The same answer draws both the room
  list and the home panel; there is deliberately no second poller.

A room in the list is joined with one tap: the client sends `{"t":"joinid"}` with the
room's opaque public handle and the relay re-resolves it and seats you, so no room code is
typed, shown or even downloaded. **End-to-end that is: up to 3 s of server-side cache plus
up to 5 s of poll, so a new room appears on somebody else's screen in about 4 s typically
and 8 s at worst.**

If the relay cannot be reached, both the panel and the room list say exactly that, in red,
and explain the most likely cause — **Tailscale being on**, which stops a public https page
opening a connection to a private address. Neither ever renders that as an empty list.
Everything else in KARTI keeps working with no internet at all.

If the server ever moves, change those two lines and redeploy the Pages site.
(There is also a `?relay=wss://…` query parameter and a *Server settings* box in the
Online screen, both of which override the constant on that one device. Handy for
testing; it is remembered in `localStorage` under `karti.relay`.)

---

## 2 · Running it

### By hand, to try it

```bash
python3 /home/foxhound/webclients/karti-malta/server/karti_server.py --port 8101
curl http://127.0.0.1:8101/karti/health
# {"ok":true,"rooms":0,"clients":0,"maxRooms":128,"maxClients":64}
```

It binds **127.0.0.1 only**. That is deliberate: Tailscale is the one and only way in.
Passing `--host 0.0.0.0` prints a warning — don't.

Useful flags:

| Flag | Meaning |
|---|---|
| `--port 8101` | Listening port (default 8101). |
| `--selftest` | Runs 61 built-in checks — happy path, reconnect, presence, the room list, and every abuse case. Exits non-zero on failure. |
| `--log /path/file` | Append-only event log. Records event names, room codes and counters. **Never** records message contents. Off by default. |
| `--origin https://x` | Allow an extra browser origin (repeatable). |
| `--verbose` | HTTP oddities to stderr. |

### As a service

Write `/etc/systemd/system/karti-relay.service`:

```ini
[Unit]
Description=KARTI online relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=foxhound
Group=foxhound
WorkingDirectory=/home/foxhound/webclients/karti-malta
ExecStart=/usr/bin/python3 /home/foxhound/webclients/karti-malta/server/karti_server.py --host 127.0.0.1 --port 8101
Restart=on-failure
RestartSec=3

# --- hardening: this process needs nothing but a loopback socket ---
NoNewPrivileges=yes
CapabilityBoundingSet=
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=read-only
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectClock=yes
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
RestrictAddressFamilies=AF_INET AF_INET6
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
IPAddressAllow=localhost
IPAddressDeny=any
MemoryMax=256M
TasksMax=256

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now karti-relay
systemctl status karti-relay
curl http://127.0.0.1:8101/karti/health
```

Two notes on that unit:

* `IPAddressAllow`/`IPAddressDeny` need cgroup BPF. If systemd complains on this kernel,
  delete those two lines — binding to loopback already does the important half.
* If you use `--log`, add `ReadWritePaths=/var/log/karti` (and create that directory)
  because `ProtectSystem=strict` + `ProtectHome=read-only` make everything else read-only.
  That read-only filesystem is a feature: the relay has no business writing anywhere.

### Publishing it with Tailscale Funnel

```bash
sudo tailscale funnel --bg --https=8443 --set-path=/karti http://127.0.0.1:8101
```

Check and verify:

```bash
tailscale funnel status
curl https://raspberrypi.silverside-tench.ts.net:8443/karti/health
```

To take it down again:

```bash
sudo tailscale funnel --https=8443 --set-path=/karti off
```

Prerequisites, in case it refuses: HTTPS certificates must be enabled for the tailnet,
and the node needs the `funnel` attribute in the tailnet policy file. Funnel only allows
ports **443, 8443 and 10000** — 8443 is used here because 443 and others on this Pi are
already spoken for.

**About the path.** Tailscale forwards the full request path to the backend, so the
relay sees `/karti/ws`. The relay answers on **both** `/karti/ws` and `/ws` (same for
`/health`), so it works whether or not the prefix is stripped, and it works unchanged
when you run it locally for testing. Nothing depends on guessing that behaviour right.

---

## 3 · Testing it

**The server's own tests** (no browser, no network needed):

```bash
python3 server/karti_server.py --selftest
# SELFTEST: ALL PASS  (61 checks, 0 failed)
```

Those checks are not decorative — each abuse case is *performed* and the rejection is
asserted: a frame claiming to be 5 MiB, an honestly-oversized message, an oversized
message smuggled in as fragments, 14 kinds of malformed JSON, out-of-range duel
payloads, script tags in a display name, an outsider relaying into someone else's room,
a real player claiming to be in a different room, a 400-message burst, room-code
brute-forcing, the room caps, idle cleanup, path traversal, and a foreign `Origin`. The
presence block additionally proves that `/presence` leaks no IP, no seat token and no room
code, that a hostile display name is scrubbed and capped, that only a *waiting* player is
given a join handle and that the handle dies the moment their room fills, that the list is
capped however many people are on, that the answer is cached and rate limited, and that a
player disappears the instant their socket closes.

The **room-list block** proves, in the same run: that opening a room publishes it with a
name and a wait time, that the published room carries no room code and no seat token, that
tapping it seats you with nothing typed, that a full room and an abandoned room both drop
straight out of the list, that a **private** room appears nowhere and hands out no handle
(and that even its own handle is refused for `joinid`) while still being joinable by its
code, that an outsider cannot join a room they were never offered, that one connection can
only hold one room in the list at a time, and that the list stays capped while `open` keeps
telling the truth about how many rooms there really are.

**Two real browsers through the real transport** (what was used to verify this build).
Two *separate* browsers, not two tabs — two tabs in one browser cannot both be visible, and
the poller stops when the page is hidden. Serve the repo on `:8123`, run the relay on
`:8102`, and open both on
`http://127.0.0.1:8123/index.html?relay=ws://127.0.0.1:8102/karti/ws` at 390×844.
What was asserted, and passed, 21/21:

* A opens a room with one tap → **B sees it in the list ~0.5 s later without typing
  anything** → B taps it → both are in the same live duel → a move made on A is mirrored
  onto B → `KARTI_MP.checksum()` **identical on both devices** before and after the move.
* The room is out of the list the moment it fills, and out again the moment A cancels.
* A private room is in nobody's list, hands out no handle, and still joins by code.
* 20 rooms opened from plain sockets → the relay publishes 16, the client draws 12 and
  says "and 8 more open right now"; the count stays honest.
* An unreachable relay renders the red "cannot reach the server" box, never an empty list.

**Both directions of compatibility were also driven in real browsers** (7/7): today's live
`js/mp.js` against the new relay (creates rooms, panel unchanged, joins off the panel,
checksums agree), and the new `js/mp.js` against today's live relay (it derives a room list
from the player list, tapping still starts a duel, and asking an old relay for a *private*
room is reported honestly instead of pretended).

---

## 4 · The protocol

One JSON object per WebSocket text frame. Everything is capped at 16 KiB.

| Client sends | Server answers |
|---|---|
| `{"t":"create","private":false}` | `{"t":"created","code":"W2AZG","token":"…","host":true,"seq":0,"private":false}` |
| `{"t":"create","private":true}` | the same, with `"private":true` — the room is in **no** list and hands out **no** join handle; its code is the only way in. The flag is echoed back on purpose, so a client can tell a relay that understands it from an older one that ignored it |
| `{"t":"join","code":"W2AZG"}` | `{"t":"joined",…}` — and the host gets `{"t":"peer","state":"joined"}` |
| `{"t":"joinid","id":"…"}` | the same `joined` reply. `id` is the opaque public handle carried by each entry in the `/presence` room list, so tapping a room seats you without your ever being told its code. The relay re-resolves the handle itself and refuses it unless that room is still open, public and short of a player |
| `{"t":"name","n":"TERENCE"}` | `{"t":"named","n":"TERENCE"}` — the display name for the online list, scrubbed and capped at 16 characters, kept only for the life of the socket |
| `{"t":"rejoin","code":…,"token":…,"since":N}` | `{"t":"rejoined",…}` then every relay after `N` that it missed |
| `{"t":"relay","d":{…}}` | the other player gets `{"t":"relay","n":SEQ,"d":{…}}` |
| `{"t":"leave"}` | the other player gets `{"t":"peer","state":"left"}` |
| `{"t":"ping"}` | `{"t":"pong"}` |
|  | `{"t":"error","why":"…"}` — always one of a fixed set of strings |
|  | `{"t":"closed","why":"…"}` then the socket is closed |

Room codes are 5 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `O`, `0`,
`I` or `1`, so they can be read down the phone without an argument. 33,554,432
possibilities. In normal play **nobody ever sees one**: they are for private rooms and for
reaching one particular person.

`GET /presence` answers, in full:

```json
{"ok":true,"count":4,"idle":1,"waiting":3,"playing":0,
 "shown":4,"max":24,"every":12,
 "players":[{"n":"TERENCE","s":"waiting","id":"gu1kgetrHl0"}, …],
 "rooms":[{"id":"gu1kgetrHl0","n":"TERENCE","w":37}, …],
 "open":3,"roomsMax":16}
```

`rooms` is the room list: one entry per open, **public**, still-empty room — the opaque
per-socket handle, the opener's scrubbed display name, and `w`, how many seconds it has
waited. `open` is how many are *really* open, which can exceed `rooms.length`. A private
room contributes to `waiting` and to nothing else: no `rooms` entry, and its host's
`players` entry carries no `id`.

**Losing signal is not a forfeit.** When a socket dies the seat is held for 60 seconds
(the other player is told `peer/dropped`), the relay keeps buffering moves, and the
phone that dropped comes back with `rejoin` + its private seat token and is sent
everything it missed. `js/mp.js` retries 8 times over about 37 seconds.

---

## 5 · Security model

Assume the endpoint is public knowledge. `*.ts.net` names appear in Certificate
Transparency logs, so "nobody knows the URL" is not a control and is not treated as one.

### What an attacker on the internet CAN do

* **Find it and talk to it.** `GET /karti/health` returns `{"ok":true,"rooms":N,"clients":M}`
  and the caps. `GET /karti/presence` returns counts, up to 24 player-chosen display names
  each with one of three words — `idle`, `waiting`, `playing` — and the room list: up to 16
  open public rooms as `{id, name, seconds waited}`. That is the whole disclosure.
  **No IP address, no seat token, no room code, no room contents, nothing whatsoever about
  a private room.** Names are put through the same filter as every other name on the wire
  (control characters and `<>&"'\`` removed, 16 characters kept) because they land on a page
  on the public internet. The answer is cached for 3 seconds and rate limited per caller —
  the caller is keyed by a truncated SHA-256 of the peer address, so not even the rate
  limiter keeps an IP. The `id` is an opaque per-socket handle published for exactly one
  situation: that player is sitting alone in a room anybody is welcome to join. It belongs
  to one socket, it is withdrawn the moment the room fills, and it resolves to nothing for
  a private room, for an idle player, or for anybody else. Joining is authorised entirely
  server-side — the client never names the room it is entering, so there is nothing there
  to forge.
* **Fill the room list with junk.** This is the honest weak point of the room list and it
  should be said plainly. A connection may hold **one** room at a time and may only ever
  open 5, so a fake room costs a whole socket; with 64 sockets an attacker can hold ~63
  rooms out of the 128 cap. Only 16 are ever published, and when more than 16 are open the
  relay publishes a **random sample** rather than the head of a sorted list — so an
  attacker cannot choose *which* real room falls off, but with 63 fakes against 2 real
  rooms they will still take most of the slots most of the time. What blunts it: the real
  count (`open`) is published and the client shows it, so a list full of strangers with a
  suspicious count is visible for what it is; **join-by-code is completely unaffected**, so
  a specific friend can always be reached; a private room cannot be crowded out because it
  was never in the list; every fake room expires (30 min idle, and instantly when the
  socket drops); and `systemctl restart karti-relay` clears the lot. There is no per-IP
  limit and there cannot be a useful one — behind Funnel every connection arrives from
  `127.0.0.1`.
* **Open a WebSocket.** The `Origin` allow-list (`https://terencecamilleripesci.github.io`
  plus loopback) only stops *browsers* on other sites; a script that sets no `Origin`
  header, or forges one, gets in. That is inherent to WebSockets and is why the origin
  check is treated as defence in depth, not as authentication.
* **Deny service, within limits.** They can hold sockets and rooms up to the caps
  (64 sockets, 128 rooms) and stop your friends getting a room while they do.
  **This is the honest weak point**: behind Funnel every connection arrives from
  `127.0.0.1`, so there is no usable per-IP limit. What blunts it is that everything
  expires — idle rooms are swept after 30 minutes, a dropped seat after 60 seconds,
  one connection may create at most 5 rooms ever, and a flooding connection is cut.
  Restarting the service clears everything instantly (`systemctl restart karti-relay`).
* **Guess room codes.** 20 wrong codes on one connection and that connection is cut, so
  they must pay for a new TLS handshake every 20 guesses against 33.5 million codes. If
  they did land on a room that still has a free seat, they would simply become the
  opponent — they cannot take a seat that is already occupied, because that needs the
  96-bit seat token, which only ever goes to the player who took the seat.
* **Cheat inside a duel they are legitimately in.** See section 6.

### What an attacker CANNOT do

* **Read or write a single file.** The relay is not built on `SimpleHTTPRequestHandler`
  and contains no filesystem code at all — no `open()` outside the optional log, no
  `os.path`, no directory listing, no static route. `/`, `/index.html`, `/js/game.js`,
  `/.git/config`, `/../../etc/passwd` and `/%2e%2e/…` all return the same 404 JSON, and
  the self-test proves it every run.
* **Run anything.** No `eval`, no `exec`, no `pickle`, no `subprocess`, no shell, no
  `os.system`, no imports driven by input. Stdlib only, nothing from pip.
* **Reach anything else on the Pi.** The process binds loopback only; Funnel publishes
  one port scoped to one path. The systemd unit above additionally denies it a writable
  filesystem, extra capabilities, and non-loopback network.
* **Exhaust memory.** Every structure is bounded, and the ceiling is arithmetic, not
  hope: ≤128 rooms × (96 buffered messages / 192 KiB) ≈ 24 MiB of room state, plus
  ≤64 sockets × 16 KiB of message buffer. A frame that merely *claims* a huge length is
  rejected from its 10-byte header, before a single byte of the body is read. The unit
  file caps the process at 256 MB regardless.
* **Spawn unlimited threads.** Accepted sockets are capped at 96 before a handler thread
  is created; over that, the connection is dropped at accept time.
* **Get anything unvalidated into the other player's browser.** Every relayed payload is
  taken apart field by field and **rebuilt from scratch** by the server before it is
  forwarded, against a whitelist of four message kinds, with every integer range-checked
  and every card id matched against `^[A-Za-z0-9_-]{1,24}$`. Display names have control
  characters and `<>&"'\`` stripped out. Anything that does not fit is refused with a
  fixed error string to the sender and never reaches the peer.
* **See another room's traffic.** Membership is by seat, not by anything the client
  claims. A `relay` may carry a `code`, and if it does not match the sender's actual room
  the message is refused.
* **Get into a room they were not offered.** `joinid` is resolved server-side from the
  handle to the room; a handle that was never published (an idle player, a private room),
  one that has gone stale, one belonging to a room that has since filled, and a made-up
  one are all refused with the same fixed string, and nobody in that room is disturbed.
  The client never sends a room identity of its own, so there is nothing to spoof — and
  the alternative, guessing the 5-character code, costs a new TLS handshake every 20 tries.
* **Learn anything from an error message.** Error strings are a fixed set of constants.
  Nothing an attacker sends is ever echoed back to them or to anyone else.
* **Persist anything.** All state is in RAM. A restart wipes every room. Nothing is
  written to disk unless `--log` is on, and that log contains no user content.

### Caps, in one place

| | |
|---|---|
| Sockets accepted at once | 96 |
| Live WebSockets | 64 |
| Rooms | 128 |
| Players per room | 2 |
| Message size | 16 KiB |
| Message rate | 25/s sustained, 50 burst |
| Byte rate | 96 KiB/s sustained, 256 KiB burst |
| Rooms one connection may create | 5 |
| Wrong room codes before disconnect | 20 |
| Protocol errors before disconnect | 30 |
| Replay buffer per room | 96 messages / 192 KiB |
| Display-name changes per connection | 8 |
| Display name length | 16 characters |
| Names published by `/presence` | 24 |
| Rooms published by `/presence` | 16 (a random sample once more are open) |
| Rooms one connection may hold at once | 1 |
| `/presence` answer cache | 3 s |
| `/presence` rate per caller | 1/s sustained, 8 burst (then 429) |
| Dropped-seat grace | 60 s |
| Idle room timeout | 30 min |
| Idle socket timeout | 120 s |
| Handshake timeout | 15 s |

---

## 6 · Cheating: what is and is not defended

This deserves to be stated plainly rather than buried.

**The relay does not referee.** It validates the *shape* of a move — that `kind` is one
of eight known actions, that `hi` and `zi` are small non-negative integers, that a deck
is at most 60 cards. It has no idea what is on the board and cannot tell a legal summon
from an illegal one. It was never going to; making it authoritative means porting the
whole engine to Python, which is a different (much bigger) product.

**The checksum catches desync, not cheating.** A checksum of the pre-move board rides
with every action, and if the two boards disagree the duel stops with an honest message
instead of drifting. But if a cheating client sends an *illegal* move, both engines apply
the *same* illegal move, both boards change the *same* way, and the checksums still
match. The checksum would not have caught the empty-zone tribute exploit. Saying
otherwise would be wrong.

**So the actual defence is client-side re-validation**, in `illegalRemote()` in
`js/mp.js`. Every incoming move is re-checked against *our own* copy of the board before
it is applied, using the engine's own legality helpers (`summonInfo`, `canAttack`,
`legalAttackTargets`, `canActivateSpell`, `spellTargets`, `noBattleYet`) plus the checks
the engine does not do. If it does not pass, the duel ends immediately with
*"Your opponent sent a tribute from an EMPTY zone, which the rules do not allow"* — a
refusal, not a silent accept, and nothing is awarded to either side.

What that catches:

* tributes pointing at empty zones, duplicated tributes, or the wrong number of them
  (the confirmed exploit — this is tested end-to-end through the real relay);
* moves out of turn or in the wrong phase;
* playing a card that is not in their hand, or is the wrong type for the action;
* a second normal summon in one turn;
* attacking with a monster that cannot attack, or at a target the rules forbid
  (including ignoring a taunt);
* a spell with no legal target, or aimed at something it cannot touch;
* flipping a monster that was summoned this turn or has already attacked;
* a battle phase on the opening turn.

What it does **not** catch, and cannot:

* **Information.** The host deals *both* decks, so each client holds the opponent's hand
  and the exact deck order in memory. Anyone who opens devtools can read them. No amount
  of move validation fixes that; it needs either an authoritative server or a
  commit–reveal shuffle.
* **A stacked deal.** The host generates the shuffle. A malicious host can arrange their
  own opening hand. Same fix, same cost.
* **Stalling or rage-quitting.** Someone can just stop sending moves. After 60 seconds
  of silence the seat expires and the duel ends with no result.
* **Bugs in the engine's own rules.** If the engine believes a move is legal, both sides
  believe it. The validator re-uses the engine's checkers, so it inherits their blind
  spots.

**Verdict:** proportionate for a private group of friends, which is what this is for.
It is not cheat-proof, and nothing in the UI claims it is.

---

## 7 · Known limitations

* Exactly two players per room. No spectators, no matchmaking, no ranking. The room list
  is a list, not a queue: first tap wins, and the other person is told *"that room has
  gone"* rather than being quietly dropped.
* A new room takes about 4 s (8 s worst case) to reach somebody else's screen — 3 s of
  server-side cache plus a 5 s poll. Going faster means either a socket push or lowering
  the polling floor, and the floor is what keeps a menu left open from costing anything.
* Anybody online can join any public room; that is the entire point of the list, and the
  answer for "I only want to play *him*" is **Open a private room** and hand over the code.
* All state is in RAM. Restarting the relay ends every duel in progress.
* No accounts and no authentication: whoever taps the room first, or has the code and a
  free seat, is the opponent.
* Reconnect covers about 37 seconds of client retries against a 60-second server grace,
  and replays at most the last 96 messages. A phone that is off for a minute has lost
  the duel.
* Reloading the page ends the duel. The seat token lives in memory, not `localStorage`,
  and the board itself is not persisted — the reconnect is for a flaky *connection*,
  not for a killed tab.
* Both players must be online at the same time. There is no correspondence/async mode.
* The relay is single-process Python with a thread per connection. Fine for a handful of
  friends on a Pi; it is not built for a hundred simultaneous duels.
* After deploying a change, bump the service worker cache version in `sw.js` or phones
  will keep serving the old `mp.js`.
