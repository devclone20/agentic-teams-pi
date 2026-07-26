# agentic-teams-pi

Every Pi extension as an in-session slash command: the slash layer (`slash/`)
toggles engine extensions (`extensions/`) live via settings + reload.

## Tooling
- **Runtime**: extensions are loaded by Pi's jiti runtime (pi ≥ 0.82, package `@earendil-works/pi-coding-agent`)
- **Never** import `@mariozechner/*` — that package name is dead; use `@earendil-works/*`
- **Tests & scripts**: `bun` (`just smoke`, `just rpc-check`, `just gen-docs`)
- **Task runner**: `just` (see justfile)

## Structure
- `slash/agentic-teams.ts` — master command layer. Its `REGISTRY` is the **single source of truth** for every feature command
- `slash/agent-slash.ts` — one slash command per agent persona (`.pi` raw, `.claude` → `cc-` prefix)
- `extensions/` — 18 engines + the shared `themeMap.ts` helper; each engine must keep working standalone via `pi -e extensions/<name>.ts`
- `.pi/` — project settings (auto-loads the slash layer) + starter agents/themes/rules
- `AGENTS.md` — install/usage guide for LLM agents (two paths: slash layer vs raw extensions)
- `docs/COMMANDS.md` — **generated**; never edit by hand
- `test/` — `smoke.ts` (load + collision + coverage) and `rpc-check.sh` (live RPC E2E, zero tokens)

## Conventions
- After changing `REGISTRY`, run `just gen-docs` to regenerate docs/COMMANDS.md
- After adding/renaming any command, update `RESERVED_NAMES` in `slash/agent-slash.ts` and run `just smoke`
- The slash layer (`slash/*.ts`) must have ZERO dependencies beyond pi — it has to load on a fresh clone with no `bun install`
- Engines import the shared helper as `./themeMap.ts`; `@sinclair/typebox` is aliased by pi itself; `yaml` must stay in package.json (and, for global installs, in `~/.pi/agent/package.json` — install.sh handles that)
- Register tools at the top level of the extension factory, not inside event handlers
- Use `isToolCallEventType()` for type-safe `tool_call` narrowing
- English only — code, comments, UI strings, docs
