#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KARTI — the avatar photo store.

WHY IT IS ON THE SERVER AND NOT IN THE SAVE
    A face kept inside the account save blob only ever reaches that player's
    own devices. The whole point of a photo is that OTHER PEOPLE see it: on the
    leaderboard, in the online lobby roster, on the seat plates round a table.
    For that, somebody else's phone has to be able to fetch it, so it has to
    live here. It also keeps a photograph out of the 128 KB save cap, which is
    shared with the entire card collection.

THE THREE ROUTES  (also served at /avatar, like every other route here)
    POST   /karti/avatar        {tok, img:"data:image/...;base64,..."} -> {ok, ver}
    GET    /karti/avatar/<who>  -> image/jpeg bytes, or 404
    DELETE /karti/avatar        {tok}                                 -> {ok}

    <who> is the ACCOUNT KEY, which is the display name CASE-FOLDED — exactly
    what v_username() in karti_server.py produces and exactly what every
    /karti/acct/* route already uses as the primary key. The GET lower-cases
    what it is given, so /avatar/Sammy and /avatar/sammy are the same person.

    POST and DELETE need a live session token; there is no other way in. The
    GET is deliberately open to anybody who already knows a name, on the same
    reasoning as the invite route: a name is not a secret, and an <img src>
    cannot carry a bearer token.

WHAT A CLIENT SENT IS NEVER WHAT A CLIENT GETS
    The official client centre-crops and shrinks to 128x128 before it posts.
    NOTHING HERE ASSUMES THAT HAPPENED. Whatever arrives is re-decoded with
    Pillow, centre-cropped, resized to 128x128, and re-encoded as a JPEG THIS
    FILE PRODUCED. The bytes a stranger uploaded are never stored and never
    served. That is also how EXIF dies — including the GPS tag a phone puts in
    a photograph, which is a real privacy leak when the picture is about to be
    shown to everyone in the lobby.

    Refusing a bomb comes BEFORE decoding: the body is capped from
    Content-Length, the base64 payload is capped, and the image's DECLARED
    dimensions are read from the header and refused before a single pixel is
    rendered. A decompression bomb is a two-kilobyte file that claims to be
    50000x50000; Image.MAX_IMAGE_PIXELS is set as well, so even a plugin that
    decodes eagerly hits a wall.

NO PATH IS EVER BUILT FROM A NAME
    The images are BLOBs in SQLite, one row per account. There is no directory
    of avatar files, so there is no filename to traverse out of: a name reaches
    the database only as a bound SQL parameter. The name is validated anyway,
    because two walls cost nothing.

IF PILLOW IS NOT INSTALLED
    Avatars switch themselves off — the three routes answer 503 and everything
    else in the relay is untouched, exactly the way accounts behave when their
    database cannot be opened. The relay has no other third-party import and
    must never fail to start because of this one.

    python3 server/karti_avatar.py --selftest    # the image pipeline alone
    (the ROUTES are tested inside karti_server.py --selftest, with the rest.)
"""

from __future__ import annotations

import base64
import io
import os
import re
import sqlite3
import threading
import time
import warnings

# ── Pillow, optionally ───────────────────────────────────────────────────────
#
# The relay is otherwise pure standard library. This is the one exception, it
# is already on the Pi for scripts/postprocess.py, and it is imported in a way
# that CANNOT stop the process starting.

try:
    from PIL import Image, ImageFile
    # A truncated upload must raise, not quietly hand back half a picture with
    # the rest filled in grey. This is Pillow's default; pinned here so that a
    # library somewhere else in the process cannot flip it on for us.
    ImageFile.LOAD_TRUNCATED_IMAGES = False
    HAVE_PIL = True
except Exception:                                   # pragma: no cover
    Image = None
    HAVE_PIL = False


DEFAULT_DB = "/var/lib/karti/avatars.db"

# ── the caps, all of them, in one place ──────────────────────────────────────

SIZE = 128              # what we store, square. One size: see docs/ONLINE.md.
QUALITY = 80            # JPEG. 128x128 q80 is 3-6 KB for a real photograph.

MAX_BODY = 192 * 1024   # bytes of the whole POST body, refused from
                        # Content-Length BEFORE the socket is drained. The
                        # official client's 128x128 data URL is about 5 KB, so
                        # this still swallows a client that forgot to shrink a
                        # medium photo, and nothing larger.
MAX_IMG = 128 * 1024    # bytes of the DECODED base64 payload
MAX_PIXELS = 4_000_000  # declared width*height. Anything that fits in 128 KB
                        # and still claims more than four megapixels is a
                        # decompression bomb, not somebody's face.
MAX_SIDE = 8192         # ...and no single side beyond this either
MAX_STORED = 32 * 1024  # bytes of ONE stored JPEG. Unreachable at 128x128;
                        # it is a floor under the disk cap, not a policy.
MAX_TOTAL = 8 * 1024 * 1024     # bytes of every avatar added together. 250
                        # accounts x ~6 KB is 1.5 MB, so this is ~5x headroom.
                        # AT THE CAP: a NEW avatar is refused with 507, but a
                        # REPLACEMENT that does not grow the total is still
                        # accepted — nobody is ever locked out of CHANGING
                        # their own face by somebody else's.
MAX_ROWS = 2000         # rows the store will carry at all

# Formats we are willing to DECODE. Everything else is refused by name after
# the header is read. This list matters: Pillow's EPS plugin shells out to
# Ghostscript and its PDF plugin is no better, so "whatever Pillow can open"
# is not an acceptable answer to "what is an avatar".
DECODABLE = {"JPEG", "PNG", "WEBP", "GIF", "BMP"}

# Per-account and per-caller token buckets. Changing your face is a rare act,
# and a burst of them is somebody being a nuisance.
UP_RATE = 1.0 / 60.0    # PER ACCOUNT: one upload a minute, sustained...
UP_BURST = 5.0          # ...after a burst of five, which covers "try three
                        # photos and keep the third". This is the REAL control,
                        # because an upload cannot happen without a token and a
                        # token is exactly one account.

# PER ADDRESS, and deliberately loose. THE RELAY IS BEHIND TAILSCALE FUNNEL,
# which means every player in the world arrives from the same client address as
# far as this process can see. A tight per-address cap here would not stop an
# abuser — it would stop the whole party from picking a photo at once. It is a
# backstop against a genuine flood of decode work and nothing more; the account
# bucket above is what actually binds one person.
ADDR_RATE = 0.5         # thirty uploads a minute across everybody, sustained
ADDR_BURST = 30.0

GET_RATE = 20.0         # a leaderboard of 25 must not trip this
GET_BURST = 120.0
BUCKETS_MAX = 512       # buckets kept before the table is binned

# DECODES RUNNING AT ONCE, SERVER-WIDE. This is the memory guard, and it is the
# same instinct as the KDF gate in karti_server.py. A four-megapixel picture is
# about 12 MB of RGB while it is being worked on; the systemd unit gives this
# process MemoryMax=256M and scrypt is already allowed 2 x 16 MiB of it. Two at
# a time keeps the worst case around 50 MB however many phones upload at once.
DECODE_GATE = 2
DECODE_WAIT = 4.0       # seconds to wait for a slot before answering 503
_GATE = threading.BoundedSemaphore(DECODE_GATE)


class Busy(Exception):
    """Every decode slot is taken. Better a 503 than an out-of-memory kill."""

DATA_URL_RE = re.compile(r"^data:image/[a-z0-9.+-]{1,20};base64,", re.I)
# The account key charset, from v_username() in karti_server.py, case-folded.
# A key with a slash, a dot-dot, a backslash or a NUL cannot match this — and
# even if it did, it would still only ever be a bound SQL parameter.
KEY_RE = re.compile(r"^[a-z0-9_ .\-]{1,16}$")

E_OFF = "Avatar photos are switched off on this server."
E_BAD = "That is not a picture this server can use."
E_BIG = "That picture is too big."
E_TOKEN = "Please log in again."
E_SLOW = "Slow down."
E_FULL = "There is no room left for avatar photos."
E_BUSY = "The server is busy. Try again in a moment."


class Reject(Exception):
    """Not something a KARTI client could have produced."""


# ── the store ────────────────────────────────────────────────────────────────

class Store:
    """One SQLite file, one connection, one lock — the same shape as the
    accounts store and the leaderboard, and for the same reason: the load is a
    handful of requests a minute and sqlite3 objects are not thread-safe.

    A VERSION MAP IS KEPT IN MEMORY. Every presence answer and every
    leaderboard answer is annotated with the version of each named player's
    photo, so that lookup happens on a hot path and must never touch the disk.
    It is a dict of at most MAX_ROWS small integers."""

    def __init__(self, path: str):
        self.path = path
        self.lock = threading.RLock()
        if path != ":memory:":
            d = os.path.dirname(os.path.abspath(path))
            if d and not os.path.isdir(d):
                os.makedirs(d, mode=0o700, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False, timeout=5.0)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS avatars(
                uname TEXT PRIMARY KEY,
                ver   INTEGER NOT NULL,
                img   BLOB NOT NULL,
                bytes INTEGER NOT NULL,
                at    REAL NOT NULL
            );
            """
        )
        self.db.commit()
        if path != ":memory:":
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
        with self.lock:
            self.vers = {r[0]: int(r[1]) for r in
                         self.db.execute("SELECT uname,ver FROM avatars")}

    def close(self) -> None:
        with self.lock:
            try:
                self.db.close()
            except sqlite3.Error:
                pass

    # -- reading --------------------------------------------------------

    def version(self, uname: str) -> int:
        """0 when this account has no photo. Memory only: no disk, no lock
        contention, cheap enough to call once per row of a 25-row board."""
        return self.vers.get(uname, 0)

    def get(self, uname: str):
        """-> (ver, jpeg bytes) or None."""
        with self.lock:
            row = self.db.execute(
                "SELECT ver,img FROM avatars WHERE uname=?", (uname,)).fetchone()
        return (int(row[0]), bytes(row[1])) if row else None

    def counts(self):
        with self.lock:
            n = self.db.execute("SELECT COUNT(*) FROM avatars").fetchone()[0]
            t = self.db.execute("SELECT COALESCE(SUM(bytes),0) FROM avatars").fetchone()[0]
        return int(n), int(t)

    # -- writing --------------------------------------------------------

    def put(self, uname: str, img: bytes):
        """Store a JPEG THIS PROCESS ENCODED. -> new version, or "full".

        The version increments on every change and never goes backwards, so a
        client can cache `…/avatar/sammy?v=7` for a year and still never show a
        stale face."""
        now = time.time()
        n = len(img)
        with self.lock:
            row = self.db.execute(
                "SELECT ver,bytes FROM avatars WHERE uname=?", (uname,)).fetchone()
            if row is None and len(self.vers) >= MAX_ROWS:
                return "full"
            total = self.db.execute(
                "SELECT COALESCE(SUM(bytes),0) FROM avatars").fetchone()[0]
            grown = n - int(row[1] if row else 0)
            # A replacement that does not grow the total is allowed even at the
            # ceiling: you may always change your own face.
            if grown > 0 and (total + grown) > MAX_TOTAL:
                return "full"
            ver = int(row[0]) + 1 if row else 1
            self.db.execute(
                "INSERT INTO avatars(uname,ver,img,bytes,at) VALUES(?,?,?,?,?)"
                " ON CONFLICT(uname) DO UPDATE SET ver=excluded.ver,"
                " img=excluded.img, bytes=excluded.bytes, at=excluded.at",
                (uname, ver, sqlite3.Binary(img), n, now))
            self.db.commit()
            self.vers[uname] = ver
        return ver

    def drop(self, uname: str) -> bool:
        with self.lock:
            cur = self.db.execute("DELETE FROM avatars WHERE uname=?", (uname,))
            self.db.commit()
            self.vers.pop(uname, None)
        return cur.rowcount > 0

    def prune(self, exists) -> int:
        """Delete every row whose account is gone. `exists` is a callable that
        answers for one account key; it is asked about rows this store holds
        and never the other way round, so it cannot be used to walk the
        accounts table. -> how many were dropped."""
        with self.lock:
            keys = list(self.vers)
        gone = []
        for k in keys:
            try:
                if not exists(k):
                    gone.append(k)
            except Exception:
                return 0            # a resolver that is unwell deletes nothing
        # A RESOLVER THAT DENIES EVERYBODY IS NOT TO BE BELIEVED. This has
        # happened for real: a test relay was started with a throwaway
        # --accounts database but the DEFAULT avatar path, so this store held
        # the real players' photographs while `exists` answered from an
        # accounts file that had never heard of any of them — and one sweep
        # deleted every photo on the server. "Every single account is gone"
        # is indistinguishable from "I am asking the wrong accounts store",
        # and the safe reading of both is: delete nothing. A lone genuine
        # orphan (rows == 1) is still swept, because a one-row store whose
        # one account has gone is the ordinary case, not a mass event.
        if len(gone) == len(keys) and len(keys) > 1:
            return 0
        for k in gone:
            self.drop(k)
        return len(gone)


# ── module state ─────────────────────────────────────────────────────────────
#
# Set once by open_store(), from karti_server.main(). RESOLVE is the ONLY thing
# this module knows about accounts — give it a token, it gives back
# (uname, display name) or None — which is the same arrangement karti_stats.py
# uses, so there is no second session table and no import in either direction.

STORE: Store | None = None
RESOLVE = None
EXISTS = None

_LOCK = threading.Lock()
_BUCKETS = {"up": {}, "get": {}}


def open_store(path: str = DEFAULT_DB, resolver=None, exists=None):
    """Switch avatars on. Returns the Store, or None having said why — a store
    that cannot be opened must never stop the relay."""
    global STORE, RESOLVE, EXISTS
    if STORE is not None:
        STORE.close()
        STORE = None
    RESOLVE, EXISTS = resolver, exists
    if not HAVE_PIL:
        return None
    try:
        STORE = Store(path)
    except Exception:
        STORE = None
    return STORE


def close_store() -> None:
    global STORE
    if STORE is not None:
        STORE.close()
    STORE = None


def buckets_reset() -> None:
    with _LOCK:
        for d in _BUCKETS.values():
            d.clear()


def enabled() -> bool:
    return STORE is not None


def version(uname: str) -> int:
    """THE ONE FUNCTION THE REST OF THE RELAY CALLS. 0 = no photo, draw a face.

    Published beside every player's name — see annotate() — so a client knows
    whether a photo exists BEFORE it asks for one, and a leaderboard of
    twenty-five never fires twenty-five requests that end in 404."""
    if STORE is None or not uname:
        return 0
    return STORE.version(uname)


def forget(uname: str) -> bool:
    """An account has gone. Take its photo with it. Nothing in the relay
    deletes an account today; this is the hook for when something does, and
    prune() below is the belt to its braces."""
    if STORE is None or not uname:
        return False
    try:
        return STORE.drop(uname)
    except sqlite3.Error:
        return False


def prune() -> int:
    """Drop orphans — rows whose account no longer exists, however it went.
    Called from the relay's sweeper. No accounts resolver means no pruning,
    because "I cannot tell you who exists" must never read as "nobody does"."""
    if STORE is None or EXISTS is None:
        return 0
    try:
        return STORE.prune(EXISTS)
    except sqlite3.Error:
        return 0


def annotate(rows, key="k", out="pv") -> None:
    """Stamp a photo version onto a list of dicts, in place.

    `key` is the dict field holding the ACCOUNT KEY. `out` is only written when
    there IS a photo, so its ABSENCE is the answer "this player has no
    photograph, draw the face" — which costs a client nothing and saves it a
    404 per row."""
    if STORE is None:
        return
    for r in rows:
        if not isinstance(r, dict):
            continue
        k = r.get(key)
        if isinstance(k, str):
            v = STORE.version(k)
            if v:
                r[out] = v


# ── rate limiting ────────────────────────────────────────────────────────────

class _Bucket:
    __slots__ = ("rate", "cap", "tokens", "ts")

    def __init__(self, rate, cap):
        self.rate, self.cap = float(rate), float(cap)
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


def _allowed(kind: str, who: str, rate: float, burst: float) -> bool:
    with _LOCK:
        table = _BUCKETS[kind]
        if len(table) > BUCKETS_MAX:
            table.clear()
        b = table.get(who)
        if b is None:
            b = table[who] = _Bucket(rate, burst)
        return b.take()


def _addr(handler) -> str:
    try:
        return str(handler.client_address[0])
    except Exception:
        return "?"


# ── the image pipeline ───────────────────────────────────────────────────────

def decode_data_url(value) -> bytes:
    """A data URL in, raw bytes out. Refuses on size BEFORE decoding, and again
    after, because base64 grows by a third and a liar can pad."""
    if not isinstance(value, str):
        raise Reject("img")
    s = value.strip()
    m = DATA_URL_RE.match(s)
    if m:
        s = s[m.end():]
    # The prefix is a CONVENIENCE, never a proof: it says nothing about what
    # the bytes are, and the only thing that decides that is Pillow, below.
    s = re.sub(r"\s+", "", s)
    if not s:
        raise Reject("img")                 # empty is nonsense, not oversized
    if len(s) > (MAX_IMG * 4) // 3 + 8:
        raise Reject("big")
    try:
        raw = base64.b64decode(s, validate=True)
    except Exception:
        raise Reject("img")
    if not raw or len(raw) > MAX_IMG:
        raise Reject("big")
    return raw


def make_avatar(raw: bytes) -> bytes:
    """Whatever arrived -> a 128x128 JPEG THIS FUNCTION BUILT, with the decode
    gate held so this process's memory stays bounded however busy it gets."""
    if not _GATE.acquire(timeout=DECODE_WAIT):
        raise Busy()
    try:
        return _make_avatar(raw)
    finally:
        _GATE.release()


def _make_avatar(raw: bytes) -> bytes:
    """The pipeline itself. Never called without the gate held.

    In order, and the order is the point:
      1. open the HEADER only. Pillow reads size and format without rendering.
      2. refuse a format not on the whitelist — by what the decoder says it is,
         never by a data-URL prefix or a file extension.
      3. refuse absurd DECLARED dimensions. This is the bomb check, and it
         happens while the picture is still two kilobytes on the heap.
      4. NOW decode, one frame only.
      5. centre-crop to a square, resize to 128x128.
      6. paste onto a BRAND NEW canvas, so not one byte of the source's info
         dict — EXIF, GPS, ICC, comments, an animation's other frames — can
         ride along into what we save.
      7. encode JPEG. What is stored is always a JPEG we produced.
    """
    if not HAVE_PIL:
        raise Reject("off")
    if not raw or len(raw) > MAX_IMG:
        raise Reject("big")

    # Belt to the braces of step 3: even a plugin that decodes eagerly stops
    # here, with Pillow's own DecompressionBombError.
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS

    try:
        with warnings.catch_warnings():
            # Pillow WARNS between one and two times the limit. We refuse on
            # our own check below, and a stranger must not be able to write a
            # line to the relay's stderr by uploading a big picture.
            warnings.simplefilter("ignore", Image.DecompressionBombWarning)
            probe = Image.open(io.BytesIO(raw))     # header only, so far
    except Image.DecompressionBombError:
        # Pillow refuses outright at twice the limit, and only WARNS between
        # one and two — which is why the explicit check below still exists.
        raise Reject("bomb")
    except Exception:
        raise Reject("img")

    fmt = (probe.format or "").upper()
    if fmt not in DECODABLE:
        raise Reject("img")
    try:
        w, h = int(probe.size[0]), int(probe.size[1])
    except Exception:
        raise Reject("img")
    if w < 1 or h < 1 or w > MAX_SIDE or h > MAX_SIDE or (w * h) > MAX_PIXELS:
        raise Reject("bomb")

    try:
        probe.seek(0)                       # frame zero of an animation, only
    except Exception:
        pass
    try:
        src = probe.convert("RGB")          # this is where it actually decodes
    except Exception:
        raise Reject("img")
    finally:
        try:
            probe.close()
        except Exception:
            pass

    side = min(src.size)
    left = (src.size[0] - side) // 2
    top = (src.size[1] - side) // 2
    square = src.crop((left, top, left + side, top + side))
    small = square.resize((SIZE, SIZE), Image.LANCZOS)

    # A fresh canvas. resize() and crop() both COPY the source's .info dict,
    # and .info is where an ICC profile and a comment live; starting from a new
    # image means there is nothing to carry. (EXIF is only ever written when it
    # is passed to save(), and it is not passed here.)
    out = Image.new("RGB", (SIZE, SIZE), (0, 0, 0))
    out.paste(small, (0, 0))

    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=False)
    img = buf.getvalue()
    if not img or len(img) > MAX_STORED:
        raise Reject("big")
    return img


# ── routes ───────────────────────────────────────────────────────────────────
#
# These borrow four helpers off the handler — reply, reply_bytes,
# read_json_body and bearer — exactly as karti_stats.py does, so this module
# owns no HTTP plumbing of its own.

def _fail(handler, status: int, why: str, extra=None) -> None:
    body = {"ok": False, "why": why}
    if extra:
        body.update(extra)
    handler.reply(status, body)


def _who(handler, body):
    """(uname, display name) for a live session, or None. A token is the ONLY
    way to say who you are here: there is no field in the body that names an
    account, so there is nothing to spoof."""
    if RESOLVE is None:
        return None
    try:
        tok = handler.bearer(body or {})
    except Exception:
        tok = ""
    if not isinstance(tok, str) or not tok:
        return None
    try:
        who = RESOLVE(tok)
    except Exception:
        return None
    if not who or not isinstance(who, (tuple, list)) or len(who) < 2:
        return None
    return str(who[0]), str(who[1])


def handle_post(handler) -> None:
    """POST /karti/avatar  {tok, img} -> {ok, ver}"""
    if STORE is None:
        _fail(handler, 503, E_OFF)
        return
    if not _allowed("get", _addr(handler), GET_RATE, GET_BURST):
        _fail(handler, 429, E_SLOW, {"retryAfter": 5})
        return
    body = handler.read_json_body(MAX_BODY)
    if body is None:
        return                              # it has already answered
    who = _who(handler, body)
    if who is None:
        _fail(handler, 401, E_TOKEN, {"relogin": True})
        return
    uname, _name = who

    # Rate limited AFTER the token is checked, so the expensive part — decoding
    # a picture — is never reachable without an account. The ACCOUNT bucket is
    # the tight one and the ADDRESS bucket is the loose one; see the note by
    # ADDR_RATE for why that way round and not the other.
    if not _allowed("up", "a:" + uname, UP_RATE, UP_BURST):
        _fail(handler, 429, E_SLOW, {"retryAfter": 60})
        return
    if not _allowed("up", "i:" + _addr(handler), ADDR_RATE, ADDR_BURST):
        _fail(handler, 429, E_SLOW, {"retryAfter": 10})
        return

    try:
        raw = decode_data_url(body.get("img"))
        img = make_avatar(raw)
    except Busy:
        _fail(handler, 503, E_BUSY, {"retry": True})
        return
    except Reject as e:
        _fail(handler, 413 if str(e) == "big" else 400,
              E_BIG if str(e) in ("big", "bomb") else E_BAD)
        return
    except Exception:
        _fail(handler, 400, E_BAD)          # anything Pillow threw is a refusal
        return

    try:
        ver = STORE.put(uname, img)
    except sqlite3.Error:
        _fail(handler, 503, E_BUSY)
        return
    if ver == "full":
        _fail(handler, 507, E_FULL)
        return
    handler.reply(200, {"ok": True, "ver": int(ver), "bytes": len(img),
                        "size": SIZE})


def handle_delete(handler) -> None:
    """DELETE /karti/avatar  {tok} -> {ok}. Back to a drawn face."""
    if STORE is None:
        _fail(handler, 503, E_OFF)
        return
    if not _allowed("get", _addr(handler), GET_RATE, GET_BURST):
        _fail(handler, 429, E_SLOW, {"retryAfter": 5})
        return
    body = handler.read_json_body(MAX_BODY)
    if body is None:
        return
    who = _who(handler, body)
    if who is None:
        _fail(handler, 401, E_TOKEN, {"relogin": True})
        return
    try:
        gone = STORE.drop(who[0])
    except sqlite3.Error:
        _fail(handler, 503, E_BUSY)
        return
    handler.reply(200, {"ok": True, "had": bool(gone)})


def handle_get(handler, who: str, full_path: str = "") -> None:
    """GET /karti/avatar/<who> -> the JPEG, or a cheap 404.

    Open on purpose: an <img src> carries no bearer token, and a display name
    is not a secret — this route says exactly as much about who has an account
    as the invite route does, which is nothing you did not already have to
    know.
    """
    if STORE is None:
        _fail(handler, 503, E_OFF)
        return
    if not _allowed("get", _addr(handler), GET_RATE, GET_BURST):
        _fail(handler, 429, E_SLOW, {"retryAfter": 5})
        return

    key = clean_key(who)
    if key is None:
        _miss(handler)                      # a hostile name is simply not found
        return

    # THE CHEAP 404. Memory lookup, no SQLite, tiny body — because a lobby of
    # twenty-five could in principle ask twenty-five times. In practice it will
    # not: `pv` beside every name says up front who has a photo at all.
    ver = STORE.version(key)
    if not ver:
        _miss(handler)
        return

    tag = '"%d"' % ver
    if (handler.headers.get("If-None-Match") or "").strip() == tag:
        handler.send_response(304)
        handler.send_header("ETag", tag)
        handler.send_header("Cache-Control", _cache_for(full_path, ver))
        handler.send_header("Content-Length", "0")
        handler.cors()
        handler.end_headers()
        return

    try:
        row = STORE.get(key)
    except sqlite3.Error:
        _fail(handler, 503, E_BUSY)
        return
    if row is None:
        _miss(handler)
        return
    ver, img = row

    handler.send_response(200)
    handler.send_header("Content-Type", "image/jpeg")
    handler.send_header("Content-Length", str(len(img)))
    handler.send_header("Cache-Control", _cache_for(full_path, ver))
    handler.send_header("ETag", '"%d"' % ver)
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("Referrer-Policy", "no-referrer")
    # It is an image and nothing else. If a browser is ever talked into
    # navigating to it, it downloads rather than renders in our origin.
    handler.send_header("Content-Disposition", "inline")
    handler.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
    handler.cors()
    handler.end_headers()
    try:
        handler.wfile.write(img)
    except OSError:
        pass


def _cache_for(full_path: str, ver: int) -> str:
    """?v=<the version we are actually serving> means this exact JPEG can never
    change, so cache it for a year. Anything else — no v, a stale v, a guess —
    gets a minute, so a client that omitted it is never frozen on an old face.
    """
    q = (full_path or "").split("?", 1)
    if len(q) == 2:
        for bit in q[1].split("&"):
            if bit[:2] == "v=" and bit[2:].isdigit() and int(bit[2:]) == ver:
                return "public, max-age=31536000, immutable"
    return "public, max-age=60"


def _miss(handler) -> None:
    """No photograph. The client draws the face it already has. Cached briefly
    so that a roster which does ask cannot ask again a second later."""
    body = b'{"ok":false,"why":"no photo"}'
    handler.send_response(404)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "public, max-age=30")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.cors()
    handler.end_headers()
    try:
        handler.wfile.write(body)
    except OSError:
        pass


def clean_key(who) -> str | None:
    """A path segment -> an account key, or None.

    Percent-decoded FIRST, because %2e%2e%2f is the whole trick, then matched
    against the account charset. A slash, a backslash, a NUL or a dot-dot
    cannot survive this. Nothing downstream builds a path out of the result
    regardless: it is a bound SQL parameter and the images are BLOBs.
    """
    if not isinstance(who, str) or not who:
        return None
    try:
        from urllib.parse import unquote
        s = unquote(who, errors="strict")
    except Exception:
        return None
    s = s.strip().lower()
    if not s or len(s) > 16:
        return None
    if not KEY_RE.match(s):
        return None
    if ".." in s or "/" in s or "\\" in s or "\x00" in s:
        return None                         # already impossible; said anyway
    return s


# ── test fixture ─────────────────────────────────────────────────────────────

def bomb_png(w: int = 50000, h: int = 50000) -> bytes:
    """A DECOMPRESSION BOMB, in about a hundred bytes. Test fixture only.

    This is what the real attack looks like: a valid PNG header declaring a
    two-and-a-half-gigapixel canvas, and almost no file behind it. Pillow reads
    only the IHDR to answer .size, which is exactly why the dimension check in
    make_avatar() happens there and not after a decode that would never return.
    Both this module's --selftest and karti_server.py's use it.
    """
    import struct as _struct
    import zlib as _zlib

    def chunk(kind, data):
        return (_struct.pack(">I", len(data)) + kind + data
                + _struct.pack(">I", _zlib.crc32(kind + data) & 0xFFFFFFFF))

    ihdr = _struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)    # 8-bit greyscale
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", _zlib.compress(b"\x00" * 64, 9))
            + chunk(b"IEND", b""))


# ── self-test: the image pipeline on its own ─────────────────────────────────
#
# The ROUTES are tested in karti_server.py --selftest, over a real socket, with
# a real session token. This one is here so the crop/strip/refuse logic can be
# run without standing a relay up.

def _selftest() -> int:                     # pragma: no cover
    results = []

    def check(name, ok, detail=""):
        results.append(bool(ok))
        print("  %-4s %s%s" % ("PASS" if ok else "FAIL", name,
                               ("   << " + str(detail)[:200]) if (detail and not ok) else ""))

    if not HAVE_PIL:
        print("Pillow is not installed — avatars would be OFF.")
        return 1

    im = Image.new("RGB", (400, 200), (200, 30, 30))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    png = buf.getvalue()

    out = make_avatar(png)
    back = Image.open(io.BytesIO(out))
    check("a PNG comes back a %dx%d JPEG" % (SIZE, SIZE),
          back.format == "JPEG" and back.size == (SIZE, SIZE), (back.format, back.size))
    check("...and it is small", len(out) < MAX_STORED, len(out))

    try:
        make_avatar(b"this is not a picture, it is a sentence")
        check("a non-image is refused", False)
    except Reject:
        check("a non-image is refused", True)

    bomb = bomb_png(50000, 50000)
    keep = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = None                   # so the fixture can be read
    declared = Image.open(io.BytesIO(bomb)).size
    Image.MAX_IMAGE_PIXELS = keep
    check("a 2.5 gigapixel bomb is under a kilobyte on the wire",
          len(bomb) < 1024 and declared == (50000, 50000), (len(bomb), declared))
    try:
        make_avatar(bomb)
        check("a decompression bomb is refused on its DIMENSIONS, not its size", False)
    except Reject as e:
        check("a decompression bomb is refused on its DIMENSIONS, not its size",
              str(e) == "bomb", str(e))

    # ...and the same trick just under Pillow's own two-times-the-limit hard
    # stop, where Pillow only warns and OUR check is the one that has to fire.
    try:
        make_avatar(bomb_png(2400, 2400))           # 5.76 MP, over MAX_PIXELS
        check("an image just over the pixel cap is refused by OUR check", False)
    except Reject as e:
        check("an image just over the pixel cap is refused by OUR check",
              str(e) == "bomb", str(e))

    exif = Image.Exif()
    exif[0x8825] = {1: "N", 2: (35.0, 53.0, 0.0), 3: "E", 4: (14.0, 30.0, 0.0)}
    exif[0x010F] = "SuperPhone"
    b2 = io.BytesIO()
    Image.new("RGB", (300, 300), (10, 90, 200)).save(b2, "JPEG", exif=exif.tobytes())
    src = b2.getvalue()
    check("the test photo really does carry GPS",
          b"SuperPhone" in src and bool(Image.open(io.BytesIO(src)).getexif()))
    clean = make_avatar(src)
    check("EXIF, camera and GPS do not survive",
          b"SuperPhone" not in clean and not dict(Image.open(io.BytesIO(clean)).getexif()),
          dict(Image.open(io.BytesIO(clean)).getexif()))

    for bad in ("../sammy", "sam/my", "sam\\my", "sam\x00my", "%2e%2e%2fetc",
                "..", "a" * 17, ""):
        check("the key %r is refused" % bad, clean_key(bad) is None, clean_key(bad))
    check("a real name folds to its key", clean_key("Sammy") == "sammy")

    bad = sum(1 for ok in results if not ok)
    print("\nAVATAR SELFTEST: %s  (%d checks, %d failed)"
          % ("ALL PASS" if not bad else "FAILURES", len(results), bad))
    return 0 if not bad else 1


if __name__ == "__main__":                  # pragma: no cover
    import sys
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    print(__doc__)
