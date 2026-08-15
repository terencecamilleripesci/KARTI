#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KARTI relay — a small, hostile-internet-facing WebSocket room relay.

WHAT IT IS
    Python 3 standard library ONLY. No pip, no framework, no database.
    It does exactly one job: pair two players by a short room code and pass
    validated JSON duel moves between them. That is the whole feature set.

WHAT IT IS NOT
    * It is NOT a web server. It never opens a file, never lists a directory,
      never serves anything from disk. The game itself is hosted on GitHub
      Pages; this process only relays.
    * It is NOT a referee. It does not know the rules of KARTI. The two
      clients run the same deterministic engine in lockstep and compare
      checksums; the relay only carries the moves. A cheating client can
      only desynchronise its own duel, which the checksum then catches.

DEPLOYMENT IT IS BUILT FOR
    game   : https://terencecamilleripesci.github.io/KARTI/       (GitHub Pages)
    relay  : this process, bound to 127.0.0.1:8101 on a Raspberry Pi
    public : Tailscale Funnel republishes it at
             https://raspberrypi.silverside-tench.ts.net:8443/karti
    Funnel forwards the FULL path, so every route is served both at
    /karti/<x> (production) and /<x> (local testing).

ROUTES
    GET  /karti/ws        (or /ws)        WebSocket upgrade, the relay itself
    GET  /karti/health    (or /health)    tiny JSON status, no room contents
    GET  /karti/presence  (or /presence)  who is connected right now: chosen
                                          display names + a state, plus THE ROOM
                                          LIST (open rooms waiting for an
                                          opponent). No codes, no tokens, no IPs.
    anything else                         404 JSON. No disk access, ever.

PROTOCOL  (one JSON object per WebSocket text frame, both directions)
    client -> server                        server -> client
    {"t":"create","private":false}          {"t":"created","code":C,"token":T,
                                             "host":true,"seq":0,"private":false}
                                            "private":true opens a room that is
                                            NOT in the public room list and can
                                            only be entered with its code.
    {"t":"join","code":C}                   {"t":"joined","code":C,"token":T,
                                             "host":false,"seq":N}
                                            peer: {"t":"peer","state":"joined"}
    {"t":"joinid","id":P}                   same "joined" reply. P is the public
                                            handle from /presence — the one
                                            carried by each entry in the room
                                            list — so you tap a room and are
                                            seated without ever being told, or
                                            typing, anybody's room code.
    {"t":"name","n":"TERENCE"}              {"t":"named","n":"TERENCE"}
    {"t":"rejoin","code":C,"token":T,       {"t":"rejoined","code":C,"host":B,
              "since":N}                     "seq":N,"peer":B} + replayed relays
                                            peer: {"t":"peer","state":"rejoined"}
    {"t":"relay","d":{...}}                 peer: {"t":"relay","n":SEQ,"d":{...}}
    {"t":"leave"}                           peer: {"t":"peer","state":"left"}
    {"t":"ping"}                            {"t":"pong"}
                                            {"t":"error","why":"..."}   (fixed text)
                                            {"t":"closed","why":"..."}  then close

PRESENCE, AND WHAT IT DELIBERATELY DOES NOT SAY
    /presence answers with counts, a capped list of {name, state} where state is
    idle | waiting | playing, and the ROOM LIST: every open, public, still-empty
    room as {"id":handle,"n":opener's name,"w":seconds waited}. It NEVER
    contains an IP address, a seat token, or the room code of a room the reader
    is not sitting in. The handle is an opaque one-connection value published
    ONLY while that player is advertising a free public seat; it dies with the
    socket, resolves to nothing once the room is full, and never appears at all
    for a private room. Names are player-chosen, scrubbed with the same filter
    as every other name on the wire, capped in length and in number, and live
    only in memory. The room list is capped too, and over the cap a random
    sample goes out rather than the head of a sortable list.

    A socket that dies is NOT a forfeit: the seat is held for GRACE seconds
    (the peer is told {"t":"peer","state":"dropped"}) so a phone that loses
    signal can come back with "rejoin" and replay the moves it missed.

RUN
    python3 server/karti_server.py                 # 127.0.0.1:8101
    python3 server/karti_server.py --port 8101
    python3 server/karti_server.py --selftest      # abuse + happy-path tests
    python3 server/karti_server.py --log /var/log/karti-relay.log

    See docs/ONLINE.md for the systemd unit and the tailscale funnel command.
"""

from __future__ import annotations

import argparse
import base64
import collections
import hashlib
import json
import os
import random
import re
import secrets
import socket
import struct
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ── deployment constants ─────────────────────────────────────────────────────

DEFAULT_HOST = "127.0.0.1"          # loopback ONLY. Tailscale does the exposing.
DEFAULT_PORT = 8101
PATH_PREFIX = "/karti"              # funnel forwards the full path

# The one browser origin that is allowed to open a socket here. Extra origins
# can be added with --origin; loopback origins are allowed so the whole thing
# can be driven by a local test harness.
PAGES_ORIGIN = "https://terencecamilleripesci.github.io"
LOOPBACK_ORIGIN_RE = re.compile(r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$")

# Room codes: 5 characters from an alphabet with no O, 0, I or 1 in it, so a
# code can be read down the phone without anybody arguing. 32**5 = 33.5M codes.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LEN = 5
CODE_RE = re.compile("^[%s]{%d}$" % (CODE_ALPHABET, CODE_LEN))


class L:
    """Every hard limit in one place. --selftest overrides some of these."""

    MAX_SOCKETS = 96            # concurrent TCP connections accepted at all
    MAX_WS = 64                 # concurrent upgraded WebSockets
    MAX_ROOMS = 128             # concurrent rooms
    SEATS = 2                   # players per room. Not configurable on purpose.

    MAX_MSG = 16 * 1024         # bytes, one WebSocket message (largest real
                                # message, the deal, is ~2 KB)
    MSG_RATE = 25.0             # sustained messages/second per connection
    MSG_BURST = 50.0
    BYTE_RATE = 96 * 1024.0     # sustained bytes/second per connection
    BYTE_BURST = 256 * 1024.0

    MAX_CREATES = 5             # rooms one connection may ever create
    MAX_BAD_JOINS = 20          # wrong room codes before the socket is cut
    MAX_ERRORS = 30             # protocol errors before the socket is cut
    MAX_NAME_SETS = 8           # display-name changes one connection may make

    NAME_LEN = 16               # characters of a display name that survive
    PRESENCE_MAX = 24           # names /presence will ever list
    ROOMS_MAX = 16              # OPEN ROOMS /presence will ever list. Over that a
                                # random sample is published, so no fixed ordering
                                # can be gamed to bury one particular real room.
    PRESENCE_CACHE = 3.0        # seconds one /presence answer is reused for
    PRESENCE_RATE = 1.0         # sustained /presence requests per second, per
    PRESENCE_BURST = 8.0        #   caller, and the burst it may spend at once
    PRESENCE_CALLERS = 512      # rate-limit buckets kept before they are binned

    ROOM_IDLE = 30 * 60.0       # seconds of silence before a room is binned
    GRACE = 60.0                # seconds a dropped seat is held for a rejoin
    REPLAY_MSGS = 96            # per room: buffered messages for a rejoin
    REPLAY_BYTES = 192 * 1024   # per room: bytes of that buffer

    SOCK_TIMEOUT = 120.0        # no frame for this long -> close the socket
    HTTP_TIMEOUT = 15.0         # slow-loris guard on the handshake
    SWEEP = 2.0                 # seconds between housekeeping passes


# Fixed error strings. Nothing an attacker sends is ever reflected back.
E_JSON = "Bad message."
E_SHAPE = "Bad message."
E_BIG = "Message too big."
E_FLOOD = "Slow down."
E_NOROOM = "No room with that code."
E_FULL_ROOM = "That room already has two players."
E_FULL_SERVER = "The server is busy. Try again in a minute."
E_NOTIN = "You are not in a room."
E_NOPEER = "Nobody else in the room yet."
E_BADTOKEN = "That room seat is not yours."
E_TOOMANY = "Too many rooms from one connection."
E_NOWAIT = "That player is not waiting for anyone."
E_SLOW = "Slow down."

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
OP_CONT, OP_TEXT, OP_BIN, OP_CLOSE, OP_PING, OP_PONG = 0x0, 0x1, 0x2, 0x8, 0x9, 0xA


# ── tiny append-only log (the only file this process ever touches) ───────────

class Journal:
    """Optional single append-only log. Never records message contents."""

    def __init__(self, path=None):
        self.path = path
        self._lock = threading.Lock()

    def __call__(self, event, **kw):
        if not self.path:
            return
        bits = " ".join("%s=%s" % (k, v) for k, v in sorted(kw.items()))
        line = "%s %s %s\n" % (time.strftime("%Y-%m-%dT%H:%M:%S"), event, bits)
        try:
            with self._lock:
                with open(self.path, "a", encoding="utf-8") as fh:
                    fh.write(line)
        except OSError:
            self.path = None        # a broken log must never break the relay


LOG = Journal()


# ── rate limiting ────────────────────────────────────────────────────────────

class Bucket:
    """Token bucket. take() is False when the caller is going too fast."""

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


# ── message validation ───────────────────────────────────────────────────────
#
# Nothing a client sends is ever forwarded verbatim. Every relay payload is
# taken apart, checked field by field, and REBUILT from scratch, so the peer
# only ever receives a structure this file constructed itself.

class Reject(Exception):
    """The message is not something KARTI could have produced."""


ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,24}$")            # card / deck ids
NAME_BAD = re.compile(r"[\x00-\x1f\x7f<>&\"'\\`]")      # keep names inert
MAX_DECK_KEYS = 64
MAX_DECK_CARDS = 60

ACT_KINDS = ("summon", "set", "spell", "attack", "pos", "battle", "end", "forfeit")
RELAY_KINDS = ("hello", "start", "act", "bail")


def v_int(v, lo, hi):
    if isinstance(v, bool) or not isinstance(v, int) or v < lo or v > hi:
        raise Reject("int")
    return v


def v_bool(v):
    if not isinstance(v, bool):
        raise Reject("bool")
    return v


def v_name(v, n=24):
    if not isinstance(v, str):
        raise Reject("name")
    v = NAME_BAD.sub("", v).strip()[:n]
    return v or "PLAYER"


def v_optstr(v, n):
    if v is None:
        return None
    if not isinstance(v, str) or len(v) > n:
        raise Reject("str")
    return NAME_BAD.sub("", v)


def v_id(v):
    if not isinstance(v, str) or not ID_RE.match(v):
        raise Reject("id")
    return v


def v_idlist(v, maxn=MAX_DECK_CARDS):
    if not isinstance(v, list) or len(v) > maxn:
        raise Reject("idlist")
    return [v_id(x) for x in v]


def v_decklist(v):
    """{cardId: count} — the shape KARTI uses for a deck."""
    if not isinstance(v, dict) or len(v) > MAX_DECK_KEYS:
        raise Reject("decklist")
    out = {}
    total = 0
    for k, n in v.items():
        out[v_id(k)] = v_int(n, 1, 3)
        total += n
    if total > MAX_DECK_CARDS:
        raise Reject("decklist")
    return out


def v_intlist(v, maxn, lo, hi):
    if not isinstance(v, list) or len(v) > maxn:
        raise Reject("intlist")
    return [v_int(x, lo, hi) for x in v]


def v_act_args(kind, a):
    if kind in ("battle", "end", "forfeit"):
        return None
    if not isinstance(a, dict):
        raise Reject("act args")
    if kind == "summon":
        return {"hi": v_int(a.get("hi"), 0, 31), "zi": v_int(a.get("zi"), 0, 9),
                "pos": "def" if a.get("pos") == "def" else "atk",
                "fd": v_bool(bool(a.get("fd"))),
                "tributes": v_intlist(a.get("tributes") or [], 3, 0, 9)}
    if kind == "set":
        return {"hi": v_int(a.get("hi"), 0, 31), "zi": v_int(a.get("zi"), 0, 9)}
    if kind == "spell":
        tgt = a.get("target")
        if tgt is None:
            t = None
        else:
            if not isinstance(tgt, dict):
                raise Reject("target")
            t = {"side": v_int(tgt.get("side"), 0, 1), "i": v_int(tgt.get("i"), 0, 9)}
        return {"hi": v_int(a.get("hi"), 0, 31), "target": t}
    if kind == "attack":
        return {"zi": v_int(a.get("zi"), 0, 9), "t": v_int(a.get("t"), -1, 9)}
    if kind == "pos":
        return {"zi": v_int(a.get("zi"), 0, 9)}
    raise Reject("act kind")


def sanitize_relay(d):
    """Rebuild a duel payload from scratch, or raise Reject."""
    if not isinstance(d, dict):
        raise Reject("payload")
    k = d.get("k")
    if k not in RELAY_KINDS:
        raise Reject("kind")

    if k == "hello":
        return {"k": "hello",
                "name": v_name(d.get("name")),
                "list": v_decklist(d.get("list")),
                "deckKey": v_optstr(d.get("deckKey"), 32),
                "deckName": v_optstr(d.get("deckName"), 40)}

    if k == "start":
        out = {"k": "start",
                "seed": v_int(d.get("seed"), 0, 0xFFFFFFFF),
                "hostName": v_name(d.get("hostName")),
                "guestName": v_name(d.get("guestName")),
                "hostList": v_decklist(d.get("hostList")),
                "guestList": v_decklist(d.get("guestList")),
                "hostKey": v_optstr(d.get("hostKey"), 32),
                "guestKey": v_optstr(d.get("guestKey"), 32),
                "hostDeck": v_idlist(d.get("hostDeck")),
                "guestDeck": v_idlist(d.get("guestDeck"))}
        # Which seat takes the first turn, drawn by the client from the shared
        # seed so the host cannot simply award it to itself. It MUST survive the
        # relay: every payload is rebuilt from this whitelist, so a field left out
        # here is silently dropped and the two clients would then disagree about
        # whose turn it is. Only passed through when actually sent, so an older
        # client's deal is relayed byte-for-byte as before.
        if "hostFirst" in d:
            out["hostFirst"] = bool(d.get("hostFirst"))
        return out

    if k == "act":
        kind = d.get("kind")
        if kind not in ACT_KINDS:
            raise Reject("act kind")
        ck = d.get("ck")
        if ck is not None and (not isinstance(ck, str) or len(ck) > 1024):
            raise Reject("checksum")
        return {"k": "act", "kind": kind, "a": v_act_args(kind, d.get("a")),
                "ck": ck if isinstance(ck, str) else None}

    # bail
    why = d.get("why")
    return {"k": "bail", "why": v_name(why, 120) if isinstance(why, str) else "They stopped."}


# ── WebSocket frames ─────────────────────────────────────────────────────────

class WSError(Exception):
    def __init__(self, message, code=1002):
        super().__init__(message)
        self.code = code


def _read_exact(rfile, n):
    if n == 0:
        return b""
    chunks = []
    got = 0
    while got < n:
        chunk = rfile.read(n - got)
        if not chunk:
            raise WSError("closed while reading", 1006)
        chunks.append(chunk)
        got += len(chunk)
    return b"".join(chunks)


def _unmask(data, mask):
    if not mask:
        return data
    out = bytearray(data)
    for i in range(len(out)):
        out[i] ^= mask[i & 3]
    return bytes(out)


def ws_read_frame(rfile, require_mask=True, max_payload=None):
    """One frame -> (fin, opcode, payload). Refuses anything oversized BEFORE
    reading the body, so a lying length header costs us nothing."""
    limit = L.MAX_MSG if max_payload is None else max_payload
    head = _read_exact(rfile, 2)
    b1, b2 = head[0], head[1]
    fin = bool(b1 & 0x80)
    if b1 & 0x70:
        raise WSError("reserved bits", 1002)
    opcode = b1 & 0x0F
    masked = bool(b2 & 0x80)
    length = b2 & 0x7F

    if require_mask and not masked:
        raise WSError("unmasked client frame", 1002)      # RFC 6455 5.1

    if length == 126:
        length = struct.unpack("!H", _read_exact(rfile, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _read_exact(rfile, 8))[0]

    if length > limit:
        raise WSError("payload too big", 1009)

    if opcode in (OP_CLOSE, OP_PING, OP_PONG):
        if not fin:
            raise WSError("fragmented control frame", 1002)
        if length > 125:
            raise WSError("oversized control frame", 1002)

    mask = _read_exact(rfile, 4) if masked else b""
    payload = _read_exact(rfile, length)
    if masked:
        payload = _unmask(payload, mask)
    return fin, opcode, payload


def ws_build_frame(opcode, payload, mask=False):
    n = len(payload)
    out = bytearray()
    out.append(0x80 | (opcode & 0x0F))
    bit = 0x80 if mask else 0x00
    if n < 126:
        out.append(bit | n)
    elif n <= 0xFFFF:
        out.append(bit | 126)
        out += struct.pack("!H", n)
    else:
        out.append(bit | 127)
        out += struct.pack("!Q", n)
    if mask:
        key = os.urandom(4)
        out += key
        out += _unmask(payload, key)
    else:
        out += payload
    return bytes(out)


def ws_accept_key(client_key):
    digest = hashlib.sha1((client_key.strip() + WS_GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


# ── one connected player ─────────────────────────────────────────────────────

class Conn:
    _seq = 0
    _seq_lock = threading.Lock()

    def __init__(self, sock, addr):
        with Conn._seq_lock:
            Conn._seq += 1
            self.cid = Conn._seq
        self.sock = sock
        self.addr = addr
        self.send_lock = threading.Lock()
        self.alive = True
        self.room_code = None
        self.slot = -1
        self.msgs = Bucket(L.MSG_RATE, L.MSG_BURST)
        self.bytes = Bucket(L.BYTE_RATE, L.BYTE_BURST)
        self.creates = 0
        self.bad_joins = 0
        self.errors = 0
        self.doomed = None          # a reason string -> pump closes the socket
        # Presence. Both of these are ephemeral: they exist for the lifetime of
        # this socket and are never written anywhere.
        self.pname = ""             # player-chosen display name, already scrubbed
        self.name_sets = 0
        self.pid = secrets.token_urlsafe(8)   # public handle, ONLY ever published
                                              # while this player is waiting

    def _raw(self, data):
        with self.send_lock:
            if not self.alive:
                return False
            try:
                self.sock.sendall(data)
                return True
            except OSError:
                self.alive = False
                return False

    def send_text(self, text):
        return self._raw(ws_build_frame(OP_TEXT, text.encode("utf-8")))

    def send_json(self, obj):
        return self.send_text(json.dumps(obj, separators=(",", ":")))

    def send_pong(self, payload):
        return self._raw(ws_build_frame(OP_PONG, payload))

    def send_close(self, code=1000, reason=""):
        body = struct.pack("!H", code) + reason.encode("utf-8")[:120]
        return self._raw(ws_build_frame(OP_CLOSE, body))

    def error(self, why):
        """Send a fixed error string. Too many of them and the socket dies."""
        self.errors += 1
        self.send_json({"t": "error", "why": why})
        if self.errors > L.MAX_ERRORS:
            self.doom("Too many bad messages.")

    def doom(self, why):
        self.doomed = why

    def kill(self):
        with self.send_lock:
            self.alive = False
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    def __repr__(self):
        return "<Conn %d room=%s slot=%d>" % (self.cid, self.room_code, self.slot)


class Seat:
    __slots__ = ("token", "conn", "gone_at")

    def __init__(self, token):
        self.token = token
        self.conn = None
        self.gone_at = 0.0          # monotonic time the socket dropped, 0 = present


class Room:
    __slots__ = ("code", "seats", "seq", "buf", "buf_bytes", "created", "touched",
                 "private")

    def __init__(self, code, private=False):
        self.code = code
        self.seats = [None, None]           # Seat or None
        self.seq = 0
        self.buf = collections.deque()      # (n, to_slot, text) for rejoin replay
        self.buf_bytes = 0
        self.created = time.monotonic()
        self.touched = time.monotonic()
        # A private room is never named in /presence and cannot be entered with a
        # join handle. The only way in is the room code, which only its opener has.
        self.private = bool(private)

    def push(self, to_slot, text):
        self.seq += 1
        self.buf.append((self.seq, to_slot, text))
        self.buf_bytes += len(text)
        while len(self.buf) > L.REPLAY_MSGS or self.buf_bytes > L.REPLAY_BYTES:
            _, _, old = self.buf.popleft()
            self.buf_bytes -= len(old)
        return self.seq

    def occupied(self):
        return sum(1 for s in self.seats if s is not None)

    def live_conns(self):
        return [s.conn for s in self.seats if s is not None and s.conn is not None]


# ── all shared mutable state, behind one lock ────────────────────────────────

class RoomBook:
    """Public methods return WHAT TO SEND; no socket write happens under lock."""

    def __init__(self):
        self._lock = threading.Lock()
        self._rooms = {}
        self._conns = set()
        self._by_pid = {}

    # -- registry ---------------------------------------------------------

    def try_register(self, conn):
        with self._lock:
            if len(self._conns) >= L.MAX_WS:
                return False
            self._conns.add(conn)
            self._by_pid[conn.pid] = conn
            return True

    def unregister(self, conn):
        with self._lock:
            self._conns.discard(conn)
            if self._by_pid.get(conn.pid) is conn:
                self._by_pid.pop(conn.pid, None)

    def stats(self):
        with self._lock:
            return len(self._rooms), len(self._conns)

    # -- presence ---------------------------------------------------------

    def presence(self):
        """Counts, a capped list of {name, state}, and THE ROOM LIST. Assembled
        here, under the one lock, so the HTTP thread never walks live room
        structures.

        The room list is the whole point of the Online screen: every room that
        is open, not private, and still short of an opponent, as
        {id, name, waited-seconds}. `id` is the SAME opaque per-socket join
        handle the who's-online panel already used — it belongs to one socket,
        it is withdrawn the instant the room fills, and `joinid` re-resolves it
        server-side, so a client never names a room it wants to enter.

        What goes out: a display name the player typed into their own phone, one
        of three words, and how long a room has been waiting. What NEVER goes
        out: the peer address, the seat token, the room CODE, the room contents,
        anything at all about a private room, or any handle for a player who is
        not advertising a free seat."""
        rows = []
        rooms = []
        counts = {"idle": 0, "waiting": 0, "playing": 0}
        now = time.monotonic()
        with self._lock:
            for conn in self._conns:
                room = self._room_of(conn)
                if room is None:
                    state = "idle"
                elif room.occupied() >= 2:
                    state = "playing"
                else:
                    state = "waiting"
                counts[state] += 1
                # A handle is published for exactly one situation: this player is
                # sitting alone in a room that anybody is welcome to join.
                offered = state == "waiting" and not room.private
                rows.append((state, conn.pname or "PLAYER",
                             conn.pid if offered else None))
                if offered:
                    rooms.append({"id": conn.pid, "n": conn.pname or "PLAYER",
                                  "w": max(0, int(now - room.created))})

        # waiting first: that is the only row anybody can act on
        order = {"waiting": 0, "playing": 1, "idle": 2}
        rows.sort(key=lambda r: (order[r[0]], r[1]))
        players = []
        for state, name, pid in rows[:L.PRESENCE_MAX]:
            entry = {"n": name, "s": state}
            if pid:
                entry["id"] = pid
            players.append(entry)

        # More open rooms than we will publish -> take a RANDOM sample, not the
        # head of a sorted list. Somebody holding a pile of sockets still takes
        # up their share of the list, but they cannot choose which real room
        # falls off it. The sample is then shown longest-waiting first.
        open_rooms = len(rooms)
        if open_rooms > L.ROOMS_MAX:
            rooms = random.sample(rooms, L.ROOMS_MAX)
        rooms.sort(key=lambda r: (-r["w"], r["n"]))

        total = counts["idle"] + counts["waiting"] + counts["playing"]
        return {"ok": True, "count": total, "idle": counts["idle"],
                "waiting": counts["waiting"], "playing": counts["playing"],
                "shown": len(players), "max": L.PRESENCE_MAX,
                "every": 12, "players": players,
                "rooms": rooms, "open": open_rooms, "roomsMax": L.ROOMS_MAX}

    def set_name(self, conn, raw):
        """A display name for the presence list. Scrubbed and capped exactly
        like every other name that crosses this relay."""
        if conn.name_sets >= L.MAX_NAME_SETS:
            return [(conn, {"t": "error", "why": E_SLOW})]
        try:
            name = v_name(raw, L.NAME_LEN)
        except Reject:
            return [(conn, {"t": "error", "why": E_SHAPE})]
        conn.name_sets += 1
        conn.pname = name
        return [(conn, {"t": "named", "n": name})]

    def join_by_id(self, conn, pid):
        """Take the empty seat a waiting player is advertising. The caller
        never learns the room code until they are actually sitting in it, and
        a handle for anyone who is NOT publicly waiting resolves to nothing —
        including a private room, which can only ever be entered by code."""
        code = None
        if isinstance(pid, str) and 0 < len(pid) <= 32:
            with self._lock:
                host = self._by_pid.get(pid)
                if host is not None and host is not conn:
                    room = self._room_of(host)
                    if room is not None and room.occupied() == 1 and not room.private:
                        code = room.code
        if code is None:
            conn.bad_joins += 1
            return [(conn, {"t": "error", "why": E_NOWAIT})]
        return self.join(conn, code)

    # -- helpers, lock held ------------------------------------------------

    def _new_code(self):
        for _ in range(64):
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
            if code not in self._rooms:
                return code
        return None

    def _room_of(self, conn):
        if conn.room_code is None or conn.slot < 0:
            return None
        room = self._rooms.get(conn.room_code)
        if room is None:
            return None
        seat = room.seats[conn.slot]
        if seat is None or seat.conn is not conn:
            return None                     # someone else holds that seat now
        return room

    def _detach(self, conn, permanent):
        """Take conn off its seat. Returns (peer_conn|None, room|None)."""
        room = self._room_of(conn)
        code, slot = conn.room_code, conn.slot
        conn.room_code = None
        conn.slot = -1
        if room is None:
            return None, None
        seat = room.seats[slot]
        seat.conn = None
        seat.gone_at = time.monotonic()
        if permanent:
            room.seats[slot] = None
        room.touched = time.monotonic()
        other = room.seats[1 - slot]
        peer = other.conn if other is not None else None
        if room.occupied() == 0:
            self._rooms.pop(code, None)
        return peer, room

    # -- actions -----------------------------------------------------------

    def create(self, conn, private=False):
        """Open a room. A connection may hold exactly ONE room at a time — the
        detach below closes whatever it had open — and may only ever open
        L.MAX_CREATES of them, so one socket cannot stack up a pile of rooms in
        the public list."""
        out = []
        if conn.creates >= L.MAX_CREATES:
            return [(conn, {"t": "error", "why": E_TOOMANY})]
        with self._lock:
            peer, _ = self._detach(conn, permanent=True)
            if peer is not None:
                out.append((peer, {"t": "peer", "state": "left"}))
            if len(self._rooms) >= L.MAX_ROOMS:
                out.append((conn, {"t": "error", "why": E_FULL_SERVER}))
                return out
            code = self._new_code()
            if code is None:
                out.append((conn, {"t": "error", "why": E_FULL_SERVER}))
                return out
            room = Room(code, private=private)
            seat = Seat(secrets.token_urlsafe(12))
            seat.conn = conn
            room.seats[0] = seat
            self._rooms[code] = room
            conn.room_code = code
            conn.slot = 0
            conn.creates += 1
            token = seat.token
        LOG("room-create", code=code, rooms=len(self._rooms), private=int(bool(private)))
        # "private" is echoed so the client can tell a relay that understands the
        # flag from an older one that quietly ignored it.
        out.append((conn, {"t": "created", "code": code, "token": token,
                           "host": True, "seq": 0, "private": bool(private)}))
        return out

    def join(self, conn, code):
        if not isinstance(code, str):
            conn.bad_joins += 1
            return [(conn, {"t": "error", "why": E_NOROOM})]
        code = code.strip().upper()
        if not CODE_RE.match(code):
            conn.bad_joins += 1
            return [(conn, {"t": "error", "why": E_NOROOM})]
        out = []
        with self._lock:
            room = self._rooms.get(code)
            if room is None:
                conn.bad_joins += 1
                return [(conn, {"t": "error", "why": E_NOROOM})]
            if self._room_of(conn) is room:
                seat = room.seats[conn.slot]
                return [(conn, {"t": "joined", "code": code, "token": seat.token,
                                "host": conn.slot == 0, "seq": room.seq})]
            if room.seats[1] is None:
                free = 1
            elif room.seats[0] is None:
                free = 0
            else:
                free = None
            if free is None:
                conn.bad_joins += 1
                return [(conn, {"t": "error", "why": E_FULL_ROOM})]
            peer, _ = self._detach(conn, permanent=True)
            if peer is not None:
                out.append((peer, {"t": "peer", "state": "left"}))
            room = self._rooms.get(code)                    # re-check after detach
            if room is None or room.seats[free] is not None:
                out.append((conn, {"t": "error", "why": E_NOROOM}))
                return out
            seat = Seat(secrets.token_urlsafe(12))
            seat.conn = conn
            room.seats[free] = seat
            room.touched = time.monotonic()
            conn.room_code = code
            conn.slot = free
            other = room.seats[1 - free]
            other_conn = other.conn if other is not None else None
            reply = {"t": "joined", "code": code, "token": seat.token,
                     "host": free == 0, "seq": room.seq}
        LOG("room-join", code=code)
        out.append((conn, reply))
        if other_conn is not None:
            out.append((other_conn, {"t": "peer", "state": "joined"}))
        return out

    def rejoin(self, conn, code, token, since):
        """Take back a seat after a dropped socket and replay what was missed."""
        if not isinstance(code, str) or not isinstance(token, str) or len(token) > 64:
            return [(conn, {"t": "error", "why": E_NOROOM})]
        code = code.strip().upper()
        if not CODE_RE.match(code):
            conn.bad_joins += 1
            return [(conn, {"t": "error", "why": E_NOROOM})]
        if not isinstance(since, int) or isinstance(since, bool) or since < 0:
            since = 0
        out = []
        with self._lock:
            room = self._rooms.get(code)
            if room is None:
                conn.bad_joins += 1
                return [(conn, {"t": "error", "why": E_NOROOM})]
            slot = -1
            for i, seat in enumerate(room.seats):
                # constant-time-ish compare; tokens are 96 bits of urandom
                if seat is not None and secrets.compare_digest(seat.token, token):
                    slot = i
            if slot < 0:
                conn.bad_joins += 1
                return [(conn, {"t": "error", "why": E_BADTOKEN})]
            old, _ = self._detach(conn, permanent=True)     # leave any other room
            if old is not None:
                out.append((old, {"t": "peer", "state": "left"}))
            room = self._rooms.get(code)
            if room is None or room.seats[slot] is None:
                out.append((conn, {"t": "error", "why": E_NOROOM}))
                return out
            seat = room.seats[slot]
            evicted = seat.conn
            seat.conn = conn
            seat.gone_at = 0.0
            room.touched = time.monotonic()
            conn.room_code = code
            conn.slot = slot
            other = room.seats[1 - slot]
            other_conn = other.conn if other is not None else None
            replay = [text for (n, to, text) in room.buf if to == slot and n > since]
            head = {"t": "rejoined", "code": code, "host": slot == 0,
                    "seq": room.seq, "peer": other_conn is not None}
        if evicted is not None and evicted is not conn:
            evicted.send_json({"t": "closed", "why": "You reconnected somewhere else."})
            evicted.doom("replaced")
            evicted.kill()
        LOG("room-rejoin", code=code, replay=len(replay))
        out.append((conn, head))
        for text in replay:
            out.append((conn, text))                        # already-serialised
        if other_conn is not None:
            out.append((other_conn, {"t": "peer", "state": "rejoined"}))
        return out

    def relay(self, conn, payload, claimed_code):
        """payload is ALREADY sanitised. claimed_code, if given, must match."""
        with self._lock:
            room = self._room_of(conn)
            if room is None:
                return [(conn, {"t": "error", "why": E_NOTIN})]
            if claimed_code is not None and claimed_code != room.code:
                return [(conn, {"t": "error", "why": E_NOTIN})]
            other = room.seats[1 - conn.slot]
            if other is None:
                return [(conn, {"t": "error", "why": E_NOPEER})]
            to = 1 - conn.slot
            text = json.dumps({"t": "relay", "n": room.seq + 1, "d": payload},
                              separators=(",", ":"))
            room.push(to, text)
            room.touched = time.monotonic()
            peer = other.conn
        if peer is None:
            return []                       # buffered; they get it when they rejoin
        return [(peer, text)]

    def leave(self, conn):
        with self._lock:
            peer, _ = self._detach(conn, permanent=True)
        return [(peer, {"t": "peer", "state": "left"})] if peer is not None else []

    def drop(self, conn):
        """Socket died. Hold the seat for GRACE seconds."""
        with self._lock:
            room = self._room_of(conn)
            if room is None:
                self._detach(conn, permanent=True)
                return []
            slot = conn.slot
            self._detach(conn, permanent=False)
            room = self._rooms.get(room.code)
            if room is None:
                return []
            other = room.seats[1 - slot]
            peer = other.conn if other is not None else None
        return [(peer, {"t": "peer", "state": "dropped"})] if peer is not None else []

    def sweep(self):
        """Bin expired seats and idle rooms. Returns messages to send."""
        now = time.monotonic()
        out = []
        with self._lock:
            for code in list(self._rooms.keys()):
                room = self._rooms.get(code)
                if room is None:
                    continue
                idle = (now - room.touched) > L.ROOM_IDLE
                if idle:
                    for seat in room.seats:
                        if seat is not None and seat.conn is not None:
                            out.append((seat.conn,
                                        {"t": "closed", "why": "The room timed out."}))
                            seat.conn.doom("idle")
                            seat.conn.room_code = None
                            seat.conn.slot = -1
                    self._rooms.pop(code, None)
                    continue
                for i, seat in enumerate(room.seats):
                    if seat is None or seat.conn is not None or seat.gone_at == 0.0:
                        continue
                    if (now - seat.gone_at) > L.GRACE:
                        room.seats[i] = None
                        other = room.seats[1 - i]
                        if other is not None and other.conn is not None:
                            out.append((other.conn, {"t": "peer", "state": "left"}))
                if room.occupied() == 0:
                    self._rooms.pop(code, None)
        return out


ROOMS = RoomBook()


def dispatch(messages):
    """Send a list of (conn, dict-or-str). Never called with a lock held."""
    for conn, msg in messages:
        if conn is None:
            continue
        if isinstance(msg, str):
            conn.send_text(msg)
        else:
            conn.send_json(msg)


# ── message pump ─────────────────────────────────────────────────────────────

def handle_ws_message(conn, raw):
    if not conn.msgs.take() or not conn.bytes.take(len(raw)):
        conn.send_json({"t": "error", "why": E_FLOOD})
        conn.doom("flood")
        LOG("flood", cid=conn.cid)
        return
    if len(raw) > L.MAX_MSG:
        conn.error(E_BIG)
        return
    try:
        msg = json.loads(raw)
    except (ValueError, TypeError, RecursionError):
        conn.error(E_JSON)
        return
    if not isinstance(msg, dict):
        conn.error(E_SHAPE)
        return

    kind = msg.get("t")

    if kind == "create":
        # Anything other than a literal true is a public room. An older client
        # sends no flag at all and gets exactly what it always got.
        dispatch(ROOMS.create(conn, msg.get("private") is True))

    elif kind == "join":
        dispatch(ROOMS.join(conn, msg.get("code")))
        if conn.bad_joins > L.MAX_BAD_JOINS:
            conn.doom("code guessing")

    elif kind == "joinid":
        dispatch(ROOMS.join_by_id(conn, msg.get("id")))
        if conn.bad_joins > L.MAX_BAD_JOINS:
            conn.doom("code guessing")

    elif kind == "name":
        dispatch(ROOMS.set_name(conn, msg.get("n")))

    elif kind == "rejoin":
        dispatch(ROOMS.rejoin(conn, msg.get("code"), msg.get("token"), msg.get("since")))
        if conn.bad_joins > L.MAX_BAD_JOINS:
            conn.doom("code guessing")

    elif kind == "relay":
        try:
            payload = sanitize_relay(msg.get("d"))
        except Reject:
            conn.error(E_SHAPE)
            return
        code = msg.get("code")
        if code is not None and not isinstance(code, str):
            conn.error(E_SHAPE)
            return
        dispatch(ROOMS.relay(conn, payload, code.strip().upper() if code else None))

    elif kind == "leave":
        dispatch(ROOMS.leave(conn))

    elif kind == "ping":
        conn.send_json({"t": "pong"})

    else:
        conn.error(E_SHAPE)


def ws_pump(conn, rfile):
    """Read frames until the client goes away. Never raises."""
    frag_op = None
    frag_buf = bytearray()
    try:
        while conn.alive and conn.doomed is None:
            fin, opcode, payload = ws_read_frame(rfile, require_mask=True)

            if opcode == OP_CLOSE:
                conn.send_close(1000)
                return
            if opcode == OP_PING:
                if not conn.msgs.take():
                    raise WSError("flood", 1008)
                conn.send_pong(payload[:125])
                continue
            if opcode == OP_PONG:
                continue

            if opcode == OP_CONT:
                if frag_op is None:
                    raise WSError("continuation without start", 1002)
            elif opcode in (OP_TEXT, OP_BIN):
                if frag_op is not None:
                    raise WSError("interleaved message", 1002)
                frag_op = opcode
            else:
                raise WSError("unknown opcode", 1002)

            frag_buf += payload
            if len(frag_buf) > L.MAX_MSG:
                raise WSError("message too big", 1009)
            if not fin:
                if not conn.bytes.take(len(payload)):
                    raise WSError("flood", 1008)
                continue

            data, op = bytes(frag_buf), frag_op
            frag_buf = bytearray()
            frag_op = None

            if op == OP_TEXT:
                try:
                    text = data.decode("utf-8")
                except UnicodeDecodeError:
                    raise WSError("bad utf-8", 1007)
                handle_ws_message(conn, text)
            # binary frames are dropped on the floor: KARTI only speaks JSON text

        if conn.doomed:
            conn.send_close(1008, "closed")
    except WSError as e:
        if e.code != 1006:
            conn.send_close(e.code, "protocol")
    except (OSError, ValueError):
        pass
    except Exception:                        # never take the whole server down
        traceback.print_exc()


# ── HTTP front door ──────────────────────────────────────────────────────────

ALLOWED_ORIGINS = {PAGES_ORIGIN}
ALLOW_ANY_ORIGIN = False


# /presence must be too cheap to be worth attacking. Two guards, both here:
#   1. the answer is built at most once every PRESENCE_CACHE seconds and every
#      caller in that window gets the same bytes back, so N requests cost one
#      walk of the connection set, not N;
#   2. each caller gets a token bucket. The key is a SHA-256 of the peer
#      address, truncated — enough to tell callers apart, and no raw IP is kept
#      anywhere in this process. The table is bounded and binned when it fills.
_PRESENCE_LOCK = threading.Lock()
_PRESENCE_AT = 0.0
_PRESENCE_BODY = b""
_PRESENCE_CALLERS = {}


def presence_body():
    """Cached JSON bytes. Never called with any other lock held."""
    global _PRESENCE_AT, _PRESENCE_BODY
    with _PRESENCE_LOCK:
        if _PRESENCE_BODY and (time.monotonic() - _PRESENCE_AT) < L.PRESENCE_CACHE:
            return _PRESENCE_BODY
    body = json.dumps(ROOMS.presence(), separators=(",", ":")).encode("utf-8")
    with _PRESENCE_LOCK:
        _PRESENCE_AT = time.monotonic()
        _PRESENCE_BODY = body
    return body


def presence_allowed(addr):
    key = hashlib.sha256(str(addr or "?").encode("utf-8", "replace")).hexdigest()[:16]
    with _PRESENCE_LOCK:
        if len(_PRESENCE_CALLERS) > L.PRESENCE_CALLERS:
            _PRESENCE_CALLERS.clear()       # bounded memory beats perfect fairness
        bucket = _PRESENCE_CALLERS.get(key)
        if bucket is None:
            bucket = Bucket(L.PRESENCE_RATE, L.PRESENCE_BURST)
            _PRESENCE_CALLERS[key] = bucket
        return bucket.take()


def presence_reset():
    """Drop the cache and every rate-limit bucket. Only the self-test uses it."""
    global _PRESENCE_AT, _PRESENCE_BODY
    with _PRESENCE_LOCK:
        _PRESENCE_AT = 0.0
        _PRESENCE_BODY = b""
        _PRESENCE_CALLERS.clear()


def origin_ok(origin):
    if ALLOW_ANY_ORIGIN:
        return True
    if not origin:
        return True             # non-browser clients send no Origin at all
    if origin in ALLOWED_ORIGINS:
        return True
    return bool(LOOPBACK_ORIGIN_RE.match(origin))


class KartiHandler(BaseHTTPRequestHandler):
    """Two routes and a 404. There is deliberately no filesystem code here."""

    server_version = "karti"
    sys_version = ""
    protocol_version = "HTTP/1.1"
    timeout = L.HTTP_TIMEOUT
    quiet = True

    # -- noise ------------------------------------------------------------

    def log_message(self, fmt, *args):
        if not self.quiet:
            sys.stderr.write("[karti] %s\n" % (fmt % args))

    def log_error(self, fmt, *args):
        if not self.quiet:
            sys.stderr.write("[karti] %s\n" % (fmt % args))

    # -- routing ----------------------------------------------------------

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

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.cors()
        self.end_headers()

    def do_GET(self):
        path = self.route()
        if path == "/ws":
            self.handle_websocket()
        elif path == "/health":
            rooms, clients = ROOMS.stats()
            self.reply(200, {"ok": True, "rooms": rooms, "clients": clients,
                             "maxRooms": L.MAX_ROOMS, "maxClients": L.MAX_WS})
        elif path == "/presence":
            addr = self.client_address[0] if self.client_address else ""
            if not presence_allowed(addr):
                self.reply_bytes(429, b'{"ok":false,"why":"Slow down."}',
                                 (("Retry-After", "5"),))
            else:
                self.reply_bytes(200, presence_body())
        else:
            self.reply(404, {"ok": False, "why": "This is the KARTI relay, not a web server."})

    def do_HEAD(self):
        self.send_response(200 if self.route() in ("/ws", "/health", "/presence") else 404)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.cors()
        self.end_headers()

    def do_POST(self):
        self.reply(405, {"ok": False, "why": "GET only."})

    do_PUT = do_DELETE = do_PATCH = do_POST

    # -- upgrade ----------------------------------------------------------

    def handle_websocket(self):
        self.close_connection = True
        origin = self.headers.get("Origin")
        if not origin_ok(origin):
            LOG("origin-reject")
            self.reply(403, {"t": "error", "why": "Origin not allowed."})
            return

        upgrade = (self.headers.get("Upgrade") or "").strip().lower()
        conn_hdr = (self.headers.get("Connection") or "").lower()
        key = self.headers.get("Sec-WebSocket-Key")
        version = (self.headers.get("Sec-WebSocket-Version") or "").strip()
        if upgrade != "websocket" or "upgrade" not in conn_hdr or not key:
            self.reply(400, {"t": "error", "why": "Expected a WebSocket upgrade."})
            return
        if version and version != "13":
            self.send_response(426)
            self.send_header("Sec-WebSocket-Version", "13")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        try:
            if len(base64.b64decode(key.strip() + "==", validate=False)) != 16:
                raise ValueError
        except Exception:
            self.reply(400, {"t": "error", "why": "Bad WebSocket key."})
            return

        conn = Conn(self.connection, self.client_address)
        if not ROOMS.try_register(conn):
            LOG("ws-refuse-full")
            self.reply(503, {"t": "error", "why": E_FULL_SERVER})
            return

        try:
            self.connection.sendall((
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                "Sec-WebSocket-Accept: %s\r\n"
                "\r\n" % ws_accept_key(key)).encode("ascii"))
        except OSError:
            ROOMS.unregister(conn)
            return

        try:
            self.connection.settimeout(L.SOCK_TIMEOUT)
            self.connection.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        except OSError:
            pass

        LOG("ws-open", cid=conn.cid)
        try:
            ws_pump(conn, self.rfile)
        finally:
            conn.alive = False
            dispatch(ROOMS.drop(conn))
            ROOMS.unregister(conn)
            LOG("ws-close", cid=conn.cid)


# ── server plumbing ──────────────────────────────────────────────────────────

class GuardedServer(ThreadingHTTPServer):
    """Hard cap on simultaneously accepted sockets, so a stranger cannot make
    us spawn threads (and thread stacks) without limit."""

    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 32

    def __init__(self, *a, **kw):
        self._open = set()
        self._open_lock = threading.Lock()
        super().__init__(*a, **kw)

    def verify_request(self, request, client_address):
        with self._open_lock:
            if len(self._open) >= L.MAX_SOCKETS:
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
    handler = type("KartiHandlerBound", (KartiHandler,), {"quiet": quiet})
    return GuardedServer((host, port), handler)


def start_sweeper(stop_event):
    def loop():
        while not stop_event.wait(L.SWEEP):
            try:
                out = ROOMS.sweep()
                dispatch(out)
                for conn, _ in out:
                    if conn is not None and conn.doomed:
                        conn.kill()
            except Exception:
                traceback.print_exc()
    t = threading.Thread(target=loop, name="karti-sweeper", daemon=True)
    t.start()
    return t


def print_banner(host, port):
    print("")
    print("KARTI relay (rooms only — this process serves no files)")
    print("  listening on   : http://%s:%d" % (host, port))
    print("  websocket      : ws://%s:%d%s/ws" % (host, port, PATH_PREFIX))
    print("  health         : http://%s:%d%s/health" % (host, port, PATH_PREFIX))
    print("  presence       : http://%s:%d%s/presence  (names, state and the open"
          " room list — no IPs, no tokens, no codes)" % (host, port, PATH_PREFIX))
    print("  allowed origin : %s (+ loopback)" % PAGES_ORIGIN)
    print("  caps           : %d rooms, %d sockets, %d KiB/message"
          % (L.MAX_ROOMS, L.MAX_WS, L.MAX_MSG // 1024))
    print("")
    print("  Publish it with Tailscale Funnel — see docs/ONLINE.md.")
    print("  Ctrl+C to stop.")
    print("", flush=True)


# ── a minimal stdlib WebSocket client, for --selftest ────────────────────────

TIMEOUT = object()          # "nothing arrived", as distinct from "socket closed"


class _Reader:
    """Byte reader over a socket that SURVIVES a timeout.

    socket.makefile('rb') hands back a BufferedReader, and once one of its
    reads times out it is poisoned for good ("cannot read from timed out
    object"). The abuse tests deliberately wait for messages that never come,
    so the test client needs a reader that just shrugs and carries on."""

    def __init__(self, sock):
        self.sock = sock
        self.buf = b""

    def _fill(self, want):
        while len(self.buf) < want:
            chunk = self.sock.recv(65536)
            if not chunk:
                return False
            self.buf += chunk
        return True

    def read(self, n):
        self._fill(n)                       # timeouts propagate, buffer intact
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def readline(self):
        while b"\n" not in self.buf:
            chunk = self.sock.recv(65536)
            if not chunk:
                break
            self.buf += chunk
        i = self.buf.find(b"\n")
        if i < 0:
            out, self.buf = self.buf, b""
            return out
        out, self.buf = self.buf[:i + 1], self.buf[i + 1:]
        return out

    def close(self):
        self.buf = b""


class WSClient:
    def __init__(self, host, port, path=PATH_PREFIX + "/ws", timeout=5.0, origin=None,
                 extra=""):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(timeout)
        self.rfile = _Reader(self.sock)
        self.closed = False
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        req = ("GET %s HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\n"
               "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
               "Sec-WebSocket-Version: 13\r\n%s%s\r\n"
               % (path, host, port, key,
                  ("Origin: %s\r\n" % origin) if origin else "", extra))
        self.sock.sendall(req.encode("ascii"))
        self.status = self.rfile.readline().decode("latin-1").strip()
        if "101" not in self.status:
            raise RuntimeError("handshake refused: %r" % self.status)
        while True:
            line = self.rfile.readline().decode("latin-1").strip()
            if not line:
                break

    def send_text(self, text):
        self.sock.sendall(ws_build_frame(OP_TEXT, text.encode("utf-8"), mask=True))

    def send_json(self, obj):
        self.send_text(json.dumps(obj))

    def send_raw(self, data):
        self.sock.sendall(data)

    def raw_recv(self, timeout=None):
        """-> text | TIMEOUT (nothing arrived) | None (server hung up).
        Telling those two apart is the whole point of the abuse tests."""
        if timeout is not None:
            self.sock.settimeout(timeout)
        buf = bytearray()
        while True:
            try:
                fin, opcode, payload = ws_read_frame(self.rfile, require_mask=False,
                                                     max_payload=1 << 22)
            except socket.timeout:
                return TIMEOUT
            except (WSError, OSError, ValueError):
                return None
            if opcode == OP_CLOSE:
                return None
            if opcode == OP_PING:
                self.sock.sendall(ws_build_frame(OP_PONG, payload, mask=True))
                continue
            if opcode == OP_PONG:
                continue
            buf += payload
            if fin:
                return buf.decode("utf-8", "replace")

    def recv_text(self, timeout=None):
        r = self.raw_recv(timeout)
        return None if (r is None or r is TIMEOUT) else r

    def recv_json(self, timeout=None):
        text = self.recv_text(timeout)
        return None if text is None else json.loads(text)

    def dead(self, seconds=3.0):
        """True only if the server actually closed the socket."""
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            if self.raw_recv(0.4) is None:
                return True
        return False

    def silent(self, seconds=0.4):
        """True if nothing at all arrived and the socket is still open."""
        return self.raw_recv(seconds) is TIMEOUT

    def close(self, graceful=True):
        if self.closed:
            return
        self.closed = True
        try:
            if graceful:
                self.sock.sendall(ws_build_frame(OP_CLOSE, struct.pack("!H", 1000), mask=True))
        except OSError:
            pass
        # makefile() holds a reference to the fd: without closing rfile too, and
        # without an explicit shutdown, the server never sees the EOF.
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            self.rfile.close()
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


def _http_get(host, port, path, timeout=5.0, origin=None, method="GET"):
    s = socket.create_connection((host, port), timeout=timeout)
    s.settimeout(timeout)
    try:
        req = ("%s %s HTTP/1.0\r\nHost: %s\r\n%sConnection: close\r\n\r\n"
               % (method, path, host, ("Origin: %s\r\n" % origin) if origin else ""))
        s.sendall(req.encode("ascii"))
        chunks = []
        while True:
            b = s.recv(65536)
            if not b:
                break
            chunks.append(b)
    finally:
        s.close()
    raw = b"".join(chunks)
    head, _, body = raw.partition(b"\r\n\r\n")
    first = head.split(b"\r\n", 1)[0].decode("latin-1")
    parts = first.split()
    status = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    return status, head.decode("latin-1"), body


# ── self-test ────────────────────────────────────────────────────────────────

def _deck40():
    return ["petard"] * 20 + ["bandist"] * 20


def _list40():
    return {"petard": 3, "bandist": 3}


def selftest():
    results = []

    def check(name, ok, detail=""):
        results.append((name, bool(ok)))
        print("  %-4s %s%s" % ("PASS" if ok else "FAIL", name,
                               ("   << " + str(detail)[:240]) if (detail and not ok) else ""))
        return ok

    # Squeeze the clock-driven limits so the run finishes in seconds.
    L.ROOM_IDLE = 30.0          # lowered on purpose inside the cleanup tests
    L.GRACE = 3.0
    L.SWEEP = 0.25
    L.MAX_ROOMS = 8
    L.MAX_CREATES = 4
    L.PRESENCE_MAX = 6
    L.ROOMS_MAX = 3
    L.PRESENCE_CACHE = 1.0

    host = "127.0.0.1"
    httpd = make_server(host, 0, quiet=True)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.05},
                     name="karti-selftest", daemon=True).start()
    stop = threading.Event()
    start_sweeper(stop)

    print("SELFTEST relay on 127.0.0.1:%d" % port)
    live = []

    def cli(**kw):
        c = WSClient(host, port, **kw)
        live.append(c)
        return c

    def bye(c):
        try:
            c.close(graceful=False)
        except Exception:
            pass
        if c in live:
            live.remove(c)

    def settle(idle=0.8):
        """Force every room to expire, then wait for the sweeper."""
        keep = L.ROOM_IDLE
        L.ROOM_IDLE = idle
        try:
            time.sleep(idle + L.SWEEP * 4 + 0.5)
        finally:
            L.ROOM_IDLE = keep

    a = b = None
    try:
        # ═══════════ happy path ═══════════
        print("")
        print(" HAPPY PATH")

        for label, path in (("/karti/health", PATH_PREFIX + "/health"),
                            ("/health", "/health")):
            try:
                st, _, body = _http_get(host, port, path)
                ok = st == 200 and json.loads(body.decode()).get("ok") is True
                check("health answers on %s" % label, ok, "%s %r" % (st, body[:80]))
            except Exception as e:
                check("health answers on %s" % label, False, repr(e))

        code = token_a = token_b = None
        try:
            a = cli(origin=PAGES_ORIGIN)
            a.send_json({"t": "create"})
            m = a.recv_json()
            code = (m or {}).get("code")
            token_a = (m or {}).get("token")
            ok = (m or {}).get("t") == "created" and (m or {}).get("host") is True
            ok = ok and isinstance(code, str) and CODE_RE.match(code or "") is not None
            ok = ok and isinstance(token_a, str) and len(token_a) >= 12
            check("create -> %d-char code + private seat token" % CODE_LEN, ok, m)
        except Exception as e:
            check("create -> code + token", False, repr(e))

        check("code alphabet contains no O/0/I/1",
              bool(code) and not any(ch in code for ch in "O0I1"), code)

        try:
            b = cli(origin=PAGES_ORIGIN)
            b.send_json({"t": "join", "code": code})
            bm = b.recv_json()
            am = a.recv_json()
            token_b = (bm or {}).get("token")
            ok = (bm or {}).get("t") == "joined" and (bm or {}).get("host") is False
            ok = ok and isinstance(token_b, str)
            ok = ok and (am or {}) == {"t": "peer", "state": "joined"}
            check("join pairs the two players and tells the host", ok,
                  "B=%r A=%r" % (bm, am))
        except Exception as e:
            check("join pairs the two players", False, repr(e))

        try:
            hello = {"k": "hello", "name": "TERENCE", "list": _list40(),
                     "deckKey": "festa", "deckName": "Festa"}
            a.send_json({"t": "relay", "d": hello})
            got = b.recv_json(3.0)
            check("relay A->B, sequenced",
                  got and got.get("t") == "relay" and got.get("d") == hello
                  and got.get("n") == 1, got)
        except Exception as e:
            check("relay A->B, sequenced", False, repr(e))

        try:
            deal = {"k": "start", "seed": 123456, "hostName": "A", "guestName": "B",
                    "hostList": _list40(), "guestList": _list40(),
                    "hostKey": "festa", "guestKey": "bahri",
                    "hostDeck": _deck40(), "guestDeck": _deck40()}
            b.send_json({"t": "relay", "d": deal})
            got = a.recv_json(3.0)
            check("relay B->A carries a whole deal (two 40-card decks)",
                  got and got.get("d") == deal, str(got)[:140])
        except Exception as e:
            check("relay B->A carries a whole deal", False, repr(e))

        try:
            act = {"k": "act", "kind": "summon", "ck": "1/main/0/8000|5",
                   "a": {"hi": 2, "zi": 1, "pos": "atk", "fd": False, "tributes": []}}
            a.send_json({"t": "relay", "d": act})
            got = b.recv_json(3.0)
            check("relay carries a duel move unchanged",
                  got and got.get("d") == act, got)
        except Exception as e:
            check("relay carries a duel move", False, repr(e))

        try:
            a.send_json({"t": "ping"})
            check("ping -> pong", a.recv_json(3.0) == {"t": "pong"})
        except Exception as e:
            check("ping -> pong", False, repr(e))

        # ═══════════ reconnect ═══════════
        print("")
        print(" RECONNECT")
        try:
            last_seq = 3                     # B has seen relays 1 and 3
            bye(b)
            drop = a.recv_json(3.0)
            ok_drop = (drop or {}) == {"t": "peer", "state": "dropped"}
            # A plays on while B is off the air; the relay buffers it
            a.send_json({"t": "relay",
                         "d": {"k": "act", "kind": "end", "a": None, "ck": "z"}})
            time.sleep(0.2)
            b = cli(origin=PAGES_ORIGIN)
            b.send_json({"t": "rejoin", "code": code, "token": token_b, "since": last_seq})
            head = b.recv_json(3.0)
            missed = b.recv_json(3.0)
            note = a.recv_json(3.0)
            ok = ok_drop
            ok = ok and (head or {}).get("t") == "rejoined" and (head or {}).get("peer") is True
            ok = ok and (missed or {}).get("t") == "relay" \
                and (missed or {}).get("d", {}).get("kind") == "end"
            ok = ok and (note or {}) == {"t": "peer", "state": "rejoined"}
            check("dropped seat is held; rejoin replays the missed move", ok,
                  "drop=%r head=%r missed=%r note=%r" % (drop, head, missed, note))
        except Exception as e:
            check("dropped seat is held; rejoin replays", False, repr(e))

        try:
            b.send_json({"t": "relay", "d": {"k": "act", "kind": "battle", "a": None}})
            got = a.recv_json(3.0)
            check("duel keeps running after the reconnect",
                  got and got.get("d", {}).get("kind") == "battle", got)
        except Exception as e:
            check("duel keeps running after the reconnect", False, repr(e))

        # ═══════════ presence ═══════════
        print("")
        print(" PRESENCE  (public endpoint — assume the reader is hostile)")

        def pres(origin=None):
            """Fresh, uncached, un-rate-limited read of /presence."""
            presence_reset()
            st, head, body = _http_get(host, port, PATH_PREFIX + "/presence",
                                       origin=origin)
            return st, head, body, json.loads(body.decode("utf-8"))

        w = j = idler = None
        try:
            for label, path in (("/karti/presence", PATH_PREFIX + "/presence"),
                                ("/presence", "/presence")):
                presence_reset()
                st, _, body = _http_get(host, port, path)
                got = json.loads(body.decode("utf-8")) if st == 200 else {}
                check("presence answers on %s" % label,
                      st == 200 and got.get("ok") is True
                      and isinstance(got.get("players"), list),
                      "%s %r" % (st, body[:90]))
        except Exception as e:
            check("presence answers", False, repr(e))

        try:
            idler = cli(origin=PAGES_ORIGIN)
            idler.send_json({"t": "name", "n": "IDLER"})
            said = idler.recv_json(2.0)
            _, _, _, got = pres()
            names = {p["n"]: p["s"] for p in got["players"]}
            ok = (said or {}) == {"t": "named", "n": "IDLER"}
            ok = ok and names.get("IDLER") == "idle"
            check("a named connection is listed, idle until it joins a room", ok,
                  "said=%r got=%r" % (said, got))
        except Exception as e:
            check("named connection listed as idle", False, repr(e))

        try:
            w = cli(origin=PAGES_ORIGIN)
            w.send_json({"t": "name", "n": "WAITER"})
            w.recv_json(2.0)
            w.send_json({"t": "create"})
            w.recv_json(2.0)
            time.sleep(0.15)
            _, _, _, got = pres()
            by = {p["n"]: p for p in got["players"]}
            ok = by.get("WAITER", {}).get("s") == "waiting"
            ok = ok and got.get("waiting") == 1
            # a and b are still sitting in a room together from the reconnect test
            ok = ok and got.get("playing") == 2
            ok = ok and got.get("count") == got["idle"] + got["waiting"] + got["playing"]
            check("state is waiting for a lone host and playing for a live duel", ok, got)
        except Exception as e:
            check("presence states", False, repr(e))

        try:
            _, _, raw, got = pres()
            text = raw.decode("utf-8", "replace")
            leaks = []
            if code and code in text:
                leaks.append("room code")
            for tok in (token_a or "", token_b or ""):
                if tok and tok in text:
                    leaks.append("seat token")
            if "127.0.0.1" in text or "token" in text.lower():
                leaks.append("address or token field")
            for p in got["players"]:
                if set(p.keys()) - {"n", "s", "id"}:
                    leaks.append("extra field %r" % sorted(p.keys()))
            check("presence leaks no IP, no seat token, no room code", not leaks,
                  "%s :: %s" % (leaks, text[:160]))
        except Exception as e:
            check("presence leaks nothing", False, repr(e))

        try:
            _, _, _, got = pres()
            handles = {p["n"]: p.get("id") for p in got["players"]}
            ok = isinstance(handles.get("WAITER"), str) and handles["WAITER"]
            ok = ok and handles.get("IDLER") is None
            ok = ok and all(p.get("id") is None for p in got["players"]
                            if p["s"] != "waiting")
            check("only a player advertising a free seat gets a join handle", ok,
                  handles)
        except Exception as e:
            check("join handle only for waiting players", False, repr(e))

        try:
            nasty = cli(origin=PAGES_ORIGIN)
            nasty.send_json({"t": "name",
                             "n": "<img src=x onerror=alert(1)>\x07' \"&`\\ EXTRALONGTAIL"})
            said = nasty.recv_json(2.0)
            _, _, raw, got = pres()
            shown = [p["n"] for p in got["players"]]
            bad = [n for n in shown if any(c in n for c in "<>&\"'\\`")]
            bad += [n for n in shown if len(n) > L.NAME_LEN]
            bad += [n for n in shown if any(ord(c) < 0x20 or ord(c) == 0x7f for c in n)]
            check("a hostile display name is scrubbed and capped before it is published",
                  not bad and (said or {}).get("t") == "named",
                  "said=%r shown=%r" % (said, shown))
            bye(nasty)
        except Exception as e:
            check("hostile display name scrubbed", False, repr(e))

        try:
            spam = cli(origin=PAGES_ORIGIN)
            refused = False
            for i in range(L.MAX_NAME_SETS + 4):
                spam.send_json({"t": "name", "n": "NAME%d" % i})
                if (spam.recv_json(2.0) or {}).get("why") == E_SLOW:
                    refused = True
            check("renaming yourself over and over is capped", refused)
            bye(spam)
        except Exception as e:
            check("name-change cap", False, repr(e))

        try:
            _, _, _, got = pres()
            handle = [p["id"] for p in got["players"] if p["s"] == "waiting"][0]
            j = cli(origin=PAGES_ORIGIN)
            j.send_json({"t": "name", "n": "JOINER"})
            j.recv_json(2.0)
            j.send_json({"t": "joinid", "id": handle})
            seated = j.recv_json(3.0)
            told = w.recv_json(3.0)
            ok = (seated or {}).get("t") == "joined" and (seated or {}).get("host") is False
            ok = ok and CODE_RE.match((seated or {}).get("code") or "") is not None
            ok = ok and (told or {}) == {"t": "peer", "state": "joined"}
            check("a waiting player can be joined from the list, without their code", ok,
                  "seated=%r told=%r" % (seated, told))
        except Exception as e:
            check("joinid seats you in the waiting room", False, repr(e))

        try:
            time.sleep(0.15)
            _, _, _, got = pres()
            by = {p["n"]: p for p in got["players"]}
            ok = by.get("WAITER", {}).get("s") == "playing"
            ok = ok and by.get("JOINER", {}).get("s") == "playing"
            ok = ok and by.get("WAITER", {}).get("id") is None
            check("both sides flip to playing once the room is full, handle withdrawn",
                  ok, got)
        except Exception as e:
            check("state flips to playing", False, repr(e))

        try:
            gate = cli(origin=PAGES_ORIGIN)
            bad = []
            for probe in ("not-a-real-handle", "", None, 123, "x" * 400,
                          [1, 2], {"a": 1}):
                gate.send_json({"t": "joinid", "id": probe})
                r = gate.recv_json(2.0)
                if (r or {}).get("why") != E_NOWAIT:
                    bad.append((str(probe)[:20], r))
            # the handle of a player who is now PLAYING must be dead too
            gate.send_json({"t": "joinid", "id": handle})
            r = gate.recv_json(2.0)
            if (r or {}).get("why") != E_NOWAIT:
                bad.append(("full-room handle", r))
            quiet = w.silent(0.4) and j.silent(0.4)
            check("a junk, stale or full-room join handle is refused and nobody is disturbed",
                  not bad and quiet, "%s quiet=%s" % (bad, quiet))
            bye(gate)
        except Exception as e:
            check("stale join handle refused", False, repr(e))

        try:
            crowd = []
            for i in range(L.PRESENCE_MAX + 4):
                c = cli(origin=PAGES_ORIGIN)
                c.send_json({"t": "name", "n": "CROWD%02d" % i})
                c.recv_json(2.0)
                crowd.append(c)
            _, _, _, got = pres()
            ok = len(got["players"]) <= L.PRESENCE_MAX
            ok = ok and got["shown"] == len(got["players"])
            ok = ok and got["count"] > L.PRESENCE_MAX      # counts stay honest
            check("the published list is capped at %d names however many are on"
                  % L.PRESENCE_MAX, ok,
                  "shown=%d count=%s" % (len(got["players"]), got.get("count")))
            for c in crowd:
                bye(c)
        except Exception as e:
            check("presence list is capped", False, repr(e))

        try:
            presence_reset()
            _, _, first = _http_get(host, port, PATH_PREFIX + "/presence")
            ghost = cli(origin=PAGES_ORIGIN)
            ghost.send_json({"t": "name", "n": "TOOLATE"})
            ghost.recv_json(2.0)
            _, _, second = _http_get(host, port, PATH_PREFIX + "/presence")
            time.sleep(L.PRESENCE_CACHE + 0.4)
            _, _, third = _http_get(host, port, PATH_PREFIX + "/presence")
            ok = first == second and b"TOOLATE" not in second and b"TOOLATE" in third
            check("presence is cached, so hammering it costs one answer, not N", ok,
                  "cached=%s fresh=%s" % (first == second, b"TOOLATE" in third))
            bye(ghost)
        except Exception as e:
            check("presence is cached", False, repr(e))

        try:
            presence_reset()
            statuses = []
            for _ in range(int(L.PRESENCE_BURST) + 8):
                st, _, _ = _http_get(host, port, PATH_PREFIX + "/presence")
                statuses.append(st)
            check("presence is rate limited per caller (429 after the burst)",
                  429 in statuses and statuses[0] == 200,
                  statuses)
            presence_reset()
        except Exception as e:
            check("presence is rate limited", False, repr(e))

        try:
            bye(idler)
            bye(j)
            bye(w)
            idler = j = w = None
            time.sleep(0.3)
            _, _, raw, got = pres()
            gone = [n for n in ("IDLER", "WAITER", "JOINER")
                    if n.encode() in raw]
            check("closing the socket takes the player straight off the list",
                  not gone, "still listed: %s" % gone)
        except Exception as e:
            check("presence forgets closed sockets", False, repr(e))

        # ═══════════ the room list ═══════════
        print("")
        print(" ROOM LIST  (the primary way in — no code is ever typed)")

        def pid_of(name):
            """White-box: the private handle of a named connection. Used only to
            prove that a handle which was never published still does nothing."""
            with ROOMS._lock:
                for c in list(ROOMS._conns):
                    if c.pname == name:
                        return c.pid
            return None

        host_a = guest_b = priv = out1 = out2 = None
        try:
            host_a = cli(origin=PAGES_ORIGIN)
            host_a.send_json({"t": "name", "n": "OPENER"})
            host_a.recv_json(2.0)
            host_a.send_json({"t": "create"})
            made = host_a.recv_json(2.0)
            time.sleep(1.2)                      # so the wait time is visibly > 0
            _, _, _, got = pres()
            rl = got.get("rooms")
            mine = [r for r in (rl or []) if r.get("n") == "OPENER"]
            ok = isinstance(rl, list) and len(mine) == 1
            ok = ok and isinstance(mine[0].get("id"), str) and mine[0]["id"]
            ok = ok and isinstance(mine[0].get("w"), int) and mine[0]["w"] >= 1
            ok = ok and got.get("open") == len(rl)
            ok = ok and (made or {}).get("private") is False
            check("opening a room puts it in the list with a name and a wait time",
                  ok, "made=%r rooms=%r" % (made, rl))
        except Exception as e:
            check("opened room appears in the room list", False, repr(e))

        try:
            _, _, raw, got = pres()
            text = raw.decode("utf-8", "replace")
            leaks = []
            for r in got.get("rooms") or []:
                if set(r.keys()) - {"id", "n", "w"}:
                    leaks.append("extra field %r" % sorted(r.keys()))
            for tok in (token_a or "", token_b or ""):
                if tok and tok in text:
                    leaks.append("seat token")
            for c in [code] + [ROOMS._rooms[k].code for k in list(ROOMS._rooms)]:
                if c and c in text:
                    leaks.append("room code %s" % c)
            check("the room list carries no room code and no seat token",
                  not leaks, "%s :: %s" % (leaks, text[:200]))
        except Exception as e:
            check("room list leaks nothing", False, repr(e))

        try:
            _, _, _, got = pres()
            handle = [r["id"] for r in got["rooms"] if r["n"] == "OPENER"][0]
            guest_b = cli(origin=PAGES_ORIGIN)
            guest_b.send_json({"t": "name", "n": "TAPPER"})
            guest_b.recv_json(2.0)
            guest_b.send_json({"t": "joinid", "id": handle})
            seated = guest_b.recv_json(3.0)
            told = host_a.recv_json(3.0)
            ok = (seated or {}).get("t") == "joined"
            ok = ok and (told or {}) == {"t": "peer", "state": "joined"}
            check("tapping a room in the list seats you, with no code typed", ok,
                  "seated=%r told=%r" % (seated, told))
        except Exception as e:
            check("tapping a listed room seats you", False, repr(e))

        try:
            time.sleep(0.15)
            _, _, _, got = pres()
            names = [r["n"] for r in got["rooms"]]
            check("a full room drops straight out of the list",
                  "OPENER" not in names and got.get("open") == len(got["rooms"]),
                  got)
        except Exception as e:
            check("full room leaves the list", False, repr(e))

        try:
            host_a.send_json({"t": "leave"})
            guest_b.recv_json(2.0)
            bye(host_a)
            bye(guest_b)
            host_a = guest_b = None
            time.sleep(0.3)
            _, _, _, got = pres()
            names = [r["n"] for r in got["rooms"]]
            check("the opener leaving takes the room off the list",
                  "OPENER" not in names and "TAPPER" not in names, got)
        except Exception as e:
            check("leaving removes the room", False, repr(e))

        # --- private rooms --------------------------------------------------
        try:
            priv = cli(origin=PAGES_ORIGIN)
            priv.send_json({"t": "name", "n": "PRIVATE"})
            priv.recv_json(2.0)
            priv.send_json({"t": "create", "private": True})
            made = priv.recv_json(2.0)
            pcode = (made or {}).get("code")
            time.sleep(0.15)
            _, _, raw, got = pres()
            listed = [r["n"] for r in got["rooms"]]
            player = [p for p in got["players"] if p["n"] == "PRIVATE"]
            ok = (made or {}).get("private") is True
            ok = ok and "PRIVATE" not in listed
            ok = ok and len(player) == 1 and player[0].get("id") is None
            ok = ok and pcode and pcode.encode() not in raw
            check("a private room is not in the list and hands out no join handle",
                  ok, "made=%r rooms=%r player=%r" % (made, got["rooms"], player))
        except Exception as e:
            check("private room stays out of the list", False, repr(e))
            pcode = None

        try:
            hidden = pid_of("PRIVATE")
            snoop = cli(origin=PAGES_ORIGIN)
            snoop.send_json({"t": "joinid", "id": hidden})
            r = snoop.recv_json(2.0)
            quiet = priv.silent(0.4)
            check("even the private room's own handle refuses a joinid",
                  bool(hidden) and (r or {}).get("why") == E_NOWAIT and quiet,
                  "handle=%r r=%r quiet=%s" % (bool(hidden), r, quiet))
            bye(snoop)
        except Exception as e:
            check("private room handle is dead", False, repr(e))

        try:
            friend = cli(origin=PAGES_ORIGIN)
            friend.send_json({"t": "join", "code": pcode})
            seated = friend.recv_json(3.0)
            told = priv.recv_json(3.0)
            ok = (seated or {}).get("t") == "joined" and seated.get("code") == pcode
            ok = ok and (told or {}) == {"t": "peer", "state": "joined"}
            check("a private room can still be joined by its code", ok,
                  "seated=%r told=%r" % (seated, told))
            bye(friend)
            bye(priv)
            priv = None
            time.sleep(0.3)
        except Exception as e:
            check("private room joins by code", False, repr(e))

        # --- an outsider must not be able to reach a room ---------------------
        try:
            out1 = cli(origin=PAGES_ORIGIN)
            out1.send_json({"t": "name", "n": "SITTING"})
            out1.recv_json(2.0)
            out2 = cli(origin=PAGES_ORIGIN)
            out2.send_json({"t": "name", "n": "STRANGER"})
            out2.recv_json(2.0)
            idle_handle = pid_of("SITTING")      # never published: SITTING has no room
            _, _, raw, got = pres()
            bad = []
            if idle_handle and idle_handle.encode() in raw:
                bad.append("an idle player's handle was published")
            out2.send_json({"t": "joinid", "id": idle_handle})
            if (out2.recv_json(2.0) or {}).get("why") != E_NOWAIT:
                bad.append("joinid on an idle player was not refused")
            out2.send_json({"t": "joinid", "id": secrets.token_urlsafe(8)})
            if (out2.recv_json(2.0) or {}).get("why") != E_NOWAIT:
                bad.append("a made-up handle was not refused")
            check("an outsider cannot join a room they were never offered",
                  not bad and out1.silent(0.4), bad)
        except Exception as e:
            check("outsider cannot join an unoffered room", False, repr(e))

        try:
            out1.send_json({"t": "create"})
            first = (out1.recv_json(2.0) or {}).get("code")
            out1.send_json({"t": "create"})
            second = (out1.recv_json(2.0) or {}).get("code")
            time.sleep(0.15)
            _, _, _, got = pres()
            mine = [r for r in got["rooms"] if r["n"] == "SITTING"]
            ok = first and second and first != second and len(mine) == 1
            ok = ok and first not in ROOMS._rooms and second in ROOMS._rooms
            check("one connection can only hold one room in the list at a time",
                  ok, "first=%r second=%r listed=%d" % (first, second, len(mine)))
            bye(out1)
            bye(out2)
            out1 = out2 = None
            time.sleep(0.3)
        except Exception as e:
            check("one room per connection", False, repr(e))

        try:
            floods = []
            for i in range(L.ROOMS_MAX + 3):
                c = cli(origin=PAGES_ORIGIN)
                c.send_json({"t": "name", "n": "FLOOD%02d" % i})
                c.recv_json(2.0)
                c.send_json({"t": "create"})
                c.recv_json(2.0)
                floods.append(c)
            time.sleep(0.2)
            _, _, _, got = pres()
            ok = len(got["rooms"]) <= L.ROOMS_MAX
            ok = ok and got["roomsMax"] == L.ROOMS_MAX
            ok = ok and got["open"] > L.ROOMS_MAX          # the count stays honest
            check("the room list is capped at %d, and says how many are really open"
                  % L.ROOMS_MAX, ok,
                  "listed=%d open=%s" % (len(got["rooms"]), got.get("open")))
            for c in floods:
                bye(c)
            time.sleep(0.3)
        except Exception as e:
            check("room list is capped", False, repr(e))

        # ═══════════ abuse ═══════════
        print("")
        print(" ABUSE  (every one of these must be REFUSED)")

        # --- oversized: a frame that merely CLAIMS to be 5 MiB -------------
        try:
            atk = cli(origin=PAGES_ORIGIN)
            head = bytearray([0x81, 0xFF])                  # TEXT, masked, 64-bit length
            head += struct.pack("!Q", 5 * 1024 * 1024)
            head += b"\x00\x00\x00\x00"
            atk.send_raw(bytes(head))
            atk.send_raw(b"A" * 4096)                       # only a sliver of the body
            check("frame claiming 5 MiB -> socket cut before the body is read",
                  atk.dead(3.0), "socket stayed open")
            bye(atk)
        except Exception as e:
            check("frame claiming 5 MiB -> socket cut", False, repr(e))

        # --- oversized: honestly sent, just too big ------------------------
        try:
            atk = cli(origin=PAGES_ORIGIN)
            atk.send_text("x" * (L.MAX_MSG + 1000))
            check("%d KiB message -> socket cut" % ((L.MAX_MSG + 1000) // 1024),
                  atk.dead(3.0))
            bye(atk)
        except Exception as e:
            check("oversized honest message -> socket cut", False, repr(e))

        # --- oversized: smuggled in as many small fragments ----------------
        try:
            atk = cli(origin=PAGES_ORIGIN)
            piece = b"y" * 4096
            atk.send_raw(ws_build_frame(OP_TEXT, piece, mask=True)[:1]
                         .replace(b"\x81", b"\x01") + ws_build_frame(OP_TEXT, piece, mask=True)[1:])
            for _ in range(8):
                f = ws_build_frame(OP_CONT, piece, mask=True)
                atk.send_raw(bytes([0x00]) + f[1:])
            check("fragmented message over the size cap -> socket cut", atk.dead(3.0))
            bye(atk)
        except Exception as e:
            check("fragmented oversize -> socket cut", False, repr(e))

        # --- malformed / hostile JSON --------------------------------------
        try:
            atk = cli(origin=PAGES_ORIGIN)
            probes = ["{not json", "[]", '"hello"', "null", "12", "",
                      '{"t":"nope"}', '{"t":"relay"}',
                      '{"t":"relay","d":{"k":"evil"}}',
                      '{"t":"relay","d":{"k":"act","kind":"rm -rf /"}}',
                      '{"t":"relay","d":{"k":"act","kind":"__proto__"}}',
                      '{"t":"join","code":{"a":1}}',
                      '{"t":"join","code":["' + "A" * 100 + '"]}',
                      '{"t":"rejoin","code":"AAAAA","token":123}']
            bad = []
            for p in probes:
                atk.send_text(p)
                r = atk.recv_json(2.0)
                if not (isinstance(r, dict) and r.get("t") == "error"):
                    bad.append((p[:40], r))
            check("malformed / hostile JSON -> plain error, no crash", not bad, bad)
            bye(atk)
        except Exception as e:
            check("malformed JSON -> error", False, repr(e))

        # --- hostile relay payloads must not reach the peer ----------------
        try:
            leaks = []
            rejects = [
                {"k": "act", "kind": "summon",
                 "a": {"hi": 99999, "zi": 4, "pos": "atk", "fd": False, "tributes": []}},
                {"k": "act", "kind": "summon",
                 "a": {"hi": 1, "zi": 1, "pos": "atk", "fd": False,
                       "tributes": list(range(50))}},
                {"k": "act", "kind": "attack", "a": {"zi": 1, "t": 9999}},
                {"k": "start", "seed": 1, "hostName": "A", "guestName": "B",
                 "hostList": _list40(), "guestList": _list40(),
                 "hostKey": None, "guestKey": None,
                 "hostDeck": ["x" * 60] * 40, "guestDeck": _deck40()},
                {"k": "hello", "name": "A", "list": {"card": 99}},
                {"k": "hello", "name": "A", "list": {"c" * 400: 1}},
                {"k": "wipe-their-save"},
            ]
            for n in rejects:
                a.send_json({"t": "relay", "d": n})
                r = a.recv_json(2.0)
                peek = b.raw_recv(0.4)
                if peek is not TIMEOUT:
                    leaks.append(("forwarded to the peer", n.get("k"), peek))
                if not (isinstance(r, dict) and r.get("t") == "error"):
                    leaks.append(("no error returned", n.get("k"), r))
            check("out-of-range / junk payloads never reach the other player",
                  not leaks, leaks)
        except Exception as e:
            check("hostile relay payloads blocked", False, repr(e))

        # --- script injection in a display name is scrubbed ----------------
        try:
            a.send_json({"t": "relay", "d": {
                "k": "hello", "name": "<img src=x onerror=alert(1)>",
                "list": _list40(), "deckKey": "<b>", "deckName": "\"x\""}})
            got = b.recv_json(3.0)
            name = (got or {}).get("d", {}).get("name", None)
            ok = isinstance(name, str) and not any(c in name for c in "<>\"'&\\`")
            ok = ok and not any(c in ((got or {}).get("d", {}).get("deckKey") or "")
                                for c in "<>")
            check("HTML/quotes are stripped out of names before forwarding", ok, got)
        except Exception as e:
            check("names are scrubbed", False, repr(e))

        # --- spoofed room membership ---------------------------------------
        try:
            spy = cli(origin=PAGES_ORIGIN)
            spy.send_json({"t": "relay", "d": {"k": "act", "kind": "end", "a": None}})
            r1 = spy.recv_json(2.0)
            spy.send_json({"t": "join", "code": code})
            r2 = spy.recv_json(2.0)
            spy.send_json({"t": "rejoin", "code": code, "token": "not-the-real-token",
                           "since": 0})
            r3 = spy.recv_json(2.0)
            spy.send_json({"t": "relay", "code": code,
                           "d": {"k": "act", "kind": "forfeit", "a": None}})
            r4 = spy.recv_json(2.0)
            quiet_a, quiet_b = a.silent(0.5), b.silent(0.5)
            ok = (r1 or {}).get("why") == E_NOTIN
            ok = ok and (r2 or {}).get("why") == E_FULL_ROOM
            ok = ok and (r3 or {}).get("why") == E_BADTOKEN
            ok = ok and (r4 or {}).get("t") == "error"
            ok = ok and quiet_a and quiet_b
            check("outsider cannot relay into, join, or steal a seat in a room", ok,
                  "r1=%r r2=%r r3=%r r4=%r quiet=%s/%s"
                  % (r1, r2, r3, r4, quiet_a, quiet_b))
            bye(spy)
        except Exception as e:
            check("outsider cannot touch someone else's room", False, repr(e))

        # --- a real member cannot claim to be in another room --------------
        try:
            other = cli(origin=PAGES_ORIGIN)
            other.send_json({"t": "create"})
            ocode = (other.recv_json(2.0) or {}).get("code")
            other.send_json({"t": "relay", "code": code,
                             "d": {"k": "act", "kind": "forfeit", "a": None}})
            r = other.recv_json(2.0)
            ok = (r or {}).get("why") == E_NOTIN and a.silent(0.5) and b.silent(0.5)
            check("a player in room X cannot address room Y", ok, "%r %r" % (ocode, r))
            bye(other)
        except Exception as e:
            check("player in room X cannot address room Y", False, repr(e))

        # --- flood ----------------------------------------------------------
        try:
            atk = cli(origin=PAGES_ORIGIN)
            for _ in range(400):
                try:
                    atk.send_text('{"t":"ping"}')
                except OSError:
                    break
            told, closed = False, False
            end = time.monotonic() + 5
            while time.monotonic() < end:
                r = atk.raw_recv(0.5)
                if r is None:
                    closed = True
                    break
                if r is TIMEOUT:
                    continue
                try:
                    if json.loads(r).get("why") == E_FLOOD:
                        told = True
                except ValueError:
                    pass
            check("400-message burst -> told to slow down, then cut off",
                  told and (closed or atk.dead(2.0)), "told=%s closed=%s" % (told, closed))
            bye(atk)
        except Exception as e:
            check("flood -> cut off", False, repr(e))

        # --- room code brute force -----------------------------------------
        try:
            atk = cli(origin=PAGES_ORIGIN)
            for i in range(L.MAX_BAD_JOINS + 5):
                try:
                    atk.send_text(json.dumps({"t": "join", "code": "ZZZZ%s"
                                              % CODE_ALPHABET[i % 32]}))
                except OSError:
                    break
                atk.recv_json(1.0)
                time.sleep(0.03)
            check("guessing room codes -> connection cut after %d misses" % L.MAX_BAD_JOINS,
                  atk.dead(3.0))
            bye(atk)
        except Exception as e:
            check("room code brute force -> cut", False, repr(e))

        # --- per-connection room cap ----------------------------------------
        try:
            atk = cli(origin=PAGES_ORIGIN)
            capped = False
            for _ in range(L.MAX_CREATES + 3):
                atk.send_json({"t": "create"})
                if (atk.recv_json(2.0) or {}).get("why") == E_TOOMANY:
                    capped = True
                time.sleep(0.03)
            check("one connection cannot mint unlimited rooms", capped)
            bye(atk)
        except Exception as e:
            check("per-connection room cap", False, repr(e))

        # --- global room cap -------------------------------------------------
        try:
            hogs = []
            for _ in range(L.MAX_ROOMS + 5):
                h = cli(origin=PAGES_ORIGIN)
                hogs.append(h)
                h.send_json({"t": "create"})
            refused = sum(1 for h in hogs
                          if (h.recv_json(2.0) or {}).get("t") == "error")
            rooms_now = ROOMS.stats()[0]
            check("room cap of %d holds under a create storm" % L.MAX_ROOMS,
                  refused >= 1 and rooms_now <= L.MAX_ROOMS,
                  "refused=%d rooms=%d" % (refused, rooms_now))
            for h in hogs:
                bye(h)
        except Exception as e:
            check("global room cap holds", False, repr(e))

        # --- idle cleanup ----------------------------------------------------
        try:
            settle(0.8)                     # clear what the cap test left behind
            ghost = cli(origin=PAGES_ORIGIN)
            ghost.send_json({"t": "create"})
            made = ghost.recv_json(2.0)
            check("a room exists before the sweep",
                  (made or {}).get("t") == "created" and ROOMS.stats()[0] > 0, made)
            settle(0.8)
            check("idle rooms are swept away automatically",
                  ROOMS.stats()[0] == 0, "rooms=%d" % ROOMS.stats()[0])
            told = ghost.recv_json(2.0)
            check("the idle player is told, not left hanging",
                  (told or {}).get("t") == "closed", told)
            bye(ghost)
        except Exception as e:
            check("idle rooms are swept away", False, repr(e))

        # ═══════════ not a web server ═══════════
        print("")
        print(" IT IS NOT A WEB SERVER")
        try:
            probes = ["/", "/index.html", "/karti", "/karti/", "/js/game.js",
                      "/karti/js/game.js", "/../../etc/passwd",
                      "/karti/../../../../etc/passwd", "/.git/config",
                      "/%2e%2e/%2e%2e/etc/passwd", "/server/karti_server.py"]
            leaked = []
            for p in probes:
                st, _, body = _http_get(host, port, p)
                if st != 404 or b"root:" in body or b"import " in body:
                    leaked.append((p, st, body[:60]))
            check("no path serves a file (/, /js/*, /.git, traversal)", not leaked, leaked)
        except Exception as e:
            check("no path serves a file", False, repr(e))

        try:
            st, _, _ = _http_get(host, port, PATH_PREFIX + "/health", method="POST")
            check("POST is refused", st == 405, st)
        except Exception as e:
            check("POST is refused", False, repr(e))

        # ═══════════ origin / CORS ═══════════
        print("")
        print(" ORIGIN / CORS")
        try:
            _, good, _ = _http_get(host, port, PATH_PREFIX + "/health", origin=PAGES_ORIGIN)
            _, evil, _ = _http_get(host, port, PATH_PREFIX + "/health",
                                   origin="https://evil.example")
            ok = PAGES_ORIGIN in good and "access-control-allow-origin" not in evil.lower()
            check("CORS header is sent only to the GitHub Pages origin", ok,
                  "good=%r evil=%r" % (good[-120:], evil[-120:]))
        except Exception as e:
            check("CORS only for the Pages origin", False, repr(e))

        try:
            presence_reset()
            _, good, _ = _http_get(host, port, PATH_PREFIX + "/presence",
                                   origin=PAGES_ORIGIN)
            _, evil, _ = _http_get(host, port, PATH_PREFIX + "/presence",
                                   origin="https://evil.example")
            ok = PAGES_ORIGIN in good and "access-control-allow-origin" not in evil.lower()
            check("presence obeys the same CORS allow-list as everything else", ok,
                  "good=%r evil=%r" % (good[-120:], evil[-120:]))
        except Exception as e:
            check("presence obeys the CORS allow-list", False, repr(e))

        try:
            refused = False
            try:
                bad = WSClient(host, port, origin="https://evil.example", timeout=3.0)
                bad.close()
            except RuntimeError as e:
                refused = "403" in str(e)
            check("WebSocket upgrade from a foreign origin -> 403", refused)
        except Exception as e:
            check("foreign origin upgrade refused", False, repr(e))

        try:
            ok = False
            try:
                bad = WSClient(host, port, path="/karti/ws", origin=PAGES_ORIGIN,
                               extra="", timeout=3.0)
                bad.close()
                ok = True
            except RuntimeError:
                ok = False
            check("the Pages origin is accepted on /karti/ws", ok)
        except Exception as e:
            check("Pages origin accepted", False, repr(e))

        try:
            ok = False
            try:
                bad = WSClient(host, port, path="/ws", origin=None, timeout=3.0)
                bad.close()
                ok = True
            except RuntimeError:
                ok = False
            check("the bare /ws path still works for local testing", ok)
        except Exception as e:
            check("bare /ws works", False, repr(e))

        # ═══════════ housekeeping ═══════════
        print("")
        print(" HOUSEKEEPING")
        try:
            x = cli(origin=PAGES_ORIGIN)
            y = cli(origin=PAGES_ORIGIN)
            x.send_json({"t": "create"})
            c2 = (x.recv_json(2.0) or {}).get("code")
            y.send_json({"t": "join", "code": c2})
            y.recv_json(2.0)
            x.recv_json(2.0)
            y.send_json({"t": "leave"})
            m = x.recv_json(2.0)
            check("an explicit leave tells the other player straight away",
                  (m or {}) == {"t": "peer", "state": "left"}, m)
            bye(x)
            bye(y)
        except Exception as e:
            check("explicit leave", False, repr(e))

        try:
            for c in list(live):
                bye(c)
            a = b = None
            settle(0.8)
            rooms, clients = ROOMS.stats()
            check("nothing leaks once everybody has gone",
                  rooms == 0 and clients == 0, "rooms=%d clients=%d" % (rooms, clients))
        except Exception as e:
            check("nothing leaks", False, repr(e))

    finally:
        for c in list(live):
            try:
                c.close(graceful=False)
            except Exception:
                pass
        stop.set()
        try:
            httpd.shutdown()
            httpd.server_close()
        except Exception:
            pass

    fails = sum(1 for _, ok in results if not ok)
    print("")
    print("SELFTEST: %s  (%d checks, %d failed)"
          % ("ALL PASS" if fails == 0 else "FAILURES", len(results), fails))
    sys.stdout.flush()
    return 0 if fails == 0 else 1


# ── entry point ──────────────────────────────────────────────────────────────

def main(argv=None):
    global ALLOW_ANY_ORIGIN

    p = argparse.ArgumentParser(description="KARTI online relay (rooms only, serves no files).")
    p.add_argument("--host", default=DEFAULT_HOST,
                   help="bind address (default %s — keep it loopback)" % DEFAULT_HOST)
    p.add_argument("--port", type=int, default=DEFAULT_PORT, help="port (default %d)" % DEFAULT_PORT)
    p.add_argument("--origin", action="append", default=[],
                   help="extra allowed browser origin (repeatable)")
    p.add_argument("--any-origin", action="store_true",
                   help="DEBUG ONLY: accept any Origin header")
    p.add_argument("--log", default=None, help="append-only event log file (no message contents)")
    p.add_argument("--verbose", action="store_true", help="log HTTP oddities to stderr")
    p.add_argument("--selftest", action="store_true", help="run the built-in tests and exit")
    args = p.parse_args(argv)

    for o in args.origin:
        ALLOWED_ORIGINS.add(o.rstrip("/"))
    if args.any_origin:
        ALLOW_ANY_ORIGIN = True
    LOG.path = args.log

    if args.selftest:
        return selftest()

    if args.host not in ("127.0.0.1", "::1", "localhost"):
        print("warning: binding to %s exposes the relay directly. Tailscale Funnel "
              "is meant to be the only way in." % args.host, file=sys.stderr)

    httpd = make_server(args.host, args.port, quiet=not args.verbose)
    stop = threading.Event()
    start_sweeper(stop)
    print_banner(args.host, args.port)
    LOG("start", host=args.host, port=args.port)
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nstopping...")
    finally:
        stop.set()
        httpd.shutdown()
        httpd.server_close()
        LOG("stop")
    return 0


if __name__ == "__main__":
    sys.exit(main())
