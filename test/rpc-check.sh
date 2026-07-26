#!/usr/bin/env bash
# rpc-check — end-to-end proof that the slash commands work inside a live pi
# session, without spending a single LLM token.
#
# Boots `pi --mode rpc` in a throwaway HOME (so the real ~/.pi is never
# touched), loads the two slash extensions with -e, then drives the session
# over the RPC protocol:
#   1. /pi-list       → expect the feature board
#   2. /pi-replay     → expect a real toggle: settings write + live reload
#   3. /pi-list       → expect Session Replay reported ON
#   4. /pi-off        → expect everything off again
#
# Run: bash test/rpc-check.sh   (or: just rpc-check)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/at-rpc-check.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

export HOME="$WORK/home"
mkdir -p "$HOME/.pi/agent"
printf '{}\n' > "$HOME/.pi/agent/settings.json"

OUT="$WORK/events.jsonl"

# Feed commands with pauses so each reload settles before the next command.
feed() {
  printf '{"id":"list-1","type":"prompt","message":"/pi-list"}\n'
  sleep 2
  printf '{"id":"toggle-on","type":"prompt","message":"/pi-replay"}\n'
  sleep 3
  printf '{"id":"list-2","type":"prompt","message":"/pi-list"}\n'
  sleep 2
  printf '{"id":"all-off","type":"prompt","message":"/pi-off"}\n'
  sleep 3
}

echo "rpc-check: booting pi --mode rpc (throwaway HOME: $HOME)"
feed | pi --mode rpc --no-session \
  -e "$ROOT/slash/agentic-teams.ts" \
  -e "$ROOT/slash/agent-slash.ts" \
  > "$OUT" 2>"$WORK/stderr.log" || true

pass=0; failed=0
check() { # check <label> <grep-pattern> <file>
  if grep -q "$2" "$3"; then
    echo "  ✓ $1"; pass=$((pass+1))
  else
    echo "  ✗ $1  (pattern not found: $2)"; failed=$((failed+1))
  fi
}

check "/pi-list executed"              '"id":"list-1".*"success":true' "$OUT"
check "feature board rendered"         'feature board'                  "$OUT"
check "/pi-replay toggle accepted"     '"id":"toggle-on".*"success":true' "$OUT"
check "Session Replay reported ON"     'Session Replay ON'              "$OUT"
check "second /pi-list executed"       '"id":"list-2".*"success":true' "$OUT"
check "/pi-off executed"               '"id":"all-off".*"success":true' "$OUT"
check "all engines reported off"       'All engines OFF'               "$OUT"

# The throwaway settings must be empty of engines again after /pi-off.
if grep -q 'session-replay' "$HOME/.pi/agent/settings.json"; then
  echo "  ✗ settings still contain the engine after /pi-off"; failed=$((failed+1))
else
  echo "  ✓ settings clean after /pi-off"; pass=$((pass+1))
fi

echo ""
if [ "$failed" -gt 0 ]; then
  echo "RPC CHECK FAILED — $failed problem(s). Events: $OUT"
  echo "--- last stderr ---"; tail -5 "$WORK/stderr.log" || true
  exit 1
fi
echo "RPC CHECK PASSED ($pass checks)"
