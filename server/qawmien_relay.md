# qawmien_relay.py — the RPG's own relay

The owner's instruction: *"Make the RPG different relay so it don't disturb the
party games."* So the RPG (QAWMIEN) gets its **own process, own port, own
database file**. If this service crash-loops, floods, or fills its disk, the
party-game relay on 8101 keeps running untouched. Nothing in this file imports
`karti_server.py`, and nothing in it **can** write into KARTI's databases.

## Run it

```
python3 server/qawmien_relay.py                    # 127.0.0.1:8102, defaults below
python3 server/qawmien_relay.py --selftest         # THE GATE — 36 checks, exit 1 on failure
```

| thing            | value                                                       |
|------------------|-------------------------------------------------------------|
| port             | **8102** (`--port`; KARTI is 8101 next door and never shared)|
| bind             | `127.0.0.1` only (`--host`; Tailscale does the exposing)     |
| its own db       | `/var/lib/qawmien/qawmien.db` (`--db`) — the ONLY file it writes |
| KARTI's db       | `/var/lib/karti/accounts.db` (`--karti`) — opened **READ-ONLY** |
| allowed origins  | `https://terencecamilleripesci.github.io` + loopback (`--origin` adds more) |
| path prefix      | routes also answer under `/qawmien/...` for a Funnel mount   |

It refuses to start if `--db` and `--karti` point at the same file. If its own
db can't be opened (e.g. `/var/lib/qawmien` doesn't exist yet), or KARTI's
file can't be read, it does **not** crash-loop: `/health` says which half is
off and every data route answers 503 until it is fixed.

To expose it the way KARTI is exposed (a separate mount, same funnel):

```
tailscale serve --bg --https=8443 --set-path=/qawmien http://127.0.0.1:8102/qawmien
```

A systemd unit should mirror `karti-relay.service` but with its own state dir:
`StateDirectory=qawmien`, `ReadWritePaths=/var/lib/qawmien`, plus
**read** access to `/var/lib/karti` (e.g. `ReadOnlyPaths=/var/lib/karti` —
`ProtectSystem=strict` alone leaves it readable, so listing it is documentation
as much as enforcement). Never give it `ReadWritePaths=/var/lib/karti`.

## Routes (mirrors `js/sync.js`'s base/ver protocol)

```
GET  /health                       -> {ok, storage, auth, maxSave}
POST /rpg/pull  {tok}              -> {ok, u, name, ver, at, save, device, hasPrev}
POST /rpg/pull  {tok, prev:true}   -> {ok, ..., save: <the blob a force-push replaced>}
POST /rpg/push  {tok, base, save[, force, device]}
                                   -> 200 {ok, u, ver, at, bytes}
                                   |  409 {ok:false, code:"stale", ver, at, save, device}
```

- `tok` in the body or `Authorization: Bearer ...` — a **KARTI** session token;
  there is no second account and no register/login route here at all.
- `base` must equal the version the server holds or the push is refused with
  409 and the server's blob handed back, exactly like KARTI save sync — a
  second device can never silently clobber a character. `force:true` is the
  player's own answer to that conflict, and even then the replaced blob is
  kept in `prev_*` and reachable via `pull {prev:true}`.
- **The blob is opaque.** It must be a bounded, well-formed JSON *object*;
  nothing here ever reads a field of it, so the game can change shape forever
  without this relay changing.

## How it validates against KARTI (one login, not two)

It opens KARTI's accounts db with `file:...?mode=ro` (URI) **and**
`PRAGMA query_only=ON`, then answers a token exactly the way
`karti_server.py` does: SHA-256 the presented token, look it up in
`sessions` joined to `accounts`, and refuse it if it is older than
`SESSION_TTL` (30 d since issue) or `SESSION_IDLE` (14 d since KARTI last saw
it). It never creates accounts, never touches passwords or hashes, never
deletes or refreshes a session row — it physically cannot (the selftest
proves an INSERT through that connection raises).

**Known consequence:** because it cannot update `seen`, a token is kept alive
by using **KARTI**, not by using the RPG. A player who only opens the RPG for
14+ days will be asked to log in again. Accepted trade-off for read-only.

## Defences (mirrors `karti_server.py` class `A` — see `class Q`)

- body refused from `Content-Length` **before a byte is read**; chunked
  refused; non-JSON content-type refused; JSON depth capped at 32 *before*
  `json.loads` (body and blob both)
- one save capped at 128 KB (`MAX_SAVE`; a real character is 1–2 KB), total
  across all characters capped at 8 MB (`MAX_TOTAL`) → 507 when full
- per-caller token bucket (1/s, burst 12) **and** a global ceiling
  (40/s, burst 80) → 429; caller = truncated hash of peer address, no raw IPs
- hard cap of 64 accepted sockets; 15 s slow-loris timeout
- origin allow-list; a stranger origin gets 403 and no CORS header
- fixed error strings; no response ever echoes a token or another player's data

## If it misbehaves

1. **First fact to establish: 8101 is fine.**
   `curl -s http://127.0.0.1:8101/karti/health` — the party games do not
   depend on this service in any way. Kill 8102 with a clear conscience.
2. `curl -s http://127.0.0.1:8102/health` —
   `storage:false` → `/var/lib/qawmien` missing/unwritable/disk full;
   `auth:false` → KARTI's accounts file unreadable at startup.
3. **Everyone gets 401** → check clock, then that KARTI's `sessions` rows are
   fresh (players who haven't opened KARTI in 14 days are *supposed* to get 401).
4. **Everyone gets 503 with `retry`** → the read-only connection to KARTI's db
   is failing even after a reopen; check that `accounts.db` and its `-shm`/`-wal`
   siblings are readable by this service's user.
5. **429s for real players** → someone behind the same NAT/funnel hop is
   flooding; the global bucket is doing its job. Restarting resets all buckets.
6. **507** → total cap reached; look for one account holding a bloated blob:
   `sqlite3 /var/lib/qawmien/qawmien.db 'SELECT uname,bytes FROM saves ORDER BY bytes DESC LIMIT 5;'`
7. After ANY change: `python3 server/qawmien_relay.py --selftest` must print
   `ALL PASS`, and `python3 server/karti_server.py --selftest` must still pass
   too (it proves you did not disturb the live relay's code by accident).

Deleting `/var/lib/qawmien/qawmien.db` loses saved RPG characters and nothing
else — no passwords, tokens, or party-game data live in it.

## Not done yet (deliberately out of scope here)

- No client wiring: `tactics-testbed` (source) → `qawmien/` (bundle) still
  saves only to localStorage. The client half should mirror `js/sync.js`
  against `/qawmien/rpg/pull|push`, reusing the KARTI session token.
- No systemd unit installed, no funnel mount added — commands above.
