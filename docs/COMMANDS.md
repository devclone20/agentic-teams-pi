# Command Reference

> Generated from `REGISTRY` in [`slash/agentic-teams.ts`](../slash/agentic-teams.ts) by `scripts/gen-commands.ts`.
> Do not edit by hand — run `just gen-docs` after changing the registry.

Every feature command is a switch: the **same command activates and deactivates** it,
live in the current session (no restart). Mode commands take `off` as an argument.

## Meta commands (always available)

| Command | What it does | What it shows |
| --- | --- | --- |
| `/teams` | Shows every agent team, chain and persona available right now | Roster board: teams with members, chains with steps, agents as slash commands, engine state |
| `/pi-list` | Status board of every feature | Grouped list with ●/○ state dots and one-line descriptions |
| `/commands-pi` | Full in-session reference | Every command, what it unlocks, personas, prompt templates |
| `/pi-themes [name]` | Instant theme switch | Theme picker (or direct switch by name, with autocomplete) |
| `/pi-off` | Deactivates every engine at once | Summary of what was turned off; plain pi again |

## Orchestration

| Command | Engine | What it does | What it shows when active | Unlocks |
| --- | --- | --- | --- | --- |
| `/pi-team` | `agent-team.ts` | Team dispatcher engine — /agents-team picks the team (again → off) | Live team grid dashboard above the editor; the agent delegates via dispatch_agent | `/agents-team` · `/agents-list` · `/agents-grid <1-6>` · `dispatch_agent tool` |
| `/pi-chain` | `agent-chain.ts` | Sequential pipeline engine — /chain picks the pipeline (again → off) | Pipeline widget with step cards and arrows; run with the run_chain tool | `/chain` · `/chain-list` · `run_chain tool` |
| `/pi-sub` | `subagent-widget.ts` | Background Pi subagents with live streaming widgets (again → off) | One live progress widget per subagent: status, elapsed, tools, last output line | `/sub <task>` · `/subcont <id> <prompt>` · `/subrm <n>` · `/subclear` · `subagent_* tools` |
| `/pi-experts` | `pi-pi.ts` | Meta-agent consulting parallel Pi-framework experts (again → off) | Expert grid with per-expert status; answers assembled from parallel research | `/experts` · `/experts-grid <1-5>` · `query_experts tool` |

## Workflow

| Command | Engine | What it does | What it shows when active | Unlocks |
| --- | --- | --- | --- | --- |
| `/pi-tilldone` | `tilldone.ts` | Task discipline: tools blocked until a task list exists (again → off) | Persistent task list in the footer with live progress; nudges until everything is done | `/tilldone` · `tilldone tool` |
| `/pi-system` | `system-select.ts` | Switch system prompt to any discovered agent persona (again → off) | Persona picker dialog; active persona name in the status line | `/system` |
| `/pi-cross` | `cross-agent.ts` | Register commands/skills from .claude, .gemini, .codex dirs (again → off) | Boot summary of discovered commands; each one becomes /name or /skill:name | `/<discovered-command>` · `/skill:<name>` |
| `/pi-replay` | `session-replay.ts` | Scrollable timeline overlay of this session's history (again → off) | Full-screen timeline: every user/assistant/tool step with timestamps | `/replay` |
| `/pi-gate` | `purpose-gate.ts` | Declare the session's single purpose before any work (again → off) | Blocking purpose prompt, then a persistent purpose banner above the editor | `purpose banner + system-prompt focus` |

## Communication

| Command | Engine | What it does | What it shows when active | Unlocks |
| --- | --- | --- | --- | --- |
| `/pi-coms` | `coms.ts` | Peer-to-peer agent messaging over Unix sockets, same machine (again → off) | Live peer-pool widget; agents message each other with the coms_* tools | `/coms` · `coms_list` · `coms_send` · `coms_get` · `coms_await` |
| `/pi-coms-net` | `coms-net.ts` | Peer-to-peer over an HTTP/SSE hub — LAN or remote (again → off) | Live peer-pool widget across machines; hub via scripts/coms-net-server.ts | `/coms-net` · `coms_net_list` · `coms_net_send` · `coms_net_get` · `coms_net_await` |

## Safety

| Command | Engine | What it does | What it shows when active | Unlocks |
| --- | --- | --- | --- | --- |
| `/pi-damage strict\|continue\|off` | `damage-control.ts` / `damage-control-continue.ts` | Safety rails for bash/file access: strict | continue | off | 🛡️ shield in the status line; dangerous tool calls blocked (or blocked-with-feedback) | `rule enforcement from damage-control-rules.yaml` |

## Interface

| Command | Engine | What it does | What it shows when active | Unlocks |
| --- | --- | --- | --- | --- |
| `/pi-focus` | `pure-focus.ts` | Distraction-free: hide footer, status and widgets (again → restore) | Nothing — that is the point. Conversation and editor only | `clean screen` |
| `/pi-minimal` | `minimal.ts` | Compact footer: model name + 10-block context meter (again → off) | One-line footer like  deepseek-v4  [###-------] 30% | `footer meter` |
| `/pi-counter footer\|widget\|off` | `tool-counter.ts` / `tool-counter-widget.ts` | Per-tool call tally: footer | widget | off | Tokens, cost, branch and per-tool counts — as a footer or a colored widget | `live tool tally` |
| `/pi-cycler` | `theme-cycler.ts` | Theme hotkeys (terminal-dependent) + /theme picker (again → off) | 🎨 theme name in the status line; swatch flash on change | `/theme [name]` · `ctrl+shift+x` · `ctrl+q` |

## Agents as commands

`slash/agent-slash.ts` turns every discovered agent persona into its own slash command:

| Source | Command shape | Example |
| --- | --- | --- |
| `.pi/agents/*.md` (project or global) | `/<name> <task>` | `/scout map this codebase` |
| `.pi/agents/pi-pi/*.md` | `/<name> <task>` | `/ext-expert how do widgets work?` |
| `.claude/agents/*.md` (project or `~/.claude`) | `/cc-<name> <task>` | `/cc-architect review this design` |

Names that collide with a built-in or agentic-teams command get an `agent-` prefix.
`/agents-slash-list` lists everything that was registered, grouped by source.

## Coverage

16 feature commands cover **18 engines** (every extension in `extensions/` except the shared helper `themeMap.ts`).

