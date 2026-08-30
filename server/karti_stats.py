#!/usr/bin/env python3
"""
KARTI — the leaderboard.

A SEPARATE, SELF-CONTAINED MODULE. It has its own routes, its own SQLite
file and its own tests, and it imports nothing from karti_server.py, so
karti_server.py never has to be edited beyond the four lines that mount it
(see MOUNTING, below). Deleting this file, or never mounting it, leaves the
relay exactly as it was.

WHAT IT IS FOR
    Every game in KARTI reports its results into js/stats.js, which keeps
    them on the phone. That is the whole feature for one player. The moment
    two people want to compare, somebody has to hold the numbers, and that
    is this: each account's per-game record, and a ranking read out of it.

ROUTES  (POST, JSON in and JSON out, mounted under /karti/stats)

    POST /karti/stats/push   {tok, games:{<id>:{p,w,l,d,bs,bm,bt,sc}, ...}}
        -> 200 {ok:true, at, games:<n>}
        Replaces this account's whole table. The account is the one the
        TOKEN belongs to; there is no field in the request that names a
        user, so a player physically cannot file a result against somebody
        else. That is the entire authorisation model and it is enough.
        It also feeds THIS WEEK: the difference between this push and the
        one before it is added to the current week's bucket. See
        Store._week_credit().

    POST /karti/stats/board  {game?:"all"|<id>, tok?, period?:"all"|"week"}
        -> 200 {ok:true, game, rows:[{u,name,p,w,l,d,bs}], you?, at, total}
        The top TOP_N by wins, then by fewest losses. `tok` is optional and
        only used to tell the caller where THEY are — it is never needed to
        read the board.
        period="week" ranks only play since the local Sunday, and answers
        additionally with {period, week, weekly:{rows,you}}. `since` may be
        sent alongside and is ignored on purpose — the server's clock owns
        the week boundary, because a client's does not (week_start()).

    GET  /karti/stats/board?game=chess&period=week
        The same answer for a browser that would rather not POST.

    GET  /karti/stats/health
        -> 200 {ok, accounts, rows}

WHAT AN ATTACKER CAN AND CANNOT DO
    This is a private group of friends, not a public ladder, so the goal is
    "one bad submission cannot spoil the board for everyone else", not
    "nobody can ever cheat". A player with an account CAN lie about their
    own numbers — they hold the client. What they cannot do:

      · file results as another player. The token names the account; the
        request has no user field at all, and the display name shown on the
        board is read from the ACCOUNTS table by the resolver, never from
        the submission. A crafted `name` is not even parsed.
      · corrupt anybody else's row. One account writes one account's rows,
        inside a transaction, and every field is re-checked and re-built
        into a fresh tuple before it goes near the database.
      · make the board unreadable. Every counter is bounded (MAX_COUNT),
        every id must match ID_RE, a submission may carry at most MAX_GAMES
        entries, and the body itself is size-capped by the caller before we
        ever see it. Anything out of range is a 400 for that submission and
        nothing is written.
      · claim an impossible record. p must equal w + l + d, and bs (the best
        run) cannot exceed w. Numbers that disagree with themselves are
        refused rather than stored and shown.
      · fill the disk. MAX_ACCOUNTS rows for accounts and MAX_GAMES per
            account, both enforced on write.
      · hammer it. Two token buckets: one per account for push, one per
        client address for board.

    Names are additionally escaped at the point of display in js/stats.js,
    because a defence that lives in one place lives in no places.

MOUNTING  — the exact lines to add to server/karti_server.py

    1) beside the other imports near the top:

           import karti_stats

    2) in KartiHandler.do_POST, ABOVE the final `self.reply(405, ...)`:

           if path.startswith("/stats/"):
               karti_stats.handle_post(self, path[len("/stats/"):])
               return

    3) in KartiHandler.do_GET, as one more `elif` before the final `else`:

           elif path.startswith("/stats/"):
               karti_stats.handle_get(self, path[len("/stats/"):], self.path)

    4) in main(), just after `accounts_open(args.accounts)`:

           karti_stats.open_store(args.stats,
                                  lambda tok: ACCOUNTS.session(tok) if ACCOUNTS else None)

       with, beside the other p.add_argument lines:

           p.add_argument("--stats", default=karti_stats.DEFAULT_DB,
                          help="SQLite file for the leaderboard (default %s)"
                               % karti_stats.DEFAULT_DB)

    Nothing else changes. handle_post/handle_get use only the handler helpers
    that already exist (route/read_json_body/reply/acct_fail/cors), and if
    open_store was never called every route answers 503 "The leaderboard is
    switched off." rather than failing.

TESTS
    python3 server/karti_stats.py --selftest
"""

from __future__ import annotations

import datetime
import http.server
import json
import os
import re
import sqlite3
import sys
import threading
import time
import urllib.parse

# ── limits ───────────────────────────────────────────────────────────────────

DEFAULT_DB = "/var/lib/karti/stats.db"

MAX_GAMES = 40  # rows one account may hold
MAX_ACCOUNTS = 2000  # accounts the board will carry at all
MAX_COUNT = 1_000_000  # ceiling on p / w / l / d / bs / bm
MAX_SCORE = 100_000_000  # ceiling on sc (money in IL-KIRI gets large)
MAX_TIME_MS = 86_400_000  # a day. bt above this is a lie or a bug.
TOP_N = 25  # rows a board answer carries
MAX_NAME = 24  # display names are already capped at 16 upstream
WEEKS_KEPT = 8  # weekly buckets older than this are pruned on write

PERIODS = ("all", "week")

PUSH_RATE = 1.0 / 20.0  # one push per twenty seconds, sustained
PUSH_BURST = 4.0
BOARD_RATE = 2.0  # per client address
BOARD_BURST = 12.0
BUCKETS_MAX = 4000  # bounded memory; cleared wholesale when it fills

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,23}$")

# Which submitted field is which, and what it is allowed to be. Order matters
# only for readability; the tuple written to the database is rebuilt from this
# table, so a key the client invented never reaches SQL.
FIELDS = (
    ("p", MAX_COUNT),
    ("w", MAX_COUNT),
    ("l", MAX_COUNT),
    ("d", MAX_COUNT),
    ("bs", MAX_COUNT),
    ("bm", MAX_COUNT),
    ("bt", MAX_TIME_MS),
    ("sc", MAX_SCORE),
)

E_OFF = "The leaderboard is switched off."
E_BAD = "That was not something this board understands."
E_TOK = "Log in again."
E_SLOW = "Slow down."
E_FULL = "The board is full."


class Reject(Exception):
    """A submission that will not be stored. Never carries a reason a caller
    could use to probe the server; the route turns it into one flat 400."""


# ── the week ─────────────────────────────────────────────────────────────────


def week_start(now: float | None = None) -> int:
    """Epoch seconds of the Sunday 00:00 that opened the week `now` is in.

    THE SERVER'S CLOCK DECIDES, NEVER THE CLIENT'S. js/stats.js sends a
    `since` alongside `period:'week'` and this module deliberately ignores it:
    it is forgeable, and one phone with a wrong clock would otherwise write
    into a bucket everybody else reads. The client's own weekStart() is
    `setHours(0,0,0,0)` then back to `getDay() === 0`, i.e. LOCAL Sunday
    midnight -- so this is local too, and the Pi and the phones are on the
    same island. The two agree; only this one is authoritative.

    weekday() is Mon=0..Sun=6, so (weekday() + 1) % 7 is "days since Sunday".
    Going through datetime rather than arithmetic on the epoch is what keeps
    this right across a DST change: subtracting 7*86400 from a Sunday
    midnight lands an hour out twice a year, and a week boundary an hour out
    is a week that resets at the wrong moment."""
    ts = time.time() if now is None else float(now)
    d = datetime.datetime.fromtimestamp(ts)
    d = d.replace(hour=0, minute=0, second=0, microsecond=0)
    d -= datetime.timedelta(days=(d.weekday() + 1) % 7)
    return int(d.timestamp())


def prev_week_start(now: float | None = None) -> int:
    """The bucket key of the LAST COMPLETED week -- what crowns() awards from.

    NOT `week_start(now) - 7*86400`. That is exactly the DST bug week_start()'s
    own docstring warns about: twice a year it lands an hour off a real Sunday
    midnight, and because the value is compared for EQUALITY against a stored
    `wk`, an hour off does not mean a slightly wrong week -- it means the query
    matches no rows at all and nobody is crowned that week. Stepping back half
    a day from this week's opening lands inside last Saturday whatever the
    clocks did, and re-running week_start() snaps that to the real boundary."""
    return week_start(week_start(now) - 43200)


# ── rate limiting ────────────────────────────────────────────────────────────


class Bucket:
    """Token bucket. take() is False when the caller is going too fast.
    Deliberately a copy of the one in karti_server.py rather than an import:
    this module is meant to be droppable, and eight lines is a cheap price."""

    __slots__ = ("rate", "cap", "tokens", "ts")

    def __init__(self, rate: float, cap: float):
        self.rate = float(rate)
        self.cap = float(cap)
        self.tokens = float(cap)
        self.ts = time.monotonic()

    def take(self, n: float = 1.0) -> bool:
        now = time.monotonic()
        self.tokens = min(self.cap, self.tokens + (now - self.ts) * self.rate)
        self.ts = now
        if self.tokens < n:
            return False
        self.tokens -= n
        return True


_BUCKET_LOCK = threading.Lock()
_BUCKETS: dict[str, Bucket] = {}


def _allowed(kind: str, who: str, rate: float, burst: float) -> bool:
    key = kind + ":" + str(who or "?")
    with _BUCKET_LOCK:
        if len(_BUCKETS) > BUCKETS_MAX:
            # Bounded memory beats perfect fairness. Everybody gets a fresh
            # allowance; nobody gets an unbounded dictionary.
            _BUCKETS.clear()
        b = _BUCKETS.get(key)
        if b is None:
            b = Bucket(rate, burst)
            _BUCKETS[key] = b
        return b.take()


def buckets_reset() -> None:
    """Only the self-test uses this."""
    with _BUCKET_LOCK:
        _BUCKETS.clear()


# ── validation ───────────────────────────────────────────────────────────────


def _int(value, cap: int) -> int:
    """A JSON number that is really a whole number in range, or Reject.
    bool is checked explicitly because in Python True is an int, and `True`
    arriving where a win count belongs is a client bug worth refusing."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise Reject("int")
    if value < 0 or value > cap:
        raise Reject("range")
    return value


def clean_games(raw) -> dict[str, tuple[int, ...]]:
    """Take whatever arrived and hand back a table this module built itself.

    Nothing is passed through: every id is matched against ID_RE, every value
    is re-typed and re-bounded, and the row is assembled as a fresh tuple in a
    fixed order. A key the client invented cannot survive this, and neither
    can a string that was hoping to be treated as a number."""
    if not isinstance(raw, dict):
        raise Reject("games")
    if len(raw) > MAX_GAMES:
        raise Reject("too-many")
    out: dict[str, tuple[int, ...]] = {}
    for gid, row in raw.items():
        if not isinstance(gid, str) or not ID_RE.match(gid):
            raise Reject("id")
        if not isinstance(row, dict):
            raise Reject("row")
        vals = tuple(_int(row.get(name, 0), cap) for name, cap in FIELDS)
        p, w, l, d, bs, bm, bt, sc = vals
        # Two invariants a real client cannot break and a hand-written
        # submission usually does. They are the difference between a board
        # that can be read and one full of nonsense.
        if p != w + l + d:
            raise Reject("sums")
        if bs > w:
            raise Reject("streak")
        if p == 0:
            continue  # nothing played: not a row, not an error
        out[gid] = vals
    return out


# ── storage ──────────────────────────────────────────────────────────────────


class Store:
    """One SQLite file, opened once, guarded by one lock.

    check_same_thread=False + an explicit lock, because ThreadingHTTPServer
    hands every request to a different thread and sqlite3 objects are not
    thread-safe on their own."""

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
            CREATE TABLE IF NOT EXISTS players(
                uname TEXT PRIMARY KEY,
                name  TEXT NOT NULL,
                at    REAL NOT NULL,
                -- THE LOOK THEY CHOSE. The client has always pushed these
                -- beside the name and this table has always thrown them away,
                -- so a leaderboard drew every player from a hash of their
                -- name -- a stable default, and not the face they picked. A
                -- photograph is separate (the avatar store, keyed by uname);
                -- this is for the many players who have no photograph at all.
                -- Two short opaque ids. Nothing here interprets them.
                av    TEXT NOT NULL DEFAULT '',
                bd    TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS rows(
                uname TEXT NOT NULL,
                game  TEXT NOT NULL,
                p INTEGER NOT NULL, w INTEGER NOT NULL,
                l INTEGER NOT NULL, d INTEGER NOT NULL,
                bs INTEGER NOT NULL, bm INTEGER NOT NULL,
                bt INTEGER NOT NULL, sc INTEGER NOT NULL,
                PRIMARY KEY(uname, game)
            );
            CREATE INDEX IF NOT EXISTS rows_by_game ON rows(game, w DESC, l ASC);
            -- THE WEEKLY BUCKET.
            -- `rows` above is CUMULATIVE: one row per account per game, holding
            -- the totals of all time. That is what the client pushes -- totals,
            -- not match events -- so there is nothing in it to slice by date,
            -- and for a long time the THIS WEEK tab simply re-showed the
            -- all-time board. This table is the missing half: put() diffs each
            -- push against the totals already stored and adds only the
            -- DIFFERENCE here, under the week it arrived in. No timestamps per
            -- match are needed, and no client is trusted to date its own play.
            -- bm/bt/sc are deliberately absent: a "best time" or a bankroll is
            -- not a thing you can difference. bs (best streak) is absent for
            -- the same reason -- a streak inside one week cannot be derived
            -- from two cumulative snapshots, and a weekly row that quietly
            -- showed the ALL-TIME streak would be a lie on a weekly board.
            CREATE TABLE IF NOT EXISTS wrows(
                uname TEXT NOT NULL,
                game  TEXT NOT NULL,
                wk    INTEGER NOT NULL,   -- week_start(), local Sunday 00:00
                p INTEGER NOT NULL, w INTEGER NOT NULL,
                l INTEGER NOT NULL, d INTEGER NOT NULL,
                PRIMARY KEY(uname, game, wk)
            );
            CREATE INDEX IF NOT EXISTS wrows_by_week ON wrows(wk, game, w DESC);
            """
        )
        # ADD THE COLUMNS TO A DATABASE THAT PREDATES THEM. CREATE TABLE IF
        # NOT EXISTS does nothing to a table that already exists, so without
        # this the live board would keep dropping the look for ever.
        for col in ("av", "bd"):
            try:
                self.db.execute(
                    "ALTER TABLE players ADD COLUMN %s TEXT NOT NULL DEFAULT ''" % col)
            except sqlite3.OperationalError:
                pass            # already there
        self.db.commit()
        if path != ":memory:":
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass

    def close(self) -> None:
        with self.lock:
            try:
                self.db.close()
            except sqlite3.Error:
                pass

    # -- writing --------------------------------------------------------

    @staticmethod
    def _look(v):
        """A face or border id, or nothing.

        Same rule the room roster uses: these end up in other people's DOM,
        so a value that can carry a quote is a value that can break out of an
        HTML attribute on somebody else's phone."""
        v = str(v or "")[:32]
        return v if v and all(c.isalnum() or c in "._-" for c in v) else ""

    def put(self, uname: str, name: str, games: dict[str, tuple[int, ...]],
            av: str = "", bd: str = "", now: float | None = None) -> int:
        """Replace one account's table. Returns how many rows it now has.

        One transaction: an interrupted push leaves the previous table intact
        rather than half of a new one. The display name is whatever the caller
        was told by the accounts database — it is not, and cannot be, a value
        from the request body.

        THE WEEKLY BUCKET IS WRITTEN HERE, and it is written from the
        DIFFERENCE between this push and the one before it. See _week_credit()
        for the three cases that difference can be.

        `now` exists so the self-test can push a week apart without sleeping
        for a week. Nothing in the request can reach it — the route never
        passes it — so it is a test seam, not an input."""
        now = time.time() if now is None else float(now)
        name = str(name or uname)[:MAX_NAME]
        with self.lock:
            known = self.db.execute(
                "SELECT 1 FROM players WHERE uname=?", (uname,)
            ).fetchone()
            if known is None:
                n = self.db.execute("SELECT COUNT(*) FROM players").fetchone()[0]
                if n >= MAX_ACCOUNTS:
                    return -1
            # The totals as they stand BEFORE this push overwrites them. Read
            # inside the lock and before the DELETE below, because it is the
            # only thing that says what is new about what just arrived.
            before = {
                r[0]: (int(r[1]), int(r[2]), int(r[3]), int(r[4]))
                for r in self.db.execute(
                    "SELECT game,p,w,l,d FROM rows WHERE uname=?", (uname,)
                )
            }
            self.db.execute("BEGIN")
            try:
                self.db.execute(
                    "INSERT INTO players(uname,name,at,av,bd) VALUES(?,?,?,?,?)"
                    " ON CONFLICT(uname) DO UPDATE SET name=excluded.name,"
                    "   at=excluded.at, av=excluded.av, bd=excluded.bd",
                    (uname, name, now, self._look(av), self._look(bd)),
                )
                self.db.execute("DELETE FROM rows WHERE uname=?", (uname,))
                self.db.executemany(
                    "INSERT INTO rows(uname,game,p,w,l,d,bs,bm,bt,sc)"
                    " VALUES(?,?,?,?,?,?,?,?,?,?)",
                    [(uname, gid) + vals for gid, vals in games.items()],
                )
                self._week_credit(uname, games, before, now)
                self._prune_weeks(now)
                self.db.execute("COMMIT")
            except sqlite3.Error:
                self.db.execute("ROLLBACK")
                raise
        return len(games)

    # -- the weekly half ------------------------------------------------

    def _week_credit(self, uname: str, games: dict[str, tuple[int, ...]],
                     before: dict[str, tuple[int, int, int, int]],
                     now: float) -> None:
        """Add this push's NEW play to the current week's bucket.

        Called inside put()'s transaction and inside its lock. Three cases,
        and the two that credit nothing are the ones that matter:

        1. WE HAVE NEVER SEEN THIS GAME FROM THIS ACCOUNT. Credit nothing;
           this push is the baseline. Without it, the first push after this
           shipped would dump a player's whole lifetime record into "this
           week" — every established player would appear to have played
           four hundred games since Sunday. The cost is that the very first
           result in a game, once ever, is not on the weekly board. That is
           the right trade: one missing game beats a corrupted board.

        2. A COUNTER WENT BACKWARDS. Somebody reset their stats, or signed in
           on a phone holding an older save, so the totals shrank. That is not
           a week's play and its difference is meaningless, so credit nothing
           and let this push re-baseline. Checked on EVERY counter, not just
           `p`: a save can restore a lower `w` under an equal `p`.

        3. IT WENT UP. Credit exactly the difference. p is recomputed as
           w+l+d rather than differenced on its own, so the weekly row obeys
           the same p == w+l+d invariant clean_games() enforces on the way in
           even if a client ever pushed a p that disagreed with its parts."""
        wk = week_start(now)
        add = []
        for gid, vals in games.items():
            old = before.get(gid)
            if old is None:
                continue                              # case 1: baseline
            p, w, l, d = vals[0], vals[1], vals[2], vals[3]
            dw, dl, dd = w - old[1], l - old[2], d - old[3]
            if dw < 0 or dl < 0 or dd < 0 or (p - old[0]) < 0:
                continue                              # case 2: went backwards
            if not (dw or dl or dd):
                continue                              # nothing new
            add.append((uname, gid, wk, dw + dl + dd, dw, dl, dd))
        if not add:
            return
        self.db.executemany(
            "INSERT INTO wrows(uname,game,wk,p,w,l,d) VALUES(?,?,?,?,?,?,?)"
            " ON CONFLICT(uname,game,wk) DO UPDATE SET"
            "   p = p + excluded.p, w = w + excluded.w,"
            "   l = l + excluded.l, d = d + excluded.d",
            add,
        )

    def _prune_weeks(self, now: float) -> None:
        """Drop buckets older than WEEKS_KEPT. Bounded storage is the whole
        point: without this, wrows grows for ever at one row per account per
        game per week. Runs on write, so it needs no scheduler — the one thing
        this module cannot have, being a request handler and nothing else."""
        cutoff = week_start(now) - (WEEKS_KEPT * 7 * 86400)
        self.db.execute("DELETE FROM wrows WHERE wk < ?", (cutoff,))

    def forget(self, uname: str) -> None:
        with self.lock:
            self.db.execute("BEGIN")
            try:
                self.db.execute("DELETE FROM rows WHERE uname=?", (uname,))
                # the weekly bucket goes too — forgetting an account that left
                # a week's play behind would put a nameless row on the board,
                # because board() joins wrows to players to get the name.
                self.db.execute("DELETE FROM wrows WHERE uname=?", (uname,))
                self.db.execute("DELETE FROM players WHERE uname=?", (uname,))
                self.db.execute("COMMIT")
            except sqlite3.Error:
                self.db.execute("ROLLBACK")
                raise

    # -- reading --------------------------------------------------------

    def board(self, game: str, me: str | None = None,
              period: str = "all", now: float | None = None) -> dict:
        """Top TOP_N for one game, or summed across every game for 'all'.

        Ranked by wins, then by FEWEST losses, then by most played, then by
        name so the order is stable between two identical records. The whole
        ladder is ranked before it is cut, so `you` is a real position and not
        a position within the page.

        period='week' ranks THIS WEEK's play only, out of the wrows bucket
        put() fills. It is the same query against a different table with one
        extra WHERE, and the same sort — so a weekly board cannot rank by
        different rules than the all-time one. `bs` comes back 0 on a weekly
        row because a within-the-week streak is not derivable from cumulative
        snapshots; js/stats.js only prints "best run" when bs > 1, so the row
        reads as plain "N% won" rather than claiming a streak it does not
        know."""
        weekly = (period == "week")
        wk = week_start(now) if weekly else 0
        with self.lock:
            if weekly and game == "all":
                sql = (
                    "SELECT r.uname, p.name,"
                    " SUM(r.p), SUM(r.w), SUM(r.l), SUM(r.d), 0,"
                    " p.av, p.bd"
                    " FROM wrows r JOIN players p ON p.uname = r.uname"
                    " WHERE r.wk=? GROUP BY r.uname"
                )
                cur = self.db.execute(sql, (wk,))
            elif weekly:
                sql = (
                    "SELECT r.uname, p.name, r.p, r.w, r.l, r.d, 0,"
                    " p.av, p.bd"
                    " FROM wrows r JOIN players p ON p.uname = r.uname"
                    " WHERE r.wk=? AND r.game=?"
                )
                cur = self.db.execute(sql, (wk, game))
            elif game == "all":
                sql = (
                    "SELECT r.uname, p.name,"
                    " SUM(r.p), SUM(r.w), SUM(r.l), SUM(r.d), MAX(r.bs),"
                    " p.av, p.bd"
                    " FROM rows r JOIN players p ON p.uname = r.uname"
                    " GROUP BY r.uname"
                )
                cur = self.db.execute(sql)
            else:
                sql = (
                    "SELECT r.uname, p.name, r.p, r.w, r.l, r.d, r.bs,"
                    " p.av, p.bd"
                    " FROM rows r JOIN players p ON p.uname = r.uname"
                    " WHERE r.game=?"
                )
                cur = self.db.execute(sql, (game,))
            raw = cur.fetchall()

        table = [
            {
                "u": row[0],
                "name": str(row[1])[:MAX_NAME],
                "p": int(row[2] or 0),
                "w": int(row[3] or 0),
                "l": int(row[4] or 0),
                "d": int(row[5] or 0),
                "bs": int(row[6] or 0),
                # the face and ring they chose, so the board draws PEOPLE
                # rather than a hash of their names. Empty for anyone who
                # has not pushed since this shipped; the client falls back
                # to what it always drew.
                "av": str(row[7] or ""),
                "bd": str(row[8] or ""),
            }
            for row in raw
        ]
        table.sort(key=lambda r: (-r["w"], r["l"], -r["p"], r["name"].lower()))

        you = None
        if me:
            for i, r in enumerate(table):
                if r["u"] == me:
                    you = dict(r)
                    you["rank"] = i + 1
                    break

        out = {
            "ok": True,
            "game": game,
            "total": len(table),
            "rows": table[:TOP_N],
            "you": you,
            "at": int(time.time()),
        }
        if weekly:
            # TWO PLACES, ON PURPOSE, and it is the wire contract that says so.
            # js/stats.js sliceFor() looks for `weekly` FIRST and falls back to
            # `rows`; every build in the field already does both. Answering in
            # both means a phone that has never been updated gets a real weekly
            # board out of `rows`, and a phone that knows about `weekly` reads
            # the declared field. Appending a field, never moving one -- the
            # rule that keeps an older build from choking on a newer relay.
            out["period"] = "week"
            out["week"] = wk
            out["weekly"] = {"rows": out["rows"], "you": you}
        return out

    def crowns(self, me: str, now: float | None = None) -> dict:
        """Where `me` finished on every board of the LAST COMPLETED week.

        Answers {"week": <bucket>, "places": {game: 1|2|3}} -- the whole input
        to the client's border reconcile, and nothing else. Deliberately not
        derived from board(): board() cuts to TOP_N and answers whole rows for
        everyone, and shipping 25 strangers' names down a wire to decide one
        player's ring would be a second, wider thing to keep honest.

        THE LAST COMPLETED WEEK, never the running one. Awarding out of the
        live bucket would hand the border to whoever is ahead on Tuesday and
        take it back on Wednesday; the ring would flicker between players all
        week and mean nothing. It becomes true once, when the week closes.

        Same sort as board(), on purpose: -wins, then fewest losses, then most
        played, then name. A weekly board that ranked by different rules than
        the crown it hands out would be a board that lies about who won.

        A PLACE NEEDS A WIN. Ranking by wins puts a player who lost their only
        game top of a board nobody else entered, and 'Champion' on a week you
        won nothing is the kind of prize that devalues every real one."""
        wk = prev_week_start(now)
        with self.lock:
            cur = self.db.execute(
                "SELECT r.game, r.uname, p.name, r.w, r.l, r.p"
                " FROM wrows r JOIN players p ON p.uname = r.uname"
                " WHERE r.wk=?",
                (wk,),
            )
            raw = cur.fetchall()

        by_game: dict[str, list] = {}
        for game, uname, name, w, l, p in raw:
            by_game.setdefault(str(game), []).append(
                (str(uname), str(name or uname)[:MAX_NAME],
                 int(w or 0), int(l or 0), int(p or 0))
            )

        places: dict[str, int] = {}
        for game, table in by_game.items():
            table.sort(key=lambda r: (-r[2], r[3], -r[4], r[1].lower()))
            for i, row in enumerate(table[:3]):
                if row[0] == me:
                    if row[2] > 0:      # no win, no crown
                        places[game] = i + 1
                    break
        return {"ok": True, "week": wk, "places": places,
                "at": int(time.time())}

    def counts(self) -> tuple[int, int]:
        with self.lock:
            a = self.db.execute("SELECT COUNT(*) FROM players").fetchone()[0]
            r = self.db.execute("SELECT COUNT(*) FROM rows").fetchone()[0]
        return int(a), int(r)


# ── module state ─────────────────────────────────────────────────────────────
#
# STORE and RESOLVE are set once, by open_store(), from main(). RESOLVE is the
# ONLY thing this module knows about accounts: give it a token, it gives back
# (uname, display name) or None. karti_server.py passes ACCOUNTS.session, so
# there is no second session table, no second idea of who is logged in, and no
# import in either direction.

STORE: Store | None = None
RESOLVE = None


def open_store(path: str = DEFAULT_DB, resolver=None) -> Store:
    global STORE, RESOLVE
    if STORE is not None:
        STORE.close()
    STORE = Store(path)
    RESOLVE = resolver
    return STORE


def close_store() -> None:
    global STORE, RESOLVE
    if STORE is not None:
        STORE.close()
    STORE = None
    RESOLVE = None


def _who(tok):
    """Token -> (uname, name), or None. Every failure mode is None: a missing
    resolver, a bad token, a resolver that raised. A leaderboard is not worth
    a traceback out of somebody else's account code."""
    if not RESOLVE or not isinstance(tok, str) or not (16 <= len(tok) <= 128):
        return None
    try:
        got = RESOLVE(tok)
    except Exception:
        return None
    if not got:
        return None
    try:
        uname, name = got[0], got[1]
    except (TypeError, IndexError):
        return None
    if not isinstance(uname, str) or not uname:
        return None
    return uname, (name if isinstance(name, str) and name else uname)


def _addr(handler) -> str:
    try:
        return handler.client_address[0] if handler.client_address else ""
    except Exception:
        return ""


def _fail(handler, status: int, why: str, extra=None) -> None:
    body = {"ok": False, "why": why}
    if extra:
        body.update(extra)
    handler.reply(status, body)


def _game_arg(value) -> str:
    if value is None:
        return "all"
    if not isinstance(value, str):
        raise Reject("game")
    v = value.strip().lower()
    if v in ("", "all", "*"):
        return "all"
    if not ID_RE.match(v):
        raise Reject("game")
    return v


def _period_arg(value) -> str:
    """'all' or 'week', and anything else is 'all'.

    Deliberately FORGIVING where _game_arg is strict. A game id reaches SQL
    and a made-up one should be refused loudly; a period only chooses which
    of two hard-coded queries runs, so an unknown one is best answered with
    the board that always existed rather than with a 400. That also means a
    future 'month' can ship on the client first and simply read as all-time
    until this side learns the word — the same way `week` itself did."""
    if isinstance(value, str) and value.strip().lower() in PERIODS:
        return value.strip().lower()
    return "all"


# ── routes ───────────────────────────────────────────────────────────────────


def handle_post(handler, action: str) -> None:
    """Mounted from KartiHandler.do_POST. `action` is what follows /stats/.

    Uses the handler's own helpers — read_json_body() has already refused an
    oversized body from the Content-Length header before a byte is read, and
    reply() already sets no-store/nosniff and the CORS header. There is no
    reason to have a second, worse copy of any of that here."""
    if STORE is None:
        _fail(handler, 503, E_OFF)
        return
    if action not in ("push", "board", "crowns"):
        _fail(handler, 404, "No such board route.")
        return

    body = handler.read_json_body()
    if body is None:  # it has already answered
        return
    if not isinstance(body, dict):
        _fail(handler, 400, E_BAD)
        return

    if action == "push":
        _push(handler, body)
    elif action == "crowns":
        _crowns(handler, body)
    else:
        _board(handler, body)


def handle_get(handler, action: str, full_path: str = "") -> None:
    """Mounted from KartiHandler.do_GET. Read-only routes only: a GET must
    never change the board, so `push` is not reachable this way."""
    if STORE is None:
        _fail(handler, 503, E_OFF)
        return
    if action == "health":
        accounts, rows = STORE.counts()
        handler.reply(200, {"ok": True, "accounts": accounts, "rows": rows,
                            "topN": TOP_N})
        return
    if action != "board":
        _fail(handler, 404, "No such board route.")
        return
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(full_path or "").query)
    body = {}
    if q.get("game"):
        body["game"] = q["game"][0]
    if q.get("tok"):
        body["tok"] = q["tok"][0]
    if q.get("period"):
        body["period"] = q["period"][0]
    _board(handler, body)


def _push(handler, body: dict) -> None:
    who = _who(body.get("tok"))
    if who is None:
        _fail(handler, 401, E_TOK, {"relogin": True})
        return
    uname, name = who
    # Rated per ACCOUNT, not per address: several people behind one funnel is
    # the normal case here, and one of them should not be able to spend
    # everybody else's allowance.
    if not _allowed("push", uname, PUSH_RATE, PUSH_BURST):
        _fail(handler, 429, E_SLOW, {"retryAfter": 20})
        return
    try:
        games = clean_games(body.get("games"))
    except Reject:
        _fail(handler, 400, E_BAD)
        return
    try:
        # The client has always sent these beside the games and they have
        # always been dropped on the floor here. They are the face and ring
        # the player CHOSE — without them a leaderboard draws everybody from
        # a hash of their name, which is stable, pretty, and not them.
        n = STORE.put(uname, name, games,
                      body.get("av"), body.get("bd"))
    except sqlite3.Error:
        _fail(handler, 503, "The board is busy.")
        return
    if n < 0:
        _fail(handler, 507, E_FULL)
        return
    handler.reply(200, {"ok": True, "at": int(time.time()), "games": n})


def _board(handler, body: dict) -> None:
    if not _allowed("board", _addr(handler), BOARD_RATE, BOARD_BURST):
        _fail(handler, 429, E_SLOW, {"retryAfter": 5})
        return
    try:
        game = _game_arg(body.get("game"))
    except Reject:
        _fail(handler, 400, E_BAD)
        return
    me = None
    tok = body.get("tok")
    if tok:
        got = _who(tok)
        # A bad token on a READ is not an error: the board is public, the
        # token only decides whether we can point out which row is yours.
        if got:
            me = got[0]
    # `since` also arrives from js/stats.js and is deliberately NOT read: see
    # week_start(). The client may label the week however it likes; only this
    # server decides which bucket is being asked for.
    try:
        handler.reply(200, STORE.board(game, me, _period_arg(body.get("period"))))
    except sqlite3.Error:
        _fail(handler, 503, "The board is busy.")


def _crowns(handler, body: dict) -> None:
    """Last week's placements, for the asker and nobody else.

    A TOKEN IS REQUIRED HERE, where _board() treats a bad one as merely 'we
    cannot point out your row'. The difference is what the answer is FOR: this
    one is the sole input to a client that will then write borders into its
    save, so answering an unauthenticated caller would mean answering the
    question 'what did that player win' about somebody else."""
    if not _allowed("board", _addr(handler), BOARD_RATE, BOARD_BURST):
        _fail(handler, 429, E_SLOW, {"retryAfter": 5})
        return
    who = _who(body.get("tok"))
    if who is None:
        _fail(handler, 401, E_TOK, {"relogin": True})
        return
    try:
        handler.reply(200, STORE.crowns(who[0]))
    except sqlite3.Error:
        _fail(handler, 503, "The board is busy.")


# ── self-test ────────────────────────────────────────────────────────────────
#
# Runs the real HTTP routes against a real (in-memory) database through a real
# socket, using a throwaway handler that provides exactly the four helpers the
# module borrows from KartiHandler. If this passes, the mounting lines are the
# only thing left that can be wrong.


def _selftest() -> int:
    import http.client
    import socketserver

    fails = []

    def check(name, cond, extra=""):
        if cond:
            print("  ok   %s" % name)
        else:
            print("  FAIL %s %s" % (name, extra))
            fails.append(name)

    print("karti_stats selftest")
    print("-- validation --")

    # clean_games: what must be refused
    bad = [
        ("not a dict", "nope"),
        ("bad id", {"CHESS!": {"p": 1, "w": 1}}),
        ("empty id", {"": {"p": 1, "w": 1}}),
        ("long id", {"x" * 40: {"p": 1, "w": 1}}),
        ("float count", {"chess": {"p": 1.5, "w": 1.5}}),
        ("string count", {"chess": {"p": "9", "w": "9"}}),
        ("bool count", {"chess": {"p": True, "w": True}}),
        ("negative", {"chess": {"p": 1, "w": -1, "l": 2}}),
        ("over cap", {"chess": {"p": MAX_COUNT + 1, "w": MAX_COUNT + 1}}),
        ("sums wrong", {"chess": {"p": 10, "w": 9, "l": 0, "d": 0}}),
        ("streak > wins", {"chess": {"p": 2, "w": 1, "l": 1, "bs": 2}}),
        ("too many games", {("g%d" % i): {"p": 1, "w": 1} for i in range(MAX_GAMES + 1)}),
        ("row not a dict", {"chess": 5}),
    ]
    for label, payload in bad:
        try:
            clean_games(payload)
            check("refuses %s" % label, False)
        except Reject:
            check("refuses %s" % label, True)

    good = clean_games(
        {
            "chess": {"p": 3, "w": 2, "l": 1, "d": 0, "bs": 2, "bm": 21, "bt": 60000, "sc": 0},
            "empty": {"p": 0, "w": 0, "l": 0, "d": 0},
            "kiri": {"p": 1, "w": 1, "l": 0, "d": 0, "bs": 1, "sc": 99999},
        }
    )
    check("keeps the good rows", set(good) == {"chess", "kiri"}, good)
    check("drops the never-played row", "empty" not in good)
    check("rebuilds as a fixed tuple", good["chess"] == (3, 2, 1, 0, 2, 21, 60000, 0), good["chess"])

    # an unknown key in the row is simply not read
    sneaky = clean_games({"chess": {"p": 1, "w": 1, "l": 0, "d": 0, "name": "<script>", "uname": "root"}})
    check("ignores unknown fields", sneaky["chess"] == (1, 1, 0, 0, 0, 0, 0, 0), sneaky)

    print("-- store --")
    st = Store(":memory:")
    st.put("aa", "Toni", clean_games({"chess": {"p": 5, "w": 4, "l": 1, "d": 0, "bs": 3}}))
    st.put("bb", "Guzi", clean_games({"chess": {"p": 9, "w": 4, "l": 5, "d": 0, "bs": 2},
                                      "dama": {"p": 2, "w": 2, "l": 0, "d": 0, "bs": 2}}))
    st.put("cc", "Nanna", clean_games({"chess": {"p": 7, "w": 7, "l": 0, "d": 0, "bs": 7}}))

    b = st.board("chess")
    order = [r["name"] for r in b["rows"]]
    check("sorts by wins then losses", order == ["Nanna", "Toni", "Guzi"], order)
    b = st.board("all")
    order = [r["name"] for r in b["rows"]]
    check("overall sums across games", order == ["Nanna", "Guzi", "Toni"], order)
    check("overall totals are summed",
          [r["w"] for r in b["rows"]] == [7, 6, 4], [r["w"] for r in b["rows"]])

    b = st.board("chess", "bb")
    check("you carries a real rank", b["you"] and b["you"]["rank"] == 3, b["you"])
    check("you is absent when unknown", st.board("chess", "zz")["you"] is None)
    check("unknown game is an empty board", st.board("nosuchgame")["rows"] == [])

    # A player with only losses (zero wins) must still be on the board and must
    # still find their own row. Ranking is by wins first, so they sit at the
    # bottom -- but "bottom" is a place ON the board, not "not on it". This is
    # exactly the account-not-showing case: her results were losses.
    st.put("ll", "OnlyLosses", clean_games({"chess": {"p": 4, "w": 0, "l": 4, "d": 0}}))
    b = st.board("chess")
    onboard = [r for r in b["rows"] if r["u"] == "ll"]
    check("a losses-only player is on the board", len(onboard) == 1 and onboard[0]["l"] == 4, onboard)
    b = st.board("chess", "ll")
    check("a losses-only player finds their own row",
          b["you"] and b["you"]["u"] == "ll" and b["you"]["l"] == 4 and b["you"]["rank"], b["you"])
    st.forget("ll")

    # a push replaces, it does not accumulate
    st.put("aa", "Toni", clean_games({"chess": {"p": 1, "w": 1, "l": 0, "d": 0, "bs": 1}}))
    row = [r for r in st.board("chess")["rows"] if r["u"] == "aa"][0]
    check("push replaces the whole table", row["p"] == 1, row)

    # a name is whatever the resolver said, truncated
    st.put("dd", "x" * 200, clean_games({"chess": {"p": 1, "w": 1, "l": 0, "d": 0}}))
    row = [r for r in st.board("chess")["rows"] if r["u"] == "dd"][0]
    check("name is bounded", len(row["name"]) == MAX_NAME, len(row["name"]))

    st.forget("dd")
    check("forget removes the player", all(r["u"] != "dd" for r in st.board("chess")["rows"]))
    st.close()

    print("-- the week --")

    # THE BOUNDARY. It has to be a local Sunday midnight, it has to be the
    # same answer all week, and it has to move exactly once a week -- checked
    # across a whole year so a DST change cannot slip past on one Sunday.
    now = time.time()
    ws = week_start(now)
    lt = datetime.datetime.fromtimestamp(ws)
    check("week starts on a Sunday", lt.weekday() == 6, lt.isoformat())
    check("week starts at midnight",
          (lt.hour, lt.minute, lt.second) == (0, 0, 0), lt.isoformat())
    check("week start is in the past and within 7 days",
          0 <= now - ws < 7 * 86400 + 3600, now - ws)
    check("same answer later the same day", week_start(ws + 3600) == ws)
    check("same answer six days in", week_start(ws + 6 * 86400) == ws)
    check("next week is a different bucket", week_start(ws + 7 * 86400) != ws)
    year = {week_start(now - i * 86400) for i in range(365)}
    check("a year holds 53 or 54 week buckets", 52 <= len(year) <= 54, len(year))
    check("every bucket in the year is a Sunday midnight",
          all(datetime.datetime.fromtimestamp(t).weekday() == 6
              and datetime.datetime.fromtimestamp(t).hour == 0 for t in year))

    wk = Store(":memory:")
    T1 = ws + 3600                      # somewhere inside this week
    T2 = ws + 7 * 86400 + 3600          # the same hour, next week

    # 1. THE FIRST PUSH IS A BASELINE AND CREDITS NOTHING. This is the whole
    #    reason the weekly board can be switched on for accounts that already
    #    have years of play: without it every one of them would appear to have
    #    played their entire history since Sunday.
    wk.put("aa", "Toni", clean_games({"chess": {"p": 400, "w": 300, "l": 100, "d": 0}}), now=T1)
    b = wk.board("chess", period="week", now=T1)
    check("first push credits nothing to the week", b["rows"] == [], b["rows"])
    check("first push still lands on all-time",
          wk.board("chess")["rows"][0]["p"] == 400, wk.board("chess")["rows"])

    # 2. THE SECOND PUSH CREDITS THE DIFFERENCE, AND ONLY THE DIFFERENCE.
    wk.put("aa", "Toni", clean_games({"chess": {"p": 403, "w": 302, "l": 101, "d": 0}}), now=T1)
    r = wk.board("chess", period="week", now=T1)["rows"]
    check("second push credits only the delta",
          len(r) == 1 and (r[0]["p"], r[0]["w"], r[0]["l"], r[0]["d"]) == (3, 2, 1, 0), r)
    check("all-time still holds the totals",
          wk.board("chess")["rows"][0]["p"] == 403)

    # 3. DELTAS ACCUMULATE WITHIN THE WEEK.
    wk.put("aa", "Toni", clean_games({"chess": {"p": 404, "w": 303, "l": 101, "d": 0}}), now=T1)
    r = wk.board("chess", period="week", now=T1)["rows"]
    check("a third push adds to the same bucket",
          (r[0]["p"], r[0]["w"]) == (4, 3), r)

    # 4. THE WEEK ROLLS OVER. The same account, more play, a week later: the
    #    new week starts from nothing and the old bucket is untouched.
    wk.put("aa", "Toni", clean_games({"chess": {"p": 409, "w": 308, "l": 101, "d": 0}}), now=T2)
    r2 = wk.board("chess", period="week", now=T2)["rows"]
    check("a new week starts from zero", (r2[0]["p"], r2[0]["w"]) == (5, 5), r2)
    r1 = wk.board("chess", period="week", now=T1)["rows"]
    check("last week's bucket is untouched", (r1[0]["p"], r1[0]["w"]) == (4, 3), r1)

    # 5. A COUNTER GOING BACKWARDS RE-BASELINES; it never writes a negative.
    wk.put("bb", "Guzi", clean_games({"chess": {"p": 50, "w": 25, "l": 25, "d": 0}}), now=T2)
    wk.put("bb", "Guzi", clean_games({"chess": {"p": 10, "w": 5, "l": 5, "d": 0}}), now=T2)
    mine = [x for x in wk.board("chess", period="week", now=T2)["rows"] if x["u"] == "bb"]
    check("a shrinking total credits nothing", mine == [], mine)
    wk.put("bb", "Guzi", clean_games({"chess": {"p": 12, "w": 7, "l": 5, "d": 0}}), now=T2)
    mine = [x for x in wk.board("chess", period="week", now=T2)["rows"] if x["u"] == "bb"]
    check("it re-baselines and counts again from there",
          len(mine) == 1 and (mine[0]["p"], mine[0]["w"]) == (2, 2), mine)
    neg = wk.db.execute("SELECT COUNT(*) FROM wrows WHERE p<0 OR w<0 OR l<0 OR d<0").fetchone()[0]
    check("no negative weekly row can exist", neg == 0, neg)

    # 6. A GAME NEW TO AN ACCOUNT BASELINES ON ITS OWN, not on the account.
    wk.put("aa", "Toni", clean_games({"chess": {"p": 409, "w": 308, "l": 101, "d": 0},
                                      "dama": {"p": 30, "w": 20, "l": 10, "d": 0}}), now=T2)
    d = wk.board("dama", period="week", now=T2)["rows"]
    check("a game's first sight baselines too", d == [], d)

    # 7. THE WEEKLY BOARD RANKS ONLY THE WEEK, and by the same rules.
    wk.put("cc", "Nanna", clean_games({"chess": {"p": 1, "w": 1, "l": 0, "d": 0}}), now=T2)
    wk.put("cc", "Nanna", clean_games({"chess": {"p": 100, "w": 99, "l": 1, "d": 0}}), now=T2)
    r = wk.board("chess", period="week", now=T2)["rows"]
    check("weekly ranks by this week's wins",
          [x["name"] for x in r] == ["Nanna", "Toni", "Guzi"], [x["name"] for x in r])
    # ...and the all-time board still ranks by ALL-TIME wins, which is a
    # different order from the weekly one above: Toni has 308 lifetime wins
    # and five this week. The two boards disagreeing is the entire point.
    a = [x["name"] for x in wk.board("chess")["rows"]]
    check("all-time ranks by lifetime wins, not the week's",
          a == ["Toni", "Nanna", "Guzi"], a)

    # 8. THE SHAPE js/stats.js READS. sliceFor() prefers `weekly`, older
    #    builds read `rows`; both must be the same answer.
    b = wk.board("chess", "aa", period="week", now=T2)
    check("weekly answer declares its period", b.get("period") == "week", b.get("period"))
    check("weekly answer carries its week", b.get("week") == week_start(T2), b.get("week"))
    check("weekly mirror matches rows", b["weekly"]["rows"] == b["rows"])
    check("weekly you matches", b["weekly"]["you"] == b["you"])
    check("weekly you has a real rank", b["you"] and b["you"]["rank"] == 2, b["you"])
    check("an all-time answer carries no weekly key", "weekly" not in wk.board("chess"))
    check("weekly rows claim no streak",
          all(x["bs"] == 0 for x in b["rows"]), [x["bs"] for x in b["rows"]])

    # 9. WEEKLY 'all' SUMS ACROSS GAMES, the same way all-time does.
    wk.put("aa", "Toni", clean_games({"chess": {"p": 411, "w": 310, "l": 101, "d": 0},
                                      "dama": {"p": 33, "w": 22, "l": 11, "d": 0}}), now=T2)
    # chess this week: 5 (the roll-over push) + 2 (this one) = 7 wins.
    # dama this week: 2 wins and 1 loss, on top of a baseline that credited 0.
    r = [x for x in wk.board("all", period="week", now=T2)["rows"] if x["u"] == "aa"][0]
    check("weekly overall sums across games",
          (r["p"], r["w"], r["l"]) == (7 + 3, 7 + 2, 0 + 1), r)

    # 10. PRUNING. Old buckets go; the current one never does.
    old = ws - (WEEKS_KEPT + 2) * 7 * 86400
    wk.db.execute("INSERT INTO wrows(uname,game,wk,p,w,l,d) VALUES('aa','chess',?,9,9,0,0)", (old,))
    wk.db.commit()
    check("an ancient bucket is there to begin with",
          wk.db.execute("SELECT COUNT(*) FROM wrows WHERE wk=?", (old,)).fetchone()[0] == 1)
    wk.put("aa", "Toni", clean_games({"chess": {"p": 412, "w": 311, "l": 101, "d": 0},
                                      "dama": {"p": 33, "w": 22, "l": 11, "d": 0}}), now=T2)
    check("a push prunes buckets past WEEKS_KEPT",
          wk.db.execute("SELECT COUNT(*) FROM wrows WHERE wk=?", (old,)).fetchone()[0] == 0)
    check("the current bucket survives pruning",
          wk.db.execute("SELECT COUNT(*) FROM wrows WHERE wk=?",
                        (week_start(T2),)).fetchone()[0] > 0)

    # 11. forget() takes the weekly rows with it, or the board joins a name
    #     that is no longer there.
    wk.forget("aa")
    check("forget clears the weekly bucket too",
          wk.db.execute("SELECT COUNT(*) FROM wrows WHERE uname='aa'").fetchone()[0] == 0)
    check("forgotten player is off the weekly board",
          all(x["u"] != "aa" for x in wk.board("chess", period="week", now=T2)["rows"]))

    # 12. THE PERIOD ARGUMENT IS FORGIVING, unlike the game argument.
    check("period 'week' is honoured", _period_arg("week") == "week")
    check("period 'all' is honoured", _period_arg("all") == "all")
    check("period is case-insensitive", _period_arg(" WEEK ") == "week")
    check("an unknown period reads as all-time", _period_arg("month") == "all")
    check("a missing period reads as all-time", _period_arg(None) == "all")
    check("a non-string period reads as all-time", _period_arg({"a": 1}) == "all")
    wk.close()

    print("-- last week's crowns --")

    # THE BOUNDARY, FROM THE OTHER SIDE. prev_week_start() has to be a real
    # Sunday midnight exactly one week back EVERY week of the year. The obvious
    # `week_start(now) - 7*86400` passes fifty weeks and then, on the two that
    # follow a clock change, returns a value one hour off a stored bucket -- and
    # because the bucket is matched by EQUALITY that does not crown the wrong
    # player, it crowns nobody at all, silently, twice a year.
    bad = None
    for i in range(365):
        t = now - i * 86400
        p = prev_week_start(t)
        pd = datetime.datetime.fromtimestamp(p)
        if not (pd.weekday() == 6 and (pd.hour, pd.minute, pd.second) == (0, 0, 0)
                and week_start(p + 7 * 86400 + 3600) == week_start(t)):
            bad = pd.isoformat()
            break
    check("prev_week_start is a Sunday midnight one week back, all year",
          bad is None, bad)
    check("prev_week_start is never this week", prev_week_start(now) != week_start(now))

    cr = Store(":memory:")

    def week_play(u, name, rows, when):
        """Put `rows` = {game: (wins, losses)} into `when`'s weekly bucket.

        TWO pushes, because the first sight of a counter is a baseline that
        credits nothing (section 1 above) -- one push would leave the bucket
        empty and every crown check below would pass for the wrong reason. The
        baseline is 1-1 rather than 0-0 because clean_games() DROPS a row with
        p == 0, and a push whose table came back empty deletes the account's
        rows instead of baselining them. Every game an account plays goes in
        one call for the same reason: put() replaces the whole table."""
        cr.put(u, name, clean_games(
            {g: {"p": 2, "w": 1, "l": 1, "d": 0} for g in rows}), now=when)
        cr.put(u, name, clean_games(
            {g: {"p": 2 + w + l, "w": 1 + w, "l": 1 + l, "d": 0}
             for g, (w, l) in rows.items()}), now=when)

    week_play("aa", "Toni", {"chess": (9, 0), "dama": (7, 0)}, T1)
    week_play("bb", "Guzi", {"chess": (5, 1)}, T1)
    week_play("cc", "Nanna", {"chess": (3, 0)}, T1)
    week_play("dd", "Pawlu", {"chess": (1, 9)}, T1)
    # Rita lost every game of serp, and nobody else played it at all.
    week_play("ee", "Rita", {"serp": (0, 4)}, T1)

    check("last week's winner is 1st", cr.crowns("aa", now=T2)["places"].get("chess") == 1)
    check("last week's runner-up is 2nd", cr.crowns("bb", now=T2)["places"].get("chess") == 2)
    check("last week's third is 3rd", cr.crowns("cc", now=T2)["places"].get("chess") == 3)
    check("fourth place is crowned with nothing",
          cr.crowns("dd", now=T2)["places"] == {}, cr.crowns("dd", now=T2))
    # TOP OF THE BOARD IS NOT THE SAME AS HAVING WON SOMETHING. Rita is first
    # on serp by default, having lost every game she played.
    check("topping a board with no wins earns no crown",
          cr.crowns("ee", now=T2)["places"] == {}, cr.crowns("ee", now=T2))

    # THE RUNNING WEEK IS NEVER AWARDED. Asked from inside the week the play
    # happened in, last-completed is the week before it, which is empty.
    check("the week still being played is not crowned",
          cr.crowns("aa", now=T1)["places"] == {}, cr.crowns("aa", now=T1))

    # It crowns per GAME, never overall: 'all' is a view of the board, not a
    # thing you can be champion of, and a border exists for real games only.
    pl = cr.crowns("aa", now=T2)["places"]
    check("a player can hold a crown in each game", pl == {"chess": 1, "dama": 1}, pl)
    check("there is no crown for 'all'", "all" not in pl, pl)
    check("the answer names the week it awarded",
          cr.crowns("aa", now=T2)["week"] == week_start(T1), cr.crowns("aa", now=T2))
    check("a stranger to the board is crowned with nothing",
          cr.crowns("zz", now=T2)["places"] == {})
    cr.close()

    print("-- routes over a real socket --")

    # A minimal handler carrying only the four helpers this module borrows.
    class Mini(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def reply(self, status, obj):
            raw = json.dumps(obj).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def read_json_body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > 65536:
                self.reply(413, {"ok": False, "why": "too big"})
                return None
            try:
                return json.loads(self.rfile.read(n) or b"{}")
            except Exception:
                self.reply(400, {"ok": False, "why": E_BAD})
                return None

        def do_POST(self):
            path = self.path.split("?", 1)[0]
            if path.startswith("/karti/stats/"):
                handle_post(self, path[len("/karti/stats/"):])
            else:
                self.reply(404, {"ok": False})

        def do_GET(self):
            path = self.path.split("?", 1)[0]
            if path.startswith("/karti/stats/"):
                handle_get(self, path[len("/karti/stats/"):], self.path)
            else:
                self.reply(404, {"ok": False})

    SESSIONS = {"tok-toni-aaaaaaaaaaaaaaaa": ("aa", "Toni"),
                "tok-guzi-aaaaaaaaaaaaaaaa": ("bb", "Guzi"),
                "tok-evil-aaaaaaaaaaaaaaaa": ("ee", "<img src=x onerror=alert(1)>")}
    open_store(":memory:", lambda t: SESSIONS.get(t))
    buckets_reset()

    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    srv = Server(("127.0.0.1", 0), Mini)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    def call(method, path, body=None):
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        if body is None:
            c.request(method, path)
        else:
            raw = json.dumps(body)
            c.request(method, path, raw, {"Content-Type": "application/json"})
        r = c.getresponse()
        txt = r.read().decode()
        c.close()
        try:
            return r.status, json.loads(txt)
        except Exception:
            return r.status, {}

    P = "/karti/stats/"

    s, d = call("POST", P + "push", {"tok": "tok-toni-aaaaaaaaaaaaaaaa",
                                     "games": {"chess": {"p": 3, "w": 3, "l": 0, "d": 0, "bs": 3}}})
    check("push accepted", s == 200 and d.get("ok"), (s, d))

    s, d = call("POST", P + "push", {"games": {"chess": {"p": 3, "w": 3, "l": 0, "d": 0}}})
    check("push with no token is 401", s == 401, (s, d))
    s, d = call("POST", P + "push", {"tok": "x" * 40,
                                     "games": {"chess": {"p": 1, "w": 1, "l": 0, "d": 0}}})
    check("push with a made-up token is 401", s == 401, (s, d))

    # THE one that matters: a player trying to file a result as somebody else.
    buckets_reset()
    s, d = call("POST", P + "push", {"tok": "tok-guzi-aaaaaaaaaaaaaaaa",
                                     "u": "aa", "uname": "aa", "user": "aa", "name": "Toni",
                                     "games": {"chess": {"p": 99, "w": 99, "l": 0, "d": 0, "bs": 99}}})
    check("a spoofed submission is accepted only for its OWN account", s == 200, (s, d))
    s, d = call("GET", P + "board?game=chess")
    toni = [r for r in d["rows"] if r["u"] == "aa"][0]
    guzi = [r for r in d["rows"] if r["u"] == "bb"][0]
    check("...and Toni's row is untouched", toni["w"] == 3 and toni["name"] == "Toni", toni)
    check("...and the numbers landed on Guzi", guzi["w"] == 99, guzi)
    check("...and the name came from the resolver, not the body", guzi["name"] == "Guzi", guzi)

    # a hostile display name is stored as data and never interpreted here
    buckets_reset()
    s, d = call("POST", P + "push", {"tok": "tok-evil-aaaaaaaaaaaaaaaa",
                                     "games": {"chess": {"p": 1, "w": 1, "l": 0, "d": 0}}})
    s, d = call("GET", P + "board?game=chess")
    evil = [r for r in d["rows"] if r["u"] == "ee"][0]
    check("hostile name is returned as plain data",
          evil["name"] == "<img src=x onerror=alert(1)>"[:MAX_NAME], evil)
    # av/bd joined this set when the board started carrying the face and ring
    # a player CHOSE (see Store.board); this assertion was left behind and had
    # been failing on its own since. The point of it is that a row carries
    # exactly the declared fields and nothing a client pushed, which still
    # holds -- it just holds over nine keys now, not seven.
    check("board rows carry no extra keys",
          set(evil) == {"u", "name", "p", "w", "l", "d", "bs", "av", "bd"}, sorted(evil))

    buckets_reset()
    s, d = call("POST", P + "push", {"tok": "tok-toni-aaaaaaaaaaaaaaaa",
                                     "games": {"chess": {"p": 5, "w": 5, "l": 1, "d": 0}}})
    check("a self-contradicting push is 400", s == 400, (s, d))
    s, d = call("GET", P + "board?game=chess")
    toni = [r for r in d["rows"] if r["u"] == "aa"][0]
    check("...and nothing was written", toni["w"] == 3, toni)

    s, d = call("POST", P + "board", {"game": "all"})
    check("board with no token works", s == 200 and d.get("you") is None, (s, d.get("you")))
    s, d = call("POST", P + "board", {"game": "all", "tok": "tok-toni-aaaaaaaaaaaaaaaa"})
    check("board with a token points out your row", d.get("you") and d["you"]["u"] == "aa", d.get("you"))
    s, d = call("POST", P + "board", {"game": "all", "tok": "not-a-real-token-at-all"})
    check("board with a bad token still answers", s == 200 and d.get("you") is None, (s, d.get("you")))
    s, d = call("POST", P + "board", {"game": "../../etc/passwd"})
    check("a nasty game filter is 400", s == 400, (s, d))
    s, d = call("POST", P + "board", {"game": 12})
    check("a non-string game filter is 400", s == 400, (s, d))

    # CROWNS OVER THE WIRE. The ranking itself is proved above against the
    # store; what the route has to get right is WHO it will answer, because
    # this answer is the only thing a client consults before writing borders
    # into a save.
    buckets_reset()
    s, d = call("POST", P + "crowns", {"tok": "tok-toni-aaaaaaaaaaaaaaaa"})
    check("crowns answers a real token", s == 200 and d.get("ok"), (s, d))
    check("crowns answers places and a week",
          isinstance(d.get("places"), dict) and isinstance(d.get("week"), int), d)
    check("crowns says nothing about anybody else",
          set(d) == {"ok", "week", "places", "at"}, sorted(d))
    s, d = call("POST", P + "crowns", {})
    check("crowns with no token is 401", s == 401, (s, d))
    s, d = call("POST", P + "crowns", {"tok": "not-a-real-token-at-all"})
    check("crowns with a bad token is 401, not a public answer", s == 401, (s, d))
    # A token names its own account and there is no other way to name one:
    # nothing in the body can ask about a different player.
    buckets_reset()
    s, d = call("POST", P + "crowns", {"tok": "tok-guzi-aaaaaaaaaaaaaaaa",
                                       "u": "aa", "uname": "aa", "user": "aa"})
    check("crowns cannot be asked about somebody else", s == 200 and d.get("ok"), (s, d))
    s, d = call("GET", P + "crowns")
    check("crowns is not reachable by GET", s == 404, (s, d))

    s, d = call("GET", P + "health")
    check("health answers", s == 200 and d.get("ok"), (s, d))
    s, d = call("GET", P + "push")
    check("push is not reachable by GET", s == 404, (s, d))
    s, d = call("POST", P + "nonsense", {})
    check("an unknown route is 404", s == 404, (s, d))

    print("-- rate limiting --")
    buckets_reset()
    codes = [call("POST", P + "push",
                  {"tok": "tok-toni-aaaaaaaaaaaaaaaa",
                   "games": {"chess": {"p": 1, "w": 1, "l": 0, "d": 0}}})[0]
             for _ in range(10)]
    check("push is rate limited", 429 in codes, codes)
    buckets_reset()
    codes = [call("GET", P + "board?game=all")[0] for _ in range(40)]
    check("board is rate limited", 429 in codes, codes)

    print("-- switched off --")
    close_store()
    buckets_reset()
    s, d = call("POST", P + "board", {})
    check("every route is 503 with no store", s == 503, (s, d))
    s, d = call("GET", P + "health")
    check("health is 503 with no store", s == 503, (s, d))

    srv.shutdown()
    srv.server_close()

    print()
    if fails:
        print("FAILED: %d" % len(fails))
        for f in fails:
            print("  - %s" % f)
        return 1
    print("all tests passed")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    print(__doc__)
    print("run:  python3 %s --selftest" % os.path.basename(__file__))
