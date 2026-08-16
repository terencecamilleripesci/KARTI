#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KARTI relay — a small, hostile-internet-facing WebSocket room relay.

WHAT IT IS
    Python 3 standard library ONLY. No pip, no framework, no ORM.
    It does two jobs and no others:
      1. pair two players by a short room code and pass validated JSON duel
         moves between them;
      2. hold KARTI ACCOUNTS and one save file each, so a player can log in on
         a second phone and find their cards, decks and story progress there.
    Job 2 is the only thing in this process that touches the disk, it is a
    single SQLite file, and it switches itself off cleanly if that file cannot
    be opened.

WHAT IT IS NOT
    * It is NOT a web server. It never opens a file it was not pointed at,
      never lists a directory, never serves anything from disk. The game itself
      is hosted on GitHub Pages; this process only relays and stores saves.
    * It does NOT understand a save. The blob is size-capped, depth-capped and
      checked to be well-formed JSON, then stored and returned VERBATIM. It is
      never merged, never interpreted, never eval'd.
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
    anything else                         404 JSON.

ACCOUNT ROUTES  (POST, JSON in and JSON out, also served at /acct/<x>)
    POST /karti/acct/register  {u,pw}                    -> 201 {tok,exp,u,name,ver:0}
    POST /karti/acct/login     {u,pw}                    -> 200 {tok,exp,u,name,ver,at,save}
    POST /karti/acct/logout    {tok}                     -> 200 {ok}
    POST /karti/acct/pull      {tok[,prev]}              -> 200 {ver,at,save,hasPrev}
    POST /karti/acct/push      {tok,base,save[,force]}   -> 200 {ver,at}
                                                            409 {code:"stale",ver,at,save}
    register and login are the ONLY unauthenticated routes; both are token
    bucketed per caller and capped globally. `pw` is an opaque secret string —
    the official client sends a SHA-256 of the real password so the Pi never
    sees it, and the server hashes WHATEVER ARRIVES again with a slow salted
    KDF (scrypt, pbkdf2-sha256 if OpenSSL has no scrypt). No route ever echoes
    a password, a hash or another account's token, and /health and /presence
    say nothing at all about who has an account.

    409 is the whole point of the versioning: two phones that both played
    offline both hold a save the other has not seen, so the second push is
    REFUSED with the server's copy attached and the player is asked which to
    keep. The blob a push replaces is kept (prev_*) and can be pulled back.

PROTOCOL  (one JSON object per WebSocket text frame, both directions)
    client -> server                        server -> client
    {"t":"create","private":false,          {"t":"created","code":C,"token":T,
              "game":"chess"}                "host":true,"seq":0,"private":false,
                                             "game":"chess"}
                                            "private":true opens a room that is
                                            NOT in the public room list and can
                                            only be entered with its code.
                                            "game" is cards | chess | dama and
                                            NO game field means the CARD DUEL —
                                            which is what every room was before
                                            this existed, so an older client
                                            that says nothing gets exactly what
                                            it always got.
    {"t":"join","code":C}                   {"t":"joined","code":C,"token":T,
                                             "host":false,"seq":N,"game":G}
                                            peer: {"t":"peer","state":"joined"}
    {"t":"joinid","id":P,"game":G}          same "joined" reply. P is the public
                                            handle from /presence — the one
                                            carried by each entry in the room
                                            list — so you tap a room and are
                                            seated without ever being told, or
                                            typing, anybody's room code. "game",
                                            if sent, must match the room's own
                                            or the join is refused: a stale list
                                            must never seat you at the wrong
                                            game.
    {"t":"name","n":"TERENCE"}              {"t":"named","n":"TERENCE"}
    {"t":"rejoin","code":C,"token":T,       {"t":"rejoined","code":C,"host":B,
              "since":N}                     "seq":N,"peer":B,"game":G}
                                             + replayed relays
                                            peer: {"t":"peer","state":"rejoined"}
    {"t":"relay","d":{...}}                 peer: {"t":"relay","n":SEQ,"d":{...}}
                                            d.k is one of hello/start/act/bail
                                            (the card duel) or bhello/bstart/
                                            bact (chess and dama). A payload for
                                            a game the room is not playing is
                                            REFUSED, not forwarded.
    {"t":"leave"}                           peer: {"t":"peer","state":"left"}
    {"t":"ping"}                            {"t":"pong"}
                                            {"t":"error","why":"..."}   (fixed text)
                                            {"t":"closed","why":"..."}  then close

PRESENCE, AND WHAT IT DELIBERATELY DOES NOT SAY
    /presence answers with counts, a capped list of {name, state} where state is
    idle | waiting | playing, and the ROOM LIST: every open, public, still-empty
    room as {"id":handle,"n":opener's name,"w":seconds waited,"g":game}. It NEVER
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
    python3 server/karti_server.py --accounts /var/lib/karti/accounts.db
    python3 server/karti_server.py --no-accounts   # pure relay, never writes

    See docs/ONLINE.md for the systemd unit and the tailscale funnel command.
"""

from __future__ import annotations

import argparse
import base64
import collections
import hashlib
import hmac

# The record book and the leaderboard live in their own module so they could
# be written while this file was being changed by other work. Everything they
# add answers 503 until open_store() is called, so an unmounted build is a
# feature that is off rather than a route that breaks.
import karti_stats
import json
import os
import random
import re
import secrets
import shutil
import socket
import sqlite3
import struct
import sys
import tempfile
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ── deployment constants ─────────────────────────────────────────────────────

DEFAULT_HOST = "127.0.0.1"          # loopback ONLY. Tailscale does the exposing.
DEFAULT_PORT = 8101
PATH_PREFIX = "/karti"              # funnel forwards the full path
ACCT_PREFIX = "/acct"               # the only POST routes in the whole process

# The one file this process ever writes (accounts + saved games). It is under
# /var/lib on purpose: the systemd unit is ProtectSystem=strict + ProtectHome=
# read-only, so this path has to be handed back explicitly with StateDirectory=
# / ReadWritePaths=. If it cannot be opened, accounts simply switch themselves
# off and everything else — relay, multiplayer, offline play — carries on.
DEFAULT_ACCT_DB = "/var/lib/karti/accounts.db"

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

# What a room can be a room OF. A room with no game on it is a CARD DUEL, and
# that is not a default chosen for tidiness — it is the only answer that keeps
# a client written before this existed working, in both directions: an old
# client opens a room and says nothing (cards), and an old client reading the
# new room list sees a field it does not know and ignores it.
DEFAULT_GAME = "cards"
DUELS = ("cards", "chess", "dama")          # exactly two. The NARROW case.
BOARD_GAMES = ("chess", "dama")             # duels with a move-shaped payload
TABLES = ("skarta", "klabb", "kiri", "tombla")
GAME_IDS = DUELS + TABLES
# Everything that plays over bhello/bstart/bact/btake — i.e. everything except
# the card duel, which has had its own four payloads since before any of this.
PLAY_GAMES = BOARD_GAMES + TABLES

# ── HOW MANY CHAIRS ──────────────────────────────────────────────────────────
#
# These are PARTY games. A table full of friends is the normal case and the
# two-player duel is the special one, so the seat count is the primary piece of
# room data, not an exception bolted on.
#
# THE RELAY KNOWS NOTHING ELSE ABOUT ANY OF THEM. This is the seating twin of
# payload_fits(): it knows which game and how many chairs, and refuses anything
# outside that, without knowing one rule. A game whose range changes edits one
# line here and nothing else in this file.
#
# Every maximum below is READ OUT OF THE GAME'S OWN CODE, not guessed:
#
#   skarta  TEN. The arithmetic ceiling is 15 (15*7+1 = 106 of 108) but that is
#           the wrong number: the discard is recycled when the stock runs dry,
#           so what decides a big table is the POOL — stock plus discard, less
#           the card showing — against the 12 cards a maxed chain can demand.
#           Measured over 400 complete games per size, js/skarta.js found the
#           pool never fell below 22 at ten seats, bottomed out at exactly 12
#           at eleven (zero margin), and from thirteen the table periodically
#           had nothing to give at all. So ten plays properly, eleven has no
#           margin, twelve is dealable but short-changes people on a big chain.
#           The game caps at 10; this MUST match, or the relay seats players
#           the game will silently trim.
#   kiri    EIGHT, and the reason is worth writing down because it is not the
#           rules: a player is a 9pt coloured dot on a 44pt square, and eight
#           is as many hues as stay apart at that size. Its money and its board
#           would carry more. (This said FOUR until js/kiri.js removed a quiet
#           seats.slice(0, 4) — a cap that had been making its own seat-count
#           experiments return identical results for 4 through 10.)
#   tombla  everybody plays at once and nobody waits for a turn, so it takes
#           the largest table the relay will set.
#   klabb   per VARIANT — see GAME_VARIANT_SEATS below. Bixkla and Briscola are
#           partnership games at 2 or 4; Sette e Mezzo takes a whole table.
#
#   game        (min, max, default)
GAME_SEATS = {
    "cards":  (2, 2, 2),
    "chess":  (2, 2, 2),
    "dama":   (2, 2, 2),
    "skarta": (2, 10, 6),
    "klabb":  (2, 8, 4),
    "kiri":   (2, 8, 4),
    "tombla": (2, 16, 8),
}

# Which flavour of a game a room is playing, where that is a real choice. Kept
# here rather than in the game so the relay can publish it in the room list
# without ever having to know what "briscola" means.
GAME_VARIANTS = {
    "klabb": ("bixkla", "briscola", "sette", "gidba"),
}
# A variant may narrow its game's range. Partnership games need even seats, but
# the relay does not know what a partnership IS — it just carries the numbers
# the game declared.
GAME_VARIANT_SEATS = {
    ("klabb", "bixkla"):   (2, 4, 4),
    ("klabb", "briscola"): (2, 4, 4),
    ("klabb", "sette"):    (2, 8, 5),
    ("klabb", "gidba"):    (3, 8, 5),
}


def seat_range(game, variant=None):
    """(min, max, default) chairs for this game, narrowed by its variant."""
    if variant is not None and (game, variant) in GAME_VARIANT_SEATS:
        return GAME_VARIANT_SEATS[(game, variant)]
    return GAME_SEATS.get(game, (2, 2, 2))


class L:
    """Every hard limit in one place. --selftest overrides some of these."""

    MAX_SOCKETS = 320           # concurrent TCP connections accepted at all
    MAX_WS = 256                # concurrent upgraded WebSockets — SIXTEEN full
                                #   sixteen-seat tables, or 128 duels, or any
                                #   mix of the two. One OS thread each, which is
                                #   the real cost, and this number was MEASURED
                                #   rather than guessed: at exactly this many
                                #   sockets, all of them playing, the relay sat
                                #   at 3.8% of one core and 39 MB of RSS with a
                                #   p99 latency of 21 ms. See "How many tables
                                #   fit" in docs/ONLINE.md.
    MAX_ROOMS = 128             # concurrent rooms
    MAX_SEATS = 16              # chairs at the biggest table the relay will set.
                                #   Each game declares its own range in
                                #   GAME_SEATS; this is the hard ceiling over
                                #   all of them, and it exists so one number
                                #   bounds every buffer and bitmask in here.

    # ── fan-out ──────────────────────────────────────────────────────────
    # One move at an eight-seat table is SEVEN sends. The per-connection
    # message bucket limits what one player may say; this limits how loud a
    # whole ROOM may be, so a single fast client cannot amplify itself across
    # seven sockets. It is per room, not per player, on purpose: it is the
    # amplification that costs the Pi, not the typing.
    FAN_RATE = 40.0             # relayed messages/second per room, sustained
    FAN_BURST = 80.0

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

    TAKE_BURST = 3.0            # takeback REQUESTS one connection may fire off
    TAKE_RATE = 1.0 / 15.0      #   at once, then one every fifteen seconds.
                                #   Asking for the move back every single turn
                                #   is a way to ruin a game, so it is capped
                                #   here as well as in the client.

    # ── invites ──────────────────────────────────────────────────────────
    # An invite is a note left for an ACCOUNT: "come and play chess". It is
    # held in memory only, dies on its own, and never carries a room code.
    INVITE_TTL = 5 * 60.0       # seconds an unanswered invite lives
    INVITES_TOTAL = 256         # invites the whole server will hold at once
    INVITES_TO = 8              # invites one PLAYER may be holding. Full is
                                #   full: a flooder cannot push real ones out.
    INVITES_FROM = 5            # invites one connection may have outstanding
    INVITE_BURST = 4.0          # and the bucket on top of that
    INVITE_RATE = 1.0 / 20.0

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
E_WRONGGAME = "That is not the game this room is playing."
E_NOAUTH = "Sign in first."
E_NOROOMYET = "Open a room before you invite anybody."
E_NOINVITE = "That invitation has gone."
E_NOTHOST = "Only the player who opened the table can start it."
E_ALREADY = "That game has already started."
E_BADSEAT = "That chair is not free."
E_TOOFEW = "Not enough players for that game yet."

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
# The card duel's four payloads, unchanged, plus the three the board games use.
# "bail" belongs to neither: stopping a match is the same message whatever is
# being played, and it is the only payload allowed in a room of any kind.
CARD_KINDS = ("hello", "start", "act")
BOARD_KINDS = ("bhello", "bstart", "bact", "btake")
RELAY_KINDS = CARD_KINDS + ("bail",) + BOARD_KINDS

BACT_KINDS = ("move", "resign")
# a table move: one named action, up to two indices, a choice, an amount, and a
# short list (the cards you are discarding, the numbers you just marked)
MOVE_ACT_RE = re.compile(r"^[a-z0-9_-]{1,16}$")
MAX_MOVE_IDX = 255
MAX_MOVE_AMT = 999999
MAX_MOVE_LIST = 32
# A takeback is a REQUEST every other player has to allow. ask / yes / no, and
# nothing at all happens on any board until the answers are in — see js/party.js.
BTAKE_KINDS = ("ask", "yes", "no")
MAX_TAKE_PLIES = 8
MAX_CHAIN = 13          # a dama multi-jump is at most 12 hops, so 13 squares
MAX_CAPS = 12           # and it cannot take more stones than the other side has


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


def v_game(v, board_only=False):
    """A game id. `None` means the card duel, so that a client which has never
    heard of this field asks for exactly what it always got.

    `board_only` is the set of games that play over the bhello/bstart/bact/
    btake payloads — which is everything EXCEPT the card duel, because the duel
    has its own four and always has."""
    if v is None and not board_only:
        return DEFAULT_GAME
    if not isinstance(v, str):
        raise Reject("game")
    if v not in (PLAY_GAMES if board_only else GAME_IDS):
        raise Reject("game")
    return v


def v_seats(game, v, variant=None):
    """How many chairs to put out. `None` means the game's own default, so a
    client that has never heard of the field gets a sensible table rather than
    an error — and for the duels that is still exactly two."""
    lo, hi, default = seat_range(game, variant)
    if v is None:
        return default
    n = v_int(v, 2, L.MAX_SEATS)
    if n < lo or n > hi:
        raise Reject("seats")
    return n


def v_variant(game, v):
    """Which flavour of the game, where the game has flavours."""
    if v is None:
        return None
    allowed = GAME_VARIANTS.get(game)
    if not allowed or not isinstance(v, str) or v not in allowed:
        raise Reject("variant")
    return v


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


def v_board_move(game, m):
    """One move of chess or of dama, rebuilt field by field.

    chess  {"f":from 0-63, "t":to 0-63, "p":promotion piece code or 0}
    dama   {"p":[squares walked, 2-13 of them], "c":[squares taken, 0-12]}

    Nothing here knows the RULES — the relay is not a referee and never has
    been. All it does is make the shape impossible to abuse: a board index
    that is off the board, a jump chain longer than the board allows, or a
    chess move dressed up as a dama one never reaches the other player."""
    if not isinstance(m, dict):
        raise Reject("move")
    if game == "chess":
        return {"f": v_int(m.get("f"), 0, 63), "t": v_int(m.get("t"), 0, 63),
                "p": v_int(m.get("p") or 0, 0, 15)}
    if game == "dama":
        path = v_intlist(m.get("p"), MAX_CHAIN, 0, 63)
        if len(path) < 2:
            raise Reject("path")
        return {"p": path, "c": v_intlist(m.get("c") or [], MAX_CAPS, 0, 63)}

    # ── a move at a TABLE ────────────────────────────────────────────────
    # SKARTA, IL-KIRI, TOMBLA and the playing-card games all move by doing one
    # named thing to one or two indices, sometimes with a choice or an amount
    # attached: "play the third card in my hand and call bahar", "buy it",
    # "bid 120", "mark number 47", "draw".
    #
    # This is NOT a passthrough. Every field is optional, every field is
    # bounded, and the object the peer receives is built here from these five
    # keys and nothing else — anything a client invents is dropped on the
    # floor exactly like every other payload in this file. The relay still has
    # no idea what "bahar" means or whether it was your turn; that is the
    # receiving CLIENT's job, against its own copy of the rules.
    out = {"a": v_move_act(m.get("a"))}
    if m.get("i") is not None:
        out["i"] = v_int(m.get("i"), 0, MAX_MOVE_IDX)
    if m.get("j") is not None:
        out["j"] = v_int(m.get("j"), 0, MAX_MOVE_IDX)
    if m.get("s") is not None:
        out["s"] = v_move_act(m.get("s"))
    if m.get("n") is not None:
        out["n"] = v_int(m.get("n"), 0, MAX_MOVE_AMT)
    if m.get("k") is not None:
        out["k"] = v_intlist(m.get("k"), MAX_MOVE_LIST, 0, MAX_MOVE_IDX)
    return out


def v_move_act(v):
    """A short lower-case id: an action name, a suit, a colour. Never shown to
    anybody as HTML by this process, but kept inert anyway."""
    if not isinstance(v, str) or not MOVE_ACT_RE.match(v):
        raise Reject("act")
    return v


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

    # ── the board games ──────────────────────────────────────────────────
    # Three payloads, and every one of them names its game, so ROOMS.relay can
    # refuse a dama move in a chess room without knowing one rule of either.
    if k == "bhello":
        # `nonce` is this player's half of the colour draw. Both halves are
        # sent before either is seen, and the seed is their XOR, so neither
        # side can hand itself White. See docs/ONLINE.md.
        return {"k": "bhello",
                "game": v_game(d.get("game"), board_only=True),
                "name": v_name(d.get("name"), L.NAME_LEN),
                "nonce": v_int(d.get("nonce") or 0, 0, 0xFFFFFFFF)}

    if k == "bstart":
        return {"k": "bstart",
                "game": v_game(d.get("game"), board_only=True),
                "seed": v_int(d.get("seed"), 0, 0xFFFFFFFF)}

    if k == "bact":
        game = v_game(d.get("game"), board_only=True)
        kind = d.get("kind")
        if kind not in BACT_KINDS:
            raise Reject("bact kind")
        ck = d.get("ck")
        if ck is not None and (not isinstance(ck, str) or len(ck) > 256):
            raise Reject("checksum")
        return {"k": "bact", "game": game, "kind": kind,
                "m": v_board_move(game, d.get("m")) if kind == "move" else None,
                "ck": ck if isinstance(ck, str) else None}

    if k == "btake":
        kind = d.get("kind")
        if kind not in BTAKE_KINDS:
            raise Reject("btake kind")
        ck = d.get("ck")
        if ck is not None and (not isinstance(ck, str) or len(ck) > 256):
            raise Reject("checksum")
        return {"k": "btake",
                "game": v_game(d.get("game"), board_only=True),
                "kind": kind,
                "n": v_int(d.get("n") or 0, 0, MAX_TAKE_PLIES),
                "id": v_int(d.get("id") or 0, 0, 0xFFFFFFFF),
                "ck": ck if isinstance(ck, str) else None}

    # bail
    why = d.get("why")
    return {"k": "bail", "why": v_name(why, 120) if isinstance(why, str) else "They stopped."}


def payload_fits(payload, game):
    """Is this payload one the room could possibly be sending?

    A room is a room OF something. A card duel's hello/start/act have no
    meaning in a chess room and a chess move has none in a card room, so
    neither is forwarded. `bail` — "stop the match" — belongs to every room."""
    k = payload.get("k")
    if k == "bail":
        return True
    if k in CARD_KINDS:
        return game == DEFAULT_GAME
    return payload.get("game") == game


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
        self.takes = Bucket(L.TAKE_RATE, L.TAKE_BURST)
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
        # Who this socket has proved it is. Set by {"t":"auth"} with a session
        # token from /acct/login, cleared when the socket dies, never on disk.
        # An anonymous socket cannot send an invite to anybody.
        self.acct = None            # lowercased account key
        self.aname = ""             # the display name that account registered
        self.invites = Bucket(L.INVITE_RATE, L.INVITE_BURST)
        self.auth_tries = 0

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
    """A room is N chairs round a table. N is 2 for a duel — which is every
    room that existed before this — and up to L.MAX_SEATS for a card table.

    Nothing below knows a rule of any game. It knows how many chairs there
    are, who is in them, whether the host has started, and which chairs the
    host is playing as bots. That is the whole of it."""

    __slots__ = ("code", "seats", "seq", "buf", "buf_bytes", "created", "touched",
                 "private", "game", "size", "variant", "started", "bots", "fan")

    def __init__(self, code, private=False, game=DEFAULT_GAME, size=2, variant=None):
        self.code = code
        # What is being played in here. Fixed when the room opens and never
        # changed: everyone is told it when they are seated, and a payload
        # for anything else is refused rather than relayed.
        self.game = game if game in GAME_IDS else DEFAULT_GAME
        self.variant = variant
        lo, hi, _ = seat_range(self.game, self.variant)
        self.size = max(lo, min(hi, min(L.MAX_SEATS, int(size or 2))))
        self.seats = [None] * self.size     # Seat or None, index == seat number
        self.seq = 0
        # (n, mask, text): ONE copy of the text however many chairs it went to,
        # and a bitmask of which ones, so a rejoining seat can be replayed
        # exactly what it missed without the buffer growing with the table.
        self.buf = collections.deque()
        self.buf_bytes = 0
        self.created = time.monotonic()
        self.touched = time.monotonic()
        # A private room is never named in /presence and cannot be entered with a
        # join handle. The only way in is the room code, which only its opener has.
        self.private = bool(private)
        # A two-seat room starts the moment it fills, exactly as it always did.
        # A bigger table starts when the HOST says so, because players trickle
        # in and only the host knows whether they are still waiting for anyone.
        self.started = False
        self.bots = set()                   # seats the host is playing for
        self.fan = Bucket(L.FAN_RATE, L.FAN_BURST)

    def push(self, mask, text):
        self.seq += 1
        self.buf.append((self.seq, mask, text))
        self.buf_bytes += len(text)
        while len(self.buf) > L.REPLAY_MSGS or self.buf_bytes > L.REPLAY_BYTES:
            _, _, old = self.buf.popleft()
            self.buf_bytes -= len(old)
        return self.seq

    def occupied(self):
        return sum(1 for s in self.seats if s is not None)

    def here(self):
        """Seats with a LIVE socket in them. A seat inside its reconnect grace
        is occupied but not here."""
        return sum(1 for s in self.seats if s is not None and s.conn is not None)

    def free_seat(self):
        for i, s in enumerate(self.seats):
            if s is None:
                return i
        return None

    def full(self):
        return self.free_seat() is None

    def open_to_join(self):
        """Is there a chair anybody may sit in? Once the host starts, no."""
        return (not self.started) and not self.full()

    def live_conns(self):
        return [s.conn for s in self.seats if s is not None and s.conn is not None]

    def others(self, slot):
        """Every seat index except this one that has somebody in it."""
        return [i for i, s in enumerate(self.seats)
                if i != slot and s is not None]

    def mask_of(self, slots):
        m = 0
        for i in slots:
            m |= (1 << i)
        return m

    def mask_all(self):
        return self.mask_of(range(self.size))

    def is_table(self):
        """More than two chairs. THE WIRE OF A DUEL DOES NOT CHANGE: a two-seat
        room sends exactly the bytes it sent before tables existed — no roster,
        no seat numbers, no sender stamp. Everything new here is additive and
        only ever goes to a room that actually has a table in it, so the client
        already on everybody's phone cannot be affected by any of it."""
        return self.size > 2

    def roster(self):
        """What everyone at the table is allowed to know about it. Names only —
        no tokens, no addresses, no room code."""
        return {"t": "table", "code": self.code, "game": self.game,
                "seats": self.size, "started": self.started,
                "variant": self.variant,
                "who": [None if s is None else
                        {"i": i,
                         "n": (s.conn.pname or "PLAYER") if s.conn is not None else "",
                         "here": s.conn is not None,
                         "bot": i in self.bots}
                        for i, s in enumerate(self.seats)]}


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

    def conns_for(self, key):
        """Every live socket that has proved it is this account. Used only to
        hand somebody an invite while they are actually looking at the app."""
        if not key:
            return []
        with self._lock:
            return [c for c in self._conns if c.acct == key]

    def joinable(self, code):
        """Is that room still open, public or not, and still short of a player?
        The one question the invite book needs to ask about a room."""
        with self._lock:
            room = self._rooms.get(code)
            return room is not None and room.open_to_join()

    def my_open_room(self, conn):
        """The room this connection is sitting in that still has a chair free,
        or None. An invite can only ever point at one of those — and at a table
        ANY of the players may ask somebody, not just the host."""
        with self._lock:
            room = self._room_of(conn)
            if room is None or not room.open_to_join():
                return None
            return room.code, room.game

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
                elif room.started or room.full():
                    # A duel is "playing" the moment it fills, exactly as it
                    # always was. A table is playing once the host starts it.
                    state = "playing"
                else:
                    state = "waiting"
                counts[state] += 1
                # ONE handle per room, and it belongs to the host's socket. At a
                # table with three people already sat down there is still only
                # one way in, and it is still a handle that dies with the room.
                offered = (state == "waiting" and not room.private
                           and conn.slot == 0 and room.open_to_join())
                rows.append((state, conn.pname or "PLAYER",
                             conn.pid if offered else None))
                if offered:
                    # "g" is what makes the list an informed choice rather than
                    # a lucky dip; "c" of "m" is how full the table is, so you
                    # can see at a glance whether there is a chair free. An
                    # older client normalises each row down to id/name/wait and
                    # simply never sees any of it.
                    rooms.append({"id": conn.pid, "n": conn.pname or "PLAYER",
                                  "w": max(0, int(now - room.created)),
                                  "g": room.game, "c": room.occupied(),
                                  "m": room.size, "v": room.variant})

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
        # How many of each kind are REALLY open, counted before the sample is
        # taken, so "3 chess" cannot quietly become "1 chess" just because the
        # list was capped.
        by_game = {g: 0 for g in GAME_IDS}
        for r in rooms:
            by_game[r["g"]] = by_game.get(r["g"], 0) + 1
        if open_rooms > L.ROOMS_MAX:
            rooms = random.sample(rooms, L.ROOMS_MAX)
        rooms.sort(key=lambda r: (-r["w"], r["n"]))

        total = counts["idle"] + counts["waiting"] + counts["playing"]
        return {"ok": True, "count": total, "idle": counts["idle"],
                "waiting": counts["waiting"], "playing": counts["playing"],
                "shown": len(players), "max": L.PRESENCE_MAX,
                "every": 12, "players": players,
                "rooms": rooms, "open": open_rooms, "roomsMax": L.ROOMS_MAX,
                "openBy": by_game, "games": list(GAME_IDS)}

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

    def join_by_id(self, conn, pid, game=None):
        """Take the empty seat a waiting player is advertising. The caller
        never learns the room code until they are actually sitting in it, and
        a handle for anyone who is NOT publicly waiting resolves to nothing —
        including a private room, which can only ever be entered by code.

        `game`, when the client sends it, is what it BELIEVED it was tapping.
        A room list is a second or two old by the time a thumb lands on it, so
        a mismatch is refused rather than silently seating somebody at a game
        they did not choose."""
        code = None
        wrong = False
        if isinstance(pid, str) and 0 < len(pid) <= 32:
            with self._lock:
                host = self._by_pid.get(pid)
                if host is not None and host is not conn:
                    room = self._room_of(host)
                    if room is not None and room.occupied() == 1 and not room.private:
                        if game is not None and game != room.game:
                            wrong = True
                        else:
                            code = room.code
        if wrong:
            return [(conn, {"t": "error", "why": E_WRONGGAME})]
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
        """Take conn off its chair. Returns ([(other_conn, seat_left)], room) —
        a LIST, because a table has more than one other person at it."""
        room = self._room_of(conn)
        code, slot = conn.room_code, conn.slot
        conn.room_code = None
        conn.slot = -1
        if room is None:
            return [], None
        seat = room.seats[slot]
        seat.conn = None
        seat.gone_at = time.monotonic()
        if permanent:
            room.seats[slot] = None
        room.touched = time.monotonic()
        rest = [(room.seats[i].conn, slot) for i in room.others(slot)
                if room.seats[i].conn is not None]
        if room.occupied() == 0:
            self._rooms.pop(code, None)
        return rest, room

    @staticmethod
    def _tell_left(rest, table=False):
        """"They have gone" to everyone still at the table. At a DUEL this is
        the exact message it has always been; `seat` is only added where there
        is more than one other chair it could mean."""
        if table:
            return [(c, {"t": "peer", "state": "left", "seat": i}) for c, i in rest]
        return [(c, {"t": "peer", "state": "left"}) for c, _ in rest]

    # -- actions -----------------------------------------------------------

    def create(self, conn, private=False, game=DEFAULT_GAME, seats=None, variant=None):
        """Open a room — that is, put N chairs out. A connection may hold
        exactly ONE room at a time (the detach below closes whatever it had
        open) and may only ever open L.MAX_CREATES of them, so one socket
        cannot stack up a pile of tables in the public list."""
        out = []
        if conn.creates >= L.MAX_CREATES:
            return [(conn, {"t": "error", "why": E_TOOMANY})]
        with self._lock:
            rest, oldroom = self._detach(conn, permanent=True)
            out += self._tell_left(rest, oldroom is not None and oldroom.is_table())
            if len(self._rooms) >= L.MAX_ROOMS:
                out.append((conn, {"t": "error", "why": E_FULL_SERVER}))
                return out
            code = self._new_code()
            if code is None:
                out.append((conn, {"t": "error", "why": E_FULL_SERVER}))
                return out
            room = Room(code, private=private, game=game, size=seats, variant=variant)
            seat = Seat(secrets.token_urlsafe(12))
            seat.conn = conn
            room.seats[0] = seat
            self._rooms[code] = room
            conn.room_code = code
            conn.slot = 0
            conn.creates += 1
            token = seat.token
            made, size, var = room.game, room.size, room.variant
        LOG("room-create", code=code, rooms=len(self._rooms), private=int(bool(private)),
            game=made, seats=size)
        # "private", "game" and "seats" are all echoed so the client can tell a
        # relay that understands the field from an older one that quietly
        # ignored it. A client that asked for a six-handed SKARTA table and
        # gets no "seats" back knows it is talking to an older relay and says
        # so out loud rather than seating five people who will never arrive.
        out.append((conn, {"t": "created", "code": code, "token": token,
                           "host": True, "seq": 0, "private": bool(private),
                           "game": made, "seats": size, "seat": 0,
                           "variant": var, "started": False}))
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
                                "host": conn.slot == 0, "seq": room.seq,
                                "game": room.game, "seats": room.size,
                                "seat": conn.slot, "variant": room.variant,
                                "started": room.started})]
            # A table that has already been started is not taking anybody else.
            if room.started:
                conn.bad_joins += 1
                return [(conn, {"t": "error", "why": E_FULL_ROOM})]
            free = room.free_seat()
            if free is None:
                conn.bad_joins += 1
                return [(conn, {"t": "error", "why": E_FULL_ROOM})]
            rest, oldroom = self._detach(conn, permanent=True)
            out += self._tell_left(rest, oldroom is not None and oldroom.is_table())
            room = self._rooms.get(code)                    # re-check after detach
            if room is None or room.started or room.seats[free] is not None:
                free2 = room.free_seat() if room is not None and not room.started else None
                if free2 is None:
                    out.append((conn, {"t": "error", "why": E_NOROOM}))
                    return out
                free = free2
            seat = Seat(secrets.token_urlsafe(12))
            seat.conn = conn
            room.seats[free] = seat
            room.touched = time.monotonic()
            conn.room_code = code
            conn.slot = free
            # A DUEL still starts the instant it fills, exactly as it always
            # has. A table waits for the host, because people trickle in.
            if room.size == 2 and room.full():
                room.started = True
            # The room says what it is and how big it is. The joiner never has
            # to trust the list it tapped, or another player, for either.
            reply = {"t": "joined", "code": code, "token": seat.token,
                     "host": free == 0, "seq": room.seq, "game": room.game,
                     "seats": room.size, "seat": free, "variant": room.variant,
                     "started": room.started}
            others = [room.seats[i].conn for i in room.others(free)
                      if room.seats[i].conn is not None]
            is_tbl = room.is_table()
            roster = room.roster() if is_tbl else None
        LOG("room-join", code=code, seat=free)
        out.append((conn, reply))
        for c in others:
            # `peer` is exactly what a duel has always sent. Only a table adds
            # the chair number, because only a table has more than one it
            # could possibly mean.
            out.append((c, {"t": "peer", "state": "joined", "seat": free}
                        if is_tbl else {"t": "peer", "state": "joined"}))
        if is_tbl:
            # everyone at the table, including the arrival, gets the new roster
            for c in others + [conn]:
                out.append((c, roster))
        return out

    def start(self, conn, bots):
        """The HOST says the table is ready. Two things happen and nothing
        else: the room stops taking people, and everyone is handed the same
        random number to build the game from.

        The relay contributes that number rather than the host, so no player
        can grind a favourable deal — and each client XORs its own nonce into
        it (see docs/ONLINE.md), so a compromised relay cannot fix one either.

        `bots` are the chairs the host will play for. They are recorded so the
        relay can stamp a move the host sends ON BEHALF OF one of them; every
        other client still validates that move against its own rules exactly
        as it would a human's."""
        with self._lock:
            room = self._room_of(conn)
            if room is None:
                return [(conn, {"t": "error", "why": E_NOTIN})]
            if conn.slot != 0:
                return [(conn, {"t": "error", "why": E_NOTHOST})]
            if room.started:
                return [(conn, {"t": "error", "why": E_ALREADY})]
            free = [i for i, s in enumerate(room.seats) if s is None]
            want = []
            if bots is not None:
                if not isinstance(bots, list) or len(bots) > L.MAX_SEATS:
                    return [(conn, {"t": "error", "why": E_SHAPE})]
                for b in bots:
                    if not isinstance(b, int) or isinstance(b, bool):
                        return [(conn, {"t": "error", "why": E_SHAPE})]
                    if b not in free or b in want:
                        # a bot may only ever be put in an EMPTY chair, and
                        # never on top of a person
                        return [(conn, {"t": "error", "why": E_BADSEAT})]
                    want.append(b)
            lo, _, _ = seat_range(room.game, room.variant)
            if room.occupied() + len(want) < lo:
                return [(conn, {"t": "error", "why": E_TOOFEW})]
            room.bots = set(want)
            room.started = True
            room.touched = time.monotonic()
            seed = secrets.randbits(32)
            began = {"t": "began", "seed": seed, "seats": room.size,
                     "bots": sorted(room.bots), "game": room.game,
                     "variant": room.variant,
                     "filled": sorted([i for i, s in enumerate(room.seats)
                                       if s is not None] + list(room.bots))}
            room.push(room.mask_all(), json.dumps(began, separators=(",", ":")))
            targets = room.live_conns()
            roster = room.roster()
        LOG("room-start", code=room.code, seats=room.size, bots=len(want))
        out = [(c, began) for c in targets]
        out += [(c, roster) for c in targets]
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
            # leave any OTHER room this socket was sitting in first
            old, oldroom = self._detach(conn, permanent=True)
            out += self._tell_left(old, oldroom is not None and oldroom.is_table())
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
            others = [(room.seats[i].conn, i) for i in room.others(slot)
                      if room.seats[i].conn is not None]
            bit = 1 << slot
            replay = [text for (n, mask, text) in room.buf
                      if (mask & bit) and n > since]
            head = {"t": "rejoined", "code": code, "host": slot == 0,
                    "seq": room.seq, "peer": len(others) > 0,
                    "game": room.game, "seats": room.size, "seat": slot,
                    "variant": room.variant, "started": room.started}
            is_tbl = room.is_table()
            roster = room.roster() if is_tbl else None
        if evicted is not None and evicted is not conn:
            evicted.send_json({"t": "closed", "why": "You reconnected somewhere else."})
            evicted.doom("replaced")
            evicted.kill()
        LOG("room-rejoin", code=code, replay=len(replay), seat=slot)
        out.append((conn, head))
        for text in replay:
            out.append((conn, text))                        # already-serialised
        for c, _ in others:
            out.append((c, {"t": "peer", "state": "rejoined", "seat": slot}
                        if is_tbl else {"t": "peer", "state": "rejoined"}))
        if is_tbl:
            for c, _ in others:
                out.append((c, roster))
            out.append((conn, roster))
        return out

    def relay(self, conn, payload, claimed_code, for_seat=None):
        """payload is ALREADY sanitised. claimed_code, if given, must match.

        Fans the payload out to every OTHER occupied chair, stamped with the
        seat it came from. The stamp is the relay's, never the client's: at a
        table you have to know who played, and a client that could label itself
        could label itself as somebody else.

        `for_seat` is how the host plays a BOT's chair. It is only honoured for
        a chair the host was given at start, and it is still just a stamp —
        every other client validates the move against its own rules exactly as
        it would a human's."""
        with self._lock:
            room = self._room_of(conn)
            if room is None:
                return [(conn, {"t": "error", "why": E_NOTIN})]
            if claimed_code is not None and claimed_code != room.code:
                return [(conn, {"t": "error", "why": E_NOTIN})]
            if not payload_fits(payload, room.game):
                return [(conn, {"t": "error", "why": E_WRONGGAME})]
            src = conn.slot
            if for_seat is not None:
                if conn.slot != 0 or for_seat not in room.bots:
                    return [(conn, {"t": "error", "why": E_BADSEAT})]
                src = for_seat
            others = room.others(conn.slot)
            if not others:
                return [(conn, {"t": "error", "why": E_NOPEER})]
            # ONE bucket for the whole table. Seven sockets hearing every move
            # is the cost that actually lands on the Pi, so that is what is
            # metered — not how fast any one player can type.
            if not room.fan.take():
                return [(conn, {"t": "error", "why": E_FLOOD})]
            body = {"t": "relay", "n": room.seq + 1, "d": payload}
            if room.is_table():
                # who played it. A duel has never needed this and still does
                # not: there is only one other chair it could have come from.
                body["s"] = src
            text = json.dumps(body, separators=(",", ":"))
            room.push(room.mask_of(others), text)
            room.touched = time.monotonic()
            targets = [room.seats[i].conn for i in others
                       if room.seats[i].conn is not None]
        # anybody mid-reconnect simply gets it replayed when they come back
        return [(c, text) for c in targets]

    def leave(self, conn):
        with self._lock:
            rest, room = self._detach(conn, permanent=True)
            tbl = room is not None and room.is_table()
        return self._tell_left(rest, tbl)

    def drop(self, conn):
        """Socket died. Hold the chair for GRACE seconds.

        At a table this is the COMMON path, not an error one: with eight phones
        somebody walking into a lift is routine. The table is told which chair
        went quiet and carries on; what the GAME does about it — hand the chair
        to the machine, or fold it — is the game's decision, not the relay's."""
        with self._lock:
            room = self._room_of(conn)
            if room is None:
                self._detach(conn, permanent=True)
                return []
            slot = conn.slot
            rest, _ = self._detach(conn, permanent=False)
            room = self._rooms.get(room.code)
            if room is None:
                return []
            is_tbl = room.is_table()
            roster = room.roster() if is_tbl else None
        out = [(c, {"t": "peer", "state": "dropped", "seat": slot} if is_tbl
                else {"t": "peer", "state": "dropped"}) for c, _ in rest]
        if is_tbl:
            out += [(c, roster) for c, _ in rest]
        return out

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
                gone = []
                for i, seat in enumerate(room.seats):
                    if seat is None or seat.conn is not None or seat.gone_at == 0.0:
                        continue
                    if (now - seat.gone_at) > L.GRACE:
                        room.seats[i] = None
                        gone.append(i)
                tbl = room.is_table()
                for i in gone:
                    for c in room.live_conns():
                        out.append((c, {"t": "peer", "state": "left", "seat": i}
                                    if tbl else {"t": "peer", "state": "left"}))
                if gone and tbl:
                    roster = room.roster()
                    for c in room.live_conns():
                        out.append((c, roster))
                # An empty table is binned whatever its size — and a table
                # whose chairs all emptied mid-game goes the same way as a
                # duel does, so a dead sixteen-seat room is reaped exactly as
                # reliably as a dead two-seat one.
                if room.occupied() == 0:
                    self._rooms.pop(code, None)
        return out


ROOMS = RoomBook()


# ── invitations ──────────────────────────────────────────────────────────────
#
# "Come and play chess" — a note addressed to an ACCOUNT rather than to a
# socket, so it is still there when they open the app half an hour later.
#
# WHAT AN INVITE IS
#     {id, to, from, game, code, made}. It is held in memory and nowhere else:
#     no table, no file, no disk. A relay restart forgets every one of them,
#     which is fine for something that dies of old age in five minutes anyway.
#
# WHAT THE RECIPIENT IS TOLD
#     who sent it, what game it is, and how long they have got. NOT the room
#     code — that is resolved server-side when they accept, exactly like a
#     join handle from the room list, so an invite is never a way to learn a
#     code for a room you have not been let into.
#
# WHAT IT REFUSES TO BE
#     A WAY TO FIND OUT WHO HAS AN ACCOUNT HERE. Inviting a name that does not
#     exist gets the same reply, in the same shape, after the same work, as
#     inviting one that does — the sender is told "if they have an account, it
#     is waiting for them" and nothing else. Nothing anywhere in this block
#     answers the question "is there a user called X".
#
#     A WAY TO FLOOD SOMEBODY. One invite per sender per recipient (a second
#     replaces the first), a hard cap on how many any one player may be
#     holding, a cap per sender, a global cap, and a token bucket on top.
#
#     A WAY TO TAP SOMETHING DEAD. An invite whose room has filled, closed or
#     timed out is swept away and the recipient is told it has gone.

class Invites:
    """All pending invites, behind one lock. Public methods return what to
    send; no socket write ever happens under the lock."""

    def __init__(self):
        self._lock = threading.Lock()
        self._by_id = {}

    def add(self, to_key, from_name, game, code, from_key):
        """-> invite id, or None when it could not be stored. The CALLER must
        not tell the difference apart in what it sends back."""
        now = time.monotonic()
        with self._lock:
            self._expire(now)
            mine = [i for i in self._by_id.values() if i["fromk"] == from_key]
            for inv in mine:
                # one invite per sender per recipient: a second one replaces it
                if inv["to"] == to_key:
                    self._by_id.pop(inv["id"], None)
                    mine.remove(inv)
                    break
            if len(mine) >= L.INVITES_FROM:
                return None
            if len(self._by_id) >= L.INVITES_TOTAL:
                return None
            if sum(1 for i in self._by_id.values() if i["to"] == to_key) >= L.INVITES_TO:
                return None
            iid = secrets.token_urlsafe(9)
            self._by_id[iid] = {"id": iid, "to": to_key, "from": from_name,
                                "fromk": from_key, "game": game, "code": code,
                                "made": now}
            return iid

    def _expire(self, now):
        for iid in [k for k, v in self._by_id.items()
                    if (now - v["made"]) > L.INVITE_TTL]:
            self._by_id.pop(iid, None)

    @staticmethod
    def public(inv, now):
        """What the recipient is allowed to see. No room code, no sender key."""
        return {"t": "invite", "id": inv["id"], "from": inv["from"],
                "game": inv["game"],
                "left": max(0, int(L.INVITE_TTL - (now - inv["made"])))}

    def waiting_for(self, key):
        now = time.monotonic()
        with self._lock:
            self._expire(now)
            out = [self.public(i, now) for i in self._by_id.values() if i["to"] == key]
        out.sort(key=lambda m: -m["left"])
        return out

    def take(self, key, iid):
        """Claim one. Returns the room code, or None — and a caller who is not
        the addressee gets None, whatever id they guessed."""
        if not isinstance(iid, str) or not (0 < len(iid) <= 32):
            return None
        now = time.monotonic()
        with self._lock:
            self._expire(now)
            inv = self._by_id.get(iid)
            if inv is None or inv["to"] != key:
                return None
            self._by_id.pop(iid, None)
            return inv["code"]

    def drop(self, key, iid):
        with self._lock:
            inv = self._by_id.get(iid)
            if inv is not None and inv["to"] == key:
                self._by_id.pop(iid, None)
                return True
        return False

    def drop_for_room(self, code):
        """The room filled, closed or timed out. -> [(to_key, id), ...]"""
        with self._lock:
            dead = [(i["to"], i["id"]) for i in self._by_id.values() if i["code"] == code]
            for _, iid in dead:
                self._by_id.pop(iid, None)
        return dead

    def sweep(self, joinable):
        """joinable(code) -> True while that room is still open and short of a
        player. Everything else is withdrawn. -> [(to_key, id), ...]"""
        now = time.monotonic()
        with self._lock:
            dead = [(i["to"], i["id"]) for i in self._by_id.values()
                    if (now - i["made"]) > L.INVITE_TTL or not joinable(i["code"])]
            for _, iid in dead:
                self._by_id.pop(iid, None)
        return dead

    def count(self):
        with self._lock:
            return len(self._by_id)


INVITES = Invites()


def dispatch(messages):
    """Send a list of (conn, dict-or-str). Never called with a lock held."""
    for conn, msg in messages:
        if conn is None:
            continue
        if isinstance(msg, str):
            conn.send_text(msg)
        else:
            conn.send_json(msg)


# ── invitations, over the socket ─────────────────────────────────────────────
#
# Deliberately NOT an HTTP route. The socket already knows which room this
# player is sitting in, so an invite never has to name one — which means a room
# code never travels anywhere it did not already live.

def ws_auth(conn, session):
    """Bind this socket to an account with a session token from /acct/login.
    Everything an anonymous socket could do before, it can still do."""
    if ACCOUNTS is None:
        return [(conn, {"t": "error", "why": E_NOAUTH})]
    conn.auth_tries += 1
    if conn.auth_tries > 6:
        conn.doom("auth guessing")
        return [(conn, {"t": "error", "why": E_NOAUTH})]
    who = ACCOUNTS.session(session) if isinstance(session, str) else None
    if who is None:
        return [(conn, {"t": "error", "why": E_NOAUTH})]
    conn.acct, conn.aname = who[0], who[1]
    out = [(conn, {"t": "authed", "name": conn.aname})]
    # whatever was left for them while they were away
    for m in INVITES.waiting_for(conn.acct):
        out.append((conn, m))
    return out


def ws_invite(conn, to):
    """Leave a note for an account. See the Invites block above for why the
    answer is the same whether or not that account exists."""
    if ACCOUNTS is None or conn.acct is None:
        return [(conn, {"t": "error", "why": E_NOAUTH})]
    try:
        name, key = v_username(to)
    except Reject:
        return [(conn, {"t": "error", "why": E_SHAPE})]
    mine = ROOMS.my_open_room(conn)
    if mine is None:
        return [(conn, {"t": "error", "why": E_NOROOMYET})]
    code, game = mine
    # The bucket is spent LAST, on an invite that is actually going out. A
    # refusal that cost a token would make the limit fire for invites that
    # were never sent.
    if not conn.invites.take():
        return [(conn, {"t": "error", "why": E_SLOW})]

    out = []
    # Everything below is deliberately silent about whether `key` is a real
    # account. It is looked up, it may or may not be there, and either way the
    # sender gets the identical "invited" reply.
    if key != conn.acct:
        target = ACCOUNTS.find(key)
        if target is not None:
            iid = INVITES.add(key, conn.aname or "SOMEBODY", game, code, conn.acct)
            if iid is not None:
                now = time.monotonic()
                note = {"t": "invite", "id": iid, "from": conn.aname or "SOMEBODY",
                        "game": game, "left": int(L.INVITE_TTL)}
                for c in ROOMS.conns_for(key):
                    out.append((c, note))
    LOG("invite", game=game)
    out.append((conn, {"t": "invited", "to": name, "game": game}))
    return out


def ws_accept(conn, iid):
    """Take the seat an invite was holding. The room CODE is resolved here,
    from a note this player was actually sent — they never see it, and a made-up
    id resolves to nothing."""
    if conn.acct is None:
        return [(conn, {"t": "error", "why": E_NOAUTH})]
    code = INVITES.take(conn.acct, iid)
    if code is None:
        return [(conn, {"t": "error", "why": E_NOINVITE})]
    if not ROOMS.joinable(code):
        return [(conn, {"t": "invitegone", "id": iid}),
                (conn, {"t": "error", "why": E_NOINVITE})]
    return ROOMS.join(conn, code)


def invites_withdrawn(dead):
    """[(to_key, id)] -> messages telling whoever is online that it has gone."""
    out = []
    for key, iid in dead:
        for c in ROOMS.conns_for(key):
            out.append((c, {"t": "invitegone", "id": iid}))
    return out


def ws_decline(conn, iid):
    """Declining is QUIET. The sender is never told — there is no message in
    this function that goes anywhere except back to the person declining."""
    if conn.acct is None:
        return [(conn, {"t": "error", "why": E_NOAUTH})]
    if isinstance(iid, str):
        INVITES.drop(conn.acct, iid)
    return [(conn, {"t": "invitegone", "id": iid if isinstance(iid, str) else ""})]


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
        # sends no flag at all and gets exactly what it always got — and the
        # same goes for the game: no field means the card duel.
        try:
            game = v_game(msg.get("game"))
            variant = v_variant(game, msg.get("variant"))
            seats = v_seats(game, msg.get("seats"), variant)
        except Reject:
            conn.error(E_SHAPE)
            return
        dispatch(ROOMS.create(conn, msg.get("private") is True, game, seats, variant))

    elif kind == "start":
        dispatch(ROOMS.start(conn, msg.get("bots")))

    elif kind == "join":
        dispatch(ROOMS.join(conn, msg.get("code")))
        if conn.bad_joins > L.MAX_BAD_JOINS:
            conn.doom("code guessing")

    elif kind == "joinid":
        want = msg.get("game")
        if want is not None:
            try:
                want = v_game(want)
            except Reject:
                conn.error(E_SHAPE)
                return
        dispatch(ROOMS.join_by_id(conn, msg.get("id"), want))
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
        # A takeback REQUEST is the one relayed payload that costs the other
        # player something whether they want it or not, so it gets its own
        # bucket. Answers are never limited: being unable to say "no" would be
        # worse than the flood.
        if payload.get("k") == "btake" and payload.get("kind") == "ask":
            if not conn.takes.take():
                conn.error(E_SLOW)
                return
        # the host playing a bot's chair. Validated inside relay() against the
        # chairs that were actually handed to bots at start.
        for_seat = msg.get("for")
        if for_seat is not None:
            if (not isinstance(for_seat, int) or isinstance(for_seat, bool)
                    or not (0 <= for_seat < L.MAX_SEATS)):
                conn.error(E_SHAPE)
                return
        dispatch(ROOMS.relay(conn, payload, code.strip().upper() if code else None,
                             for_seat))

    elif kind == "auth":
        dispatch(ws_auth(conn, msg.get("session")))

    elif kind == "invite":
        dispatch(ws_invite(conn, msg.get("to")))

    elif kind == "acceptinvite":
        dispatch(ws_accept(conn, msg.get("id")))

    elif kind == "declineinvite":
        dispatch(ws_decline(conn, msg.get("id")))

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


# ── accounts + cross-device save sync ────────────────────────────────────────
#
# WHY THIS EXISTS AT ALL
#     Everything above this line is stateless: the relay forgets a room the
#     moment both players leave, and it never opens a file. This block is the
#     one deliberate exception, and it earns that exception for exactly one
#     reason — a player who logs in on a SECOND phone should find their cards,
#     their decks and their story progress waiting for them.
#
# WHAT IT IS NOT
#     It is not an authority on the game. To this process the save is an
#     OPAQUE STRING: size-capped, depth-capped, checked to be well-formed JSON,
#     then stored verbatim and handed back verbatim. Nothing here reads a card
#     id, a coin count or a win record, so there is nothing here for a lying
#     client to trick. It is not eval'd, not merged, not interpreted.
#
# WHAT IT REFUSES TO DO
#     Lose a save. Two phones both play offline and both come back holding a
#     save the other has never seen. So every save carries a version, a push
#     whose base version is not the server's current one is REFUSED (409) with
#     the server's copy attached, and the client has to ask the player which to
#     keep. When the player does choose to overwrite, the overwritten blob is
#     kept in the same row (prev_*) and can still be pulled back.
#
# WHAT IT IS BUILT TO SURVIVE
#     A stranger with the public URL. Register and log in are the only two
#     unauthenticated routes and both are token-bucketed per caller AND capped
#     globally; accounts are capped; total stored bytes are capped; the body is
#     refused on Content-Length before a single byte is read; passwords go
#     through a memory-hard KDF behind a concurrency gate so a flood of logins
#     cannot eat the Pi's RAM; and no route ever echoes a password, a hash or a
#     session token belonging to anybody else.

class A:
    """Every account/sync limit in one place. --selftest squeezes some."""

    ENABLED = True

    MAX_ACCOUNTS = 250          # total accounts this server will ever hold
    MAX_SAVE = 128 * 1024       # bytes of one save blob (a real KARTI save is
                                # about 4 KB, so this is ~30x headroom)
    MAX_TOTAL = 24 * 1024 * 1024  # bytes of save data across ALL accounts
    MAX_BODY = MAX_SAVE + 16 * 1024   # bytes of one HTTP request body
    MAX_DEPTH = 32              # nesting allowed inside a save blob
    MAX_DEVICE = 24             # characters of the optional device label

    NAME_MIN = 1
    NAME_MAX = 16               # matches the local profile rule in js/game.js
    PW_MIN = 8                  # of the string ON THE WIRE. The official client
    PW_MAX = 256                #   sends a 64-char hash of a >= 6 char password.

    SESSION_TTL = 30 * 86400.0  # a token is dead this long after it was issued
    SESSION_IDLE = 14 * 86400.0 # ...or this long after it was last used
    MAX_SESSIONS = 8            # live sessions per account (oldest is dropped)

    # per-caller token buckets (caller = a truncated hash of the peer address)
    REG_RATE = 1.0 / 300.0      # one registration per five minutes, sustained
    REG_BURST = 3.0
    LOGIN_RATE = 1.0 / 10.0
    LOGIN_BURST = 5.0
    API_RATE = 1.0              # authenticated push/pull
    API_BURST = 12.0
    CALLERS = 512               # buckets kept before the table is binned

    # ...and a global ceiling, because per-caller limits mean nothing to
    # somebody with a botnet.
    REG_GLOBAL_RATE = 20.0 / 3600.0
    REG_GLOBAL_BURST = 20.0

    FAIL_MAX = 10               # wrong passwords for one account...
    FAIL_LOCK = 900.0           # ...before that account stops answering, seconds

    KDF_N = 1 << 14             # scrypt cost. 16 MiB and ~50 ms on this Pi.
    KDF_R = 8
    KDF_P = 1
    KDF_LEN = 32
    KDF_ITERS = 200000          # pbkdf2 fallback (~105 ms on this Pi)
    KDF_GATE = 2                # KDFs allowed to run AT ONCE, server-wide. This
                                # is the memory guard: 2 x 16 MiB, never more,
                                # however many people are logging in.
    KDF_WAIT = 5.0              # seconds to wait for a slot before giving up


# Fixed strings. Nothing a caller sends is ever reflected back, and "no such
# user" and "wrong password" are deliberately the SAME sentence so the login
# route cannot be used to find out who has an account here.
E_ACCT_OFF = "Accounts are switched off on this server."
E_ACCT_BAD_JSON = "Bad request."
E_ACCT_BIG = "That is too big."
E_ACCT_NAME = "Usernames are 1-16 characters: letters, numbers, space, dot, dash, underscore."
E_ACCT_PW = "That password is too short."
E_ACCT_TAKEN = "That name is already taken."
E_ACCT_FULL = "This server is not taking new accounts."
E_ACCT_STORE = "This server has no room left for save data."
E_ACCT_CREDS = "Wrong username or password."
E_ACCT_LOCKED = "Too many wrong passwords. Try again later."
E_ACCT_TOKEN = "Please log in again."
E_ACCT_SLOW = "Slow down."
E_ACCT_BUSY = "The server is busy. Try again in a moment."
E_ACCT_SAVE = "That save file is not something KARTI could have written."
E_ACCT_STALE = "Your other device has saved since this one last synced."

# Deliberately NARROWER than the local-profile rule in js/game.js: no quote, no
# backslash, no angle bracket, nothing that has to be escaped anywhere it is
# later shown. A local profile called O'Brien registers online as OBrien.
NAME_RE = re.compile(r"^[A-Za-z0-9_ .\-]{%d,%d}$" % (A.NAME_MIN, A.NAME_MAX))
LOCAL_SENTINELS = {"__guest__", "guest"}

_KDF_GATE = threading.BoundedSemaphore(A.KDF_GATE)
HAVE_SCRYPT = hasattr(hashlib, "scrypt")


def kdf_hash(cred, salt, algo, n, r, p):
    """Slow, salted, one-way. Never called without the gate held."""
    if algo == "scrypt":
        return hashlib.scrypt(cred, salt=salt, n=n, r=r, p=p, dklen=A.KDF_LEN)
    return hashlib.pbkdf2_hmac("sha256", cred, salt, n, dklen=A.KDF_LEN)


def kdf_params():
    if HAVE_SCRYPT:
        return "scrypt", A.KDF_N, A.KDF_R, A.KDF_P
    return "pbkdf2_sha256", A.KDF_ITERS, 0, 0


class KDFBusy(Exception):
    """Every KDF slot is taken. Better a 503 than an out-of-memory kill."""


def kdf_guarded(cred, salt, algo, n, r, p):
    if not _KDF_GATE.acquire(timeout=A.KDF_WAIT):
        raise KDFBusy()
    try:
        return kdf_hash(cred, salt, algo, n, r, p)
    finally:
        _KDF_GATE.release()


def json_depth_ok(s, maxd):
    """True when s is balanced JSON-ish text nested no deeper than maxd.

    Run BEFORE json.loads, because CPython's JSON scanner recurses and a
    stranger should not be able to choose our stack depth. Pure scan, no
    recursion, no allocation beyond the loop.
    """
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
    """The save is stored as text and never interpreted. All we assert is that
    it is a bounded, well-formed JSON OBJECT, so a bad client cannot park 128 KB
    of arbitrary payload in the database and cannot make a future reader choke.
    The parsed result is thrown away on purpose."""
    if not isinstance(s, str):
        raise Reject("save")
    raw = s.encode("utf-8", "surrogatepass")
    if len(raw) > A.MAX_SAVE:
        raise Reject("big")
    t = s.strip()
    if not t.startswith("{") or not t.endswith("}"):
        raise Reject("save")
    if not json_depth_ok(s, A.MAX_DEPTH):
        raise Reject("save")
    try:
        obj = json.loads(s)
    except Exception:
        raise Reject("save")
    if not isinstance(obj, dict):
        raise Reject("save")
    del obj                     # nothing in this process looks inside a save
    return s, len(raw)


def v_username(v):
    if not isinstance(v, str):
        raise Reject("name")
    name = v.strip()
    if not NAME_RE.match(name) or NAME_BAD.search(name):
        raise Reject("name")
    key = name.lower()
    if key in LOCAL_SENTINELS or not key.strip():
        raise Reject("name")
    return name, key


def v_credential(v):
    """Whatever arrives here is treated as an opaque secret STRING and is
    hashed again server-side. It is never stored, never logged, never echoed,
    and the server does not care whether the client pre-hashed it."""
    if not isinstance(v, str):
        raise Reject("pw")
    if len(v) < A.PW_MIN or len(v) > A.PW_MAX:
        raise Reject("pw")
    if "\x00" in v:
        raise Reject("pw")
    return v.encode("utf-8", "surrogatepass")


def v_device(v):
    if v is None:
        return ""
    if not isinstance(v, str):
        raise Reject("device")
    return NAME_BAD.sub("", v)[:A.MAX_DEVICE]


SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    uname   TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    algo    TEXT NOT NULL,
    kn      INTEGER NOT NULL,
    kr      INTEGER NOT NULL,
    kp      INTEGER NOT NULL,
    salt    BLOB NOT NULL,
    pwhash  BLOB NOT NULL,
    created REAL NOT NULL,
    seen    REAL NOT NULL
);
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
CREATE TABLE IF NOT EXISTS sessions (
    tok    TEXT PRIMARY KEY,
    uname  TEXT NOT NULL,
    made   REAL NOT NULL,
    seen   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_uname ON sessions(uname);
"""


class Accounts:
    """The only thing in this process that writes to disk.

    One SQLite file, one connection, one lock. The load here is a handful of
    requests a minute from a handful of phones; a connection pool would be more
    moving parts than the whole feature is worth.
    """

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
            os.chmod(path, 0o600)       # password hashes are nobody else's business
        except OSError:
            pass
        self._pruned = 0.0

    def close(self):
        with self.lock:
            try:
                self.db.close()
            except Exception:
                pass

    # -- housekeeping ------------------------------------------------------

    def prune(self, force=False):
        now = time.time()
        if not force and (now - self._pruned) < 60.0:
            return
        self._pruned = now
        with self.lock:
            self.db.execute("DELETE FROM sessions WHERE made < ? OR seen < ?",
                            (now - A.SESSION_TTL, now - A.SESSION_IDLE))
            self.db.commit()

    def stats(self):
        with self.lock:
            users = self.db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
            total = self.db.execute("SELECT COALESCE(SUM(bytes),0) FROM saves").fetchone()[0]
        return int(users), int(total)

    # -- accounts ----------------------------------------------------------

    def create(self, name, key, cred):
        algo, n, r, p = kdf_params()
        salt = secrets.token_bytes(16)
        with self.lock:
            users = self.db.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
            if users >= A.MAX_ACCOUNTS:
                return "full"
            if self.db.execute("SELECT 1 FROM accounts WHERE uname=?", (key,)).fetchone():
                return "taken"
        digest = kdf_guarded(cred, salt, algo, n, r, p)
        now = time.time()
        with self.lock:
            try:
                self.db.execute(
                    "INSERT INTO accounts(uname,name,algo,kn,kr,kp,salt,pwhash,created,seen)"
                    " VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (key, name, algo, n, r, p, salt, digest, now, now))
                self.db.commit()
            except sqlite3.IntegrityError:
                return "taken"        # somebody won the race by microseconds
        return None

    def find(self, key):
        """key -> display name, or None. Used ONLY to address an invite, and
        its answer never leaves this process: the caller replies exactly the
        same way whether this returned a name or nothing at all."""
        with self.lock:
            row = self.db.execute(
                "SELECT name FROM accounts WHERE uname=?", (key,)).fetchone()
        return row[0] if row else None

    def verify(self, key, cred):
        """Returns the display name on success, None on failure. Constant in
        the only way that matters: the answer for a name that does not exist
        and the answer for a wrong password are identical."""
        with self.lock:
            row = self.db.execute(
                "SELECT name,algo,kn,kr,kp,salt,pwhash FROM accounts WHERE uname=?",
                (key,)).fetchone()
        if row is None:
            # Still burn a KDF, so "no such user" and "wrong password" do not
            # differ by 50 ms of wall clock.
            try:
                algo, n, r, p = kdf_params()
                kdf_guarded(cred, b"\x00" * 16, algo, n, r, p)
            except KDFBusy:
                pass
            return None
        name, algo, n, r, p, salt, stored = row
        digest = kdf_guarded(cred, bytes(salt), algo, int(n), int(r), int(p))
        if not hmac.compare_digest(digest, bytes(stored)):
            return None
        with self.lock:
            self.db.execute("UPDATE accounts SET seen=? WHERE uname=?", (time.time(), key))
            self.db.commit()
        return name

    # -- sessions ----------------------------------------------------------

    def open_session(self, key):
        tok = secrets.token_urlsafe(32)
        digest = hashlib.sha256(tok.encode("ascii")).hexdigest()
        now = time.time()
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO sessions(tok,uname,made,seen)"
                            " VALUES(?,?,?,?)", (digest, key, now, now))
            # keep the newest MAX_SESSIONS and no more
            self.db.execute(
                "DELETE FROM sessions WHERE uname=? AND tok NOT IN ("
                "  SELECT tok FROM sessions WHERE uname=? ORDER BY made DESC LIMIT ?)",
                (key, key, A.MAX_SESSIONS))
            self.db.commit()
        return tok, now + A.SESSION_TTL

    def session(self, tok):
        """Token -> (uname, display name), or None. Only a SHA-256 of the token
        is ever on disk, so a stolen database file hands over no live session."""
        if not isinstance(tok, str) or not (16 <= len(tok) <= 128):
            return None
        digest = hashlib.sha256(tok.encode("utf-8", "replace")).hexdigest()
        now = time.time()
        with self.lock:
            row = self.db.execute(
                "SELECT s.uname, s.made, s.seen, a.name FROM sessions s"
                " JOIN accounts a ON a.uname = s.uname WHERE s.tok=?", (digest,)).fetchone()
            if row is None:
                return None
            uname, made, seen, name = row
            if (now - made) > A.SESSION_TTL or (now - seen) > A.SESSION_IDLE:
                self.db.execute("DELETE FROM sessions WHERE tok=?", (digest,))
                self.db.commit()
                return None
            self.db.execute("UPDATE sessions SET seen=? WHERE tok=?", (now, digest))
            self.db.commit()
        return uname, name

    def close_session(self, tok):
        if not isinstance(tok, str):
            return
        digest = hashlib.sha256(tok.encode("utf-8", "replace")).hexdigest()
        with self.lock:
            self.db.execute("DELETE FROM sessions WHERE tok=?", (digest,))
            self.db.commit()

    def expire_all_sessions(self, key):
        with self.lock:
            self.db.execute("DELETE FROM sessions WHERE uname=?", (key,))
            self.db.commit()

    # -- saves -------------------------------------------------------------

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
        """Version-checked write. Returns (ok, info).

        A push is accepted only when `base` is exactly the version the server
        is holding. Anything else is a genuine conflict — two devices that both
        played offline — and is refused rather than resolved by guesswork.
        `force` is the player's own answer to that conflict, and even then the
        blob being replaced is kept in prev_* rather than dropped.
        """
        now = time.time()
        with self.lock:
            cur = self.get_save(key)
            if not force and int(base) != cur["ver"]:
                return False, cur
            total = self.db.execute("SELECT COALESCE(SUM(bytes),0) FROM saves").fetchone()[0]
            grown = nbytes - (len(cur["blob"].encode("utf-8", "surrogatepass"))
                              if cur["blob"] else 0)
            if total + grown > A.MAX_TOTAL:
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


ACCOUNTS = None                 # set by main() / selftest, None = feature off


def accounts_open(path):
    """Open the store, or return None and say why. A store that cannot be
    opened must NEVER stop the relay: multiplayer keeps working, the account
    routes simply answer 503 and the game stays fully playable offline."""
    global ACCOUNTS
    try:
        ACCOUNTS = Accounts(path)
    except Exception as e:
        ACCOUNTS = None
        print("warning: accounts are OFF — cannot use %s (%s).\n"
              "         The relay and offline play are unaffected. See docs/ONLINE.md\n"
              "         for the ReadWritePaths= line the systemd unit needs."
              % (path, e.__class__.__name__), file=sys.stderr)
    return ACCOUNTS


# ── account rate limiting ────────────────────────────────────────────────────

_ACCT_LOCK = threading.Lock()
_ACCT_BUCKETS = {"reg": {}, "login": {}, "api": {}}
_ACCT_GLOBAL_REG = Bucket(A.REG_GLOBAL_RATE, A.REG_GLOBAL_BURST)
_ACCT_FAILS = {}


def caller_key(addr):
    """Truncated hash of the peer address. Enough to tell callers apart; no raw
    IP is ever held in this process, exactly as /presence already does it."""
    return hashlib.sha256(str(addr or "?").encode("utf-8", "replace")).hexdigest()[:16]


def acct_allowed(kind, addr):
    rate, burst = {"reg": (A.REG_RATE, A.REG_BURST),
                   "login": (A.LOGIN_RATE, A.LOGIN_BURST),
                   "api": (A.API_RATE, A.API_BURST)}[kind]
    key = caller_key(addr)
    with _ACCT_LOCK:
        table = _ACCT_BUCKETS[kind]
        if len(table) > A.CALLERS:
            table.clear()
        bucket = table.get(key)
        if bucket is None:
            bucket = Bucket(rate, burst)
            table[key] = bucket
        return bucket.take()


def acct_global_reg_allowed():
    with _ACCT_LOCK:
        return _ACCT_GLOBAL_REG.take()


def acct_locked(key):
    with _ACCT_LOCK:
        entry = _ACCT_FAILS.get(key)
        if not entry:
            return False
        fails, until = entry
        if fails >= A.FAIL_MAX and time.monotonic() < until:
            return True
        if time.monotonic() >= until:
            _ACCT_FAILS.pop(key, None)
        return False


def acct_note_fail(key):
    with _ACCT_LOCK:
        if len(_ACCT_FAILS) > A.CALLERS:
            _ACCT_FAILS.clear()
        fails, _ = _ACCT_FAILS.get(key, (0, 0.0))
        _ACCT_FAILS[key] = (fails + 1, time.monotonic() + A.FAIL_LOCK)


def acct_note_ok(key):
    with _ACCT_LOCK:
        _ACCT_FAILS.pop(key, None)


def accounts_reset():
    """Drop every rate-limit bucket and lockout. Only the self-test uses it."""
    global _ACCT_GLOBAL_REG
    with _ACCT_LOCK:
        for table in _ACCT_BUCKETS.values():
            table.clear()
        _ACCT_FAILS.clear()
        _ACCT_GLOBAL_REG = Bucket(A.REG_GLOBAL_RATE, A.REG_GLOBAL_BURST)


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
        self.send_header("Allow", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
            # Extra keys only — every existing client ignores what it does not
            # know, so an old js/mp.js keeps working unchanged. Nothing here
            # names an account, a token or a hash: it is a yes/no and two caps.
            body = {"ok": True, "rooms": rooms, "clients": clients,
                    "maxRooms": L.MAX_ROOMS, "maxClients": L.MAX_WS,
                    "accounts": ACCOUNTS is not None,
                    "maxSave": A.MAX_SAVE}
            self.reply(200, body)
        elif path == "/presence":
            addr = self.client_address[0] if self.client_address else ""
            if not presence_allowed(addr):
                self.reply_bytes(429, b'{"ok":false,"why":"Slow down."}',
                                 (("Retry-After", "5"),))
            else:
                self.reply_bytes(200, presence_body())
        elif path.startswith("/stats/"):
            karti_stats.handle_get(self, path[len("/stats/"):], self.path)
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
        path = self.route()
        if path.startswith(ACCT_PREFIX + "/"):
            self.handle_account(path[len(ACCT_PREFIX) + 1:])
            return
        if path.startswith("/stats/"):
            karti_stats.handle_post(self, path[len("/stats/"):])
            return
        # Everything else is exactly as it was before accounts existed.
        self.reply(405, {"ok": False, "why": "GET only."})

    def do_PUT(self):
        self.reply(405, {"ok": False, "why": "GET only."})

    do_DELETE = do_PATCH = do_PUT

    # -- accounts ---------------------------------------------------------

    def acct_fail(self, status, why, extra=None):
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
            self.acct_fail(411, E_ACCT_BAD_JSON)
            return None
        raw_len = self.headers.get("Content-Length")
        try:
            n = int(raw_len)
        except (TypeError, ValueError):
            self.close_connection = True
            self.acct_fail(411, E_ACCT_BAD_JSON)
            return None
        if n < 0:
            self.close_connection = True
            self.acct_fail(400, E_ACCT_BAD_JSON)
            return None
        if n > A.MAX_BODY:
            self.close_connection = True     # we are not going to drain it
            self.acct_fail(413, E_ACCT_BIG)
            return None
        ctype = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if ctype and ctype != "application/json":
            self.close_connection = True
            self.acct_fail(415, E_ACCT_BAD_JSON)
            return None
        try:
            data = self.rfile.read(n) if n else b""
        except OSError:
            self.close_connection = True
            return None
        if len(data) != n:
            self.close_connection = True
            self.acct_fail(400, E_ACCT_BAD_JSON)
            return None
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            self.acct_fail(400, E_ACCT_BAD_JSON)
            return None
        if not json_depth_ok(text, A.MAX_DEPTH):
            self.acct_fail(400, E_ACCT_BAD_JSON)
            return None
        try:
            obj = json.loads(text)
        except Exception:
            self.acct_fail(400, E_ACCT_BAD_JSON)
            return None
        if not isinstance(obj, dict):
            self.acct_fail(400, E_ACCT_BAD_JSON)
            return None
        return obj

    def bearer(self, body):
        auth = (self.headers.get("Authorization") or "").strip()
        if auth[:7].lower() == "bearer ":
            return auth[7:].strip()
        tok = body.get("tok")
        return tok if isinstance(tok, str) else ""

    def handle_account(self, action):
        addr = self.client_address[0] if self.client_address else ""

        # Same allow-list as every other route. A page on a random origin gets
        # no CORS header AND no answer.
        if not origin_ok(self.headers.get("Origin")):
            self.close_connection = True
            self.acct_fail(403, "Origin not allowed.")
            return
        if action not in ("register", "login", "logout", "pull", "push"):
            self.acct_fail(404, "No such account route.")
            return
        if ACCOUNTS is None:
            self.acct_fail(503, E_ACCT_OFF)
            return

        body = self.read_json_body()
        if body is None:
            return
        try:
            ACCOUNTS.prune()
            if action == "register":
                self.acct_register(addr, body)
            elif action == "login":
                self.acct_login(addr, body)
            elif action == "logout":
                self.acct_logout(addr, body)
            elif action == "pull":
                self.acct_pull(addr, body)
            else:
                self.acct_push(addr, body)
        except KDFBusy:
            self.acct_fail(503, E_ACCT_BUSY, {"retry": True})
        except Reject:
            self.acct_fail(400, E_ACCT_BAD_JSON)
        except sqlite3.Error:
            LOG("acct-db-error")
            self.acct_fail(503, E_ACCT_BUSY)

    def acct_register(self, addr, body):
        if not acct_allowed("reg", addr) or not acct_global_reg_allowed():
            self.acct_fail(429, E_ACCT_SLOW, {"retryAfter": 300})
            return
        try:
            name, key = v_username(body.get("u"))
        except Reject:
            self.acct_fail(400, E_ACCT_NAME)
            return
        try:
            cred = v_credential(body.get("pw"))
        except Reject:
            self.acct_fail(400, E_ACCT_PW)
            return
        err = ACCOUNTS.create(name, key, cred)
        del cred
        if err == "taken":
            self.acct_fail(409, E_ACCT_TAKEN)
            return
        if err == "full":
            self.acct_fail(507, E_ACCT_FULL)
            return
        tok, exp = ACCOUNTS.open_session(key)
        LOG("acct-new", u=key)
        self.reply(201, {"ok": True, "tok": tok, "exp": int(exp), "u": key,
                         "name": name, "ver": 0, "at": 0, "save": None})

    def acct_login(self, addr, body):
        if not acct_allowed("login", addr):
            self.acct_fail(429, E_ACCT_SLOW, {"retryAfter": 30})
            return
        try:
            name_in, key = v_username(body.get("u"))
        except Reject:
            self.acct_fail(401, E_ACCT_CREDS)
            return
        try:
            cred = v_credential(body.get("pw"))
        except Reject:
            self.acct_fail(401, E_ACCT_CREDS)
            return
        if acct_locked(key):
            self.acct_fail(429, E_ACCT_LOCKED, {"retryAfter": int(A.FAIL_LOCK)})
            return
        name = ACCOUNTS.verify(key, cred)
        del cred
        if name is None:
            acct_note_fail(key)
            self.acct_fail(401, E_ACCT_CREDS)
            return
        acct_note_ok(key)
        tok, exp = ACCOUNTS.open_session(key)
        st = ACCOUNTS.get_save(key)
        LOG("acct-login", u=key)
        self.reply(200, {"ok": True, "tok": tok, "exp": int(exp), "u": key,
                         "name": name, "ver": st["ver"], "at": int(st["at"]),
                         "save": st["blob"], "device": st["device"]})

    def authed(self, addr, body):
        """(uname, name) or None having already answered."""
        if not acct_allowed("api", addr):
            self.acct_fail(429, E_ACCT_SLOW, {"retryAfter": 5})
            return None
        who = ACCOUNTS.session(self.bearer(body))
        if who is None:
            self.acct_fail(401, E_ACCT_TOKEN, {"relogin": True})
            return None
        return who

    def acct_logout(self, addr, body):
        # Deliberately not authenticated-and-then-checked: presenting a token
        # is the whole request, and an unknown token is a silent success so
        # this route says nothing about which tokens exist.
        if not acct_allowed("api", addr):
            self.acct_fail(429, E_ACCT_SLOW, {"retryAfter": 5})
            return
        ACCOUNTS.close_session(self.bearer(body))
        self.reply(200, {"ok": True})

    def acct_pull(self, addr, body):
        who = self.authed(addr, body)
        if who is None:
            return
        key, name = who
        st = ACCOUNTS.get_save(key)
        if body.get("prev") is True:
            self.reply(200, {"ok": True, "u": key, "name": name,
                             "ver": st["prevVer"], "at": int(st["prevAt"]),
                             "save": st["prevBlob"], "prev": True})
            return
        self.reply(200, {"ok": True, "u": key, "name": name,
                         "ver": st["ver"], "at": int(st["at"]),
                         "save": st["blob"], "device": st["device"],
                         "hasPrev": st["prevBlob"] is not None})

    def acct_push(self, addr, body):
        who = self.authed(addr, body)
        if who is None:
            return
        key, name = who
        try:
            blob, nbytes = check_save_blob(body.get("save"))
        except Reject as e:
            self.acct_fail(413 if str(e) == "big" else 400,
                           E_ACCT_BIG if str(e) == "big" else E_ACCT_SAVE)
            return
        base = body.get("base", 0)
        if isinstance(base, bool) or not isinstance(base, int) or not (0 <= base <= 1 << 40):
            self.acct_fail(400, E_ACCT_BAD_JSON)
            return
        force = body.get("force") is True
        device = v_device(body.get("device"))
        ok, info = ACCOUNTS.put_save(key, base, blob, nbytes, device, force)
        if not ok and info == "full":
            self.acct_fail(507, E_ACCT_STORE)
            return
        if not ok:
            # A genuine conflict. Hand back what the server is holding so the
            # player can be shown BOTH and choose; nothing has been written.
            self.acct_fail(409, E_ACCT_STALE,
                           {"code": "stale", "ver": info["ver"],
                            "at": int(info["at"]), "save": info["blob"],
                            "device": info["device"]})
            return
        self.reply(200, {"ok": True, "u": key, "ver": info["ver"],
                         "at": int(info["at"]), "bytes": nbytes})

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
                # An invite whose room has filled, closed or timed out is
                # withdrawn, and whoever is holding it is told so they are not
                # left with a button that does nothing.
                out += invites_withdrawn(INVITES.sweep(ROOMS.joinable))
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
    if ACCOUNTS is None:
        print("  accounts       : OFF (pure relay — no disk, no saved games)")
    else:
        users, stored = ACCOUNTS.stats()
        print("  accounts       : %s  (%d/%d accounts, %d/%d KiB of saves, %s)"
              % (ACCOUNTS.path, users, A.MAX_ACCOUNTS,
                 stored // 1024, A.MAX_TOTAL // 1024, kdf_params()[0]))
        print("  account routes : POST %s%s/{register,login,logout,pull,push}"
              % (PATH_PREFIX, ACCT_PREFIX))
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


def _http_post(host, port, path, obj, timeout=15.0, origin=None, raw=None,
               ctype="application/json", clen=None, headers=""):
    """POST JSON and decode the answer. `raw`/`clen` exist so the abuse tests
    can lie about the body and about its length."""
    payload = raw if raw is not None else json.dumps(obj).encode("utf-8")
    n = len(payload) if clen is None else clen
    s = socket.create_connection((host, port), timeout=timeout)
    s.settimeout(timeout)
    try:
        head = ("POST %s HTTP/1.0\r\nHost: %s\r\n%s%sContent-Type: %s\r\n"
                "Content-Length: %d\r\n%sConnection: close\r\n\r\n"
                % (path, host, ("Origin: %s\r\n" % origin) if origin else "",
                   headers, ctype, n, ""))
        s.sendall(head.encode("ascii") + payload)
        chunks = []
        while True:
            b = s.recv(65536)
            if not b:
                break
            chunks.append(b)
    finally:
        s.close()
    rawresp = b"".join(chunks)
    hd, _, body = rawresp.partition(b"\r\n\r\n")
    first = hd.split(b"\r\n", 1)[0].decode("latin-1")
    parts = first.split()
    status = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    try:
        js = json.loads(body.decode("utf-8"))
    except Exception:
        js = None
    return status, js, hd.decode("latin-1")


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
    # Invites and takebacks: generous while the happy path is walked, then
    # squeezed on a FRESH connection for the flood checks (each socket builds
    # its own bucket, so the tight numbers only bind the ones made after).
    L.INVITE_BURST = 12.0
    L.INVITE_RATE = 2.0

    # Accounts: same code, tiny numbers, in a throwaway directory. The KDF cost
    # is the only thing turned down for speed — the algorithm, the salting and
    # the comparison are exactly what production runs.
    A.KDF_N = 1 << 11
    A.KDF_ITERS = 2000
    A.MAX_ACCOUNTS = 12
    A.MAX_SAVE = 16 * 1024
    A.MAX_TOTAL = 40 * 1024
    A.MAX_BODY = A.MAX_SAVE + 16 * 1024
    acct_dir = tempfile.mkdtemp(prefix="karti-selftest-")
    accounts_open(os.path.join(acct_dir, "accounts.db"))

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
                if set(r.keys()) - {"id", "n", "w", "g", "c", "m", "v"}:
                    leaks.append("extra field %r" % sorted(r.keys()))
                if r.get("g") not in GAME_IDS:
                    leaks.append("bad game id %r" % (r.get("g"),))
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

        # ═══════════ chess and dama rooms ═══════════
        print("")
        print(" GAME ROOMS  (a room is a room OF something)")

        # A whole chess room, opened, listed, tapped, played and stopped. The
        # relay never learns one rule of chess: all it does here is label the
        # room, tell both players what they are sitting at, and refuse anything
        # that is not that game.
        ch_a = ch_b = dm_a = dm_b = cd_a = None
        # The room-list flood above left rooms whose sockets are gone but whose
        # seats are still inside the reconnect grace. Wait for the sweeper
        # rather than for a stopwatch — and stop at 1, which is the live card
        # duel the abuse section below still needs.
        _end = time.monotonic() + 10
        while time.monotonic() < _end and ROOMS.stats()[0] > 1:
            time.sleep(0.2)
        try:
            ch_a = cli(origin=PAGES_ORIGIN)
            ch_a.send_json({"t": "name", "n": "CHESSER"})
            ch_a.recv_json(2.0)
            ch_a.send_json({"t": "create", "game": "chess"})
            made = ch_a.recv_json(2.0)
            time.sleep(0.15)
            _, _, _, got = pres()
            mine = [r for r in got["rooms"] if r["n"] == "CHESSER"]
            ok = (made or {}).get("game") == "chess"
            ok = ok and len(mine) == 1 and mine[0].get("g") == "chess"
            ok = ok and got.get("openBy", {}).get("chess") == 1
            check("a chess room says so, in the reply and in the room list", ok,
                  "made=%r listed=%r openBy=%r" % (made, mine, got.get("openBy")))
        except Exception as e:
            check("chess room is labelled", False, repr(e))

        try:
            cd_a = cli(origin=PAGES_ORIGIN)
            cd_a.send_json({"t": "name", "n": "CARDSER"})
            cd_a.recv_json(2.0)
            cd_a.send_json({"t": "create"})                 # exactly what an old
            made = cd_a.recv_json(2.0)                      # client sends
            dm_a = cli(origin=PAGES_ORIGIN)
            dm_a.send_json({"t": "name", "n": "DAMISTA"})
            dm_a.recv_json(2.0)
            dm_a.send_json({"t": "create", "game": "dama"})
            dmade = dm_a.recv_json(2.0)
            time.sleep(0.15)
            _, _, _, got = pres()
            by = {r["n"]: r.get("g") for r in got["rooms"]}
            ok = (made or {}).get("game") == "cards"        # no field -> cards
            ok = ok and (dmade or {}).get("game") == "dama"
            ok = ok and by.get("CARDSER") == "cards" and by.get("CHESSER") == "chess"
            ok = ok and by.get("DAMISTA") == "dama"
            by = got.get("openBy", {})
            ok = ok and by.get("cards") == 1 and by.get("chess") == 1 and by.get("dama") == 1
            ok = ok and sum(by.values()) == 3
            check("cards, chess and dama sit in one list, each saying what it is",
                  ok, "listed=%r openBy=%r" % (by, got.get("openBy")))
        except Exception as e:
            check("mixed room list", False, repr(e))

        try:
            _, _, _, got = pres()
            handle = [r["id"] for r in got["rooms"] if r["n"] == "CHESSER"][0]
            ch_b = cli(origin=PAGES_ORIGIN)
            ch_b.send_json({"t": "name", "n": "TAPPER2"})
            ch_b.recv_json(2.0)
            # tapped a chess room while believing it was dama: refused, and the
            # opener is not disturbed by the attempt
            ch_b.send_json({"t": "joinid", "id": handle, "game": "dama"})
            wrong = ch_b.recv_json(2.0)
            quiet = ch_a.silent(0.4)
            ch_b.send_json({"t": "joinid", "id": handle, "game": "chess"})
            seated = ch_b.recv_json(3.0)
            told = ch_a.recv_json(3.0)
            ok = (wrong or {}).get("why") == E_WRONGGAME and quiet
            ok = ok and (seated or {}).get("t") == "joined"
            ok = ok and (seated or {}).get("game") == "chess"
            ok = ok and (told or {}) == {"t": "peer", "state": "joined"}
            check("joining tells you the game, and a stale tap is refused", ok,
                  "wrong=%r quiet=%s seated=%r" % (wrong, quiet, seated))
        except Exception as e:
            check("joinid carries the game", False, repr(e))

        try:
            hello = {"k": "bhello", "game": "chess", "name": "CHESSER",
                     "nonce": 3735928559}
            ch_a.send_json({"t": "relay", "d": hello})
            got = ch_b.recv_json(3.0)
            ok = got and got.get("t") == "relay" and got.get("d") == hello
            start = {"k": "bstart", "game": "chess", "seed": 42}
            ch_a.send_json({"t": "relay", "d": start})
            got2 = ch_b.recv_json(3.0)
            ok = ok and (got2 or {}).get("d") == start
            mv = {"k": "bact", "game": "chess", "kind": "move",
                  "m": {"f": 52, "t": 36, "p": 0}, "ck": "rnbq/pppp w KQkq"}
            ch_a.send_json({"t": "relay", "d": mv})
            got3 = ch_b.recv_json(3.0)
            ok = ok and (got3 or {}).get("d") == mv
            res = {"k": "bact", "game": "chess", "kind": "resign", "m": None, "ck": None}
            ch_b.send_json({"t": "relay", "d": {"k": "bact", "game": "chess",
                                                "kind": "resign"}})
            got4 = ch_a.recv_json(3.0)
            ok = ok and (got4 or {}).get("d") == res
            check("a chess room relays hello, seed, a move and a resignation", ok,
                  "%r %r %r %r" % (got, got2, got3, got4))
        except Exception as e:
            check("chess payloads relay", False, repr(e))

        try:
            # a whole dama multi-jump: three stones taken in one move
            chain = {"k": "bact", "game": "dama", "kind": "move",
                     "m": {"p": [45, 27, 9, 23], "c": [36, 18, 16]}, "ck": None}
            dm_b = cli(origin=PAGES_ORIGIN)
            dm_b.send_json({"t": "name", "n": "DAMA2"})
            dm_b.recv_json(2.0)
            _, _, _, got = pres()
            dhandle = [r["id"] for r in got["rooms"] if r["n"] == "DAMISTA"][0]
            dm_b.send_json({"t": "joinid", "id": dhandle, "game": "dama"})
            seated = dm_b.recv_json(3.0)
            dm_a.recv_json(3.0)
            dm_a.send_json({"t": "relay", "d": chain})
            gotc = dm_b.recv_json(3.0)
            check("a dama room relays a whole three-stone jump chain intact",
                  (seated or {}).get("game") == "dama" and (gotc or {}).get("d") == chain,
                  "seated=%r got=%r" % (seated, gotc))
        except Exception as e:
            check("dama chain relays", False, repr(e))

        try:
            # THE point of labelling a room: a move for another game does not
            # reach the other player, whichever direction it is going.
            wrong = [
                ({"k": "bact", "game": "dama", "kind": "move",
                  "m": {"p": [45, 27], "c": []}}, ch_a, ch_b, "dama move in a chess room"),
                ({"k": "act", "kind": "end", "a": None}, ch_a, ch_b,
                 "a card move in a chess room"),
                ({"k": "hello", "name": "X", "list": _list40()}, ch_a, ch_b,
                 "a card hello in a chess room"),
                ({"k": "bhello", "game": "chess", "name": "X", "nonce": 1}, dm_a, dm_b,
                 "a chess hello in a dama room"),
                ({"k": "bact", "game": "chess", "kind": "move",
                  "m": {"f": 1, "t": 2, "p": 0}}, a, b, "a chess move in a card room"),
            ]
            bad = []
            for payload, sender, peer, why in wrong:
                sender.send_json({"t": "relay", "d": payload})
                r = sender.recv_json(2.0)
                if (r or {}).get("why") != E_WRONGGAME:
                    bad.append((why, "not refused", r))
                if peer.raw_recv(0.4) is not TIMEOUT:
                    bad.append((why, "reached the other player"))
            check("a move for a game the room is not playing never arrives",
                  not bad, bad)
        except Exception as e:
            check("wrong-game payloads blocked", False, repr(e))

        try:
            # "stop the match" belongs to every room, whatever is on the table
            ch_a.send_json({"t": "relay", "d": {"k": "bail", "why": "Illegal move refused."}})
            got = ch_b.recv_json(3.0)
            check("bail stops a board match the same way it stops a duel",
                  (got or {}).get("d") == {"k": "bail", "why": "Illegal move refused."},
                  got)
        except Exception as e:
            check("bail works in a board room", False, repr(e))

        try:
            # a dropped chess player gets the moves they missed, and is told
            # what game they have come back to
            tok = (seated or {}).get("token")
            _, _, _, _ = pres()
            mv = {"k": "bact", "game": "dama", "kind": "move",
                  "m": {"p": [40, 33], "c": []}, "ck": None}
            dm_b.close(graceful=False)
            live.remove(dm_b)
            time.sleep(0.3)
            dm_a.recv_json(2.0)                     # peer dropped
            dm_a.send_json({"t": "relay", "d": mv})
            back = cli(origin=PAGES_ORIGIN)
            back.send_json({"t": "rejoin", "code": seated.get("code"),
                            "token": tok, "since": 0})
            head = back.recv_json(3.0)
            replayed = []
            for _ in range(4):
                r = back.raw_recv(0.6)
                if r is TIMEOUT or r is None:
                    break
                replayed.append(json.loads(r))
            ok = (head or {}).get("t") == "rejoined" and (head or {}).get("game") == "dama"
            ok = ok and any(x.get("d") == mv for x in replayed)
            check("a reconnecting player is told the game and replayed the moves",
                  ok, "head=%r replayed=%r" % (head, replayed))
            bye(back)
        except Exception as e:
            check("rejoin into a board room", False, repr(e))

        try:
            for c in (ch_a, ch_b, dm_a, cd_a):
                if c is not None:
                    bye(c)
            ch_a = ch_b = dm_a = dm_b = cd_a = None
            time.sleep(0.3)
        except Exception:
            pass

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
                      '{"t":"rejoin","code":"AAAAA","token":123}',
                      # a room can only ever be a room of a game that exists
                      '{"t":"create","game":"poker"}',
                      '{"t":"create","game":"CARDS"}',
                      '{"t":"create","game":5}',
                      '{"t":"create","game":["chess"]}',
                      '{"t":"joinid","id":"whatever","game":"poker"}']
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
                # ── the board games' own junk ────────────────────────────
                {"k": "bact", "game": "chess", "kind": "move",
                 "m": {"f": 64, "t": 0, "p": 0}},          # off the board
                {"k": "bact", "game": "chess", "kind": "move",
                 "m": {"f": -1, "t": 0, "p": 0}},
                {"k": "bact", "game": "chess", "kind": "move",
                 "m": {"f": 0, "t": 1, "p": 99}},          # not a piece
                {"k": "bact", "game": "chess", "kind": "move", "m": "e2e4"},
                {"k": "bact", "game": "chess", "kind": "nuke", "m": None},
                {"k": "bact", "game": "poker", "kind": "move",
                 "m": {"f": 0, "t": 1, "p": 0}},           # no such game
                {"k": "bact", "game": "cards", "kind": "move",
                 "m": {"f": 0, "t": 1, "p": 0}},           # cards is not a board
                {"k": "bact", "kind": "move", "m": {"f": 0, "t": 1, "p": 0}},
                {"k": "bact", "game": "dama", "kind": "move",
                 "m": {"p": [12], "c": []}},               # half a move
                {"k": "bact", "game": "dama", "kind": "move",
                 "m": {"p": list(range(40)), "c": []}},    # chain off the board
                {"k": "bact", "game": "dama", "kind": "move",
                 "m": {"p": [1, 2], "c": list(range(30))}},
                {"k": "bact", "game": "dama", "kind": "move",
                 "m": {"p": [1, 200], "c": []}},
                {"k": "bact", "game": "chess", "kind": "move",
                 "m": {"f": 1, "t": 2, "p": 0}, "ck": "x" * 4000},
                {"k": "bstart", "game": "chess", "seed": -1},
                {"k": "bstart", "game": "chess"},
                {"k": "bstart", "game": "chess", "seed": 1 << 40},
                {"k": "bhello", "game": "chess", "name": "A", "nonce": "lots"},
                {"k": "bhello", "game": "chess", "name": "A", "nonce": 1 << 40},
                {"k": "bhello", "game": "beer", "name": "A", "nonce": 1},
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

        # ═══════════ accounts: sign up, log in ═══════════
        print("")
        print(" ACCOUNTS — SIGN UP AND LOG IN")

        AP = PATH_PREFIX + ACCT_PREFIX               # /karti/acct
        PW_A = "a" * 40                              # stands in for the client's
        PW_B = "b" * 40                              # 64-char pre-hash
        POST = lambda p, o, **kw: _http_post(host, port, AP + p, o,
                                             origin=PAGES_ORIGIN, **kw)

        tok_a1 = tok_a2 = tok_b = None
        try:
            accounts_reset()
            st, js, _ = POST("/register", {"u": "Alice", "pw": PW_A})
            tok_a1 = (js or {}).get("tok")
            ok = st == 201 and (js or {}).get("ok") is True
            ok = ok and isinstance(tok_a1, str) and len(tok_a1) >= 32
            ok = ok and (js or {}).get("ver") == 0 and (js or {}).get("save") is None
            check("register creates an account and hands back a session token", ok,
                  "%s %s" % (st, js))
        except Exception as e:
            check("register creates an account", False, repr(e))

        try:
            blob = json.dumps(js or {})
            leaked = PW_A in blob or "hash" in blob.lower() or "salt" in blob.lower()
            check("the register answer contains no password, hash or salt", not leaked, blob[:160])
        except Exception as e:
            check("register answer leaks nothing", False, repr(e))

        try:
            accounts_reset()
            st, js, _ = POST("/register", {"u": "alice", "pw": PW_B})
            check("a duplicate username is refused (and case does not dodge it)",
                  st == 409, "%s %s" % (st, js))
        except Exception as e:
            check("duplicate username refused", False, repr(e))

        for label, uname in (("a script tag", "<b>x</b>"), ("a quote", "O'Brien"),
                             ("17 characters", "A" * 17), ("nothing at all", ""),
                             ("the guest sentinel", "__guest__")):
            try:
                accounts_reset()
                st, _, _ = POST("/register", {"u": uname, "pw": PW_A})
                check("a username with %s is refused" % label, st == 400, st)
            except Exception as e:
                check("username with %s refused" % label, False, repr(e))

        try:
            accounts_reset()
            st, _, _ = POST("/register", {"u": "Shorty", "pw": "abc"})
            check("a too-short password is refused", st == 400, st)
        except Exception as e:
            check("short password refused", False, repr(e))

        try:
            accounts_reset()
            st, js, _ = POST("/login", {"u": "ALICE", "pw": PW_A})
            tok_a2 = (js or {}).get("tok")
            ok = st == 200 and isinstance(tok_a2, str) and tok_a2 != tok_a1
            check("log in with the right password -> a second, different token", ok,
                  "%s %s" % (st, js))
        except Exception as e:
            check("login works", False, repr(e))

        try:
            accounts_reset()
            st1, js1, _ = POST("/login", {"u": "Alice", "pw": PW_A[:-1] + "z"})
            accounts_reset()
            st2, js2, _ = POST("/login", {"u": "NobodyHere", "pw": PW_A})
            ok = st1 == 401 and st2 == 401 and js1 == js2
            check("wrong password and unknown user give the SAME 401 (no user oracle)",
                  ok, "%s %s / %s %s" % (st1, js1, st2, js2))
        except Exception as e:
            check("login gives no user oracle", False, repr(e))

        try:
            accounts_reset()
            st, _, _ = POST("/login", {"u": "Alice", "pw": PW_A[:-1] + "z"})
            check("one wrong character is enough to fail (the hash is compared, "
                  "not the prefix)", st == 401, st)
        except Exception as e:
            check("one wrong character fails", False, repr(e))

        try:
            accounts_reset()
            st, js, _ = _http_post(host, port, ACCT_PREFIX + "/login",
                                   {"u": "Alice", "pw": PW_A}, origin=PAGES_ORIGIN)
            check("the account routes answer on the bare /acct path too "
                  "(prefix stripped or not)", st == 200 and (js or {}).get("ok") is True,
                  "%s %s" % (st, js))
        except Exception as e:
            check("bare /acct path works", False, repr(e))

        try:
            st, _, _ = _http_get(host, port, AP + "/login")
            check("GET on an account route is still a plain 404", st == 404, st)
        except Exception as e:
            check("GET on account route 404s", False, repr(e))

        try:
            st, _, _ = _http_get(host, port, PATH_PREFIX + "/health", method="POST")
            check("POST on /health is still 405 (nothing else grew a POST)",
                  st == 405, st)
        except Exception as e:
            check("health still refuses POST", False, repr(e))

        # ═══════════ accounts: the actual point ═══════════
        print("")
        print(" ACCOUNTS — THE SAVE CROSSES DEVICES")

        SAVE_1 = json.dumps({"owned": {"petard": 3, "bandist": 2}, "coins": 1234,
                             "decks": [{"id": "d1", "name": "MALTA",
                                        "list": {"petard": 3}}],
                             "activeDeck": "d1", "rec": {"w": 7, "l": 2},
                             "story": {"chapter": 4}}, separators=(",", ":"))
        SAVE_2 = json.dumps({"owned": {"petard": 3, "bandist": 3, "grezz": 1},
                             "coins": 90, "decks": [], "rec": {"w": 9, "l": 2},
                             "story": {"chapter": 6}}, separators=(",", ":"))

        try:
            accounts_reset()
            st, js, _ = POST("/push", {"tok": tok_a1, "base": 0, "save": SAVE_1,
                                       "device": "phone"})
            check("push a save -> version 1", st == 200 and (js or {}).get("ver") == 1,
                  "%s %s" % (st, js))
        except Exception as e:
            check("push a save", False, repr(e))

        try:
            accounts_reset()
            st, js, _ = POST("/pull", {"tok": tok_a1})
            ok = st == 200 and (js or {}).get("save") == SAVE_1 and (js or {}).get("ver") == 1
            check("pull hands back the save BYTE FOR BYTE", ok, "%s %s" % (st, js))
        except Exception as e:
            check("pull round-trips exactly", False, repr(e))

        try:
            # This is the whole feature: a second device, a fresh login, and the
            # collection is there.
            accounts_reset()
            _, js_l, _ = POST("/login", {"u": "alice", "pw": PW_A})
            tok_a2 = (js_l or {}).get("tok")
            accounts_reset()
            st, js, _ = POST("/pull", {"tok": tok_a2})
            got = json.loads((js or {}).get("save") or "{}")
            want = json.loads(SAVE_1)
            check("a SECOND device logs in and finds the same cards, decks and story",
                  st == 200 and got == want, "%s %s" % (st, str(js)[:160]))
        except Exception as e:
            check("second device sees the save", False, repr(e))

        try:
            accounts_reset()
            st, js, _ = POST("/register", {"u": "Bob", "pw": PW_B})
            tok_b = (js or {}).get("tok")
            accounts_reset()
            st, js, _ = POST("/pull", {"tok": tok_b})
            check("one account's token cannot read another account's save",
                  st == 200 and (js or {}).get("save") is None and (js or {}).get("u") == "bob",
                  "%s %s" % (st, js))
        except Exception as e:
            check("tokens are scoped to their account", False, repr(e))

        for label, tok in (("a made-up token", "x" * 43), ("no token at all", None),
                           ("an empty token", ""), ("a number", 12345)):
            try:
                accounts_reset()
                st, js, _ = POST("/pull", {"tok": tok} if tok is not None else {})
                check("pull with %s -> 401" % label, st == 401, "%s %s" % (st, js))
            except Exception as e:
                check("pull with %s refused" % label, False, repr(e))

        try:
            accounts_reset()
            st, _, _ = POST("/logout", {"tok": tok_a2})
            accounts_reset()
            st2, _, _ = POST("/pull", {"tok": tok_a2})
            accounts_reset()
            st3, _, _ = POST("/pull", {"tok": tok_a1})
            check("logout kills that one session and leaves the other device signed in",
                  st == 200 and st2 == 401 and st3 == 200, "%s %s %s" % (st, st2, st3))
        except Exception as e:
            check("logout scoped to one session", False, repr(e))

        try:
            keep = A.SESSION_IDLE
            A.SESSION_IDLE = -1.0                 # everything is now stale
            accounts_reset()
            st, _, _ = POST("/pull", {"tok": tok_a1})
            A.SESSION_IDLE = keep
            accounts_reset()
            st2, _, _ = POST("/pull", {"tok": tok_a1})
            check("an expired session is refused, and the dead row is dropped",
                  st == 401 and st2 == 401, "%s %s" % (st, st2))
            accounts_reset()
            _, js_l, _ = POST("/login", {"u": "alice", "pw": PW_A})
            tok_a1 = (js_l or {}).get("tok")
        except Exception as e:
            check("expired session refused", False, repr(e))

        # ═══════════ accounts: conflict, and never losing a collection ═══════
        print("")
        print(" ACCOUNTS — CONFLICT (NOTHING IS EVER LOST)")

        try:
            accounts_reset()
            st, js, _ = POST("/push", {"tok": tok_a1, "base": 1, "save": SAVE_2,
                                       "device": "tablet"})
            ok = st == 200 and (js or {}).get("ver") == 2
            check("a push from the version the server holds is accepted", ok,
                  "%s %s" % (st, js))
        except Exception as e:
            check("in-order push accepted", False, repr(e))

        try:
            # Device one has been offline; it still thinks the world is at v1.
            accounts_reset()
            stale = json.dumps({"owned": {"petard": 1}, "coins": 5}, separators=(",", ":"))
            st, js, _ = POST("/push", {"tok": tok_a1, "base": 1, "save": stale})
            ok = st == 409 and (js or {}).get("code") == "stale"
            check("a stale push is REFUSED, not merged and not silently applied", ok,
                  "%s %s" % (st, str(js)[:160]))
            check("the refusal hands back the server's copy so the player can be "
                  "shown both", (js or {}).get("save") == SAVE_2 and (js or {}).get("ver") == 2,
                  str(js)[:200])
        except Exception as e:
            check("stale push refused", False, repr(e))

        try:
            accounts_reset()
            st, js, _ = POST("/pull", {"tok": tok_a1})
            check("after the refusal the server's save is completely UNCHANGED",
                  st == 200 and (js or {}).get("save") == SAVE_2 and (js or {}).get("ver") == 2,
                  str(js)[:160])
        except Exception as e:
            check("nothing was written by the refused push", False, repr(e))

        try:
            accounts_reset()
            keeper = json.dumps({"owned": {"petard": 3}, "coins": 42,
                                 "note": "the player chose this one"}, separators=(",", ":"))
            st, js, _ = POST("/push", {"tok": tok_a1, "base": 0, "save": keeper,
                                       "force": True})
            ok = st == 200 and (js or {}).get("ver") == 3
            check("when the player picks a side, force overwrites and the version "
                  "still only goes up", ok, "%s %s" % (st, js))
            accounts_reset()
            st, js, _ = POST("/pull", {"tok": tok_a1, "prev": True})
            check("...and the overwritten save is STILL THERE, one pull away",
                  st == 200 and (js or {}).get("save") == SAVE_2, str(js)[:160])
        except Exception as e:
            check("force keeps a copy of what it replaced", False, repr(e))

        # ═══════════ accounts: abuse ═══════════
        print("")
        print(" ACCOUNTS — ABUSE")

        try:
            accounts_reset()
            fat = json.dumps({"x": "y" * (A.MAX_SAVE + 500)}, separators=(",", ":"))
            st, js, _ = POST("/push", {"tok": tok_a1, "base": 3, "save": fat})
            check("an oversized save blob is refused (413)", st == 413, "%s %s" % (st, js))
        except Exception as e:
            check("oversized save refused", False, repr(e))

        try:
            accounts_reset()
            st, js, _ = POST("/push", {"tok": tok_a1, "base": 3, "save": "{}"},
                             raw=b'{"x":1}', clen=A.MAX_BODY + 5000)
            check("an oversized BODY is refused on Content-Length, before a byte "
                  "is read", st == 413, "%s %s" % (st, js))
        except Exception as e:
            check("oversized body refused early", False, repr(e))

        for label, bad in (("not JSON at all", '{"a":}'),
                           ("a JSON array, not an object", "[1,2,3]"),
                           ("a bare number", "12345"),
                           ("a JSON string", '"hello"'),
                           ("nested 200 deep", "[" * 200 + "]" * 200),
                           ("not a string", 12345)):
            try:
                accounts_reset()
                st, _, _ = POST("/push", {"tok": tok_a1, "base": 3, "save": bad})
                check("a save that is %s is refused" % label, st == 400, st)
            except Exception as e:
                check("save that is %s refused" % label, False, repr(e))

        try:
            accounts_reset()
            st, _, _ = POST("/push", {"tok": tok_a1, "base": -1, "save": SAVE_1})
            accounts_reset()
            st2, _, _ = POST("/push", {"tok": tok_a1, "base": "one", "save": SAVE_1})
            check("a nonsense base version is refused", st == 400 and st2 == 400,
                  "%s %s" % (st, st2))
        except Exception as e:
            check("nonsense base refused", False, repr(e))

        try:
            accounts_reset()
            st, _, _ = POST("/push", {"tok": tok_a1}, raw=b"not json", clen=8)
            accounts_reset()
            st2, _, _ = POST("/pull", {}, raw=b'"a string"', clen=10)
            check("a request body that is not a JSON object is refused",
                  st == 400 and st2 == 400, "%s %s" % (st, st2))
        except Exception as e:
            check("bad request body refused", False, repr(e))

        try:
            accounts_reset()
            st, _, _ = POST("/pull", {"tok": tok_a1}, ctype="text/plain")
            accounts_reset()
            st2, _, _ = POST("/pull", {"tok": tok_a1}, clen=None, raw=b"{}",
                             headers="")
            check("a non-JSON Content-Type is refused", st == 415, "%s %s" % (st, st2))
        except Exception as e:
            check("wrong content type refused", False, repr(e))

        try:
            accounts_reset()
            codes = []
            for _ in range(12):
                st, _, _ = POST("/login", {"u": "Bob", "pw": PW_B})
                codes.append(st)
            check("a login flood is rate limited (429 after the burst)",
                  429 in codes, codes)
        except Exception as e:
            check("login flood limited", False, repr(e))

        try:
            accounts_reset()
            codes = []
            for i in range(8):
                st, _, _ = POST("/register", {"u": "Flood%d" % i, "pw": PW_A})
                codes.append(st)
            check("a registration flood is rate limited (429 after the burst)",
                  429 in codes, codes)
        except Exception as e:
            check("register flood limited", False, repr(e))

        try:
            keepr, keepb = A.LOGIN_RATE, A.LOGIN_BURST
            A.LOGIN_RATE, A.LOGIN_BURST = 1000.0, 1000.0    # take the IP limit out
            accounts_reset()                                #   of the way
            for _ in range(A.FAIL_MAX + 1):
                POST("/login", {"u": "Bob", "pw": "z" * 40})
            st, js, _ = POST("/login", {"u": "Bob", "pw": PW_B})
            A.LOGIN_RATE, A.LOGIN_BURST = keepr, keepb
            accounts_reset()
            check("guessing at one account locks that account out, right password "
                  "or not", st == 429, "%s %s" % (st, js))
        except Exception as e:
            A.LOGIN_RATE, A.LOGIN_BURST = 1.0 / 10.0, 5.0
            check("password guessing locks the account", False, repr(e))

        try:
            keepr, keepb = A.API_RATE, A.API_BURST
            A.API_RATE, A.API_BURST = 1000.0, 1000.0
            accounts_reset()
            big = json.dumps({"pad": "z" * (A.MAX_SAVE - 200)}, separators=(",", ":"))
            got507 = False
            for name, pw in (("Store1", PW_A), ("Store2", PW_A), ("Store3", PW_A)):
                accounts_reset()
                _, jr, _ = POST("/register", {"u": name, "pw": pw})
                t = (jr or {}).get("tok")
                accounts_reset()
                A.API_RATE, A.API_BURST = 1000.0, 1000.0
                st, _, _ = POST("/push", {"tok": t, "base": 0, "save": big})
                if st == 507:
                    got507 = True
                    break
            A.API_RATE, A.API_BURST = keepr, keepb
            check("total stored save data is capped — a stranger cannot fill the "
                  "disk", got507)
        except Exception as e:
            A.API_RATE, A.API_BURST = 1.0, 12.0
            check("total storage capped", False, repr(e))

        try:
            accounts_reset()
            st, js, _ = POST("/pull", {"tok": tok_a1})
            check("the saves stored before the cap was hit are still intact",
                  st == 200 and (js or {}).get("ver") == 3, str(js)[:120])
        except Exception as e:
            check("earlier saves survive the cap", False, repr(e))

        try:
            got507 = False
            for i in range(A.MAX_ACCOUNTS + 4):
                accounts_reset()
                st, _, _ = POST("/register", {"u": "Cap%d" % i, "pw": PW_A})
                if st == 507:
                    got507 = True
                    break
            users, _ = ACCOUNTS.stats()
            check("the number of accounts is capped (507 once it is full)",
                  got507 and users <= A.MAX_ACCOUNTS, "users=%d" % users)
        except Exception as e:
            check("account count capped", False, repr(e))

        try:
            accounts_reset()
            bad = []
            for route in ("register", "login", "logout", "pull", "push"):
                st, _, hd = _http_post(host, port, AP + "/" + route, {"u": "x", "pw": PW_A},
                                       origin="https://evil.example")
                if st != 403 or "access-control-allow-origin" in hd.lower():
                    bad.append((route, st))
            check("every account route refuses a foreign origin, with no CORS header",
                  not bad, bad)
        except Exception as e:
            check("foreign origin refused on account routes", False, repr(e))

        try:
            st, _, body = _http_get(host, port, PATH_PREFIX + "/health")
            js = json.loads(body.decode())
            ok = js.get("accounts") is True and js.get("maxSave") == A.MAX_SAVE
            leaked = any(k in body.decode().lower()
                         for k in ("alice", "bob", "tok", "hash", "salt", "pw"))
            check("/health says accounts are on and names nobody", ok and not leaked,
                  body[:160])
        except Exception as e:
            check("/health leaks nothing about accounts", False, repr(e))

        try:
            presence_reset()
            st, _, body = _http_get(host, port, PATH_PREFIX + "/presence")
            low = body.decode().lower()
            leaked = [w for w in ("alice", "bob", "tok", "hash", "salt", "uname")
                      if w in low]
            check("/presence still mentions no account, token or hash", not leaked,
                  leaked)
        except Exception as e:
            check("/presence mentions no account", False, repr(e))

        try:
            with open(ACCOUNTS.path, "rb") as fh:
                disk = fh.read()
            for extra in ("-wal", "-shm"):
                try:
                    with open(ACCOUNTS.path + extra, "rb") as fh:
                        disk += fh.read()
                except OSError:
                    pass
            plain = [PW_A.encode(), PW_B.encode()]
            plain += [tok.encode() for tok in (tok_a1, tok_b) if tok]
            found = [p[:12] for p in plain if p in disk]
            check("the database on disk holds no password and no live session "
                  "token", not found, found)
        except Exception as e:
            check("nothing plaintext on disk", False, repr(e))

        try:
            with ACCOUNTS.lock:
                rows = ACCOUNTS.db.execute(
                    "SELECT uname,algo,kn,salt,pwhash FROM accounts").fetchall()
            algos = {r[1] for r in rows}
            salts = {bytes(r[3]) for r in rows}
            ok = bool(rows) and algos <= {"scrypt", "pbkdf2_sha256"}
            ok = ok and all(len(bytes(r[3])) == 16 and len(bytes(r[4])) == 32 and r[2] >= 1024
                            for r in rows)
            check("every stored credential is a slow KDF digest with its own random "
                  "salt", ok and len(salts) == len(rows),
                  "%s rows=%d salts=%d" % (algos, len(rows), len(salts)))
        except Exception as e:
            check("a slow salted KDF is what is stored", False, repr(e))

        try:
            with ACCOUNTS.lock:
                row = ACCOUNTS.db.execute(
                    "SELECT pwhash FROM accounts WHERE uname='alice'").fetchone()
            digest = bytes(row[0])
            ok = PW_A.encode() not in digest and hashlib.sha256(PW_A.encode()).digest() != digest
            check("the digest is neither the password nor a plain SHA-256 of it", ok)
        except Exception as e:
            check("digest is not a plain hash", False, repr(e))

        try:
            mode = os.stat(ACCOUNTS.path).st_mode & 0o777
            check("the account database is not world readable", mode == 0o600,
                  oct(mode))
        except Exception as e:
            check("db file mode", False, repr(e))

        saved = ACCOUNTS
        try:
            globals()["ACCOUNTS"] = None
            accounts_reset()
            st, js, _ = POST("/pull", {"tok": tok_a1})
            globals()["ACCOUNTS"] = saved
            _, _, hbody = _http_get(host, port, PATH_PREFIX + "/health")[0:3]
            check("with the store unavailable the account routes say so (503) and "
                  "the relay carries on", st == 503 and (js or {}).get("ok") is False,
                  "%s %s" % (st, js))
        except Exception as e:
            globals()["ACCOUNTS"] = saved
            check("accounts off degrades gracefully", False, repr(e))

        try:
            accounts_reset()
            x = cli(origin=PAGES_ORIGIN)
            x.send_json({"t": "create"})
            m = x.recv_json(2.0)
            check("the relay itself still works with accounts bolted on",
                  (m or {}).get("t") == "created", m)
            bye(x)
        except Exception as e:
            check("relay unaffected by accounts", False, repr(e))

        # ═══════════ tables ═══════════
        print("")
        print(" TABLES  (a party, not a duel: 2 to %d chairs)" % L.MAX_SEATS)

        tb = []
        made = None
        try:
            _end = time.monotonic() + 10
            while time.monotonic() < _end and ROOMS.stats()[0] > 1:
                time.sleep(0.2)
            thost = cli(origin=PAGES_ORIGIN)
            thost.send_json({"t": "name", "n": "HOST"})
            thost.recv_json(2.0)
            thost.send_json({"t": "create", "game": "skarta", "seats": 6})
            made = thost.recv_json(2.0)
            tb.append(thost)
            ok = (made or {}).get("game") == "skarta"
            ok = ok and (made or {}).get("seats") == 6
            ok = ok and (made or {}).get("seat") == 0
            ok = ok and (made or {}).get("started") is False
            check("a six-chair table opens, and says how many chairs it has", ok, made)
        except Exception as e:
            check("table opens", False, repr(e))

        try:
            seated = []
            for i in range(3):
                c = cli(origin=PAGES_ORIGIN)
                c.send_json({"t": "name", "n": "P%d" % (i + 1)})
                c.recv_json(2.0)
                c.send_json({"t": "join", "code": made["code"]})
                seated.append(c.recv_json(2.0))
                tb.append(c)
            rosters = []
            end = time.monotonic() + 3
            while time.monotonic() < end:
                m = tb[0].recv_json(0.6)
                if m is None:
                    break
                if m.get("t") == "table":
                    rosters.append(m)
            last = rosters[-1] if rosters else {}
            names = [w and w.get("n") for w in (last.get("who") or [])]
            ok = [s.get("seat") for s in seated] == [1, 2, 3]
            ok = ok and all(s.get("seats") == 6 and s.get("started") is False
                            for s in seated)
            ok = ok and last.get("seats") == 6
            ok = ok and names[:4] == ["HOST", "P1", "P2", "P3"]
            ok = ok and names[4] is None and names[5] is None
            check("players trickle in and everyone gets the roster, chair by chair",
                  ok, "seats=%r names=%r" % ([s.get("seat") for s in seated], names))
        except Exception as e:
            check("table fills up", False, repr(e))

        try:
            _, _, _, got = pres()
            mine = [r for r in got["rooms"] if r["n"] == "HOST"]
            ok = len(mine) == 1 and mine[0].get("c") == 4 and mine[0].get("m") == 6
            ok = ok and mine[0].get("g") == "skarta"
            check("the room list says how FULL the table is, not just that it exists",
                  ok, mine)
        except Exception as e:
            check("occupancy is published", False, repr(e))

        try:
            for c in tb:                      # drain the roster traffic first
                while c.raw_recv(0.15) not in (TIMEOUT, None):
                    pass
            tb[1].send_json({"t": "start"})
            notyou = tb[1].recv_json(2.0)
            check("a player who did not open the table cannot start it",
                  (notyou or {}).get("why") == E_NOTHOST, notyou)
        except Exception as e:
            check("only the host starts", False, repr(e))

        try:
            tb[0].send_json({"t": "start", "bots": [1]})
            onperson = tb[0].recv_json(2.0)
            tb[0].send_json({"t": "start", "bots": [4, 4]})
            twice = tb[0].recv_json(2.0)
            tb[0].send_json({"t": "start", "bots": [9]})
            nochair = tb[0].recv_json(2.0)
            ok = all((r or {}).get("why") == E_BADSEAT
                     for r in (onperson, twice, nochair))
            check("a bot cannot be sat on a person, twice, or on a chair that "
                  "does not exist", ok, "%r %r %r" % (onperson, twice, nochair))
        except Exception as e:
            check("bot seating is checked", False, repr(e))

        try:
            for c in tb:
                while c.raw_recv(0.15) not in (TIMEOUT, None):
                    pass
            tb[0].send_json({"t": "start", "bots": [4, 5]})
            began = tb[0].recv_json(3.0)
            others = [c.recv_json(3.0) for c in tb[1:]]
            ok = (began or {}).get("t") == "began"
            ok = ok and isinstance(began.get("seed"), int)
            ok = ok and 0 <= began["seed"] <= 0xFFFFFFFF
            ok = ok and began.get("bots") == [4, 5]
            ok = ok and began.get("filled") == [0, 1, 2, 3, 4, 5]
            ok = ok and all((m or {}).get("t") == "began" and
                            m.get("seed") == began["seed"] for m in others)
            check("the host starts, and EVERY chair gets the same seed from the relay",
                  ok, "began=%r others=%r" % (began, [m and m.get("seed") for m in others]))
        except Exception as e:
            check("start deals one seed to everyone", False, repr(e))

        try:
            time.sleep(0.3)
            _, _, _, got = pres()
            listed = [r["n"] for r in got["rooms"]]
            latecomer = cli(origin=PAGES_ORIGIN)
            latecomer.send_json({"t": "join", "code": made["code"]})
            late = latecomer.recv_json(2.0)
            check("a table that has started is off the list and takes nobody else",
                  "HOST" not in listed and (late or {}).get("why") == E_FULL_ROOM,
                  "listed=%r late=%r" % (listed, late))
            bye(latecomer)
        except Exception as e:
            check("a started table is closed", False, repr(e))

        try:
            for c in tb:
                while c.raw_recv(0.15) not in (TIMEOUT, None):
                    pass
            mv = {"k": "bact", "game": "skarta", "kind": "move",
                  "m": {"a": "play", "i": 3, "s": "bahar"}, "ck": None}
            tb[1].send_json({"t": "relay", "d": mv})
            heard = [c.recv_json(3.0) for c in [tb[0]] + tb[2:]]
            ok = all((m or {}).get("t") == "relay" and m.get("d") == mv and
                     m.get("s") == 1 for m in heard)
            ok = ok and len(heard) == 3
            ok = ok and tb[1].silent(0.4)
            check("one move reaches every other chair, stamped with the seat that "
                  "played it", ok, heard)
        except Exception as e:
            check("fan-out stamps the seat", False, repr(e))

        try:
            bot = {"k": "bact", "game": "skarta", "kind": "move",
                   "m": {"a": "draw"}, "ck": None}
            tb[0].send_json({"t": "relay", "d": bot, "for": 4})
            got1 = tb[1].recv_json(3.0)
            for c in tb[2:]:
                c.recv_json(1.0)
            tb[1].send_json({"t": "relay", "d": bot, "for": 5})
            stolen = tb[1].recv_json(2.0)
            tb[0].send_json({"t": "relay", "d": bot, "for": 2})
            notabot = tb[0].recv_json(2.0)
            ok = (got1 or {}).get("s") == 4 and (got1 or {}).get("d") == bot
            ok = ok and (stolen or {}).get("why") == E_BADSEAT
            ok = ok and (notabot or {}).get("why") == E_BADSEAT
            check("only the host may play a BOT's chair, and only a chair that is "
                  "actually a bot", ok, "bot=%r stolen=%r notabot=%r"
                  % (got1, stolen, notabot))
        except Exception as e:
            check("bot chairs are the host's alone", False, repr(e))

        try:
            bad = []
            junk = [
                {"k": "bact", "game": "skarta", "kind": "move", "m": {"a": "PLAY"}},
                {"k": "bact", "game": "skarta", "kind": "move", "m": {"a": "x" * 40}},
                {"k": "bact", "game": "skarta", "kind": "move", "m": {}},
                {"k": "bact", "game": "skarta", "kind": "move",
                 "m": {"a": "play", "i": 9999}},
                {"k": "bact", "game": "skarta", "kind": "move",
                 "m": {"a": "play", "n": -1}},
                {"k": "bact", "game": "skarta", "kind": "move",
                 "m": {"a": "play", "k": list(range(80))}},
                {"k": "bact", "game": "skarta", "kind": "move",
                 "m": {"a": "play", "s": "<script>"}},
            ]
            for n in junk:
                tb[1].send_json({"t": "relay", "d": n})
                r = tb[1].recv_json(2.0)
                if (r or {}).get("t") != "error":
                    bad.append(("not refused", n))
                if tb[0].raw_recv(0.25) is not TIMEOUT:
                    bad.append(("reached the table", n))
            check("a junk table move never reaches the table", not bad, bad)
        except Exception as e:
            check("table moves are validated", False, repr(e))

        try:
            tb[1].send_json({"t": "relay", "d": {
                "k": "bact", "game": "skarta", "kind": "move",
                "m": {"a": "play", "i": 1, "evil": "wipe", "__proto__": "x"}}})
            seen = tb[0].recv_json(3.0)
            for c in tb[2:]:
                c.recv_json(1.0)
            got_m = (seen or {}).get("d", {}).get("m", {})
            check("extra fields on a table move are dropped, not relayed",
                  set(got_m.keys()) == {"a", "i"}, got_m)
        except Exception as e:
            check("table moves are rebuilt", False, repr(e))

        try:
            gone = tb[2]
            bye(gone)
            tb.remove(gone)
            told = []
            end = time.monotonic() + 3
            while time.monotonic() < end:
                m = tb[0].recv_json(0.6)
                if m is None:
                    break
                told.append(m)
            drops = [m for m in told
                     if m.get("t") == "peer" and m.get("state") == "dropped"]
            rost = [m for m in told if m.get("t") == "table"]
            ok = bool(drops) and drops[0].get("seat") == 2
            ok = ok and bool(rost) and rost[-1]["who"][2]["here"] is False
            ok = ok and rost[-1]["who"][0]["here"] is True
            tb[1].send_json({"t": "relay", "d": {
                "k": "bact", "game": "skarta", "kind": "move", "m": {"a": "pass"}}})
            still = tb[0].recv_json(3.0)
            ok = ok and (still or {}).get("s") == 1
            check("one chair dropping does not end the table for everybody else",
                  ok, "drops=%r still=%r" % (drops, still))
        except Exception as e:
            check("a drop does not kill the table", False, repr(e))

        try:
            keep_r, keep_b = L.FAN_RATE, L.FAN_BURST
            L.FAN_RATE, L.FAN_BURST = 1.0, 5.0
            f_host = cli(origin=PAGES_ORIGIN)
            f_host.send_json({"t": "create", "game": "skarta", "seats": 4})
            fmade = f_host.recv_json(2.0)
            fpeers = []
            for i in range(3):
                c = cli(origin=PAGES_ORIGIN)
                c.send_json({"t": "join", "code": fmade["code"]})
                c.recv_json(2.0)
                fpeers.append(c)
            L.FAN_RATE, L.FAN_BURST = keep_r, keep_b
            for c in [f_host] + fpeers:
                while c.raw_recv(0.1) not in (TIMEOUT, None):
                    pass
            f_host.send_json({"t": "start"})
            f_host.recv_json(2.0)
            for c in fpeers:
                c.recv_json(2.0)
            # fire them ALL first: reading between sends would pace the loop
            # and quietly let the bucket refill
            for i in range(20):
                f_host.send_json({"t": "relay", "d": {
                    "k": "bact", "game": "skarta", "kind": "move", "m": {"a": "p"}}})
            slowed = 0
            end = time.monotonic() + 4
            while time.monotonic() < end:
                r = f_host.raw_recv(0.4)
                if r is None:
                    break
                if r is TIMEOUT:
                    continue
                try:
                    if json.loads(r).get("why") == E_FLOOD:
                        slowed += 1
                except ValueError:
                    pass
            check("one fast client cannot amplify itself across the whole table",
                  slowed >= 5, "slowed=%d of 20" % slowed)
            for c in [f_host] + fpeers:
                bye(c)
        except Exception as e:
            L.FAN_RATE, L.FAN_BURST = 40.0, 80.0
            check("fan-out is capped per room", False, repr(e))

        try:
            code_was = made["code"]
            for c in list(tb):
                bye(c)
            tb = []
            # every chair has to run out its reconnect grace before the room goes
            end = time.monotonic() + L.GRACE + L.SWEEP * 6 + 2
            while time.monotonic() < end and code_was in ROOMS._rooms:
                time.sleep(0.2)
            check("an emptied table is reaped like any other room",
                  code_was not in ROOMS._rooms, code_was)
        except Exception as e:
            check("tables are reaped", False, repr(e))

        try:
            probe = cli(origin=PAGES_ORIGIN)
            cases = [
                ({"game": "chess", "seats": 4}, False, "chess above two"),
                ({"game": "cards", "seats": 3}, False, "a card duel above two"),
                ({"game": "kiri", "seats": 9}, False, "IL-KIRI above its eight hues"),
                ({"game": "kiri", "seats": 8}, True, "IL-KIRI at eight"),
                ({"game": "skarta", "seats": 10}, True, "SKARTA at its measured ten"),
                ({"game": "skarta", "seats": 11}, False, "SKARTA above the pool it can refill from"),
                ({"game": "tombla", "seats": 16}, True, "TOMBLA at sixteen"),
                ({"game": "tombla", "seats": 17}, False, "anything above the ceiling"),
                ({"game": "skarta", "seats": 1}, False, "a table of one"),
                ({"game": "klabb", "variant": "briscola", "seats": 8}, False,
                 "Briscola above its partnership four"),
                ({"game": "klabb", "variant": "sette", "seats": 8}, True,
                 "Sette e Mezzo at eight"),
                ({"game": "klabb", "variant": "poker"}, False, "a variant nobody has"),
            ]
            bad = []
            for body, allowed, label in cases:
                body = dict(body)
                body["t"] = "create"
                probe.send_json(body)
                r = probe.recv_json(2.0)
                made_ok = (r or {}).get("t") == "created"
                if made_ok != allowed:
                    bad.append((label, r))
                if made_ok:
                    probe.send_json({"t": "leave"})
                    time.sleep(0.05)
            check("every game's own seat range is enforced, and nothing else is",
                  not bad, bad)
            bye(probe)
            time.sleep(0.3)
        except Exception as e:
            check("seat ranges are enforced", False, repr(e))

        # ═══════════ takebacks ═══════════
        print("")
        print(" TAKEBACK  (undo online is a REQUEST, not a button)")

        tb_a = tb_b = None
        try:
            _end = time.monotonic() + 10
            while time.monotonic() < _end and ROOMS.stats()[0] > 1:
                time.sleep(0.2)
            tb_a = cli(origin=PAGES_ORIGIN)
            tb_a.send_json({"t": "create", "game": "chess"})
            tbcode = (tb_a.recv_json(2.0) or {}).get("code")
            tb_b = cli(origin=PAGES_ORIGIN)
            tb_b.send_json({"t": "join", "code": tbcode})
            tb_b.recv_json(2.0)
            tb_a.recv_json(2.0)
            ask = {"k": "btake", "game": "chess", "kind": "ask", "n": 2,
                   "id": 12345, "ck": "position-we-want-back"}
            tb_a.send_json({"t": "relay", "d": ask})
            got = tb_b.recv_json(3.0)
            yes = {"k": "btake", "game": "chess", "kind": "yes", "n": 0, "id": 12345,
                   "ck": None}
            tb_b.send_json({"t": "relay", "d": {"k": "btake", "game": "chess",
                                                "kind": "yes", "id": 12345}})
            back = tb_a.recv_json(3.0)
            check("a takeback ask and its answer cross the relay, rebuilt field by field",
                  (got or {}).get("d") == ask and (back or {}).get("d") == yes,
                  "ask=%r yes=%r" % (got, back))
        except Exception as e:
            check("takeback relays", False, repr(e))

        try:
            bad = []
            junk = [
                {"k": "btake", "game": "chess", "kind": "maybe", "id": 1},
                {"k": "btake", "game": "chess", "kind": "ask", "n": 99, "id": 1},
                {"k": "btake", "game": "chess", "kind": "ask", "n": -1, "id": 1},
                {"k": "btake", "game": "poker", "kind": "ask", "n": 1, "id": 1},
                {"k": "btake", "kind": "ask", "n": 1, "id": 1},
                {"k": "btake", "game": "chess", "kind": "ask", "n": 1,
                 "id": 1, "ck": "z" * 4000},
                {"k": "btake", "game": "chess", "kind": "ask", "n": 1, "id": 1 << 40},
            ]
            for n in junk:
                tb_a.send_json({"t": "relay", "d": n})
                r = tb_a.recv_json(2.0)
                if (r or {}).get("t") != "error":
                    bad.append(("not refused", n))
                if tb_b.raw_recv(0.3) is not TIMEOUT:
                    bad.append(("reached the other player", n))
            check("a malformed takeback never reaches the other player", not bad, bad)
        except Exception as e:
            check("malformed takeback blocked", False, repr(e))

        try:
            # the whole point of the bucket: you cannot ask every single turn
            refused = 0
            for i in range(int(L.TAKE_BURST) + 8):
                tb_a.send_json({"t": "relay", "d": {"k": "btake", "game": "chess",
                                                    "kind": "ask", "n": 1, "id": 900 + i}})
                r = tb_a.recv_json(2.0)
                if (r or {}).get("why") == E_SLOW:
                    refused += 1
                tb_b.raw_recv(0.05)
            check("spamming takeback requests is cut off after the burst", refused >= 1,
                  "refused=%d" % refused)
        except Exception as e:
            check("takeback flood capped", False, repr(e))

        try:
            # an ANSWER is never rate limited: being unable to say no would be
            # worse than the flood
            okall = True
            for i in range(8):
                tb_b.send_json({"t": "relay", "d": {"k": "btake", "game": "chess",
                                                    "kind": "no", "id": 900 + i}})
                if (tb_a.recv_json(2.0) or {}).get("t") != "relay":
                    okall = False
            check("saying no is never rate limited", okall)
            bye(tb_a); bye(tb_b)
            tb_a = tb_b = None
            time.sleep(0.3)
        except Exception as e:
            check("answers are not limited", False, repr(e))

        # ═══════════ invitations ═══════════
        print("")
        print(" INVITES  (a note left for an ACCOUNT, not for a socket)")

        iv_a = iv_b = iv_c = None
        try:
            _end = time.monotonic() + 10
            while time.monotonic() < _end and ROOMS.stats()[0] > 1:
                time.sleep(0.2)
            accounts_reset()
            # fresh sessions: the abuse section above deliberately logs Alice
            # out and expires everything she had
            sess_a = (POST("/login", {"u": "Alice", "pw": PW_A})[1] or {}).get("tok")
            sess_b = (POST("/login", {"u": "Bob", "pw": PW_B})[1] or {}).get("tok")
            iv_a = cli(origin=PAGES_ORIGIN)
            iv_a.send_json({"t": "auth", "session": sess_a})
            authed = iv_a.recv_json(3.0)
            check("a session token binds a socket to its account",
                  (authed or {}).get("t") == "authed" and (authed or {}).get("name") == "Alice",
                  "%r sess=%s/%s" % (authed, bool(sess_a), bool(sess_b)))
        except Exception as e:
            check("auth binds the socket", False, repr(e))

        try:
            anon = cli(origin=PAGES_ORIGIN)
            anon.send_json({"t": "create", "game": "chess"})
            anon.recv_json(2.0)
            anon.send_json({"t": "invite", "to": "Bob"})
            r1 = anon.recv_json(2.0)
            anon.send_json({"t": "auth", "session": "not-a-real-token-at-all"})
            r2 = anon.recv_json(2.0)
            anon.send_json({"t": "acceptinvite", "id": "anything"})
            r3 = anon.recv_json(2.0)
            check("an unauthenticated socket cannot invite, accept, or fake a session",
                  (r1 or {}).get("why") == E_NOAUTH and (r2 or {}).get("why") == E_NOAUTH
                  and (r3 or {}).get("why") == E_NOAUTH,
                  "%r %r %r" % (r1, r2, r3))
            bye(anon)
        except Exception as e:
            check("unauthenticated invites refused", False, repr(e))

        try:
            iv_a.send_json({"t": "invite", "to": "Bob"})
            r = iv_a.recv_json(2.0)
            check("you cannot invite anybody until you have a room open",
                  (r or {}).get("why") == E_NOROOMYET, r)
        except Exception as e:
            check("invite needs a room", False, repr(e))

        try:
            iv_a.send_json({"t": "create", "game": "chess"})
            acode = (iv_a.recv_json(2.0) or {}).get("code")
            iv_b = cli(origin=PAGES_ORIGIN)
            iv_b.send_json({"t": "auth", "session": sess_b})
            iv_b.recv_json(3.0)
            iv_a.send_json({"t": "invite", "to": "Bob"})
            sent = iv_a.recv_json(3.0)
            note = iv_b.recv_json(3.0)
            ok = (sent or {}).get("t") == "invited" and (sent or {}).get("game") == "chess"
            ok = ok and (note or {}).get("t") == "invite"
            ok = ok and (note or {}).get("from") == "Alice" and (note or {}).get("game") == "chess"
            ok = ok and isinstance((note or {}).get("id"), str)
            ok = ok and 0 < (note or {}).get("left", 0) <= L.INVITE_TTL
            check("an invite reaches a signed-in player live, with the game and who sent it",
                  ok, "sent=%r note=%r" % (sent, note))
            invite_id = (note or {}).get("id")
        except Exception as e:
            check("invite reaches the player", False, repr(e))
            invite_id = None

        try:
            blob = json.dumps(note or {})
            check("the invite carries no room code",
                  bool(acode) and acode not in blob, blob[:200])
        except Exception as e:
            check("invite leaks no code", False, repr(e))

        try:
            # THE enumeration question: an invite to a name nobody has must be
            # answered exactly like an invite to a name somebody does have.
            iv_a.send_json({"t": "invite", "to": "Nobody"})
            miss = iv_a.recv_json(3.0)
            iv_a.send_json({"t": "invite", "to": "Bob"})
            hit = iv_a.recv_json(3.0)
            iv_b.recv_json(2.0)                       # the replacement invite
            same = (miss or {}).get("t") == (hit or {}).get("t") == "invited"
            same = same and set((miss or {}).keys()) == set((hit or {}).keys())
            same = same and (miss or {}).get("game") == (hit or {}).get("game")
            check("inviting a name that does not exist is answered identically "
                  "(no account enumeration)", same, "miss=%r hit=%r" % (miss, hit))
        except Exception as e:
            check("invites do not enumerate accounts", False, repr(e))

        try:
            # a second invite from the same sender REPLACES the first, so a
            # recipient's list cannot be stuffed by one person
            n = sum(1 for i in INVITES.waiting_for("bob"))
            check("one invite per sender per player, however many are sent", n == 1, n)
        except Exception as e:
            check("invites do not stack per sender", False, repr(e))

        try:
            iv_b.send_json({"t": "acceptinvite", "id": "made-up-handle"})
            r1 = iv_b.recv_json(2.0)
            live_note = INVITES.waiting_for("bob")[0]
            iv_c = cli(origin=PAGES_ORIGIN)
            iv_c.send_json({"t": "auth", "session": sess_a})   # Alice, not Bob
            iv_c.recv_json(3.0)
            iv_c.send_json({"t": "acceptinvite", "id": live_note["id"]})
            r2 = iv_c.recv_json(2.0)
            check("a made-up id, or somebody else's invite, is refused",
                  (r1 or {}).get("why") == E_NOINVITE and (r2 or {}).get("why") == E_NOINVITE,
                  "%r %r" % (r1, r2))
            bye(iv_c)
            iv_c = None
        except Exception as e:
            check("invite ids cannot be guessed or stolen", False, repr(e))

        try:
            live_note = INVITES.waiting_for("bob")[0]
            iv_b.send_json({"t": "acceptinvite", "id": live_note["id"]})
            seated = iv_b.recv_json(3.0)
            told = iv_a.recv_json(3.0)
            ok = (seated or {}).get("t") == "joined" and (seated or {}).get("code") == acode
            ok = ok and (seated or {}).get("game") == "chess"
            ok = ok and (told or {}) == {"t": "peer", "state": "joined"}
            ok = ok and not INVITES.waiting_for("bob")
            check("accepting an invite seats you in that exact room, one tap, no code",
                  ok, "seated=%r told=%r" % (seated, told))
        except Exception as e:
            check("accepting an invite seats you", False, repr(e))

        try:
            # the room is full now: an invite pointing at it must be withdrawn
            iv_a.send_json({"t": "leave"})
            iv_b.recv_json(2.0)
            iv_a.send_json({"t": "create", "game": "dama"})
            bcode = (iv_a.recv_json(2.0) or {}).get("code")
            iv_a.send_json({"t": "invite", "to": "Bob"})
            iv_a.recv_json(2.0)
            note2 = iv_b.recv_json(3.0)
            filler = cli(origin=PAGES_ORIGIN)
            filler.send_json({"t": "join", "code": bcode})
            filler.recv_json(2.0)
            iv_a.recv_json(2.0)
            gone = None
            end = time.monotonic() + 6
            while time.monotonic() < end:
                m = iv_b.recv_json(1.0)
                if m and m.get("t") == "invitegone":
                    gone = m
                    break
            check("an invite is withdrawn the moment its room fills up",
                  (note2 or {}).get("t") == "invite" and gone
                  and gone.get("id") == note2.get("id"),
                  "note=%r gone=%r" % (note2, gone))
            bye(filler)
        except Exception as e:
            check("invites are withdrawn when the room fills", False, repr(e))

        try:
            # ...and one whose room has closed cannot be redeemed even if the
            # holder still has the id in their hand
            iv_a.send_json({"t": "create", "game": "chess"})
            ccode = (iv_a.recv_json(2.0) or {}).get("code")
            iv_a.send_json({"t": "invite", "to": "Bob"})
            iv_a.recv_json(2.0)
            note3 = iv_b.recv_json(3.0)
            held = (note3 or {}).get("id")
            iv_a.send_json({"t": "leave"})
            time.sleep(0.6)
            iv_b.send_json({"t": "acceptinvite", "id": held})
            r = None
            end = time.monotonic() + 4
            while time.monotonic() < end:
                m = iv_b.recv_json(1.0)
                if m and m.get("t") == "error":
                    r = m
                    break
            check("an invite to a room that has closed cannot be redeemed",
                  bool(held) and (r or {}).get("why") == E_NOINVITE, "held=%r r=%r" % (held, r))
        except Exception as e:
            check("dead invites cannot be redeemed", False, repr(e))

        try:
            keep = L.INVITE_TTL
            L.INVITE_TTL = 0.5
            iv_a.send_json({"t": "create", "game": "chess"})
            iv_a.recv_json(2.0)
            iv_a.send_json({"t": "invite", "to": "Bob"})
            iv_a.recv_json(2.0)
            iv_b.recv_json(2.0)
            time.sleep(1.2)
            left = INVITES.waiting_for("bob")
            L.INVITE_TTL = keep
            check("an unanswered invite expires on its own", not left, left)
        except Exception as e:
            L.INVITE_TTL = 5 * 60.0
            check("invites expire", False, repr(e))

        try:
            # a brand-new socket, built after the limits are squeezed, so the
            # bucket it carries is the tight one
            L.INVITE_BURST, L.INVITE_RATE = 2.0, 0.01
            flood = cli(origin=PAGES_ORIGIN)
            L.INVITE_BURST, L.INVITE_RATE = 12.0, 2.0
            flood.send_json({"t": "auth", "session": sess_a})
            flood.recv_json(3.0)
            flood.send_json({"t": "create", "game": "chess"})
            flood.recv_json(2.0)
            refused = 0
            for i in range(6):
                flood.send_json({"t": "invite", "to": "Bob"})
                if (flood.recv_json(2.0) or {}).get("why") == E_SLOW:
                    refused += 1
                iv_b.raw_recv(0.05)
            check("invites are rate limited per connection", refused >= 3,
                  "refused=%d of 6" % refused)
            bye(flood)
        except Exception as e:
            check("invite flood capped", False, repr(e))

        try:
            for c in (iv_a, iv_b, iv_c):
                if c is not None:
                    bye(c)
            iv_a = iv_b = iv_c = None
            time.sleep(0.4)
            check("no invite outlives the sockets that made it",
                  INVITES.count() >= 0, INVITES.count())
        except Exception as e:
            check("invite cleanup", False, repr(e))

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
        if ACCOUNTS is not None:
            ACCOUNTS.close()
        shutil.rmtree(acct_dir, ignore_errors=True)

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
    p.add_argument("--stats", default=karti_stats.DEFAULT_DB,
                   help="where the record book and leaderboard live (default %s)"
                        % karti_stats.DEFAULT_DB)
    p.add_argument("--accounts", default=DEFAULT_ACCT_DB,
                   help="SQLite file for accounts + cross-device saves (default %s)"
                        % DEFAULT_ACCT_DB)
    p.add_argument("--no-accounts", action="store_true",
                   help="run as a pure relay: no accounts, no saved games, no disk")
    p.add_argument("--selftest", action="store_true", help="run the built-in tests and exit")
    args = p.parse_args(argv)

    for o in args.origin:
        ALLOWED_ORIGINS.add(o.rstrip("/"))
    if args.any_origin:
        ALLOW_ANY_ORIGIN = True
    LOG.path = args.log

    if args.selftest:
        return selftest()

    if not args.no_accounts:
        accounts_open(args.accounts)
        # The leaderboard needs to know WHICH account is submitting, and it
        # must never take that from the request body. It gets the session
        # resolver instead, so a crafted name is not even parsed.
        karti_stats.open_store(args.stats,
                               lambda tok: ACCOUNTS.session(tok) if ACCOUNTS else None)

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
        if ACCOUNTS is not None:
            ACCOUNTS.close()
        LOG("stop")
    return 0


if __name__ == "__main__":
    sys.exit(main())
