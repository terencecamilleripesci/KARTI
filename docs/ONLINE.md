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
| The relay | `server/karti_server.py` on the Pi, `127.0.0.1:8101` | Pairs two players by room code and passes JSON moves between them. |
| The tunnel | Tailscale Funnel, `:8443` under `/karti` | Gives the relay a public HTTPS/WSS address without opening a router port. |
| The client | `js/mp.js` | Knows the address, handles the lobby, reconnects, checks the other player's moves. |

**The endpoint lives in exactly one place.** Top of `js/mp.js`:

```js
const RELAY_URL    = 'wss://raspberrypi.silverside-tench.ts.net:8443/karti/ws';
const RELAY_HEALTH = 'https://raspberrypi.silverside-tench.ts.net:8443/karti/health';
```

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
| `--selftest` | Runs 34 built-in checks — happy path, reconnect, and every abuse case. Exits non-zero on failure. |
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
# SELFTEST: ALL PASS  (34 checks, 0 failed)
```

Those checks are not decorative — each abuse case is *performed* and the rejection is
asserted: a frame claiming to be 5 MiB, an honestly-oversized message, an oversized
message smuggled in as fragments, 14 kinds of malformed JSON, out-of-range duel
payloads, script tags in a display name, an outsider relaying into someone else's room,
a real player claiming to be in a different room, a 400-message burst, room-code
brute-forcing, the room caps, idle cleanup, path traversal, and a foreign `Origin`.

**Two real browsers through the real transport** (what was used to verify this build):
serve the repo on `:8000`, run the relay on `:8101`, then open two browser contexts on
`http://127.0.0.1:8000/?relay=ws://127.0.0.1:8101/karti/ws`, create a room in one, join
from the other, and play a duel out. The acceptance test is that
`KARTI_MP.checksum()` is **identical on both devices when the duel ends**.

---

## 4 · The protocol

One JSON object per WebSocket text frame. Everything is capped at 16 KiB.

| Client sends | Server answers |
|---|---|
| `{"t":"create"}` | `{"t":"created","code":"W2AZG","token":"…","host":true,"seq":0}` |
| `{"t":"join","code":"W2AZG"}` | `{"t":"joined",…}` — and the host gets `{"t":"peer","state":"joined"}` |
| `{"t":"rejoin","code":…,"token":…,"since":N}` | `{"t":"rejoined",…}` then every relay after `N` that it missed |
| `{"t":"relay","d":{…}}` | the other player gets `{"t":"relay","n":SEQ,"d":{…}}` |
| `{"t":"leave"}` | the other player gets `{"t":"peer","state":"left"}` |
| `{"t":"ping"}` | `{"t":"pong"}` |
|  | `{"t":"error","why":"…"}` — always one of a fixed set of strings |
|  | `{"t":"closed","why":"…"}` then the socket is closed |

Room codes are 5 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `O`, `0`,
`I` or `1`, so they can be read down the phone without an argument. 33,554,432
possibilities.

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
  and the caps. That is the entire information disclosure: counts, no codes, no names.
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

* Exactly two players per room. No spectators, no lobby list, no matchmaking, no ranking.
* All state is in RAM. Restarting the relay ends every duel in progress.
* No accounts and no authentication: whoever has the code and a free seat is the opponent.
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
