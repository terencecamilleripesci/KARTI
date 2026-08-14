#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KARTI LAN game server — static files + hand-rolled WebSocket relay on ONE port.

WHAT IT IS
    A tiny, dependency-free (Python 3 standard library ONLY) server for playing
    KARTI online between two devices on the same wifi / LAN, typically hosted on
    a Raspberry Pi.

    It does two jobs on the same TCP port:
      1. Serves the game's static files (index.html, js/*.js, css, icons, ...)
         over plain HTTP from --root.
      2. Speaks WebSocket (RFC 6455, implemented by hand here) at the path /ws
         and relays JSON messages between the two players of a "room".

HOW TO RUN
    python3 server/karti_server.py
    python3 server/karti_server.py --port 8788 --host 0.0.0.0
    python3 server/karti_server.py --root /path/to/karti-malta
    python3 server/karti_server.py --selftest        # runs built-in tests, exits

    Then BOTH phones open   http://<pi-lan-ip>:8788/   and the page connects to
    ws://<pi-lan-ip>:8788/ws  automatically (same host, same port).

IMPORTANT LIMIT — WHY YOU MUST LOAD THE GAME FROM THIS MACHINE
    Browsers refuse to open an insecure ws:// socket from a page served over
    https:// (mixed content), and modern Chrome additionally blocks requests
    from a public https:// origin into a private LAN address (Private Network
    Access). So a GitHub Pages copy of KARTI (https://...github.io/...) CANNOT
    talk to this server. Online play works only when BOTH players load the game
    over http:// from this machine, on the same network.

OTHER LIMITS (deliberate, keep it simple)
    * LAN only. No TLS, no authentication, no rate limiting. Do not expose to
      the internet.
    * All state lives in RAM. Restarting the server destroys every room.
    * Exactly two players per room.
    * It is a DUMB RELAY: it forwards whatever JSON the clients send. It does
      not know or validate the rules of KARTI, does not referee, does not keep
      score, and trusts both clients completely.

PROTOCOL (one JSON object per WebSocket text frame)
    client -> server                     server -> client
    {"t":"create"}                       {"t":"created","code":"ABCD","host":true}
    {"t":"join","code":"ABCD"}           {"t":"joined","code":"ABCD","host":false}
                                         ... and to the peer: {"t":"peer","state":"joined"}
    {"t":"relay","d":<any JSON>}         to the OTHER member: {"t":"relay","d":<same>}
    {"t":"leave"}                        to the other member: {"t":"peer","state":"left"}
    {"t":"ping"}                         {"t":"pong"}
    errors                               {"t":"error","why":"..."}

    A socket dropping counts as a leave: the peer gets {"t":"peer","state":"left"}.

HTTP EXTRAS
    GET /health  -> {"ok":true,"rooms":N,"clients":M}
"""

from __future__ import annotations

import argparse
import base64
import functools
import hashlib
import json
import os
import secrets
import socket
import struct
import sys
import threading
import time
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# ── constants ────────────────────────────────────────────────────────────────

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

OP_CONT, OP_TEXT, OP_BIN, OP_CLOSE, OP_PING, OP_PONG = 0x0, 0x1, 0x2, 0x8, 0x9, 0xA

MAX_PAYLOAD = 1 << 20          # 1 MiB — refuse anything bigger
ROOM_IDLE_SECONDS = 2 * 60 * 60  # purge rooms idle for over 2 hours
SWEEP_EVERY = 60.0             # seconds between purge sweeps

# Room codes: 4 uppercase letters, no I and no O (they read as 1 and 0).
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LEN = 4

DEFAULT_PORT = 8788
DEFAULT_HOST = "0.0.0.0"
# repo root = parent of the directory holding this script, resolved from __file__
DEFAULT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ── low-level WebSocket frame helpers ────────────────────────────────────────


class WSError(Exception):
    """Anything that means: give up on this one connection."""

    def __init__(self, message: str, code: int = 1002):
        super().__init__(message)
        self.code = code


def _read_exact(rfile, n: int) -> bytes:
    """Read exactly n bytes or raise WSError on EOF."""
    if n == 0:
        return b""
    chunks = []
    got = 0
    while got < n:
        chunk = rfile.read(n - got)
        if not chunk:
            raise WSError("connection closed while reading", 1006)
        chunks.append(chunk)
        got += len(chunk)
    return b"".join(chunks)


def _unmask(data: bytes, mask: bytes) -> bytes:
    if not mask:
        return data
    out = bytearray(data)
    for i in range(len(out)):
        out[i] ^= mask[i & 3]
    return bytes(out)


def ws_read_frame(rfile, require_mask: bool = True):
    """Read one WebSocket frame. Returns (fin: bool, opcode: int, payload: bytes)."""
    head = _read_exact(rfile, 2)
    b1, b2 = head[0], head[1]
    fin = bool(b1 & 0x80)
    rsv = b1 & 0x70
    opcode = b1 & 0x0F
    masked = bool(b2 & 0x80)
    length = b2 & 0x7F

    if rsv:
        raise WSError("reserved bits set", 1002)
    if require_mask and not masked:
        # RFC 6455 §5.1: client-to-server frames MUST be masked.
        raise WSError("unmasked client frame", 1002)

    if length == 126:
        length = struct.unpack("!H", _read_exact(rfile, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _read_exact(rfile, 8))[0]

    if length > MAX_PAYLOAD:
        raise WSError("payload too big (%d bytes)" % length, 1009)

    mask = _read_exact(rfile, 4) if masked else b""
    payload = _read_exact(rfile, length)
    if masked:
        payload = _unmask(payload, mask)

    if opcode in (OP_CLOSE, OP_PING, OP_PONG):
        if not fin:
            raise WSError("fragmented control frame", 1002)
        if length > 125:
            raise WSError("oversized control frame", 1002)

    return fin, opcode, payload


def ws_build_frame(opcode: int, payload: bytes, mask: bool = False) -> bytes:
    """Build one complete (unfragmented) frame. Server frames are unmasked."""
    n = len(payload)
    out = bytearray()
    out.append(0x80 | (opcode & 0x0F))          # FIN + opcode
    mask_bit = 0x80 if mask else 0x00
    if n < 126:
        out.append(mask_bit | n)
    elif n <= 0xFFFF:
        out.append(mask_bit | 126)              # 2-byte extended length
        out += struct.pack("!H", n)
    else:
        out.append(mask_bit | 127)              # 8-byte extended length
        out += struct.pack("!Q", n)
    if mask:
        key = os.urandom(4)
        out += key
        out += _unmask(payload, key)            # masking is symmetric
    else:
        out += payload
    return bytes(out)


def ws_accept_key(client_key: str) -> str:
    """Sec-WebSocket-Accept = base64(sha1(key + GUID))."""
    digest = hashlib.sha1((client_key.strip() + WS_GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


# ── one connected player ─────────────────────────────────────────────────────


class Conn:
    """A live WebSocket connection. Sends are serialised by a per-connection lock."""

    _seq = 0
    _seq_lock = threading.Lock()

    def __init__(self, sock: socket.socket, addr):
        with Conn._seq_lock:
            Conn._seq += 1
            self.cid = Conn._seq
        self.sock = sock
        self.addr = addr
        self.send_lock = threading.Lock()
        self.alive = True
        self.room_code = None       # set by the RoomBook
        self.is_host = False

    # -- sending -------------------------------------------------------------

    def _send_raw(self, data: bytes) -> bool:
        with self.send_lock:
            if not self.alive:
                return False
            try:
                self.sock.sendall(data)
                return True
            except OSError:
                self.alive = False
                return False

    def send_text(self, text: str) -> bool:
        return self._send_raw(ws_build_frame(OP_TEXT, text.encode("utf-8")))

    def send_json(self, obj) -> bool:
        return self.send_text(json.dumps(obj, separators=(",", ":")))

    def send_pong(self, payload: bytes) -> bool:
        return self._send_raw(ws_build_frame(OP_PONG, payload))

    def send_close(self, code: int = 1000, reason: str = "") -> bool:
        body = struct.pack("!H", code) + reason.encode("utf-8")[:123]
        return self._send_raw(ws_build_frame(OP_CLOSE, body))

    def shutdown(self):
        with self.send_lock:
            self.alive = False
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    def __repr__(self):
        return "<Conn %d %s room=%s>" % (self.cid, self.addr, self.room_code)


class Room:
    def __init__(self, code: str):
        self.code = code
        self.members = []          # list of Conn, max 2
        self.created = time.time()
        self.touched = time.time()


# ── room bookkeeping (the only shared mutable state) ─────────────────────────


class RoomBook:
    """All rooms + all connections, behind one lock.

    Every public method returns *what to send* rather than sending it, so no
    socket write ever happens while the lock is held.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._rooms = {}           # code -> Room
        self._conns = set()        # every live Conn

    # -- connection registry -------------------------------------------------

    def register(self, conn: Conn):
        with self._lock:
            self._conns.add(conn)

    def unregister(self, conn: Conn):
        with self._lock:
            self._conns.discard(conn)

    def stats(self):
        with self._lock:
            return len(self._rooms), len(self._conns)

    # -- helpers (call with the lock held) -----------------------------------

    def _new_code(self) -> str:
        while True:
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
            if code not in self._rooms:
                return code

    def _detach(self, conn: Conn):
        """Remove conn from its room. Returns the peer Conn (or None)."""
        code = conn.room_code
        conn.room_code = None
        room = self._rooms.get(code)
        if room is None:
            return None
        if conn in room.members:
            room.members.remove(conn)
        room.touched = time.time()
        peer = room.members[0] if room.members else None
        if not room.members:
            self._rooms.pop(code, None)
        return peer

    # -- protocol actions ----------------------------------------------------

    def create(self, conn: Conn):
        """-> (reply_to_sender, (peer, msg) | None)"""
        with self._lock:
            old_peer = self._detach(conn) if conn.room_code else None
            code = self._new_code()
            room = Room(code)
            room.members.append(conn)
            self._rooms[code] = room
            conn.room_code = code
            conn.is_host = True
        notify = (old_peer, {"t": "peer", "state": "left"}) if old_peer else None
        return {"t": "created", "code": code, "host": True}, notify

    def join(self, conn: Conn, code):
        """-> (reply_to_sender, (peer, msg) | None)"""
        if not isinstance(code, str):
            return {"t": "error", "why": "No room with that code."}, None
        code = code.strip().upper()
        with self._lock:
            room = self._rooms.get(code)
            if room is None:
                return {"t": "error", "why": "No room with that code."}, None
            if conn in room.members:
                return {"t": "joined", "code": code, "host": conn.is_host}, None
            if len(room.members) >= 2:
                return {"t": "error", "why": "That room already has two players."}, None
            old_peer = self._detach(conn) if conn.room_code else None
            room = self._rooms.get(code)
            if room is None or len(room.members) >= 2:   # vanished while we shuffled
                return {"t": "error", "why": "No room with that code."}, None
            peer = room.members[0] if room.members else None
            room.members.append(conn)
            room.touched = time.time()
            conn.room_code = code
            conn.is_host = False
        if old_peer is not None and old_peer is not peer:
            old_peer.send_json({"t": "peer", "state": "left"})
        notify = (peer, {"t": "peer", "state": "joined"}) if peer else None
        return {"t": "joined", "code": code, "host": False}, notify

    def peer_of(self, conn: Conn):
        with self._lock:
            room = self._rooms.get(conn.room_code)
            if room is None:
                return None
            room.touched = time.time()
            for m in room.members:
                if m is not conn:
                    return m
            return None

    def leave(self, conn: Conn):
        """-> peer Conn to notify, or None"""
        with self._lock:
            if conn.room_code is None:
                return None
            return self._detach(conn)

    def sweep(self):
        """Drop empty rooms and rooms idle for too long."""
        now = time.time()
        with self._lock:
            dead = [c for c, r in self._rooms.items()
                    if not r.members or (now - r.touched) > ROOM_IDLE_SECONDS]
            for code in dead:
                room = self._rooms.pop(code, None)
                if room:
                    for m in room.members:
                        m.room_code = None
        return len(dead)


ROOMS = RoomBook()


# ── the message pump for one player ──────────────────────────────────────────


def handle_ws_message(conn: Conn, raw: str):
    """Handle one JSON text message from a client."""
    try:
        msg = json.loads(raw)
    except (ValueError, TypeError):
        conn.send_json({"t": "error", "why": "Bad JSON."})
        return
    if not isinstance(msg, dict):
        conn.send_json({"t": "error", "why": "Bad JSON."})
        return

    kind = msg.get("t")

    if kind == "create":
        reply, notify = ROOMS.create(conn)
        conn.send_json(reply)
        if notify:
            notify[0].send_json(notify[1])

    elif kind == "join":
        reply, notify = ROOMS.join(conn, msg.get("code"))
        conn.send_json(reply)
        if notify:
            notify[0].send_json(notify[1])

    elif kind == "relay":
        peer = ROOMS.peer_of(conn)
        if peer is None:
            conn.send_json({"t": "error", "why": "Nobody else in the room yet."})
        else:
            # forward the payload verbatim, no inspection, no rules
            peer.send_json({"t": "relay", "d": msg.get("d")})

    elif kind == "leave":
        peer = ROOMS.leave(conn)
        if peer:
            peer.send_json({"t": "peer", "state": "left"})

    elif kind == "ping":
        conn.send_json({"t": "pong"})

    else:
        conn.send_json({"t": "error", "why": "Unknown message type."})


def ws_pump(conn: Conn, rfile):
    """Read frames until the client goes away. Never raises."""
    frag_op = None
    frag_buf = bytearray()
    try:
        while conn.alive:
            fin, opcode, payload = ws_read_frame(rfile, require_mask=True)

            if opcode == OP_CLOSE:
                conn.send_close(1000)
                return
            if opcode == OP_PING:
                conn.send_pong(payload)
                continue
            if opcode == OP_PONG:
                continue

            if opcode == OP_CONT:
                if frag_op is None:
                    raise WSError("continuation without start", 1002)
            elif opcode in (OP_TEXT, OP_BIN):
                if frag_op is not None:
                    raise WSError("new message during fragmented message", 1002)
                frag_op = opcode
            else:
                raise WSError("unknown opcode %d" % opcode, 1002)

            frag_buf += payload
            if len(frag_buf) > MAX_PAYLOAD:
                raise WSError("message too big", 1009)
            if not fin:
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
            # binary frames are simply ignored — KARTI only speaks JSON text

    except WSError as e:
        if e.code != 1006:
            conn.send_close(e.code, str(e)[:100])
    except (OSError, ValueError):
        pass
    except Exception:                        # never take the server down
        traceback.print_exc()


# ── HTTP + WebSocket request handler ─────────────────────────────────────────


class KartiHandler(SimpleHTTPRequestHandler):
    server_version = "KARTI/1.0"
    protocol_version = "HTTP/1.1"
    quiet = True

    # be explicit; some Pi images have thin /etc/mime.types
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        "": "application/octet-stream",
        ".html": "text/html; charset=utf-8",
        ".htm": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webmanifest": "application/manifest+json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".wav": "audio/wav",
        ".txt": "text/plain; charset=utf-8",
    })

    # -- noise control -------------------------------------------------------

    def log_message(self, fmt, *args):
        if not self.quiet:
            sys.stderr.write("[karti] %s - %s\n" % (self.address_string(), fmt % args))

    def log_error(self, fmt, *args):
        if not self.quiet:
            sys.stderr.write("[karti] %s - %s\n" % (self.address_string(), fmt % args))

    # -- headers -------------------------------------------------------------

    def end_headers(self):
        # phones love caching stale JS; make sure they never do
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        SimpleHTTPRequestHandler.end_headers(self)

    # -- routing -------------------------------------------------------------

    def _path_only(self) -> str:
        return self.path.split("?", 1)[0].split("#", 1)[0]

    def _wants_websocket(self) -> bool:
        upgrade = (self.headers.get("Upgrade") or "").strip().lower()
        conn_hdr = (self.headers.get("Connection") or "").lower()
        return upgrade == "websocket" and "upgrade" in conn_hdr

    def do_GET(self):
        path = self._path_only()
        if path == "/ws":
            self.handle_websocket()
            return
        if path == "/health":
            self.send_json_response(200, self.health_payload())
            return
        SimpleHTTPRequestHandler.do_GET(self)

    def do_HEAD(self):
        path = self._path_only()
        if path in ("/ws", "/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        SimpleHTTPRequestHandler.do_HEAD(self)

    @staticmethod
    def health_payload():
        rooms, clients = ROOMS.stats()
        return {"ok": True, "rooms": rooms, "clients": clients}

    def send_json_response(self, status: int, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # -- the WebSocket upgrade ----------------------------------------------

    def handle_websocket(self):
        self.close_connection = True          # we own the socket from here on
        key = self.headers.get("Sec-WebSocket-Key")
        version = (self.headers.get("Sec-WebSocket-Version") or "").strip()
        if not self._wants_websocket() or not key:
            self.send_json_response(400, {"t": "error", "why": "Expected a WebSocket upgrade."})
            return
        if version and version != "13":
            self.send_response(426)
            self.send_header("Sec-WebSocket-Version", "13")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        accept = ws_accept_key(key)
        handshake = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Accept: %s\r\n"
            "\r\n" % accept
        ).encode("ascii")

        try:
            self.connection.sendall(handshake)
        except OSError:
            return

        # from now on: raw frames. No socket timeout, players idle between turns.
        try:
            self.connection.settimeout(None)
            self.connection.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        except OSError:
            pass

        conn = Conn(self.connection, self.client_address)
        ROOMS.register(conn)
        try:
            ws_pump(conn, self.rfile)
        finally:
            peer = ROOMS.leave(conn)
            ROOMS.unregister(conn)
            conn.alive = False
            if peer is not None:
                peer.send_json({"t": "peer", "state": "left"})


# ── server plumbing ──────────────────────────────────────────────────────────


def make_server(host: str, port: int, root: str, quiet: bool = True) -> ThreadingHTTPServer:
    handler_cls = type("KartiHandlerBound", (KartiHandler,), {"quiet": quiet})
    handler = functools.partial(handler_cls, directory=root)
    ThreadingHTTPServer.allow_reuse_address = True
    ThreadingHTTPServer.daemon_threads = True
    return ThreadingHTTPServer((host, port), handler)


def start_sweeper(stop_event: threading.Event) -> threading.Thread:
    def loop():
        while not stop_event.wait(SWEEP_EVERY):
            try:
                ROOMS.sweep()
            except Exception:
                traceback.print_exc()
    t = threading.Thread(target=loop, name="karti-sweeper", daemon=True)
    t.start()
    return t


def lan_ips():
    """Best-effort list of this machine's LAN IPv4 addresses."""
    ips = []

    def add(ip):
        if ip and not ip.startswith("127.") and ip not in ips:
            ips.append(ip)

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))       # no packets sent, just picks a route
            add(s.getsockname()[0])
        finally:
            s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            add(info[4][0])
    except OSError:
        pass
    return ips


def print_banner(host: str, port: int, root: str):
    ips = lan_ips()
    shown = ips if host in ("0.0.0.0", "::", "") else [host]
    if not shown:
        shown = ["<this-machine-ip>"]
    print("")
    print("KARTI server running")
    print("  serving files from : %s" % root)
    print("  listening on       : %s:%d" % (host, port))
    print("")
    print("  Open this on BOTH phones:")
    for ip in shown:
        print("      http://%s:%d/" % (ip, port))
    print("  WebSocket endpoint : ws://%s:%d/ws" % (shown[0], port))
    print("  Health check       : http://%s:%d/health" % (shown[0], port))
    print("")
    print("  NOTE: online play only works when BOTH players load the game over")
    print("  http:// from this machine on the same network. An https:// copy")
    print("  (e.g. GitHub Pages) cannot connect here - the browser blocks it")
    print("  (mixed content / private network access).")
    print("")
    print("  Ctrl+C to stop.")
    print("", flush=True)


# ── a minimal stdlib WebSocket CLIENT (used by --selftest) ───────────────────


class WSClient:
    """Tiny blocking WebSocket client. Enough to drive the self-test."""

    def __init__(self, host: str, port: int, path: str = "/ws", timeout: float = 5.0):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(timeout)
        self.rfile = self.sock.makefile("rb")
        self.closed = False

        key = base64.b64encode(os.urandom(16)).decode("ascii")
        req = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n" % (path, host, port, key)
        )
        self.sock.sendall(req.encode("ascii"))

        status = self.rfile.readline().decode("latin-1").strip()
        if "101" not in status:
            raise RuntimeError("handshake failed: %r" % status)
        headers = {}
        while True:
            line = self.rfile.readline().decode("latin-1").strip()
            if not line:
                break
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        if headers.get("sec-websocket-accept") != ws_accept_key(key):
            raise RuntimeError("bad Sec-WebSocket-Accept")

    def send_text(self, text: str):
        self.sock.sendall(ws_build_frame(OP_TEXT, text.encode("utf-8"), mask=True))

    def send_json(self, obj):
        self.send_text(json.dumps(obj))

    def recv_text(self):
        """Return the next text message, or None if the peer closed."""
        buf = bytearray()
        while True:
            try:
                fin, opcode, payload = ws_read_frame(self.rfile, require_mask=False)
            except WSError:
                return None
            except (OSError, socket.timeout):
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

    def recv_json(self):
        text = self.recv_text()
        return None if text is None else json.loads(text)

    def expect_nothing(self, seconds: float = 0.35) -> bool:
        """True if no message arrives within `seconds`."""
        old = self.sock.gettimeout()
        self.sock.settimeout(seconds)
        try:
            return self.recv_text() is None
        finally:
            try:
                self.sock.settimeout(old)
            except OSError:
                pass

    def close(self, graceful: bool = True):
        if self.closed:
            return
        self.closed = True
        try:
            if graceful:
                self.sock.sendall(ws_build_frame(OP_CLOSE, struct.pack("!H", 1000), mask=True))
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


def _http_get(host: str, port: int, path: str, timeout: float = 5.0):
    """Dead-simple HTTP/1.0 GET -> (status:int, body:bytes)."""
    s = socket.create_connection((host, port), timeout=timeout)
    s.settimeout(timeout)
    try:
        s.sendall(("GET %s HTTP/1.0\r\nHost: %s\r\nConnection: close\r\n\r\n"
                   % (path, host)).encode("ascii"))
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
    return status, body


# ── self-test ────────────────────────────────────────────────────────────────


def selftest(root: str) -> int:
    results = []

    def check(name: str, ok: bool, detail: str = ""):
        results.append((name, bool(ok)))
        print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name,
                               ("  -- " + detail) if (detail and not ok) else ""))
        return ok

    host = "127.0.0.1"
    httpd = make_server(host, 0, root, quiet=True)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.1},
                              name="karti-selftest-server", daemon=True)
    thread.start()

    print("SELFTEST on http://%s:%d  (root=%s)" % (host, port, root))
    a = b = c = None
    try:
        # 1 -- /health
        try:
            status, body = _http_get(host, port, "/health")
            payload = json.loads(body.decode("utf-8"))
            check("1. GET /health returns ok", status == 200 and payload.get("ok") is True,
                  "status=%s body=%r" % (status, body[:120]))
        except Exception as e:
            check("1. GET /health returns ok", False, repr(e))

        # 2 -- GET / serves index.html
        try:
            status, body = _http_get(host, port, "/")
            check("2. GET / serves index.html with KARTI",
                  status == 200 and b"KARTI" in body,
                  "status=%s len=%d" % (status, len(body)))
        except Exception as e:
            check("2. GET / serves index.html with KARTI", False, repr(e))

        # 3 -- A creates a room
        code = None
        try:
            a = WSClient(host, port)
            a.send_json({"t": "create"})
            msg = a.recv_json()
            code = (msg or {}).get("code")
            ok = (msg or {}).get("t") == "created" and msg.get("host") is True
            ok = ok and isinstance(code, str) and len(code) == CODE_LEN
            ok = ok and all(ch in CODE_ALPHABET for ch in code or "")
            check("3. A create -> 4-letter code", ok, repr(msg))
        except Exception as e:
            check("3. A create -> 4-letter code", False, repr(e))

        # 4 -- B joins
        try:
            b = WSClient(host, port)
            b.send_json({"t": "join", "code": code})
            bmsg = b.recv_json()
            amsg = a.recv_json()
            ok = (bmsg or {}).get("t") == "joined" and bmsg.get("code") == code \
                and bmsg.get("host") is False
            ok = ok and (amsg or {}) == {"t": "peer", "state": "joined"}
            check("4. B join -> both notified", ok, "B=%r A=%r" % (bmsg, amsg))
        except Exception as e:
            check("4. B join -> both notified", False, repr(e))

        # 5 -- relay both ways
        try:
            pay_a = {"move": "play", "card": "il-Qattus", "n": 7, "u": "għ ż ċ"}
            a.send_json({"t": "relay", "d": pay_a})
            got_b = b.recv_json()
            pay_b = ["ok", {"score": [3, 1]}, None, True]
            b.send_json({"t": "relay", "d": pay_b})
            got_a = a.recv_json()
            ok = got_b == {"t": "relay", "d": pay_a} and got_a == {"t": "relay", "d": pay_b}
            check("5. relay A->B and B->A verbatim", ok, "B got %r / A got %r" % (got_b, got_a))
        except Exception as e:
            check("5. relay A->B and B->A verbatim", False, repr(e))

        # 6 -- big payload round trip (needs 16-bit extended length both ways)
        try:
            big = "".join(secrets.choice("abcdefghijklmnopqrstuvwxyz0123456789")
                          for _ in range(40000))
            a.send_json({"t": "relay", "d": {"blob": big}})
            got_b = b.recv_json()
            ok1 = got_b == {"t": "relay", "d": {"blob": big}}
            b.send_json({"t": "relay", "d": {"echo": big}})
            got_a = a.recv_json()
            ok2 = got_a == {"t": "relay", "d": {"echo": big}}
            check("6. 40KB relay survives both directions", ok1 and ok2,
                  "A->B ok=%s B->A ok=%s" % (ok1, ok2))
        except Exception as e:
            check("6. 40KB relay survives both directions", False, repr(e))

        # 7 -- bad code
        try:
            c = WSClient(host, port)
            bad = "ZZZZ" if code != "ZZZZ" else "YYYY"
            c.send_json({"t": "join", "code": bad})
            msg = c.recv_json()
            check("7. bad code -> error", (msg or {}).get("t") == "error"
                  and "No room" in (msg or {}).get("why", ""), repr(msg))
        except Exception as e:
            check("7. bad code -> error", False, repr(e))

        # 8 -- full room
        try:
            c.send_json({"t": "join", "code": code})
            msg = c.recv_json()
            check("8. full room -> error", (msg or {}).get("t") == "error"
                  and "two players" in (msg or {}).get("why", ""), repr(msg))
        except Exception as e:
            check("8. full room -> error", False, repr(e))

        # 9 -- B drops -> A is told
        try:
            b.close(graceful=False)
            b = None
            msg = a.recv_json()
            check("9. B disconnect -> A gets peer left",
                  (msg or {}) == {"t": "peer", "state": "left"}, repr(msg))
        except Exception as e:
            check("9. B disconnect -> A gets peer left", False, repr(e))

    finally:
        for cl in (a, b, c):
            if cl is not None:
                try:
                    cl.close()
                except Exception:
                    pass
        try:
            httpd.shutdown()
        except Exception:
            pass
        try:
            httpd.server_close()
        except Exception:
            pass

    fails = sum(1 for _, ok in results if not ok)
    print("")
    if fails == 0:
        print("SELFTEST: ALL PASS (%d checks)" % len(results))
    else:
        print("SELFTEST: FAILURES: %d" % fails)
    sys.stdout.flush()
    return 0 if fails == 0 else 1


# ── entry point ──────────────────────────────────────────────────────────────


def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        description="KARTI LAN server: static files + WebSocket room relay on one port.")
    p.add_argument("--host", default=DEFAULT_HOST, help="bind address (default %s)" % DEFAULT_HOST)
    p.add_argument("--port", type=int, default=DEFAULT_PORT,
                   help="port (default %d)" % DEFAULT_PORT)
    p.add_argument("--root", default=DEFAULT_ROOT,
                   help="directory to serve (default: the KARTI repo root)")
    p.add_argument("--verbose", action="store_true", help="log every HTTP request")
    p.add_argument("--selftest", action="store_true", help="run the built-in tests and exit")
    args = p.parse_args(argv)

    root = os.path.abspath(os.path.expanduser(args.root))
    if not os.path.isdir(root):
        print("error: --root %r is not a directory" % root, file=sys.stderr)
        return 2

    if args.selftest:
        return selftest(root)

    httpd = make_server(args.host, args.port, root, quiet=not args.verbose)
    stop = threading.Event()
    start_sweeper(stop)
    print_banner(args.host, args.port, root)
    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nstopping...")
    finally:
        stop.set()
        httpd.shutdown()
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
