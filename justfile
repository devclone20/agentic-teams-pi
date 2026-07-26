set dotenv-load := true

# List every recipe
default:
    @just --list

# ─────────────────────────── everyday ───────────────────────────

# Launch pi inside this repo — the slash layer loads automatically (/teams, /pi-list, …)
pi:
    pi

# Install the slash layer globally (every pi session, any directory)
install:
    bash install.sh

# Remove the global install
uninstall:
    bash uninstall.sh

# ─────────────────────────── quality ────────────────────────────

# Static check: every module loads, zero command collisions, every engine covered
smoke:
    bun test/smoke.ts

# Live check: boots pi in RPC mode in a throwaway HOME and flips real toggles (zero tokens)
rpc-check:
    bash test/rpc-check.sh

# Regenerate docs/COMMANDS.md from the REGISTRY in slash/agentic-teams.ts
gen-docs:
    bun scripts/gen-commands.ts

# ──────────────────── pro: extensions by hand ───────────────────
# Each engine also works standalone, without the slash layer.
# Stack combos with:  pi -e extensions/a.ts -e extensions/b.ts

# Distraction-free mode
ext-pure-focus:
    pi -e extensions/pure-focus.ts

# Minimal context-meter footer (+ theme cycler)
ext-minimal:
    pi -e extensions/minimal.ts -e extensions/theme-cycler.ts

# Cross-agent command loading + minimal footer
ext-cross-agent:
    pi -e extensions/cross-agent.ts -e extensions/minimal.ts

# Purpose gate + minimal footer
ext-purpose-gate:
    pi -e extensions/purpose-gate.ts -e extensions/minimal.ts

# Rich two-line footer with tool tally
ext-tool-counter:
    pi -e extensions/tool-counter.ts

# Per-tool widget above the editor
ext-tool-counter-widget:
    pi -e extensions/tool-counter-widget.ts -e extensions/minimal.ts

# Subagent spawner with live progress widgets
ext-subagent-widget:
    pi -e extensions/subagent-widget.ts -e extensions/pure-focus.ts -e extensions/theme-cycler.ts

# Task discipline with live progress tracking
ext-tilldone:
    pi -e extensions/tilldone.ts -e extensions/theme-cycler.ts

# Multi-agent orchestration grid dashboard
ext-agent-team:
    pi -e extensions/agent-team.ts -e extensions/theme-cycler.ts

# Agent persona switcher via /system
ext-system-select:
    pi -e extensions/system-select.ts -e extensions/minimal.ts -e extensions/theme-cycler.ts

# Safety auditing (strict: block & abort)
ext-damage-control:
    pi -e extensions/damage-control.ts -e extensions/minimal.ts -e extensions/theme-cycler.ts

# Safety auditing (continue: block & keep going)
ext-damage-control-continue:
    pi -e extensions/damage-control-continue.ts -e extensions/minimal.ts -e extensions/theme-cycler.ts

# Sequential pipeline orchestrator
ext-agent-chain:
    pi -e extensions/agent-chain.ts -e extensions/theme-cycler.ts

# Meta-agent with parallel Pi-framework experts
ext-pi-pi:
    pi -e extensions/pi-pi.ts -e extensions/theme-cycler.ts

# Scrollable session timeline overlay
ext-session-replay:
    pi -e extensions/session-replay.ts -e extensions/minimal.ts

# Theme cycler: ctrl+shift+x / ctrl+q + /theme picker
ext-theme-cycler:
    pi -e extensions/theme-cycler.ts -e extensions/minimal.ts

# Open pi with any stacked extensions in a new Terminal window: just open minimal tool-counter
open +exts:
    #!/usr/bin/env bash
    args=""
    for ext in {{exts}}; do
        args="$args -e extensions/$ext.ts"
    done
    cmd="cd '{{justfile_directory()}}' && pi$args"
    escaped="${cmd//\\/\\\\}"
    escaped="${escaped//\"/\\\"}"
    osascript -e "tell application \"Terminal\" to do script \"$escaped\""

# ──────────────────── coms: pi-to-pi messaging ──────────────────

# Same-machine peer-to-peer (pass --cname <name> --purpose "..." --color "#36F9F6")
local-coms *args:
    pi -e extensions/coms.ts -e extensions/minimal.ts -e extensions/theme-cycler.ts {{args}}

# Start a local coms-net hub (binds 127.0.0.1, kills stale port holder first)
coms-net-server:
    -lsof -ti :${PI_COMS_NET_PORT:-52965} | xargs -r kill -TERM 2>/dev/null
    bun scripts/coms-net-server.ts

# Start a LAN-visible hub (binds 0.0.0.0 — requires PI_COMS_NET_AUTH_TOKEN)
coms-net-server-lan:
    -lsof -ti :${PI_COMS_NET_PORT:-52965} | xargs -r kill -TERM 2>/dev/null
    PI_COMS_NET_HOST=0.0.0.0 bun scripts/coms-net-server.ts

# Networked coms client (auto-discovers the local hub)
coms *args:
    pi -e extensions/coms-net.ts -e extensions/minimal.ts -e extensions/theme-cycler.ts {{args}}
