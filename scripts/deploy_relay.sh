#!/usr/bin/env bash
#
# deploy_relay.sh — restart the KARTI relay safely, and put it back if it breaks.
#
# The relay is KARTI-only (rooms, accounts, the record book, avatars). It is not
# the LuxuryLifts dashboard and not the Cosmo bridge — those are separate
# services and this script never touches them.
#
# It refuses to restart a relay that would not come back:
#
#   1. the file must compile
#   2. --selftest must pass EVERY check, not most of them
#   3. the running file is copied aside first
#   4. restart, then wait for the PORT to answer — not for systemd to say
#      "active", which it does the instant the process starts and before the
#      socket is listening. That distinction already produced one false alarm.
#   5. health is checked locally AND through the public funnel, because the
#      funnel is how everybody except this Pi reaches it
#   6. if any of that fails, the previous file is restored and the relay is
#      restarted again, so a bad deploy self-heals instead of leaving the game
#      down until somebody notices
#
# Usage:
#   scripts/deploy_relay.sh            # check, restart, verify, roll back on failure
#   scripts/deploy_relay.sh --check    # gates only, change nothing
#   scripts/deploy_relay.sh --no-funnel # skip the public check (offline Pi)

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/server/karti_server.py"
UNIT="karti-relay"
LOCAL="http://127.0.0.1:8101/karti/health"
FUNNEL="https://raspberrypi.silverside-tench.ts.net:8443/karti/health"
BACKUP_DIR="$REPO/server/_deploy_bak"
CHECK_ONLY=0
DO_FUNNEL=1

for a in "$@"; do
  case "$a" in
    --check)     CHECK_ONLY=1 ;;
    --no-funnel) DO_FUNNEL=0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

say()  { printf '  %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; }

printf '\nKARTI relay deploy\n'
printf -- '------------------\n'

# ── gate 1: it must compile ───────────────────────────────────────────────
if ! python3 -m py_compile "$SRC" 2>/tmp/karti_deploy_compile.txt; then
  fail "server/karti_server.py does not compile"
  sed 's/^/    /' /tmp/karti_deploy_compile.txt >&2
  exit 1
fi
say "compiles"

# ── gate 2: every self-test check, not most ───────────────────────────────
OUT=$(cd "$REPO" && timeout 600 python3 "$SRC" --selftest 2>&1)
LINE=$(printf '%s\n' "$OUT" | grep -E '^SELFTEST:' | tail -1)
if [ -z "$LINE" ]; then
  fail "the self-test produced no verdict (timed out, or the harness changed)"
  printf '%s\n' "$OUT" | tail -20 >&2
  exit 1
fi
if ! printf '%s\n' "$LINE" | grep -q 'ALL PASS'; then
  fail "$LINE"
  printf '%s\n' "$OUT" | grep -iE '^\s*FAIL' | head -20 >&2
  exit 1
fi
say "self-test: ${LINE#SELFTEST: }"

if [ "$CHECK_ONLY" = "1" ]; then
  printf '\n--check: gates pass, nothing restarted.\n'
  exit 0
fi

# ── keep the version that is currently running ────────────────────────────
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
BAK="$BACKUP_DIR/karti_server.py.$STAMP"
cp "$SRC" "$BAK"
say "kept a copy: server/_deploy_bak/$(basename "$BAK")"

# only the last 10, so this never grows without bound
ls -1t "$BACKUP_DIR"/karti_server.py.* 2>/dev/null | tail -n +11 | xargs -r rm -f

# ── restart ───────────────────────────────────────────────────────────────
say "restarting $UNIT"
sudo systemctl restart "$UNIT"

# wait for the SOCKET, not for systemd. systemd reports active as soon as the
# process starts, which is before it is listening — checking too early reports
# a healthy relay as dead.
code=""
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$LOCAL" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 0.5
done

rollback() {
  fail "$1"
  say "restoring the previous file and restarting"
  cp "$BAK" "$SRC"
  sudo systemctl restart "$UNIT"
  for _ in $(seq 1 40); do
    c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$LOCAL" 2>/dev/null || echo 000)
    [ "$c" = "200" ] && { say "rolled back, relay is answering again"; exit 1; }
    sleep 0.5
  done
  fail "ROLLBACK ALSO FAILED — the relay is down and needs a human"
  journalctl -u "$UNIT" -n 20 --no-pager >&2
  exit 1
}

[ "$code" = "200" ] || rollback "the relay did not answer on 8101 after 20s (got $code)"
say "local  8101: 200"

if [ "$DO_FUNNEL" = "1" ]; then
  fcode=""
  for _ in $(seq 1 10); do
    fcode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$FUNNEL" 2>/dev/null || echo 000)
    [ "$fcode" = "200" ] && break
    sleep 1
  done
  if [ "$fcode" != "200" ]; then
    say "public funnel: $fcode — NOT rolling back, because the relay itself is"
    say "healthy on 8101. This is a Tailscale problem, not a bad deploy."
  else
    say "public funnel: 200"
  fi
fi

# ── say what is actually live now ─────────────────────────────────────────
printf '\nlive:\n'
curl -s --max-time 5 "$LOCAL" | python3 -c '
import sys, json
try: d = json.load(sys.stdin)
except Exception: print("  (health did not return JSON)"); raise SystemExit
print("  rooms %s/%s   sockets %s/%s   accounts %s"
      % (d.get("rooms"), d.get("maxRooms"), d.get("clients"),
         d.get("maxClients"), "on" if d.get("accounts") else "off"))'

for r in stats/board avatar; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:8101/karti/$r" 2>/dev/null)
  printf '  /karti/%-12s %s\n' "$r" "$c"
done

printf '\nother services, untouched:\n'
for s in luxurylifts-dashboard luxury-lifts-bridge; do
  printf '  %-24s %s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null)"
done
printf '\ndone.\n'
