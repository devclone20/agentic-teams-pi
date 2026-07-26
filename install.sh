#!/usr/bin/env bash
# install.sh — wire agentic-teams-pi into every pi session on this machine.
#
#   ./install.sh            interactive
#   ./install.sh --yes      no prompts (CI / LLM agents)
#   ./install.sh --dry-run  show every action, change nothing
#
# What it does:
#   1. copies slash/ + extensions/ to ~/.pi/agent/agentic-teams/
#   2. makes sure the `yaml` package resolves for globally-loaded engines
#   3. installs starter agents/themes/rules WITHOUT overwriting yours
#   4. adds the two slash extensions to ~/.pi/agent/settings.json (backup first)
#
# Uninstall: ./uninstall.sh

set -euo pipefail

YES=0; DRY=0
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    --dry-run) DRY=1 ;;
    *) echo "unknown flag: $arg (use --yes / --dry-run)"; exit 1 ;;
  esac
done

if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ]; then
  G=""; Y=""; D=""; R=""; N=""
else
  G=$'\033[32m'; Y=$'\033[33m'; D=$'\033[2m'; R=$'\033[31m'; N=$'\033[0m'
fi

say()  { printf '%s\n' "$*"; }
ok()   { say "  ${G}✓${N} $*"; }
warn() { say "  ${Y}⚠${N} $*"; }
# run a command with a message, honoring --dry-run
run()  { local msg="$1"; shift; if [ "$DRY" = 1 ]; then say "  ${D}[dry-run]${N} $msg"; else "$@"; ok "$msg"; fi; }

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$HOME/.pi/agent"
DEST="$AGENT_DIR/agentic-teams"
SETTINGS="$AGENT_DIR/settings.json"

say ""
say "${G}agentic-teams-pi installer${N}"
say "${D}repo: $REPO_DIR${N}"
say "${D}dest: $DEST${N}"
say ""

# ── 0. prerequisites ────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  say "${R}node is required (used to edit settings.json safely). Install Node.js and re-run.${N}"
  exit 1
fi
if ! command -v pi >/dev/null 2>&1; then
  warn "pi not found on PATH — install it with: npm i -g @earendil-works/pi-coding-agent"
fi

# ── 1. copy code ────────────────────────────────────────────────────────────
if [ "$DRY" = 1 ]; then
  say "  ${D}[dry-run]${N} refresh $DEST/{slash,extensions} from repo"
else
  mkdir -p "$DEST"
  rm -rf "$DEST/slash" "$DEST/extensions"
  cp -R "$REPO_DIR/slash" "$DEST/slash"
  cp -R "$REPO_DIR/extensions" "$DEST/extensions"
  ok "code copied to $DEST"
fi

# ── 2. yaml dependency for globally-loaded engines ──────────────────────────
# Engines resolve `@sinclair/typebox` through pi's own bundle, but `yaml`
# must be resolvable from the agent dir (pi's documented pattern).
if [ -d "$AGENT_DIR/node_modules/yaml" ]; then
  ok "yaml dependency already available in $AGENT_DIR"
else
  if [ "$DRY" = 1 ]; then
    say "  ${D}[dry-run]${N} add yaml to $AGENT_DIR/package.json and npm install"
  else
    mkdir -p "$AGENT_DIR"
    node -e '
      const fs = require("fs");
      const p = process.argv[1] + "/package.json";
      let j = {};
      try { j = JSON.parse(fs.readFileSync(p, "utf-8")); } catch {}
      if (!j || typeof j !== "object" || Array.isArray(j)) j = {};
      j.name = j.name || "pi-agent-local";
      j.private = true;
      j.dependencies = Object.assign({}, j.dependencies, { yaml: "^2.8.0" });
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
    ' "$AGENT_DIR"
    installed_yaml=0
    if command -v npm >/dev/null 2>&1; then
      if (cd "$AGENT_DIR" && npm install --silent --no-audit --no-fund); then installed_yaml=1; fi
    fi
    if [ "$installed_yaml" = 0 ] && command -v bun >/dev/null 2>&1; then
      if (cd "$AGENT_DIR" && bun install --silent); then installed_yaml=1; fi
    fi
    if [ "$installed_yaml" = 1 ]; then
      ok "yaml dependency installed in $AGENT_DIR"
    else
      warn "could not install yaml automatically — run 'npm install' in $AGENT_DIR (only /pi-team and /pi-chain need it)"
    fi
  fi
fi

# ── 3. starter resources (never overwrite existing files) ───────────────────
copied=0; skipped=0
copy_tree() { # copy_tree <src-dir> <dst-dir>
  local src="$1" dst="$2" rel f
  [ -d "$src" ] || return 0
  while IFS= read -r f; do
    rel="${f#"$src"/}"
    if [ -e "$dst/$rel" ]; then
      skipped=$((skipped+1))
    else
      if [ "$DRY" = 1 ]; then
        say "  ${D}[dry-run]${N} install $dst/$rel"
      else
        mkdir -p "$(dirname "$dst/$rel")"
        cp "$f" "$dst/$rel"
      fi
      copied=$((copied+1))
    fi
  done < <(find "$src" -type f)
}

copy_tree "$REPO_DIR/.pi/agents" "$AGENT_DIR/agents"
copy_tree "$REPO_DIR/.pi/themes" "$AGENT_DIR/themes"
copy_tree "$REPO_DIR/.pi/skills" "$AGENT_DIR/skills"
# The damage-control engines read the GLOBAL rules from ~/.pi/ (not ~/.pi/agent/).
DC_RULES="$HOME/.pi/damage-control-rules.yaml"
if [ ! -e "$DC_RULES" ] && [ -e "$REPO_DIR/.pi/damage-control-rules.yaml" ]; then
  run "installed damage-control-rules.yaml → $DC_RULES" cp "$REPO_DIR/.pi/damage-control-rules.yaml" "$DC_RULES"
  copied=$((copied+1))
else
  skipped=$((skipped+1))
fi
ok "starter resources: $copied installed, $skipped kept (yours are never overwritten)"

# ── 4. settings.json ────────────────────────────────────────────────────────
[ "$DRY" = 1 ] || mkdir -p "$AGENT_DIR"

# A settings.json that exists but cannot be parsed must never be overwritten.
if [ -f "$SETTINGS" ]; then
  if ! node -e '
    const raw = require("fs").readFileSync(process.argv[1], "utf-8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || Array.isArray(j)) process.exit(2);
  ' "$SETTINGS" 2>/dev/null; then
    say "${R}settings.json exists but is not a valid JSON object — fix it by hand, then re-run:${N}"
    say "  $SETTINGS"
    exit 1
  fi
fi

# Fresh install vs re-install: on a re-install the user's own engine toggles
# are authoritative and the starter set must never be pushed on them.
FRESH=1
if [ -f "$SETTINGS" ] && grep -q "agentic-teams/slash" "$SETTINGS" 2>/dev/null; then
  FRESH=0
fi

legacy="$(node -e '
  const fs = require("fs");
  const [settingsPath, dest] = process.argv.slice(1);
  let s = {};
  try { s = JSON.parse(fs.readFileSync(settingsPath, "utf-8")); } catch {}
  const list = Array.isArray(s.extensions) ? s.extensions : [];
  const names = new Set(["pi-commands.ts", "agent-slash.ts", "agentic-teams.ts"]);
  const legacy = list.filter(p => {
    const base = p.split("/").pop();
    return names.has(base) && !p.startsWith(dest + "/");
  });
  process.stdout.write(legacy.join("\n"));
' "$SETTINGS" "$DEST")"

REPLACE_LEGACY=1
if [ -n "$legacy" ]; then
  say ""
  warn "legacy slash-command entries found in settings.json:"
  printf '%s\n' "$legacy" | sed "s/^/      /"
  if [ "$YES" = 1 ] || [ ! -t 0 ]; then
    say "  ${D}non-interactive → replacing them with agentic-teams${N}"
  else
    printf "  Replace them with agentic-teams? [Y/n] "
    read -r answer
    case "$answer" in
      n|N|no|NO) REPLACE_LEGACY=0; warn "keeping legacy entries — expect duplicate commands" ;;
      *) ;;
    esac
  fi
fi

if [ "$DRY" = 1 ]; then
  say "  ${D}[dry-run]${N} settings.json: remove stale/legacy entries, add:"
  say "  ${D}[dry-run]${N}   $DEST/slash/agentic-teams.ts"
  say "  ${D}[dry-run]${N}   $DEST/slash/agent-slash.ts"
  if [ "$FRESH" = 1 ]; then
    say "  ${D}[dry-run]${N} fresh install → would offer the visual starter set (6 engines)"
  fi
else
  if [ -f "$SETTINGS" ]; then
    BACKUP="$SETTINGS.bak-$(date +%Y%m%d-%H%M%S)"
    cp "$SETTINGS" "$BACKUP"
    say "  ${D}backup: $BACKUP${N}"
  fi
  node -e '
    const fs = require("fs");
    const [settingsPath, dest, replaceLegacy] = process.argv.slice(1);
    let s = {};
    try { s = JSON.parse(fs.readFileSync(settingsPath, "utf-8")); } catch {}
    let list = Array.isArray(s.extensions) ? s.extensions : [];
    const names = new Set(["pi-commands.ts", "agent-slash.ts", "agentic-teams.ts"]);
    const slashA = dest + "/slash/agentic-teams.ts";
    const slashB = dest + "/slash/agent-slash.ts";
    list = list.filter(p => {
      if (typeof p !== "string") return true;
      const base = p.split("/").pop();
      // Only strip our two slash entries (re-added below) — engine entries
      // under dest/extensions/ are user toggles and MUST survive a re-install.
      if (p === slashA || p === slashB) return false;
      if (replaceLegacy === "1" && names.has(base) && !p.startsWith(dest + "/")) return false;
      return true;
    });
    list.push(slashA, slashB);
    s.extensions = list;
    fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n");
  ' "$SETTINGS" "$DEST" "$REPLACE_LEGACY"
  ok "settings.json wired (slash layer active, engine toggles preserved)"

  # Visual starter set (fresh installs only): the boards are the product's face —
  # a first session with everything off looks broken to a newcomer.
  if [ "$FRESH" = 1 ]; then
    STARTER=1
    if [ "$YES" != 1 ] && [ -t 0 ]; then
      printf "  Enable the visual starter set (team grid, expert grid, chains board, subagent cards, minimal footer)? [Y/n] "
      read -r answer
      case "$answer" in
        n|N|no|NO) STARTER=0 ;;
        *) ;;
      esac
    fi
    if [ "$STARTER" = 1 ]; then
      node -e '
        const fs = require("fs");
        const [settingsPath, dest] = process.argv.slice(1);
        const s = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        const list = Array.isArray(s.extensions) ? s.extensions : [];
        const have = new Set(list.map(p => typeof p === "string" ? p.split("/").pop() : ""));
        const starter = ["minimal.ts", "agent-chain.ts", "cross-agent.ts", "agent-team.ts", "pi-pi.ts", "subagent-widget.ts"];
        for (const f of starter) {
          if (!have.has(f)) list.push(dest + "/extensions/" + f);
        }
        s.extensions = list;
        fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n");
      ' "$SETTINGS" "$DEST"
      ok "visual starter set enabled (turn any of it off later: /pi-list · /pi-off)"
    else
      say "  ${D}starter set skipped — enable features any time with /pi-team, /pi-experts, …${N}"
    fi
  fi
fi

# ── done ────────────────────────────────────────────────────────────────────
say ""
say "${G}Installed.${N} Next:"
say "  1. restart pi ${D}(or type /reload inside an open session)${N}"
say "  2. type ${Y}/teams${N}       — see every team, chain and agent you have"
say "  3. type ${Y}/pi-list${N}     — feature board · ${Y}/commands-pi${N} — full reference"
say ""
