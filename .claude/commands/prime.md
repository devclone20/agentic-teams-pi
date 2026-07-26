---
description: Load foundational context for the agentic-teams-pi codebase
---

# Purpose

Orient yourself in agentic-teams-pi — every Pi coding-agent extension turned
into an in-session slash command: a master command layer (slash/) toggles
engine extensions (extensions/) live via settings + reload, with agent teams,
chains, subagents, P2P coms and safety rails as the payload.

## Workflow

1. Run `git ls-files --others --cached --exclude-standard` to see the project file tree
2. Read `README.md`, `CLAUDE.md`
3. Read `slash/agentic-teams.ts` (the REGISTRY is the single source of truth) and `slash/agent-slash.ts`
4. Skim `extensions/*` and `.pi/agents/*`
5. Read `.pi/settings.json`, `docs/COMMANDS.md`
6. Summarize your understanding of the project: purpose, stack, structure, key files, and entry points
