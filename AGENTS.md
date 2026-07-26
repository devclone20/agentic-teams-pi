# AGENTS.md — install & usage guide for AI agents

You are an LLM agent asked to install or set up **agentic-teams-pi** for a human.
Follow this file exactly. Everything here is copy-paste runnable.

## What this repo is

A distribution for the [Pi coding agent](https://github.com/badlogic/pi-mono) with two layers:

| Layer | Directory | Who it's for |
| --- | --- | --- |
| **A. Slash commands** (default) | `slash/` + `extensions/` | Everyone. Every feature becomes an in-session command: `/pi-team` arms the agent team, same command disarms it. No restarts. |
| **B. Raw extensions** (pro) | `extensions/` only | Users who explicitly say they want the classic `-e` extension workflow, without the slash layer. |

## Decision rule

- The human said nothing specific, or asked for "the commands", "the teams", "install it" → **Path A**.
- The human explicitly asked for "extensions only", "no slash layer", "the pro setup", "-e flags" → **Path B**.
- The human asked to "just try it" without installing → **Path try-out**.

## Prerequisites (check first)

```bash
pi --version     # need ≥ 0.82  → if missing: npm i -g @earendil-works/pi-coding-agent
node --version   # any modern version (used by install.sh)
```

If `pi` reports a version below 0.82 or the package `@mariozechner/pi-coding-agent`
is installed instead, upgrade first: `npm i -g @earendil-works/pi-coding-agent`.

---

## Path try-out — run inside the repo, install nothing

```bash
git clone https://github.com/devclone20/agentic-teams-pi.git
cd agentic-teams-pi
pi
```

The repo's `.pi/settings.json` loads the slash layer for sessions started in this
directory only. Tell the human to type `/teams`. When pi asks whether to trust the
project, the human must answer yes — extensions only load in trusted projects.

Two caveats to relay honestly: (a) `/pi-*` toggles persist by writing your global
`~/.pi/agent/settings.json` (that is the persistence mechanism; `/pi-off` or
`./uninstall.sh` cleans it); (b) the `/pi-team` and `/pi-chain` engines read YAML —
run `bun install` (or `npm install`) once in the clone before toggling those two.

## Path A — slash commands, global (default)

```bash
git clone https://github.com/devclone20/agentic-teams-pi.git
cd agentic-teams-pi
./install.sh --yes
```

What `install.sh --yes` does (idempotent, always backs up settings.json first,
refuses to touch a corrupt settings.json, preserves your engine toggles on re-runs):
1. Copies `slash/` + `extensions/` to `~/.pi/agent/agentic-teams/`
2. Ensures the `yaml` package resolves from `~/.pi/agent/` (needed by the team/chain engines)
3. Installs starter personas/teams/themes/skills into `~/.pi/agent/` and the safety
   rules to `~/.pi/damage-control-rules.yaml` (where the engines read them) — **never overwriting existing files**
4. Adds two entries to the `extensions` array of `~/.pi/agent/settings.json`

Then verify:

```bash
bash test/rpc-check.sh   # optional but recommended — spends zero LLM tokens
```

Tell the human: restart pi (or type `/reload` in an open session), then:
- `/teams` — every team, chain and agent they have
- `/pi-list` — feature board · `/commands-pi` — full reference
- any feature: `/pi-team`, `/pi-sub`, `/pi-coms`, … — **same command turns it off again**
- `/pi-off` — everything off at once

## Path B — raw extensions only (pro)

Do NOT run install.sh. The engines work standalone, straight from the repo clone:

```bash
git clone https://github.com/devclone20/agentic-teams-pi.git
cd agentic-teams-pi
bun install                              # needed by agent-team/agent-chain (yaml) + the coms-net hub
pi -e extensions/agent-team.ts           # one engine
pi -e extensions/minimal.ts -e extensions/tool-counter-widget.ts   # stacked
just ext-agent-team                      # or use the just recipes (just --list)
```

Per-engine reference (flags, config files, what each registers): [docs/EXTENSIONS.md](docs/EXTENSIONS.md).

**On/off for pros:** an `-e` extension lives only for that session — "off" is simply
launching without the flag. For a persistent set, add absolute engine paths to the
`extensions` array in `~/.pi/agent/settings.json` and remove them to turn off.
That is exactly what the slash layer automates; a pro can do it by hand.

Engines that need config files (`agent-team` → `teams.yaml`, `agent-chain` →
`agent-chain.yaml`, `pi-pi` → `.pi/agents/pi-pi/`, `damage-control` →
`damage-control-rules.yaml`): the repo ships working starters under `.pi/` — running
from the repo directory just works. For global use copy them to `~/.pi/agent/`
(that is step 3 of install.sh; pros can copy selectively).

## Uninstall

```bash
./uninstall.sh        # removes ~/.pi/agent/agentic-teams + its 2 settings entries
```

Shared resources under `~/.pi/agent/` (agents/, themes/, damage-control-rules.yaml)
are left in place; the script prints what and where.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/teams` unknown after install | Restart pi or type `/reload`; confirm both entries exist in `~/.pi/agent/settings.json` → `extensions` |
| `Cannot find module 'yaml'` on engine load | In-repo: `bun install` (or `npm install`) in the clone. Global install: `cd ~/.pi/agent && npm install` (install.sh normally does this) |
| `/pi-coms` and `/pi-coms-net` both wanted | Not possible — they share CLI flags; turning one on turns the other off automatically |
| `Cannot find package '@mariozechner/...'` | Old pi. `npm i -g @earendil-works/pi-coding-agent` |
| Extensions don't load inside the repo | The project wasn't trusted — restart pi in the repo dir and accept the trust prompt |
| Duplicate commands in autocomplete | A legacy copy of the engines is still wired in settings.json — re-run `./install.sh` and accept the replace prompt |
| Toggle saved but nothing changed | The reload failed mid-flight; type `/reload` manually |

## Rules for agents working on this repo's code

Read `CLAUDE.md`. Short version: `REGISTRY` in `slash/agentic-teams.ts` is the single
source of truth; regenerate docs with `just gen-docs`; keep `RESERVED_NAMES` in
`slash/agent-slash.ts` in sync; run `just smoke` before committing; English only.
