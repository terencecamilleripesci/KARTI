#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QAWMIEN relay — the RPG's own cloud-save service, deliberately NOT the KARTI
relay.

WHY A SEPARATE PROCESS
    The owner's instruction: "Make the RPG different relay so it don't disturb
    the party games." So this is its own process on its own port (8102) with
    its own SQLite file. If it crash-loops, floods, or fills its store, the
    party-game relay on 8101 keeps running untouched. Nothing here imports
    karti_server.py and nothing here can write a byte into KARTI's databases.

ONE LOGIN, NOT TWO
    Players must not need a second account. This service validates the
    presented session token by READING KARTI's accounts database — opened
    with SQLite's mode=ro URI flag AND `PRAGMA query_only=ON`, so even a bug
    in this file cannot write there. It applies the same expiry rules as
    karti_server.py (SESSION_TTL after issue, SESSION_IDLE after last use).
    It never creates accounts, never touches passwords, and never updates the
    session's `seen` column — it can't, and that is the point. (Consequence:
    a token is kept alive by using KARTI, not by using the RPG. A player who
    only opens the RPG for 14+ days signs in again. Acceptable, documented.)

WHAT IT STORES
    One opaque blob per account. The blob is a bounded, well-formed JSON
    object and NOTHING in this process ever looks inside it — exactly like
    KARTI save blobs — so the game can change shape forever without this file
    changing at all.

ROUTES (mirrors js/sync.js's versioned base/ver protocol)
    GET  /health                        -> {ok, storage, auth, maxSave}
    POST /rpg/pull  {tok[, prev]}       -> {ok, u, name, ver, at, save, ...}
    POST /rpg/push  {tok, base, save[, force, device]}
                                        -> {ok, ver, at, bytes}
                                        |  409 {code:"stale", ver, at, save}
    (Also answers under a /qawmien path prefix, for a Funnel mount.)

WHAT IT IS BUILT TO SURVIVE (same doctrine as karti_server.py "class A")
    A stranger with the public URL. Every route is token-bucketed per caller
    AND capped globally; the body is refused on Content-Length before a
    single byte is read; one save is capped; total stored bytes are capped;
    JSON nesting depth is capped BEFORE json.loads; and no route ever echoes
    a token, a hash, or another player's data.

RUN
    python3 server/qawmien_relay.py --port 8102        # the service
    python3 server/qawmien_relay.py --selftest         # the gate; exits 1 on failure

See server/qawmien_relay.md for operations notes.
"""

import argparse
import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_HOST = "127.0.0.1"          # loopback ONLY. Tailscale does the exposing.
DEFAULT_PORT = 8102                 # KARTI is 8101; this is next door, never shared
DEFAULT_DB = "/var/lib/qawmien/qawmien.db"
DEFAULT_KARTI_DB = "/var/lib/karti/accounts.db"     # READ-ONLY, always

PATH_PREFIX = "/qawmien"            # a funnel may forward the full path
PAGES_ORIGIN = "https://terencecamilleripesci.github.io"
LOOPBACK_ORIGIN_RE = re.compile(r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$")

ALLOWED_ORIGINS = {PAGES_ORIGIN}
ALLOW_ANY_ORIGIN = False


class Q:
    """Every limit in one place, mirroring karti_server.py's class A.
    --selftest squeezes some of these; production runs them as written."""

    MAX_SAVE = 128 * 1024       # bytes of one character blob. A real QAWMIEN
                                # character is 1-2 KB, so this is huge headroom
                                # and still 1/1000th of what a phone can send.
    MAX_TOTAL = 8 * 1024 * 1024  # bytes across ALL characters. 250 accounts
                                # at 2 KB is half a megabyte; this is 16x that
                                # with room for growth, and it bounds the disk.
    MAX_BODY = MAX_SAVE + 16 * 1024   # bytes of one HTTP request body

    # -- SPAR ROOMS ---------------------------------------------------
    # Two players, turn-based, one action at a time. These live entirely in
    # memory: a spar that does not survive a relay restart is a spar both
    # players will simply start again, and persisting them would mean
    # reconciling rooms nobody is sitting in.
    MAX_ROOMS = 60              # live rooms at once, across everyone
    MAX_ACTS = 200              # queued actions per room before it is junk
    MAX_ACT = 4 * 1024          # bytes of ONE action blob, opaque
    ROOM_TTL = 20 * 60.0        # a room with no traffic is swept after this
    ROOM_CODE_LEN = 5
    MAX_DEPTH = 32              # JSON nesting allowed anywhere
    MAX_DEVICE = 24             # characters of the optional device label

    # Session expiry — THE SAME NUMBERS AS KARTI's class A, because the rows
    # being judged are KARTI's rows and the judgement must match the owner's.
    SESSION_TTL = 30 * 86400.0  # a token is dead this long after it was issued
    SESSION_IDLE = 14 * 86400.0 # ...or this long after KARTI last saw it used

    # per-caller token bucket (caller = a truncated hash of the peer address)
    API_RATE = 1.0
    API_BURST = 12.0
    CALLERS = 512               # buckets kept before the table is binned

    # ...and a global ceiling, because per-caller limits mean nothing to
    # somebody with a botnet. A handful of phones syncing a character each
    # need a few requests a minute; forty a second is not players.
    GLOBAL_RATE = 40.0
    GLOBAL_BURST = 80.0

    MAX_SOCKETS = 64            # concurrent TCP connections accepted at all
    HTTP_TIMEOUT = 15.0         # slow-loris guard on the handshake


# Fixed strings, exactly as KARTI does it: nothing a caller sends is ever
# reflected back, and refusals are deliberately uninformative.
E_ROOM = "That spar is not there any more."
E_FULL = "That spar already has two fighters."
E_ROOMS = "Too many spars are open right now."
E_BAD_JSON = "Bad request."
E_BIG = "That is too big."
E_TOKEN = "Please log in again."
E_SLOW = "Slow down."
E_BUSY = "The server is busy. Try again in a moment."
E_SAVE = "That save file is not something QAWMIEN could have written."
E_STALE = "Your other device has saved since this one last synced."
E_STORE = "This server has no room left for save data."
E_OFF = "Cloud saves are switched off on this server."


# ── rate limiting ────────────────────────────────────────────────────────────

class Bucket:
    """Token bucket. take() is False when the caller is going too fast.
    (Verbatim shape from karti_server.py.)"""

    __slots__ = ("rate", "cap", "tokens", "ts")

    def __init__(self, rate, cap):
        self.rate = float(rate)
        self.cap = float(cap)
        self.tokens = float(cap)
        self.ts = time.monotonic()

    def take(self, n=1.0):
        now = time.monotonic()
        self.tokens = min(self.cap, self.tokens + (now - self.ts) * self.rate)
        self.ts = now
        if self.tokens < n:
            return False
        self.tokens -= n
        return True


_RL_LOCK = threading.Lock()
_RL_CALLERS = {}
_RL_GLOBAL = None


def caller_key(addr):
    """Truncated hash of the peer address; no raw IP is ever held here."""
    return hashlib.sha256(str(addr or "?").encode("utf-8", "replace")).hexdigest()[:16]


def rl_allowed(addr):
    global _RL_GLOBAL
    key = caller_key(addr)
    with _RL_LOCK:
        if _RL_GLOBAL is None:
            _RL_GLOBAL = Bucket(Q.GLOBAL_RATE, Q.GLOBAL_BURST)
        if len(_RL_CALLERS) > Q.CALLERS:
            _RL_CALLERS.clear()         # bounded memory beats perfect fairness
        b = _RL_CALLERS.get(key)
        if b is None:
            b = Bucket(Q.API_RATE, Q.API_BURST)
            _RL_CALLERS[key] = b
        if not b.take():
            return False
        return _RL_GLOBAL.take()


def rl_reset():
    """Drop every bucket. Only the self-test uses it."""
    global _RL_GLOBAL
    with _RL_LOCK:
        _RL_CALLERS.clear()
        _RL_GLOBAL = None


# ── validation (verbatim shapes from karti_server.py) ────────────────────────

class Reject(Exception):
    """The message is not something the QAWMIEN client could have produced."""


NAME_BAD = re.compile(r"[\x00-\x1f\x7f<>&\"'\\`]")      # keep labels inert


def json_depth_ok(s, maxd):
    """True when s is balanced JSON-ish text nested no deeper than maxd.
    Run BEFORE json.loads, because CPython's JSON scanner recurses and a
    stranger should not be able to choose our stack depth."""
    depth = 0
    in_str = False
    escaped = False
    for ch in s:
        if in_str:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "[" or ch == "{":
            depth += 1
            if depth > maxd:
                return False
        elif ch == "]" or ch == "}":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0 and not in_str


def check_save_blob(s):
    """THE BLOB IS OPAQUE. All this asserts is: bounded, well-formed JSON
    OBJECT. The parsed result is thrown away on purpose — nothing in this
    process ever looks inside a character."""
    if not isinstance(s, str):
        raise Reject("save")
    raw = s.encode("utf-8", "surrogatepass")
    if len(raw) > Q.MAX_SAVE:
        raise Reject("big")
    t = s.strip()
    if not t.startswith("{") or not t.endswith("}"):
        raise Reject("save")
    if not json_depth_ok(s, Q.MAX_DEPTH):
        raise Reject("save")
    try:
        obj = json.loads(s)
    except Exception:
        raise Reject("save")
    if not isinstance(obj, dict):
        raise Reject("save")
    del obj
    return s, len(raw)


def v_device(v):
    if v is None:
        return ""
    if not isinstance(v, str):
        raise Reject("device")
    return NAME_BAD.sub("", v)[:Q.MAX_DEVICE]


# ── KARTI, read-only ─────────────────────────────────────────────────────────

class AuthDown(Exception):
    """KARTI's accounts file cannot be read right now. Answer 503."""


class KartiAuth:
    """Token -> (uname, display name), answered from KARTI's accounts db and
    NOTHING ELSE. The connection is opened with mode=ro in the URI and
    query_only=ON on top, so this class is physically unable to write there:
    no session row is ever deleted, no `seen` is ever updated, no account is
    ever created. Expired tokens are simply refused; KARTI's own prune()
    remains the only thing that deletes them.
    """

    def __init__(self, path):
        self.path = os.path.abspath(path)
        self.lock = threading.RLock()
        self.db = None
        self._open()                    # fail loudly at startup...

    def _open(self):
        db = sqlite3.connect("file:%s?mode=ro" % self.path, uri=True,
                             check_same_thread=False, timeout=5.0,
                             isolation_level=None)
        db.execute("PRAGMA query_only=ON")      # belt AND braces
        self.db = db

    def close(self):
        with self.lock:
            try:
                if self.db is not None:
                    self.db.close()
            except Exception:
                pass
            self.db = None

    def session(self, tok):
        """(uname, name) or None. Only the SHA-256 of the token is compared,
        exactly as karti_server.py stores it. Raises AuthDown when KARTI's
        file cannot be read (never silently accepts)."""
        if not isinstance(tok, str) or not (16 <= len(tok) <= 128):
            return None
        digest = hashlib.sha256(tok.encode("utf-8", "replace")).hexdigest()
        now = time.time()
        with self.lock:
            for attempt in (0, 1):
                try:
                    if self.db is None:
                        self._open()
                    row = self.db.execute(
                        "SELECT s.uname, s.made, s.seen, a.name FROM sessions s"
                        " JOIN accounts a ON a.uname = s.uname WHERE s.tok=?",
                        (digest,)).fetchone()
                    break
                except sqlite3.Error:
                    # ...but survive a checkpoint/restart of KARTI mid-flight:
                    # drop the handle and try to reopen exactly once.
                    self.close()
                    if attempt:
                        raise AuthDown()
        if row is None:
            return None
        uname, made, seen, name = row
        # THE SAME EXPIRY RULES AS karti_server.py's Accounts.session().
        if (now - float(made)) > Q.SESSION_TTL or (now - float(seen)) > Q.SESSION_IDLE:
            return None
        return uname, name


# ── the store (this service's ONLY writable file) ────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS saves (
    uname     TEXT PRIMARY KEY,
    ver       INTEGER NOT NULL,
    blob      TEXT NOT NULL,
    bytes     INTEGER NOT NULL,
    at        REAL NOT NULL,
    device    TEXT NOT NULL DEFAULT '',
    prev_ver  INTEGER,
    prev_blob TEXT,
    prev_at   REAL
);
"""


class Store:
    """One SQLite file, one connection, one lock — the karti Accounts shape,
    holding ONLY save rows. uname is KARTI's account key, but this file never
    holds a password, a hash, a token or a session: losing it loses saved
    characters and nothing else."""

    def __init__(self, path):
        self.path = path
        self.lock = threading.RLock()
        directory = os.path.dirname(os.path.abspath(path))
        if directory and not os.path.isdir(directory):
            os.makedirs(directory, mode=0o700, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False, timeout=5.0)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self.db.executescript(SCHEMA)
        self.db.commit()
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass

    def close(self):
        with self.lock:
            try:
                self.db.close()
            except Exception:
                pass

    def get_save(self, key):
        with self.lock:
            row = self.db.execute(
                "SELECT ver,blob,at,device,prev_ver,prev_blob,prev_at FROM saves"
                " WHERE uname=?", (key,)).fetchone()
        if row is None:
            return {"ver": 0, "blob": None, "at": 0.0, "device": "",
                    "prevVer": 0, "prevBlob": None, "prevAt": 0.0}
        return {"ver": int(row[0]), "blob": row[1], "at": float(row[2]),
                "device": row[3] or "",
                "prevVer": int(row[4] or 0), "prevBlob": row[5],
                "prevAt": float(row[6] or 0.0)}

    def put_save(self, key, base, blob, nbytes, device, force):
        """Version-checked write, verbatim semantics from karti_server.py:
        accepted only when `base` is exactly the version being held; anything
        else is a genuine conflict and is refused rather than resolved by
        guesswork. `force` is the player's own answer to that conflict, and
        even then the blob being replaced is kept in prev_*."""
        now = time.time()
        with self.lock:
            cur = self.get_save(key)
            if not force and int(base) != cur["ver"]:
                return False, cur
            total = self.db.execute(
                "SELECT COALESCE(SUM(bytes),0) FROM saves").fetchone()[0]
            grown = nbytes - (len(cur["blob"].encode("utf-8", "surrogatepass"))
                              if cur["blob"] else 0)
            if total + grown > Q.MAX_TOTAL:
                return False, "full"
            ver = cur["ver"] + 1
            self.db.execute(
                "INSERT INTO saves(uname,ver,blob,bytes,at,device,prev_ver,prev_blob,prev_at)"
                " VALUES(?,?,?,?,?,?,?,?,?)"
                " ON CONFLICT(uname) DO UPDATE SET ver=excluded.ver, blob=excluded.blob,"
                " bytes=excluded.bytes, at=excluded.at, device=excluded.device,"
                " prev_ver=excluded.prev_ver, prev_blob=excluded.prev_blob,"
                " prev_at=excluded.prev_at",
                (key, ver, blob, nbytes, now, device,
                 cur["ver"] or None, cur["blob"], cur["at"] or None))
            self.db.commit()
        return True, {"ver": ver, "at": now}


STORE = None                    # set by main() / selftest; None = 503
AUTH = None                     # set by main() / selftest; None = 503


def open_stores(db_path, karti_path):
    """Open both, or leave them None and say why. A store that cannot be
    opened must never crash-loop the process: the routes answer 503, /health
    says so, and KARTI next door is unaffected either way."""
    global STORE, AUTH
    try:
        STORE = Store(db_path)
    except Exception as e:
        STORE = None
        print("warning: storage is OFF — cannot use %s (%s)"
              % (db_path, e.__class__.__name__), file=sys.stderr)
    try:
        AUTH = KartiAuth(karti_path)
    except Exception as e:
        AUTH = None
        print("warning: auth is OFF — cannot read %s (%s). Every route will "
              "answer 503 until the KARTI accounts file is readable."
              % (karti_path, e.__class__.__name__), file=sys.stderr)


# ── HTTP front door ──────────────────────────────────────────────────────────

def origin_ok(origin):
    if ALLOW_ANY_ORIGIN:
        return True
    if not origin:
        return True             # non-browser clients send no Origin at all
    if origin in ALLOWED_ORIGINS:
        return True
    return bool(LOOPBACK_ORIGIN_RE.match(origin))


# ══════════════════════ SPAR ROOMS ══════════════════════════════════════
#
# Two players fight through the relay. Kept SEPARATE from KARTI's own room
# server on purpose: the owner's call, and the right one — the RPG's traffic
# must never compete with the card games for the same process.
#
# IN MEMORY, NOT SQLITE. A spar is a conversation, not a record. If the relay
# restarts, both players simply start again — whereas persisted rooms would
# mean reconciling ones nobody is sitting in, for no benefit anybody can see.
#
# THE ACTION BLOB IS OPAQUE. This never reads a move. It stores bytes, caps
# them, and hands them to the other seat in order — exactly how KARTI carries
# its rules and deal payloads. It is what lets combat change without the
# server changing.
class Rooms:
    def __init__(self):
        self.lock = threading.RLock()
        self.rooms = {}          # code -> room dict

    @staticmethod
    def _code():
        # No vowels: a five-character code that cannot accidentally spell
        # something, and no 0/O or 1/I to misread over a phone.
        alpha = "BCDFGHJKLMNPQRSTVWXYZ23456789"
        return "".join(secrets.choice(alpha) for _ in range(Q.ROOM_CODE_LEN))

    def _sweep(self, now):
        dead = [c for c, r in self.rooms.items() if now - r["seen"] > Q.ROOM_TTL]
        for c in dead:
            self.rooms.pop(c, None)

    def open(self, key, name):
        now = time.time()
        with self.lock:
            self._sweep(now)
            if len(self.rooms) >= Q.MAX_ROOMS:
                return None, E_ROOMS
            for _ in range(40):
                code = self._code()
                if code not in self.rooms:
                    break
            else:
                return None, E_ROOMS
            self.rooms[code] = {
                "code": code, "made": now, "seen": now,
                "seats": [{"key": key, "name": name}, None],
                "acts": [],                      # [{seat, n, blob}]
                "n": 0,
            }
            return code, None

    def join(self, code, key, name):
        with self.lock:
            r = self.rooms.get(code)
            if not r:
                return None, E_ROOM
            r["seen"] = time.time()
            for i, s in enumerate(r["seats"]):
                if s and s["key"] == key:
                    return {"seat": i, "room": self._view(r)}, None
            if r["seats"][1] is not None:
                return None, E_FULL
            r["seats"][1] = {"key": key, "name": name}
            return {"seat": 1, "room": self._view(r)}, None

    def act(self, code, key, blob):
        with self.lock:
            r = self.rooms.get(code)
            if not r:
                return None, E_ROOM
            seat = self._seat_of(r, key)
            if seat is None:
                return None, E_ROOM
            if len(r["acts"]) >= Q.MAX_ACTS:
                # A room this noisy is a bug or an attack; drop it rather
                # than let one spar eat the process's memory.
                self.rooms.pop(code, None)
                return None, E_ROOM
            r["n"] += 1
            r["acts"].append({"seat": seat, "n": r["n"], "blob": blob})
            r["seen"] = time.time()
            return {"n": r["n"]}, None

    def since(self, code, key, after):
        """Everything the OTHER seat has said since `after`. A player is never
           handed back their own actions: they already applied them, and
           replaying them is how a desync starts."""
        with self.lock:
            r = self.rooms.get(code)
            if not r:
                return None, E_ROOM
            seat = self._seat_of(r, key)
            if seat is None:
                return None, E_ROOM
            r["seen"] = time.time()
            out = [a for a in r["acts"] if a["n"] > after and a["seat"] != seat]
            return {"acts": out, "n": r["n"], "room": self._view(r)}, None

    def leave(self, code, key):
        with self.lock:
            r = self.rooms.get(code)
            if not r:
                return
            seat = self._seat_of(r, key)
            if seat is not None:
                r["seats"][seat] = None
            if not any(r["seats"]):
                self.rooms.pop(code, None)

    @staticmethod
    def _seat_of(r, key):
        for i, s in enumerate(r["seats"]):
            if s and s["key"] == key:
                return i
        return None

    @staticmethod
    def _view(r):
        # Names only. A seat's account key is never echoed to the other
        # player — the same rule the save routes follow.
        return {"code": r["code"],
                "seats": [(s["name"] if s else None) for s in r["seats"]]}

    def stats(self):
        with self.lock:
            return {"rooms": len(self.rooms)}


ROOMS = Rooms()


class QawmienHandler(BaseHTTPRequestHandler):
    """Three routes and a 404. No filesystem code, no directory to escape."""

    server_version = "qawmien"
    sys_version = ""
    protocol_version = "HTTP/1.1"
    timeout = Q.HTTP_TIMEOUT
    quiet = True

    def log_message(self, fmt, *args):
        if not self.quiet:
            sys.stderr.write("[qawmien] %s\n" % (fmt % args))

    log_error = log_message

    # -- plumbing ---------------------------------------------------------

    def route(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        while len(path) > 1 and path.endswith("/"):
            path = path[:-1]
        if path == PATH_PREFIX:
            return "/"
        if path.startswith(PATH_PREFIX + "/"):
            path = path[len(PATH_PREFIX):] or "/"
        return path

    def cors(self):
        origin = self.headers.get("Origin")
        if origin and origin_ok(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def reply_bytes(self, status, body, extra=()):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in extra:
            self.send_header(k, v)
        self.cors()
        self.end_headers()
        try:
            self.wfile.write(body)
        except OSError:
            pass

    def reply(self, status, obj):
        self.reply_bytes(status, json.dumps(obj, separators=(",", ":")).encode("utf-8"))

    def fail(self, status, why, extra=None):
        body = {"ok": False, "why": why}
        if extra:
            body.update(extra)
        self.reply(status, body)

    def read_json_body(self):
        """Bounded, exact-length body read. Returns a dict, or None having
        already answered. The size is refused from the Content-Length header,
        BEFORE a single byte of the body is read off the socket."""
        if (self.headers.get("Transfer-Encoding") or "").strip().lower():
            self.close_connection = True
            self.fail(411, E_BAD_JSON)
            return None
        raw_len = self.headers.get("Content-Length")
        try:
            n = int(raw_len)
        except (TypeError, ValueError):
            self.close_connection = True
            self.fail(411, E_BAD_JSON)
            return None
        if n < 0:
            self.close_connection = True
            self.fail(400, E_BAD_JSON)
            return None
        if n > Q.MAX_BODY:
            self.close_connection = True     # we are not going to drain it
            self.fail(413, E_BIG)
            return None
        ctype = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if ctype and ctype != "application/json":
            self.close_connection = True
            self.fail(415, E_BAD_JSON)
            return None
        try:
            data = self.rfile.read(n) if n else b""
        except OSError:
            self.close_connection = True
            return None
        if len(data) != n:
            self.close_connection = True
            self.fail(400, E_BAD_JSON)
            return None
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            self.fail(400, E_BAD_JSON)
            return None
        if not json_depth_ok(text, Q.MAX_DEPTH):
            self.fail(400, E_BAD_JSON)
            return None
        try:
            obj = json.loads(text)
        except Exception:
            self.fail(400, E_BAD_JSON)
            return None
        if not isinstance(obj, dict):
            self.fail(400, E_BAD_JSON)
            return None
        return obj

    def bearer(self, body):
        auth = (self.headers.get("Authorization") or "").strip()
        if auth[:7].lower() == "bearer ":
            return auth[7:].strip()
        tok = body.get("tok")
        return tok if isinstance(tok, str) else ""

    # -- methods ----------------------------------------------------------

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.cors()
        self.end_headers()

    def do_GET(self):
        path = self.route()
        if path == "/health":
            # A yes/no and one cap. No name, no token, no count of players.
            self.reply(200, {"ok": True, "storage": STORE is not None,
                             "auth": AUTH is not None, "maxSave": Q.MAX_SAVE})
            return
        self.reply(404, {"ok": False,
                         "why": "This is the QAWMIEN relay, not a web server."})

    def do_HEAD(self):
        self.send_response(200 if self.route() == "/health" else 404)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.cors()
        self.end_headers()

    def do_POST(self):
        path = self.route()
        addr = self.client_address[0] if self.client_address else ""
        # Same allow-list rule as KARTI: a page on a random origin gets no
        # CORS header AND no answer.
        if not origin_ok(self.headers.get("Origin")):
            self.close_connection = True
            self.fail(403, "Origin not allowed.")
            return
        if path not in ("/rpg/pull", "/rpg/push",
                        "/rpg/spar/open", "/rpg/spar/join",
                        "/rpg/spar/act", "/rpg/spar/poll", "/rpg/spar/leave"):
            self.fail(404, "No such route.")
            return
        if STORE is None or AUTH is None:
            self.fail(503, E_OFF)
            return
        body = self.read_json_body()
        if body is None:
            return
        try:
            if path == "/rpg/pull":
                self.rpg_pull(addr, body)
            elif path == "/rpg/push":
                self.rpg_push(addr, body)
            else:
                self.spar(addr, body, path.rsplit("/", 1)[-1])
        except AuthDown:
            self.fail(503, E_BUSY, {"retry": True})
        except Reject:
            self.fail(400, E_BAD_JSON)
        except sqlite3.Error:
            self.fail(503, E_BUSY)

    def do_PUT(self):
        self.fail(405, "GET or POST only.")

    do_PATCH = do_PUT
    do_DELETE = do_PUT

    # -- the two routes ---------------------------------------------------

    def authed(self, addr, body):
        """(uname, name) or None having already answered. The bucket is
        spent BEFORE the token is looked at, so a flood of junk tokens is
        priced the same as a flood of real ones."""
        if not rl_allowed(addr):
            self.fail(429, E_SLOW, {"retryAfter": 5})
            return None
        who = AUTH.session(self.bearer(body))
        if who is None:
            self.fail(401, E_TOKEN, {"relogin": True})
            return None
        return who

    # -- sparring ---------------------------------------------------------

    def spar(self, addr, body, verb):
        """One handler for all five spar verbs. Auth first, ALWAYS — a spar
           route must be exactly as hard to reach as a save route, or it
           becomes the soft way in."""
        who = self.authed(addr, body)
        if who is None:
            return
        key, name = who

        if verb == "open":
            code, err = ROOMS.open(key, name)
            if err:
                return self.fail(429 if err is E_ROOMS else 400, err)
            return self.reply(200, {"ok": True, "code": code, "seat": 0})

        code = body.get("code")
        if not isinstance(code, str) or not (1 <= len(code) <= 12):
            return self.fail(400, E_BAD_JSON)
        code = code.upper()

        if verb == "join":
            got, err = ROOMS.join(code, key, name)
            if err:
                return self.fail(404 if err is E_ROOM else 409, err)
            return self.reply(200, {"ok": True, "seat": got["seat"], "room": got["room"]})

        if verb == "leave":
            ROOMS.leave(code, key)
            return self.reply(200, {"ok": True})

        if verb == "act":
            blob = body.get("act")
            # Opaque, but SIZE-CAPPED and shape-checked. The relay never reads
            # a move; it only refuses to carry something absurd.
            try:
                raw = json.dumps(blob, separators=(",", ":"))
            except (TypeError, ValueError):
                return self.fail(400, E_BAD_JSON)
            if len(raw.encode("utf-8")) > Q.MAX_ACT:
                return self.fail(413, E_BIG)
            got, err = ROOMS.act(code, key, blob)
            if err:
                return self.fail(404, err)
            return self.reply(200, {"ok": True, "n": got["n"]})

        if verb == "poll":
            after = body.get("after")
            after = after if isinstance(after, int) and after >= 0 else 0
            got, err = ROOMS.since(code, key, after)
            if err:
                return self.fail(404, err)
            return self.reply(200, {"ok": True, "acts": got["acts"], "n": got["n"],
                            "room": got["room"]})

        return self.fail(404, "No such route.")

    def rpg_pull(self, addr, body):
        who = self.authed(addr, body)
        if who is None:
            return
        key, name = who
        st = STORE.get_save(key)
        if body.get("prev") is True:
            self.reply(200, {"ok": True, "u": key, "name": name,
                             "ver": st["prevVer"], "at": int(st["prevAt"]),
                             "save": st["prevBlob"], "prev": True})
            return
        self.reply(200, {"ok": True, "u": key, "name": name,
                         "ver": st["ver"], "at": int(st["at"]),
                         "save": st["blob"], "device": st["device"],
                         "hasPrev": st["prevBlob"] is not None})

    def rpg_push(self, addr, body):
        who = self.authed(addr, body)
        if who is None:
            return
        key, name = who
        try:
            blob, nbytes = check_save_blob(body.get("save"))
        except Reject as e:
            self.fail(413 if str(e) == "big" else 400,
                      E_BIG if str(e) == "big" else E_SAVE)
            return
        base = body.get("base", 0)
        if isinstance(base, bool) or not isinstance(base, int) or not (0 <= base <= 1 << 40):
            self.fail(400, E_BAD_JSON)
            return
        force = body.get("force") is True
        device = v_device(body.get("device"))
        ok, info = STORE.put_save(key, base, blob, nbytes, device, force)
        if not ok and info == "full":
            self.fail(507, E_STORE)
            return
        if not ok:
            # A genuine conflict. Hand back what the server is holding — the
            # CALLER'S OWN row, never anybody else's — so the player can be
            # shown both and choose. Nothing has been written.
            self.fail(409, E_STALE,
                      {"code": "stale", "ver": info["ver"],
                       "at": int(info["at"]), "save": info["blob"],
                       "device": info["device"]})
            return
        self.reply(200, {"ok": True, "u": key, "ver": info["ver"],
                         "at": int(info["at"]), "bytes": nbytes})


# ── server plumbing ──────────────────────────────────────────────────────────

class GuardedServer(ThreadingHTTPServer):
    """Hard cap on simultaneously accepted sockets, so a stranger cannot make
    us spawn threads without limit. (Verbatim shape from karti_server.py.)"""

    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 16

    def __init__(self, *a, **kw):
        self._open = set()
        self._open_lock = threading.Lock()
        super().__init__(*a, **kw)

    def verify_request(self, request, client_address):
        with self._open_lock:
            if len(self._open) >= Q.MAX_SOCKETS:
                return False
            self._open.add(request)
            return True

    def shutdown_request(self, request):
        with self._open_lock:
            self._open.discard(request)
        super().shutdown_request(request)

    def handle_error(self, request, client_address):
        pass                        # a broken client is not news


def make_server(host, port, quiet=True):
    handler = type("QawmienHandlerBound", (QawmienHandler,), {"quiet": quiet})
    return GuardedServer((host, port), handler)


# ── selftest ─────────────────────────────────────────────────────────────────
#
# The same gate karti_server.py has: happy path AND abuse, tiny limits, a
# throwaway directory, exit non-zero on any failure. The KARTI fixture file is
# chmod 0444 AND hashed before/after, so "never writes to KARTI's database"
# is proven twice over.

def _http(host, port, method, path, obj=None, origin=None, raw=None,
          ctype="application/json", clen=None, timeout=8.0):
    """Tiny stdlib client. Returns (status, headers-lowercased, body-bytes)."""
    import http.client
    c = http.client.HTTPConnection(host, port, timeout=timeout)
    try:
        body = raw if raw is not None else (
            json.dumps(obj).encode("utf-8") if obj is not None else b"")
        headers = {}
        if origin:
            headers["Origin"] = origin
        if method == "POST":
            headers["Content-Type"] = ctype
            headers["Content-Length"] = str(len(body) if clen is None else clen)
        c.request(method, path, body if method == "POST" else None, headers)
        r = c.getresponse()
        data = r.read()
        return r.status, {k.lower(): v for k, v in r.getheaders()}, data
    finally:
        try:
            c.close()
        except Exception:
            pass


def _mk_karti_fixture(directory, now):
    """A miniature KARTI accounts db: the accounts and sessions tables in the
    live file's exact shape, two players and four tokens. Written once here,
    then chmod 0444 and never written again by ANYTHING."""
    path = os.path.join(directory, "karti-accounts.db")
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode=DELETE")
    db.executescript("""
    CREATE TABLE accounts (
        uname TEXT PRIMARY KEY, name TEXT NOT NULL, algo TEXT NOT NULL,
        kn INTEGER NOT NULL, kr INTEGER NOT NULL, kp INTEGER NOT NULL,
        salt BLOB NOT NULL, pwhash BLOB NOT NULL,
        created REAL NOT NULL, seen REAL NOT NULL,
        vis INTEGER NOT NULL DEFAULT 1, admin INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sessions (
        tok TEXT PRIMARY KEY, uname TEXT NOT NULL,
        made REAL NOT NULL, seen REAL NOT NULL);
    """)
    toks = {"alice": "TOKEN-ALICE-%s" % ("a" * 20),
            "bob": "TOKEN-BOB-%s" % ("b" * 20),
            "expired": "TOKEN-EXPIRED-%s" % ("c" * 20),
            "idle": "TOKEN-IDLE-%s" % ("d" * 20)}

    def h(t):
        return hashlib.sha256(t.encode()).hexdigest()

    for key, disp in (("alice", "Alice"), ("bob", "Bob")):
        db.execute("INSERT INTO accounts(uname,name,algo,kn,kr,kp,salt,pwhash,"
                   "created,seen) VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (key, disp, "scrypt", 16384, 8, 1, b"\x00" * 16,
                    b"\x00" * 32, now, now))
    db.execute("INSERT INTO sessions VALUES(?,?,?,?)",
               (h(toks["alice"]), "alice", now, now))
    db.execute("INSERT INTO sessions VALUES(?,?,?,?)",
               (h(toks["bob"]), "bob", now, now))
    db.execute("INSERT INTO sessions VALUES(?,?,?,?)",          # made too long ago
               (h(toks["expired"]), "alice", now - Q.SESSION_TTL - 60.0, now))
    db.execute("INSERT INTO sessions VALUES(?,?,?,?)",          # idle too long
               (h(toks["idle"]), "alice", now, now - Q.SESSION_IDLE - 60.0))
    db.commit()
    db.close()
    os.chmod(path, 0o444)
    return path, toks


def selftest():
    import tempfile

    results = []

    def check(name, ok, detail=""):
        results.append((name, bool(ok)))
        print("  %-4s %s%s" % ("PASS" if ok else "FAIL", name,
                               ("   << " + str(detail)[:240]) if (detail and not ok) else ""))
        return ok

    # Tiny limits so the abuse tests are cheap; the CODE under test is
    # exactly what production runs.
    Q.MAX_SAVE = 4 * 1024
    Q.MAX_TOTAL = 10 * 1024
    Q.MAX_BODY = Q.MAX_SAVE + 2 * 1024
    Q.API_RATE = 1000.0         # generous while the happy path is walked...
    Q.API_BURST = 1000.0
    Q.GLOBAL_RATE = 2000.0
    Q.GLOBAL_BURST = 2000.0

    tmp = tempfile.mkdtemp(prefix="qawmien-selftest-")
    now = time.time()
    karti_path, toks = _mk_karti_fixture(tmp, now)
    with open(karti_path, "rb") as f:
        karti_before = hashlib.sha256(f.read()).hexdigest()
    karti_dir_before = sorted(os.listdir(tmp))

    open_stores(os.path.join(tmp, "qawmien.db"), karti_path)
    rl_reset()

    host = "127.0.0.1"
    httpd = make_server(host, 0, quiet=True)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.05},
                     name="qawmien-selftest", daemon=True).start()
    print("SELFTEST qawmien relay on 127.0.0.1:%d (karti fixture: read-only)" % port)

    O = PAGES_ORIGIN
    tok_a, tok_b = toks["alice"], toks["bob"]
    seen_bodies = []                # everything the server ever answered

    def post(path, obj, **kw):
        st, hd, body = _http(host, port, "POST", path, obj, origin=O, **kw)
        seen_bodies.append(body)
        try:
            return st, hd, json.loads(body.decode("utf-8"))
        except Exception:
            return st, hd, {}

    try:
        print("")
        print(" HAPPY PATH")

        for label, path in (("/health", "/health"),
                            ("/qawmien/health", PATH_PREFIX + "/health")):
            st, _, body = _http(host, port, "GET", path, origin=O)
            try:
                j = json.loads(body.decode())
            except Exception:
                j = {}
            check("health answers on %s" % label,
                  st == 200 and j.get("ok") is True and j.get("auth") is True
                  and j.get("storage") is True, (st, body[:120]))

        st, _, j = post("/rpg/pull", {"tok": tok_a})
        check("pull before any push -> ver 0, empty save",
              st == 200 and j.get("ok") is True and j.get("ver") == 0
              and j.get("save") is None and j.get("u") == "alice", (st, j))

        save1 = json.dumps({"hero": {"name": "Kaxxu", "lv": 3}, "gold": 41})
        st, _, j = post("/rpg/push", {"tok": tok_a, "base": 0, "save": save1,
                                      "device": "phone"})
        check("push base 0 -> ok, ver 1",
              st == 200 and j.get("ok") is True and j.get("ver") == 1, (st, j))

        st, _, j = post("/rpg/pull", {"tok": tok_a})
        check("pull -> the exact blob back, ver 1",
              st == 200 and j.get("ver") == 1 and j.get("save") == save1
              and j.get("device") == "phone", (st, j))

        save2 = json.dumps({"hero": {"name": "Kaxxu", "lv": 4}, "gold": 7})
        st, _, j = post("/rpg/push", {"tok": tok_a, "base": 1, "save": save2})
        check("push base 1 -> ok, ver 2", st == 200 and j.get("ver") == 2, (st, j))

        print("")
        print(" CONFLICTS (the second-device story)")

        stale = json.dumps({"hero": "offline-tablet"})
        st, _, j = post("/rpg/push", {"tok": tok_a, "base": 1, "save": stale})
        check("push with a stale base -> 409, nothing written, server blob handed back",
              st == 409 and j.get("code") == "stale" and j.get("ver") == 2
              and j.get("save") == save2, (st, j))

        st, _, j = post("/rpg/pull", {"tok": tok_a})
        check("...and the store still holds ver 2",
              st == 200 and j.get("ver") == 2 and j.get("save") == save2, (st, j))

        st, _, j = post("/rpg/push", {"tok": tok_a, "base": 1, "save": stale,
                                      "force": True})
        check("force push (the player's own choice) -> accepted, ver 3",
              st == 200 and j.get("ver") == 3, (st, j))

        st, _, j = post("/rpg/pull", {"tok": tok_a, "prev": True})
        check("pull prev -> the blob the force replaced",
              st == 200 and j.get("prev") is True and j.get("save") == save2, (st, j))

        print("")
        print(" ABUSE")

        st, _, j = post("/rpg/pull", {"tok": "no-such-token-%s" % ("x" * 20)})
        check("bad token -> 401", st == 401 and j.get("relogin") is True, (st, j))

        st, _, j = post("/rpg/pull", {"tok": toks["expired"]})
        check("token past SESSION_TTL -> 401", st == 401, (st, j))

        st, _, j = post("/rpg/pull", {"tok": toks["idle"]})
        check("token past SESSION_IDLE -> 401", st == 401, (st, j))

        st, _, j = post("/rpg/pull", {})
        check("no token at all -> 401", st == 401, (st, j))

        big = b"{" + b" " * (Q.MAX_BODY + 512) + b"}"
        st, _, j = post("/rpg/push", None, raw=big)
        check("oversized body -> 413 from the Content-Length header",
              st == 413, (st, j))

        fat_save = json.dumps({"pad": "x" * (Q.MAX_SAVE + 64)})
        st, _, j = post("/rpg/push", {"tok": tok_a, "base": 3, "save": fat_save})
        check("oversized save -> 413, nothing written", st == 413, (st, j))

        deep = "[" * 40 + "]" * 40
        st, _, j = post("/rpg/push", None, raw=deep.encode())
        check("deep nesting in the body -> 400 before json.loads", st == 400, (st, j))

        deep_save = "{" + '"a":' + "[" * 40 + "]" * 40 + "}"
        st, _, j = post("/rpg/push", {"tok": tok_a, "base": 3, "save": deep_save})
        check("deep nesting inside the save -> 400", st == 400, (st, j))

        st, _, j = post("/rpg/push", {"tok": tok_a, "base": 3, "save": "[1,2]"})
        check("save that is not a JSON object -> 400", st == 400, (st, j))

        st, _, j = post("/rpg/push", {"tok": tok_a, "base": True, "save": "{}"})
        check("boolean base -> 400", st == 400, (st, j))

        st, _, j = post("/rpg/push", None, raw=b"\xff\xfe junk")
        check("bytes that are not UTF-8 -> 400", st == 400, (st, j))

        st, _, j = post("/rpg/nothere", {"tok": tok_a})
        check("unknown POST route -> 404", st == 404, (st, j))

        st, _, body = _http(host, port, "GET", "/rpg/pull", origin=O)
        check("GET on a POST route -> 404 (not a data leak)", st == 404, st)

        print("")
        print(" ISOLATION (another player's token)")

        st, _, j = post("/rpg/pull", {"tok": tok_b})
        check("Bob's token sees Bob's (empty) row, never Alice's",
              st == 200 and j.get("u") == "bob" and j.get("ver") == 0
              and j.get("save") is None, (st, j))

        bob_save = json.dumps({"hero": "Bob"})
        st, _, j = post("/rpg/push", {"tok": tok_b, "base": 0, "save": bob_save})
        check("Bob pushes his own character", st == 200 and j.get("ver") == 1, (st, j))

        st, _, j = post("/rpg/pull", {"tok": tok_a})
        check("...and Alice's row is untouched by it",
              st == 200 and j.get("ver") == 3 and j.get("save") == stale, (st, j))

        leaked = [b for b in seen_bodies
                  if tok_a.encode() in b or tok_b.encode() in b]
        check("no response body ever contained a session token", not leaked,
              leaked[:1])

        print("")
        print(" CAPS AND FLOODS")

        # Squeeze the TOTAL cap under two near-MAX_SAVE rows: Alice's big push
        # fits, Bob's identical one would cross the ceiling and must bounce
        # with 507 — and write nothing.
        keep_total = Q.MAX_TOTAL
        Q.MAX_TOTAL = 6 * 1024
        big_ok = json.dumps({"pad": "y" * (Q.MAX_SAVE - 64)})
        st, _, j = post("/rpg/push", {"tok": tok_a, "base": 3, "save": big_ok})
        st2, _, j2 = post("/rpg/push", {"tok": tok_b, "base": 1, "save": big_ok})
        check("total-bytes cap answers 507 rather than storing",
              st == 200 and st2 == 507, (st, st2, j2))
        st3, _, j3 = post("/rpg/pull", {"tok": tok_b})
        check("...and the refused push really wrote nothing",
              st3 == 200 and j3.get("save") == bob_save, (st3, j3))
        Q.MAX_TOTAL = keep_total

        rl_reset()
        Q.API_RATE = 0.001
        Q.API_BURST = 3.0
        got_429 = False
        for _ in range(6):
            st, _, j = post("/rpg/pull", {"tok": tok_a})
            if st == 429:
                got_429 = True
                break
        check("per-caller token bucket -> 429", got_429, st)

        rl_reset()
        Q.API_RATE = 1000.0
        Q.API_BURST = 1000.0
        Q.GLOBAL_RATE = 0.001
        Q.GLOBAL_BURST = 2.0
        got_429 = False
        for _ in range(5):
            st, _, j = post("/rpg/pull", {"tok": tok_a})
            if st == 429:
                got_429 = True
                break
        check("global ceiling -> 429 even for a polite caller", got_429, st)
        rl_reset()
        Q.GLOBAL_RATE = 2000.0
        Q.GLOBAL_BURST = 2000.0

        st, hd, body = _http(host, port, "POST", "/rpg/pull", {"tok": tok_a},
                             origin="https://evil.example")
        check("stranger origin -> 403 and no CORS header",
              st == 403 and "access-control-allow-origin" not in hd, (st, hd))

        st, hd, _ = _http(host, port, "GET", "/health", origin=O)
        check("good origin gets its CORS header back",
              hd.get("access-control-allow-origin") == O, hd)

        print("")
        print(" KARTI IS NEVER WRITTEN")

        try:
            AUTH.db.execute("INSERT INTO sessions VALUES('x','x',0,0)")
            check("the auth connection physically cannot write", False,
                  "INSERT was accepted?!")
        except sqlite3.OperationalError as e:
            check("the auth connection physically cannot write", True, e)

        with open(karti_path, "rb") as f:
            karti_after = hashlib.sha256(f.read()).hexdigest()
        check("KARTI fixture db byte-identical after every request",
              karti_before == karti_after)
        check("no journal/WAL/shm ever appeared beside KARTI's file",
              sorted(x for x in os.listdir(tmp)
                     if x.startswith("karti-accounts.db")) ==
              [x for x in karti_dir_before if x.startswith("karti-accounts.db")],
              sorted(os.listdir(tmp)))

    finally:
        httpd.shutdown()
        httpd.server_close()
        if STORE is not None:
            STORE.close()
        if AUTH is not None:
            AUTH.close()

    passed = sum(1 for _, ok in results if ok)
    failed = [name for name, ok in results if not ok]
    print("")
    print("%d/%d checks passed" % (passed, len(results)))
    if failed:
        print("FAILED: %s" % ", ".join(failed))
        return 1
    print("ALL PASS")
    return 0


# ── entry ────────────────────────────────────────────────────────────────────

def main(argv=None):
    global ALLOW_ANY_ORIGIN

    p = argparse.ArgumentParser(
        description="QAWMIEN relay — the RPG's own save sync, apart from the "
                    "party games. Reads KARTI's accounts db strictly read-only.")
    p.add_argument("--host", default=DEFAULT_HOST,
                   help="bind address (default %s — keep it loopback)" % DEFAULT_HOST)
    p.add_argument("--port", type=int, default=DEFAULT_PORT,
                   help="port (default %d; KARTI's 8101 is next door and untouched)"
                        % DEFAULT_PORT)
    p.add_argument("--db", default=DEFAULT_DB,
                   help="SQLite file for RPG saves — the ONLY file this process "
                        "writes (default %s)" % DEFAULT_DB)
    p.add_argument("--karti", default=DEFAULT_KARTI_DB,
                   help="KARTI accounts db, opened READ-ONLY for token checks "
                        "(default %s)" % DEFAULT_KARTI_DB)
    p.add_argument("--origin", action="append", default=[],
                   help="extra allowed browser origin (repeatable)")
    p.add_argument("--any-origin", action="store_true",
                   help="DEBUG ONLY: accept any Origin header")
    p.add_argument("--verbose", action="store_true", help="log HTTP oddities to stderr")
    p.add_argument("--selftest", action="store_true",
                   help="run the built-in tests and exit (non-zero on failure)")
    args = p.parse_args(argv)

    for o in args.origin:
        ALLOWED_ORIGINS.add(o.rstrip("/"))
    if args.any_origin:
        ALLOW_ANY_ORIGIN = True

    if args.selftest:
        return selftest()

    if os.path.abspath(args.db) == os.path.abspath(args.karti):
        print("refusing to run: --db and --karti are the same file.", file=sys.stderr)
        return 1

    open_stores(args.db, args.karti)

    if args.host not in ("127.0.0.1", "::1", "localhost"):
        print("warning: binding to %s exposes the relay directly. Tailscale is "
              "meant to be the only way in." % args.host, file=sys.stderr)

    httpd = make_server(args.host, args.port, quiet=not args.verbose)
    print("QAWMIEN relay on %s:%d" % (args.host, args.port))
    print("  saves db       : %s%s" % (args.db, "" if STORE else "  (OFF)"))
    print("  karti db (ro)  : %s%s" % (args.karti, "" if AUTH else "  (OFF)"))
    print("  allowed origin : %s (+ loopback)" % PAGES_ORIGIN)
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nstopping...")
    finally:
        httpd.shutdown()
        httpd.server_close()
        if STORE is not None:
            STORE.close()
        if AUTH is not None:
            AUTH.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
