# Extensions Reference (pro path)

Every engine in `extensions/` is a standalone Pi extension. This is the raw, no-slash-layer
reference: launch lines, what each engine registers, the config and environment it reads.

```bash
pi -e extensions/<name>.ts                 # one engine
pi -e extensions/a.ts -e extensions/b.ts   # engines compose — stack as many as you want
just --list                                # ready-made ext-* combos
```

**Session-scoped vs persistent.** An `-e` engine lives for that session only — "off" is
launching without the flag. To make a set persistent, put absolute paths in the
`extensions` array of `~/.pi/agent/settings.json`; remove them to turn off. The slash
layer (`/pi-*` commands) automates exactly that edit + a live `/reload`.

**Dependencies.** `@sinclair/typebox` is aliased to Pi's own bundle — nothing to install.
`yaml` (used by `agent-team` and `agent-chain`) resolves from the repo's `node_modules`
when running here (`bun install` once); for engines loaded from elsewhere,
`~/.pi/agent/package.json` must carry it (`install.sh` step 2, or `cd ~/.pi/agent && npm i yaml`).
The slash layer itself has zero dependencies.

---

## Orchestration

### agent-team.ts
Dispatcher-only orchestration: the primary agent stops answering directly and delegates
every request to a specialist via the `dispatch_agent` tool, with a live grid dashboard.

| | |
| --- | --- |
| Launch | `pi -e extensions/agent-team.ts` · `just ext-agent-team` |
| Commands | `/agents-team` (pick team — arms the dispatcher) · `/agents-list` · `/agents-grid <1-6>` |
| Tools | `dispatch_agent` |
| Config | `.pi/agents/teams.yaml` (project → `~/.pi/agent/agents/teams.yaml` fallback); personas from `agents/`, `.pi/agents/`, `.claude/agents/` + global |
| UI | team grid widget, status line, custom footer |
| Notes | Dormant until `/agents-team` is run. Spawns one `pi --mode json -p --no-extensions` subprocess per dispatch; per-agent session files under `.pi/agent-sessions/` (wiped on session start). |

### agent-chain.ts
Sequential pipelines: each step's output feeds the next agent's prompt (`$INPUT`), with
the user's original ask always available as `$ORIGINAL`.

| | |
| --- | --- |
| Launch | `pi -e extensions/agent-chain.ts` · `just ext-agent-chain` |
| Commands | `/chain` (pick pipeline — arms it) · `/chain-list` |
| Tools | `run_chain` |
| Config | `.pi/agents/agent-chain.yaml` (project → global fallback) |
| UI | pipeline widget with step cards and arrows |
| Notes | Dormant until `/chain` is run. Same subprocess model as agent-team. |

### subagent-widget.ts
Background Pi subagents you can keep talking to: each gets a persistent session file and
a live streaming widget.

| | |
| --- | --- |
| Launch | `pi -e extensions/subagent-widget.ts` · `just ext-subagent-widget` |
| Commands | `/sub [--model p/m] [--thinking l] <task>` · `/subcont <id> <prompt>` · `/subrm <n>` · `/subclear` |
| Tools | `subagent_create` · `subagent_continue` · `subagent_remove` · `subagent_list` |
| Config | sessions under `~/.pi/agent/sessions/subagents/` |
| Notes | Session start (and every `/reload`) kills running subagents and clears widgets — launch subagents after your toggles are settled. |

### pi-pi.ts
Meta-agent: answers Pi-framework questions by fanning out to specialist experts in parallel.

| | |
| --- | --- |
| Launch | `pi -e extensions/pi-pi.ts` · `just ext-pi-pi` |
| Commands | `/experts` (arms orchestrator mode) · `/experts-grid <1-5>` |
| Tools | `query_experts` |
| Config | `.pi/agents/pi-pi/*.md` experts + `pi-orchestrator.md` template (project → global fallback) |
| Env | `FIRECRAWL_API_KEY` optional — experts fall back to `curl` |

## Workflow

### tilldone.ts
Task discipline: every tool is blocked until a task list exists and one task is in
progress; the agent is nudged until the list is done.

| | |
| --- | --- |
| Launch | `pi -e extensions/tilldone.ts` · `just ext-tilldone` |
| Commands | `/tilldone` (overlay with the full list) |
| Tools | `tilldone` (actions: new-list, add, toggle, remove, update, list, clear) |
| Notes | State reconstructs from the session branch — survives `/reload`, forks and resumes. |

### system-select.ts
Switch the system prompt to any discovered agent persona, optionally restricting tools.

| | |
| --- | --- |
| Launch | `pi -e extensions/system-select.ts` · `just ext-system-select` |
| Commands | `/system` (picker; "Reset to Default" included) |
| Config | `.pi/.claude/.gemini/.codex` `agents/*.md`, project + home |

### cross-agent.ts
Registers commands, skills and agents from other AI-tool directories as native Pi commands.

| | |
| --- | --- |
| Launch | `pi -e extensions/cross-agent.ts` · `just ext-cross-agent` |
| Commands | one `/name` per discovered command · `/skill:<name>` per skill |
| Config | `.claude/ .gemini/ .codex` → `commands/*.md`, `skills/*/SKILL.md`, `agents/*.md` (project + home) |
| Notes | Registration happens at load. `$1`/`$@`/`$ARGUMENTS` in templates are expanded. |

### session-replay.ts
Scrollable, expandable timeline overlay of everything that happened in the session.

| | |
| --- | --- |
| Launch | `pi -e extensions/session-replay.ts` · `just ext-session-replay` |
| Commands | `/replay` (↑/↓ navigate · Enter expand · Esc close) |

### purpose-gate.ts
Blocks the session until you declare its single purpose; keeps it visible and injected
into the system prompt.

| | |
| --- | --- |
| Launch | `pi -e extensions/purpose-gate.ts` · `just ext-purpose-gate` |
| UI | blocking input at start, then a persistent purpose banner |
| Notes | No commands — the gate IS the feature. Activating mid-session (slash layer) prompts immediately. |

## Communication

> `coms.ts` and `coms-net.ts` register the same CLI flags — never load both in one
> session (the slash layer enforces this automatically; with `-e`, pick one).

### coms.ts
Peer-to-peer messaging between Pi agents on the same machine (Unix sockets / named pipes),
with file-registry discovery, live peer pool, hop limits and an audit log.

| | |
| --- | --- |
| Launch | `just local-coms --name dev --cname dev --color "#72F1B8"` |
| Commands | `/coms [--all] [--project <name>]` |
| Tools | `coms_list` · `coms_send` · `coms_get` · `coms_await` |
| Env | `PI_COMS_DIR` (default `~/.pi/coms`) · `PI_COMS_MAX_HOPS` (5) · `PI_COMS_TIMEOUT_MS` (30 min) · `PI_COMS_PING_INTERVAL_MS` (10 s) |
| Flags | `--cname` `--purpose` `--project` `--color` `--explicit` (pi owns `--name`) |
| Notes | Cleans up socket + registry on shutdown; prunes dead peers on every list. |

### coms-net.ts
The same peer-to-peer model over an HTTP/SSE hub — across terminals, machines or a LAN.

| | |
| --- | --- |
| Hub | `bun scripts/coms-net-server.ts` · `just coms-net-server` (localhost) · `just coms-net-server-lan` |
| Launch | `just coms --name dev --cname dev` |
| Commands | `/coms-net [--all | --reconnect | --server | --project <name>]` |
| Tools | `coms_net_list` · `coms_net_send` · `coms_net_get` · `coms_net_await` |
| Env | `PI_COMS_NET_SERVER_URL` · `PI_COMS_NET_AUTH_TOKEN` (required beyond localhost) · `PI_COMS_NET_PORT` · `PI_COMS_NET_MAX_HOPS` · `PI_COMS_NET_HEARTBEAT_MS` · `PI_COMS_NET_MESSAGE_TTL_MS` |
| Notes | Localhost-by-default; SSE reconnect with backoff; heartbeats mark peers stale/offline. Front with TLS beyond a trusted LAN. |

## Safety

### damage-control.ts / damage-control-continue.ts
Real-time guard over every tool call: dangerous bash patterns, zero-access paths,
read-only paths, no-delete paths — from a YAML rules file. `strict` aborts the turn on a
block; `continue` returns actionable feedback and lets the agent adapt.

| | |
| --- | --- |
| Launch | `just ext-damage-control` · `just ext-damage-control-continue` |
| Config | `.pi/damage-control-rules.yaml` (project) → `~/.pi/damage-control-rules.yaml` (global) |
| UI | 🛡️ rule count in status line; block notifications; optional ask-to-confirm rules |
| Notes | Load one variant at a time — the slash layer (`/pi-damage strict\|continue\|off`) enforces that for you. |

## Interface

| Engine | Launch | What you get |
| --- | --- | --- |
| `pure-focus.ts` | `just ext-pure-focus` | Footer, status and widgets stripped — conversation + editor only |
| `minimal.ts` | `just ext-minimal` | One-line footer: model + 10-block context meter |
| `tool-counter.ts` | `just ext-tool-counter` | Two-line footer: model/context/tokens/cost + cwd/branch/per-tool tally |
| `tool-counter-widget.ts` | `just ext-tool-counter-widget` | Colored per-tool tally widget above the editor |
| `theme-cycler.ts` | `just ext-theme-cycler` | `/theme [name]` picker + `ctrl+shift+x` / `ctrl+q` cycling, swatch flash |

### themeMap.ts
Shared helper, not an engine: maps engine files to default themes and sets the terminal
title. Imported by the engines as `./themeMap.ts`; exports a no-op factory so Pi's
auto-discovery never chokes on it.

---

## Writing your own engine

Use any engine here as the template. Contract:

1. standalone `.ts` file, default-exports `function (pi: ExtensionAPI)`
2. imports from `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui`
3. register tools/commands at the top level of the factory, events via `pi.on(...)`
4. keep it loadable at any time — it may be activated mid-session by the slash layer
5. add it to `REGISTRY` in `slash/agentic-teams.ts` to give it a `/pi-*` switch, then `just gen-docs && just smoke`

Reference docs: [TOOLS.md](TOOLS.md) · [THEME.md](THEME.md) · [RESERVED_KEYS.md](RESERVED_KEYS.md) · upstream specs in [specs/](specs/).
