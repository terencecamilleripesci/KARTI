#!/usr/bin/env python3
"""
avatars.py — look at, export and remove the photos players have uploaded.

WHERE THEY ACTUALLY LIVE, and why it is not a folder:

    /var/lib/karti/avatars.db

They are rows in SQLite, not files, and that is a deliberate security choice
rather than an accident. `GET /karti/avatar/<who>` takes a name straight off
the public internet. If that name reached a filesystem path, every classic
traversal payload — ../, %2e%2e%2f, ....//, a null byte, an overlong UTF-8
encoding — would be aimed at the whole Pi, and getting all of them right
forever is a bet you only have to lose once. A name that can only ever become
a *bound SQL parameter* cannot escape anywhere. Thirteen such payloads are
fired at the live route by the relay's own self-test and all thirteen 404.

But a database is not something you can open and look at, and being able to see
what people uploaded is reasonable. So this exports them to a folder on demand.
The database stays the source of truth; the folder is a view of it.

Usage:
    python3 scripts/avatars.py                      # who has one, how big
    python3 scripts/avatars.py --export ~/karti-photos
    python3 scripts/avatars.py --remove sammy       # take one down
    python3 scripts/avatars.py --db /path/to.db     # a different database
"""

import argparse
import os
import sqlite3
import sys

DEFAULT_DB = "/var/lib/karti/avatars.db"


def die(msg):
    print("error: %s" % msg, file=sys.stderr)
    sys.exit(1)


def columns(cur, table):
    try:
        return [r[1] for r in cur.execute("PRAGMA table_info(%s)" % table)]
    except sqlite3.Error:
        return []


def find_table(cur):
    """The relay owns the schema, so discover it rather than assume it."""
    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")]
    for t in tables:
        cols = columns(cur, t)
        # NB: this schema has a `bytes` column that is the SIZE, not the image.
        # Prefer the real blob names and never fall back to something numeric.
        blob = next((c for c in cols if c in ("img", "data", "photo", "blob", "image")), None)
        who  = next((c for c in cols if c in ("uname", "user", "who", "name",
                                               "acct", "account", "username")), None)
        if blob and who:
            ver = next((c for c in cols if c in ("ver", "v", "version")), None)
            return t, who, blob, ver
    die("no avatar table found in this database (tables: %s)" % ", ".join(tables) or "none")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--export", metavar="DIR", help="write every photo into DIR as <name>.jpg")
    ap.add_argument("--remove", metavar="NAME", help="delete one player's photo")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        die("no database at %s — has anybody uploaded a photo yet?" % args.db)
    if not os.access(args.db, os.R_OK):
        die("cannot read %s (it is owned by the relay's user; try sudo)" % args.db)

    con = sqlite3.connect("file:%s?mode=%s" % (args.db, "rw" if args.remove else "ro"), uri=True)
    cur = con.cursor()
    table, who_col, blob_col, ver_col = find_table(cur)

    if args.remove:
        name = args.remove.strip().lower()
        n = cur.execute("DELETE FROM %s WHERE lower(%s)=?" % (table, who_col), (name,)).rowcount
        con.commit()
        print("removed %d photo%s for %r" % (n, "" if n == 1 else "s", name))
        print("(they fall back to their drawn face immediately — nothing else to do)")
        return

    sel = "SELECT %s, %s%s FROM %s ORDER BY 1" % (
        who_col, blob_col, (", " + ver_col) if ver_col else "", table)
    rows = list(cur.execute(sel))

    if not rows:
        print("No photos uploaded yet.")
        print("Everybody is on a drawn face, which is the default and costs nothing.")
        return

    if args.export:
        os.makedirs(args.export, exist_ok=True)
        for r in rows:
            who, blob = r[0], r[1]
            # the filename is built from the DB's own value, never from a request
            safe = "".join(c for c in str(who) if c.isalnum() or c in "-_") or "player"
            path = os.path.join(args.export, safe + ".jpg")
            with open(path, "wb") as fh:
                fh.write(blob)
        print("exported %d photo%s to %s" % (len(rows), "" if len(rows) == 1 else "s", args.export))
        print("(that folder is a COPY — the relay still serves from the database,")
        print(" so deleting a file there changes nothing. Use --remove for that.)")
        return

    print("%-20s %8s %6s" % ("player", "size", "ver"))
    total = 0
    for r in rows:
        who, blob = r[0], r[1]
        ver = r[2] if ver_col and len(r) > 2 else "-"
        total += len(blob)
        print("%-20s %7.1fK %6s" % (who, len(blob) / 1024.0, ver))
    print("\n%d photo%s, %.0f KB total" % (len(rows), "" if len(rows) == 1 else "s", total / 1024.0))
    print("export them with:  python3 scripts/avatars.py --export ~/karti-photos")


if __name__ == "__main__":
    main()
