# KARTI online — running the relay, and what it is actually safe against

Online play is two phones running the **same deterministic engine in lockstep**, with a
tiny **relay** in the middle that only passes moves along. The same little service also
holds **KARTI accounts and one save file each**, which is what lets a player log in on a
second phone and find their collection. This document covers how to run and publish it,
and — honestly — what someone on the internet can and cannot do to it.

```
  phone A                          the Pi                          phone B
  ───────                          ──────                          ───────
  https://terencecamilleripesci.github.io/KARTI/   (GitHub Pages, static files)
        │                                                              │
        │  wss://…:8443/karti/ws        duels                          │
        │  https://…:8443/karti/acct/*  accounts + saves               │
        └──────────────►  Tailscale Funnel (public, TLS)  ◄────────────┘
                                    │
                          http://127.0.0.1:8101/karti/…
                                    │
                       server/karti_server.py
                         ├── relays moves.  No rules, all in RAM.
                         └── accounts + saves in ONE SQLite file,
                             /var/lib/karti/accounts.db.  Nothing else
                             on this machine is ever written to.
```

**The game never stops working without any of this.** No account, no signal, Pi switched
off — KARTI plays exactly as it always has. Sync is an addition, never a dependency.

---

## 1 · The pieces

| Piece | Where | What it does |
|---|---|---|
| The game | GitHub Pages, `https://terencecamilleripesci.github.io/KARTI/` | All the HTML/JS/art. Static. |
| The relay | `server/karti_server.py` on the Pi, `127.0.0.1:8101` | Pairs two players and passes JSON moves between them, and answers `/presence` with who is connected **and which rooms are open**. |
| The accounts | the same process, `/var/lib/karti/accounts.db` | KARTI accounts and one save file each, so a player can log in on a second phone and find their collection. **The only thing here that writes to disk** — see section 4. |
| The tunnel | Tailscale Funnel, `:8443` under `/karti` | Gives the relay a public HTTPS/WSS address without opening a router port. |
| The client | `js/mp.js` | Knows the address, handles the lobby, reconnects, checks the other player's moves, and draws both the room list and the who's-online panel. |
| The sync client | `js/sync.js` | Sign up, log in, upload and download the save, and the "which of these two games do you want to keep?" conversation. Self-contained; the game plays perfectly without it. |

**The endpoint lives in exactly one place.** Top of `js/mp.js`:

```js
const RELAY_URL      = 'wss://raspberrypi.silverside-tench.ts.net:8443/karti/ws';
const RELAY_HEALTH   = 'https://raspberrypi.silverside-tench.ts.net:8443/karti/health';
const RELAY_PRESENCE = 'https://raspberrypi.silverside-tench.ts.net:8443/karti/presence';
```

…and its twin at the top of `js/sync.js`, which must stay in step:

```js
var ACCT_URL = 'https://raspberrypi.silverside-tench.ts.net:8443/karti/acct';
```

`js/sync.js` asks `KARTI_MP.defaultURL()` first and only falls back to that constant, so
`?relay=…` and the *Server settings* box move duels and cloud saves together.

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
| `--selftest` | Runs 118 built-in checks — happy path, reconnect, presence, the room list, accounts, cross-device saves, the conflict path, and every abuse case. Exits non-zero on failure. |
| `--accounts /path/db` | SQLite file for accounts and saves (default `/var/lib/karti/accounts.db`). If it cannot be opened, accounts switch themselves off and everything else carries on. |
| `--no-accounts` | Pure relay: no accounts, no saves, no disk at all — exactly the process as it was before section 4 existed. |
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

# --- the ONE writable path: accounts + cross-device saves (see section 4).
#     Delete these three lines, or add --no-accounts, to go back to a relay
#     that never touches the disk. Nothing else breaks either way.
StateDirectory=karti
StateDirectoryMode=0700
ReadWritePaths=/var/lib/karti

# --- hardening: apart from that one directory, nothing but a loopback socket ---
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
  Keep that read-only filesystem: apart from `/var/lib/karti`, the relay has no business
  writing anywhere.
* `StateDirectory=karti` is what makes `/var/lib/karti` exist, be owned by `foxhound` and
  be writable despite `ProtectSystem=strict`. Without it (and without
  `ReadWritePaths=/var/lib/karti`) the process starts perfectly happily, prints one
  warning, and serves `"accounts":false` — duels are unaffected. See section 4.

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
# SELFTEST: ALL PASS  (118 checks, 0 failed)
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

### The accounts block — 57 of the 118 checks

Everything in section 4 is asserted by performing it, in the same run, against a throwaway
database: register, log in, a second token, a byte-for-byte save round trip, and — the
point of the feature — **a second session logging in and finding the same save**. Then the
abuse: a duplicate username, a script tag in a username, a 17-character username, a
too-short password, a made-up token, no token, an empty token, an expired session, one
account's token pointed at another account's save, a 200 KB save, an oversized *body*
refused on `Content-Length` before a byte is read, a save that is not JSON, is an array, is
a bare number, is nested 200 deep, a login flood, a registration flood, password guessing
against one account, the account cap, the total-storage cap, and a foreign `Origin` on all
five routes. It also proves that the wrong password and an unknown user give **byte-
identical** answers, that the database holds no plaintext password and no live token, that
every stored credential is a slow KDF digest with its own random salt, that the file is
`0600`, that `/health` and `/presence` name nobody, and that with the store unavailable the
routes answer 503 while the relay carries on.

The **conflict block** proves the promise in section 4: a stale push is refused, the
refusal carries the server's copy, **the server's save is completely unchanged afterwards**,
choosing a side is an ordinary in-order write, and the blob that was replaced is still one
`pull {prev:true}` away.

### Two separate browsers, one account (what was used to verify this build)

Two *browsers*, not two tabs, each with its own profile directory and no shared storage.
Serve the repo on `:8188`, run a test relay on `:8102`, and open both on
`http://127.0.0.1:8188/index.html?relay=ws://127.0.0.1:8102/karti/ws`. Asserted and passed,
**26/26**:

* Browser A seeds a recognisable collection (5 cards, a named deck, 4321 coins, 77 dust,
  4 story stages, 13W/4L), registers, and pushes → version 1.
* Browser B — a **separate browser**, verified to start with nothing in `localStorage` —
  logs in as the same user and **every one of those fields arrives unchanged**: cards,
  decks, active deck, story progress, coins, dust and win record. No question was asked,
  because a clean device has nothing to lose.
* The conflict path, driven for real: B plays on and pushes (v2); A, which never saw that,
  pushes and is **refused**; the player is shown both summaries (A's 1111 coins vs the
  cloud's 9999); while undecided the server still holds B's save **and** A's local save is
  untouched; A chooses "keep this device" (v3); **B's overwritten save is still pulled back
  from the server**; B then chooses the cloud, its own copy is backed up locally, and
  `restoreBackup()` puts it back exactly.
* From the page itself: a made-up token → 401, no token → 401, a 200 KB save → 413.

**With the relay switched off entirely** (12/12): the game boots, `js/sync.js` loads and
gets in nobody's way, a guest picks a starter deck and plays a duel through a turn, saving
works, `notifySaved()` is a silent no-op, `reachable()` correctly says no, logging in and
registering return a plain sentence instead of throwing, the offline game is untouched by
the failed attempts, the Cloud save panel still opens and explains where the account lives,
and **no script error occurs anywhere**.

---

## 4 · Accounts and cloud saves — logging in on a second phone

Until now a KARTI account was a row in one browser's `localStorage`. Change phone, lose
everything. This section is the fix: **a real account on the Pi, and one save file per
account**, so you can log in somewhere else and your cards, decks, coins and story
progress are already there.

### Why it is on the Pi and not on GitHub

The obvious idea is "put the saves in the GitHub repo". It cannot be done safely, and it
is worth writing down why so nobody tries it again later:

* Writing to GitHub needs a token.
* The game is a **static public page**. Anything the page can use, a visitor can read out
  of it with two clicks of the developer tools.
* A GitHub token is not scoped to "one file in one repo" in any way that helps — a
  classic token with `repo` scope can write to **every repository on the account**.

So the token would be public and it would grant write access to everything. The Pi already
hosts the relay, already has a public HTTPS address through Funnel, and can keep a secret.
That is where it goes.

### What the player sees

* **Nothing, unless they want it.** No login wall, no prompt. `Play now` still starts a
  guest game with no account of any kind, and everything below still works with the Pi
  switched off and the phone in flight mode.
* A **Cloud save** panel (`js/sync.js`, `KARTI_SYNC.openPanel()`) with two buttons —
  create an account, or log in — and copy that says, in plain words, that the account
  lives on Terence's Raspberry Pi, that if it is off then logging in and syncing will not
  work, and that **the game itself keeps working with no internet at all**.
* Once signed in, the save uploads itself a few seconds after any change (debounced 6 s,
  never more often than once every 20 s, and skipped entirely if nothing actually changed).

### The one thing this must never do: lose a collection

Two phones both play offline. Both come back holding progress the other has never seen.
There is no correct automatic answer, so **nothing automatic is attempted**:

1. Every save on the server carries a **version number** that only ever goes up.
2. A push must state the version it is based on. If that is not the version the server is
   holding, the push is **refused with 409** — nothing is written — and the server's copy
   comes back with the refusal.
3. The client then shows the player **both**, summarised in words they understand
   ("14 different cards, 3 decks, 4321 coins, 4 story stages cleared, 13W/4L") and asks
   which to keep. "Decide later" is a real option; the game carries on offline in the
   meantime.
4. Whichever they pick, **the other one is kept**. The server keeps the blob it replaced
   (`prev_*`, one `pull {prev:true}` away). The client takes a local backup before it ever
   overwrites the local save, and the panel has a *"Put back this device's previous game"*
   button.

Nothing is ever merged. Merging two collections silently is how you end up with duplicated
legendaries and a player who cannot tell what happened.

### Passwords

* The client sends `SHA-256("karti-acct-v1|" + lowercased username + "|" + password)`, so
  the plaintext password never reaches the Pi at all — players reuse passwords and that is
  not Terence's problem to hold.
* **The server does not trust that for a second.** It treats whatever arrives as an opaque
  secret string and hashes it again with a slow, salted, memory-hard KDF —
  `hashlib.scrypt` (n=2^14, r=8, p=1: 16 MiB, ~50 ms on this Pi), falling back to
  `hashlib.pbkdf2_hmac('sha256', …, 200 000)` if OpenSSL has no scrypt. Per-user 16-byte
  random salt from `secrets.token_bytes`. Comparison with `hmac.compare_digest`.
* At most **two** KDFs run at once, server-wide, behind a semaphore. That is the memory
  guard: 2 × 16 MiB and no more, however many people are logging in at the same time,
  which matters under the unit's `MemoryMax=256M`.
* An unknown username **also** burns a KDF, so "no such user" and "wrong password" do not
  differ by 50 ms of wall clock — and they return byte-identical JSON.
* Session tokens are `secrets.token_urlsafe(32)`. Only a **SHA-256 of the token** is ever
  on disk, so a stolen database file hands over no live session. Tokens expire 30 days
  after they are issued and 14 days after they were last used, and one account keeps at
  most 8 live sessions.

### Storage, and the systemd change you must make

Everything lives in **one SQLite file** (stdlib `sqlite3`, WAL, `chmod 0600`), default
`/var/lib/karti/accounts.db`.

**The unit as it stands cannot write anywhere.** `ProtectSystem=strict` plus
`ProtectHome=read-only` is deliberate and should stay. Add exactly this to the `[Service]`
section of `/etc/systemd/system/karti-relay.service`:

```ini
StateDirectory=karti
StateDirectoryMode=0700
ReadWritePaths=/var/lib/karti
```

`StateDirectory=karti` creates `/var/lib/karti` owned by `User=foxhound` on every start and
makes it writable; `ReadWritePaths=` is the belt to that braces and is what you would use
on its own if you would rather create the directory by hand:

```bash
sudo install -d -o foxhound -g foxhound -m 0700 /var/lib/karti
sudo systemctl daemon-reload && sudo systemctl restart karti-relay
```

**If you skip this, nothing breaks.** The relay prints a warning, `/health` reports
`"accounts":false`, the five account routes answer `503 {"why":"Accounts are switched off
on this server."}`, and duels and offline play are completely unaffected. That path is
tested. `--no-accounts` makes it explicit.

### The routes

All `POST`, JSON in and JSON out, and — like everything else here — served both at
`/karti/acct/<x>` and `/acct/<x>`.

| Route | Body | Answer |
|---|---|---|
| `/karti/acct/register` | `{u, pw}` | `201 {tok, exp, u, name, ver:0, save:null}` · `409` name taken · `507` server full |
| `/karti/acct/login` | `{u, pw}` | `200 {tok, exp, u, name, ver, at, save}` · `401` wrong username **or** password (same answer for both) |
| `/karti/acct/logout` | `{tok}` | `200 {ok:true}` — always, even for a token that never existed |
| `/karti/acct/pull` | `{tok}` or `{tok, prev:true}` | `200 {ver, at, save, hasPrev}` · `401` bad or expired token |
| `/karti/acct/push` | `{tok, base, save, force?, device?}` | `200 {ver, at, bytes}` · **`409 {code:"stale", ver, at, save}`** · `413` too big · `507` no room left |

`register` and `login` are the only unauthenticated routes. The token may be sent as
`{"tok": …}` in the body or as `Authorization: Bearer …`. `GET` on any of them is still
the same plain 404 as before, and `POST /karti/health` is still `405` — nothing else in
the process grew a POST.

### The client — `js/sync.js`

Self-contained. It has its own SHA-256, its own overlay UI with inline styles (no class
from `css/extra.css`, no helper from `js/game.js`), and it talks to the game through
exactly two things: the `localStorage` keys `karti_active` and `karti_save_<profile>`, and
`window.KARTI.load()`. Both are behind `KARTI_SYNC.adapter` so they can be repointed
without editing the file. It follows whatever relay `js/mp.js` is pointed at, so
`?relay=…` and the *Server settings* box move duels and saves together.

Every network call is wrapped: an unreachable Pi, a captive portal, a flight-mode phone
and a CORS refusal all come back as a status string. **Nothing in `js/sync.js` is ever on
the critical path of playing KARTI.**

---

## 5 · The protocol

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

## 6 · Security model

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
* **Cheat inside a duel they are legitimately in.** See section 7.
* **Create an account, and store up to 128 KiB in it.** That is the feature working. What
  it costs them: registration is token-bucketed at one per five minutes per caller with a
  burst of 3, *and* globally at 20 per hour however many callers there are, the server
  refuses account 251 with `507`, and it refuses any push that would take total stored save
  data past 24 MiB. Worst case on disk is therefore ~24 MiB plus the same again for the
  "previous save" column, not "the Pi's disk".
* **Try passwords.** 1 login per 10 s per caller with a burst of 5; and after 10 wrong
  passwords **that account stops answering for 15 minutes** whether the next guess is right
  or not. Each attempt costs the server ~50 ms of scrypt, and at most two of those run at
  once, so a guessing flood queues rather than eating RAM. They cannot tell a wrong password
  from a username that does not exist: the two answers are byte-identical and both burn a
  KDF, so they do not differ in timing either.
* **Store junk in their own save.** 128 KiB of well-formed JSON of their choosing. It is
  never parsed for meaning, never merged, never executed, and it is only ever handed back
  to the account that stored it.
* **Annoy one player they already have the password of.** Nothing here defends a player
  who gives their password away. The blast radius is that one account's save, and even
  then the previous save is still on the server.

### What an attacker CANNOT do

* **Read or write a single file of their choosing.** The relay is not built on
  `SimpleHTTPRequestHandler` and has no filesystem code driven by input — no directory
  listing, no static route, and the only paths it ever opens are the two named on the
  command line (`--accounts`, `--log`). `/`, `/index.html`, `/js/game.js`, `/.git/config`,
  `/../../etc/passwd` and `/%2e%2e/…` all return the same 404 JSON, and the self-test
  proves it every run.
* **Run anything.** No `eval`, no `exec`, no `pickle`, no `subprocess`, no shell, no
  `os.system`, no imports driven by input. Stdlib only, nothing from pip. Every SQL
  statement is a fixed string with bound parameters; nothing a caller sends is ever
  concatenated into one.
* **Reach anything else on the Pi.** The process binds loopback only; Funnel publishes
  one port scoped to one path. The systemd unit above denies it extra capabilities,
  non-loopback network, and every writable path except `/var/lib/karti`.
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
* **Persist anything except their own account's save.** Every duel and every room is in
  RAM and a restart wipes the lot. The *only* disk state is `/var/lib/karti/accounts.db`
  (and the optional `--log`, which contains no user content). Nothing a caller sends
  chooses a path, a filename or a directory — the database path comes from the command
  line and nowhere else.
* **Read anybody else's save.** Every route except `register` and `login` needs a session
  token, and the token resolves server-side to exactly one account. There is no route that
  takes a username and returns a save, no route that lists accounts, and no route that
  returns anything about an account other than the caller's own. `/health` says only
  whether accounts are switched on; `/presence` says nothing about them at all.
* **Get a password or a hash back out.** No response ever contains the credential, the
  salt, the digest or another account's token — the self-test asserts it on the register
  answer specifically. The plaintext password never reaches the Pi in the first place (the
  client pre-hashes), and what is stored is a scrypt digest over a per-user random salt.
  Reversing that is the point of using a slow memory-hard KDF.
* **Use a stolen database file to log in.** Sessions are stored as a SHA-256 of the token,
  so the file contains no usable token; and the password column is a KDF digest.
* **Make the server parse something dangerous.** The request body is refused on
  `Content-Length` above 144 KiB before a byte is read, refused unless the `Content-Type`
  is `application/json`, and depth-scanned to 32 levels **before** `json.loads` is allowed
  near it — so nobody chooses our recursion depth. The save blob gets the same treatment
  again, must be a JSON *object*, and is then stored as text: this process never looks
  inside a save, so there is nothing inside a save for it to be fooled by. No `eval`, no
  `pickle`, no dynamic import, anywhere.
* **CSRF a logged-in player.** There are no cookies. The session token travels in the JSON
  body (or an `Authorization` header) and a page on another origin cannot read it. On top
  of that, every account route enforces the same `Origin` allow-list as everything else and
  returns 403 with no CORS header to anybody else.
* **Fill the disk.** 250 accounts, 128 KiB each, plus one previous save each: ~64 MiB
  ceiling, with a hard global cap of 24 MiB of *current* saves enforced on every push.

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
| **Accounts on the server** | **250** (then `507`) |
| One save blob | 128 KiB (then `413`) |
| All saves together | 24 MiB (then `507`) |
| One HTTP request body | 144 KiB, refused on `Content-Length` |
| JSON nesting, request and save | 32 levels |
| Username | 1–16 of `A-Z a-z 0-9 _ . -` and a space |
| Registrations per caller | 1 per 5 min, burst 3 |
| Registrations, whole server | 20 per hour, burst 20 |
| Logins per caller | 1 per 10 s, burst 5 |
| Wrong passwords before an account is locked | 10, then 15 min |
| Authenticated calls per caller | 1/s sustained, 12 burst |
| Password KDF | scrypt n=2¹⁴ r=8 p=1 (16 MiB, ~50 ms), pbkdf2-sha256 ×200 000 if no scrypt |
| KDFs running at once, whole server | 2 (then `503`, so RAM stays bounded) |
| Session token | `secrets.token_urlsafe(32)`; 30 days from issue, 14 days idle |
| Live sessions per account | 8 (oldest dropped) |

---

## 7 · Cheating: what is and is not defended

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

## 8 · Known limitations

* Exactly two players per room. No spectators, no matchmaking, no ranking. The room list
  is a list, not a queue: first tap wins, and the other person is told *"that room has
  gone"* rather than being quietly dropped.
* A new room takes about 4 s (8 s worst case) to reach somebody else's screen — 3 s of
  server-side cache plus a 5 s poll. Going faster means either a socket push or lowering
  the polling floor, and the floor is what keeps a menu left open from costing anything.
* Anybody online can join any public room; that is the entire point of the list, and the
  answer for "I only want to play *him*" is **Open a private room** and hand over the code.
* All *duel* state is in RAM. Restarting the relay ends every duel in progress. Accounts
  and saves survive a restart; live sessions do too, because they are in the same file.
* **Duels are still unauthenticated.** A KARTI account authenticates you to your *save*,
  not to a room. Whoever taps the room first, or has the code and a free seat, is the
  opponent, exactly as before. Wiring accounts into matchmaking is a separate job.
* **If the Pi is off, there is no logging in and no syncing.** That is the deal with
  self-hosting and the UI says so in as many words. Local play, story mode, packs, deck
  building and pass-and-play are all completely unaffected — the game is offline-first and
  stays that way.
* **There is no password reset.** Nobody has an email address, there is no mail server, and
  a "reset" route on a public endpoint is a way in, not a feature. A forgotten password
  means a new account; the old save is still in the database and Terence can hand it back
  by hand. Say this out loud to players before they choose a password.
* **One save per account, and it is the whole save.** Sync replaces a file; it does not
  merge two collections. That is deliberate (see section 4) but it does mean a player with
  two phones has to answer a question now and then.
* **A cloud account and a local profile are not the same thing.** The local profile is
  still the row in `localStorage` that `js/game.js` has always used; the cloud account is
  what backs it up. Signing out of cloud save leaves the local profile exactly as it was.
* Usernames on the server are narrower than local ones: no apostrophe, so a local profile
  called `O'Brien` registers online as `OBrien`.
* The server does not know a KARTI save from a shopping list. A player who edits their own
  `localStorage` will happily sync the result. Save data is **not** an anti-cheat surface
  and was never going to be one — see section 7.
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
  will keep serving the old `mp.js` / `sync.js`.
* `/var/lib/karti/accounts.db` is **not backed up by anything**. It is one file; copy it
  somewhere occasionally (`sqlite3 accounts.db ".backup /path/copy.db"` is safe while the
  service is running).
