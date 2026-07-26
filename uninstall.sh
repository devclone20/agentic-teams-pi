#!/usr/bin/env bash
# uninstall.sh — remove agentic-teams-pi from this machine's pi setup.
#
#   ./uninstall.sh            interactive
#   ./uninstall.sh --dry-run  show every action, change nothing
#
# Removes ~/.pi/agent/agentic-teams and its two settings.json entries.
# Shared resources (agents/, themes/, damage-control-rules.yaml, the yaml
# package) are LEFT IN PLACE — they may be yours.

set -euo pipefail

DRY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --yes) ;; # accepted for symmetry; nothing to confirm
    *) echo "unknown flag: $arg (use --dry-run)"; exit 1 ;;
  esac
done

if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then G=""; Y=""; D=""; N=""; else
  G=$'\033[32m'; Y=$'\033[33m'; D=$'\033[2m'; N=$'\033[0m'
fi
say() { printf '%s\n' "$*"; }

AGENT_DIR="$HOME/.pi/agent"
DEST="$AGENT_DIR/agentic-teams"
SETTINGS="$AGENT_DIR/settings.json"

if [ ! -d "$DEST" ] && ! grep -q "agentic-teams" "$SETTINGS" 2>/dev/null; then
  say "agentic-teams-pi is not installed — nothing to do."
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  say "node is required to edit settings.json safely."
  exit 1
fi

if [ -f "$SETTINGS" ]; then
  if ! node -e '
    const raw = require("fs").readFileSync(process.argv[1], "utf-8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || Array.isArray(j)) process.exit(2);
  ' "$SETTINGS" 2>/dev/null; then
    say "settings.json is not a valid JSON object — fix it by hand, nothing was changed:"
    say "  $SETTINGS"
    exit 1
  fi
  if [ "$DRY" = 1 ]; then
    say "  ${D}[dry-run]${N} remove agentic-teams entries from settings.json"
  else
    cp "$SETTINGS" "$SETTINGS.bak-$(date +%Y%m%d-%H%M%S)"
    removed="$(node -e '
      const fs = require("fs");
      const [settingsPath, dest] = process.argv.slice(1);
      let s = {};
      try { s = JSON.parse(fs.readFileSync(settingsPath, "utf-8")); } catch { process.exit(0); }
      if (!Array.isArray(s.extensions)) { console.log("0"); process.exit(0); }
      const before = s.extensions.length;
      // Remove the global install AND toggles written from a repo clone
      // (their paths contain the repo directory name).
      s.extensions = s.extensions.filter(p =>
        typeof p !== "string" || (!p.startsWith(dest + "/") && !p.includes("/agentic-teams-pi/")));
      fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n");
      console.log(String(before - s.extensions.length));
    ' "$SETTINGS" "$DEST")"
    if [ "${removed:-0}" -gt 0 ]; then
      say "  ${G}✓${N} settings.json: removed $removed entr$( [ "$removed" = 1 ] && echo y || echo ies) (backup kept)"
    else
      say "  ${D}settings.json: no agentic-teams entries found${N}"
    fi
  fi
fi

if [ "$DRY" = 1 ]; then
  say "  ${D}[dry-run]${N} rm -rf $DEST"
else
  rm -rf "$DEST"
  say "  ${G}✓${N} removed $DEST"
fi

say ""
say "${G}Uninstalled.${N} Restart pi (or /reload) to drop the commands."
say "${D}Left in place (remove manually if you want):${N}"
say "${D}  $AGENT_DIR/agents/            — personas, teams.yaml, agent-chain.yaml${N}"
say "${D}  $AGENT_DIR/themes/            — themes${N}"
say "${D}  $AGENT_DIR/skills/            — skills (bowser)${N}"
say "${D}  $HOME/.pi/damage-control-rules.yaml${N}"
