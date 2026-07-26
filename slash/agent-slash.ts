/**
 * Agent Slash — one slash command per agent persona
 *
 * Registers a slash command for every agent persona discovered in the
 * project and global agent directories from BOTH .pi and .claude sources,
 * with a clear, non-conflicting naming scheme:
 *
 *   - .pi agents    → raw name        (/scout, /builder, /red-team, …)
 *   - .claude agents → "cc-" + name   (/cc-akita, /cc-architect, …)
 *
 * Each command dispatches that specific persona as a one-shot ephemeral
 * `pi` subprocess (--no-session), streams its output, then injects the
 * result back into the conversation via pi.sendMessage so the main agent
 * and user can see it.
 *
 * Names that would collide with a built-in pi command or an agentic-teams
 * command are registered as "agent-" + name instead, so nothing is ever
 * silently shadowed.
 *
 * Helper:
 *   /agents-slash-list   — list all per-agent commands grouped by source
 *
 * Part of agentic-teams-pi. Loaded automatically next to agentic-teams.ts;
 * standalone: pi -e slash/agent-slash.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { spawn } from "child_process";
import { readdirSync, readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

// Survives ctx.reload(); released at session_start so the next reload
// generation can claim it. Keeps a global install + the repo's project
// settings from registering every persona command twice (pi would rename
// the duplicates to name:1/name:2).
const ACTIVE_KEY = "__agentSlashActive";

// ── Types ────────────────────────────────────────

type AgentSource = "pi" | "claude";

interface AgentDef {
	name: string;
	description: string;
	tools: string;
	systemPrompt: string;
	file: string;
	source: AgentSource;
}

// ── Frontmatter Parser ───────────────────────────
// Handles plain single-line values AND YAML folded/literal block scalars
// (`description: >` / `description: |` with the text on following indented
// lines), so .claude agents (which use folded descriptions) parse correctly.

function parseFrontmatter(fmText: string): Record<string, string> {
	const lines = fmText.split("\n");
	const fm: Record<string, string> = {};
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		const idx = line.indexOf(":");

		// A top-level key line: has a colon and is NOT indented.
		if (idx > 0 && !/^\s/.test(line)) {
			const key = line.slice(0, idx).trim();
			let val = line.slice(idx + 1).trim();

			// YAML sequence (`tools:` followed by `  - Bash` lines): join items
			// with commas so declared tools survive (.claude agents use this form).
			if (val === "") {
				const items: string[] = [];
				let j = i + 1;
				while (j < lines.length && /^\s+-\s*\S/.test(lines[j])) {
					items.push(lines[j].replace(/^\s+-\s*/, "").trim());
					j++;
				}
				if (items.length > 0) {
					fm[key] = items.join(",");
					i = j;
					continue;
				}
			}

			// YAML block scalar indicator (folded `>` or literal `|`,
			// with optional chomping `+`/`-`): gather following indented lines.
			if (/^[>|][+-]?$/.test(val)) {
				const collected: string[] = [];
				i++;
				while (
					i < lines.length &&
					(/^\s+/.test(lines[i]) || lines[i].trim() === "")
				) {
					// Stop if we hit a non-indented key on a blank-free line handled above.
					if (lines[i].trim() !== "") collected.push(lines[i].trim());
					i++;
				}
				fm[key] = collected.join(" ").trim();
				continue;
			}

			fm[key] = val;
		}

		i++;
	}

	return fm;
}

// Map declared tool names (including Claude Code's capitalized set) onto pi's
// tools; unknown tools are dropped rather than passed through to a failing CLI.
const TOOL_MAP: Record<string, string> = {
	bash: "bash", read: "read", write: "write", edit: "edit",
	grep: "grep", glob: "find", find: "find", ls: "ls",
};

function normalizeTools(raw: string | undefined): string {
	const mapped = (raw ?? "")
		.split(",")
		.map((t) => TOOL_MAP[t.trim().toLowerCase()])
		.filter((t): t is string => Boolean(t));
	return mapped.length > 0 ? [...new Set(mapped)].join(",") : "read,grep,find,ls";
}

function parseAgentFile(filePath: string): Omit<AgentDef, "source"> | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
		if (!match) return null;

		const frontmatter = parseFrontmatter(match[1]);

		if (!frontmatter.name) return null;

		return {
			name: frontmatter.name,
			description: frontmatter.description || "",
			tools: normalizeTools(frontmatter.tools),
			systemPrompt: match[2].trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
}

// ── Command-name derivation (non-conflicting) ────

// Built-in pi commands + every command the agentic-teams layer registers.
// A persona with one of these names gets an "agent-" prefix instead of
// shadowing the existing command.
export const RESERVED_NAMES = new Set([
	// pi built-ins
	"changelog", "clone", "compact", "copy", "export", "fork", "hotkeys", "import",
	"login", "logout", "model", "name", "new", "quit", "reload", "resume",
	"scoped-models", "session", "settings", "share", "tree", "trust",
	// agentic-teams meta + toggles
	"teams", "pi-list", "commands-pi", "pi-themes", "pi-off",
	"pi-team", "pi-chain", "pi-sub", "pi-experts", "pi-tilldone", "pi-system",
	"pi-cross", "pi-replay", "pi-gate", "pi-coms", "pi-coms-net", "pi-damage",
	"pi-focus", "pi-minimal", "pi-counter", "pi-cycler",
	// engine-provided commands
	"agents-team", "agents-list", "agents-grid", "chain", "chain-list",
	"sub", "subcont", "subrm", "subclear", "tilldone", "experts", "experts-grid",
	"coms", "coms-net", "system", "replay", "theme",
	// this file
	"agents-slash-list",
]);

export function slashCommandName(name: string, source: AgentSource): string {
	const base = source === "claude" ? `cc-${name}` : name;
	return RESERVED_NAMES.has(base.toLowerCase()) ? `agent-${base}` : base;
}

function commandNameFor(def: AgentDef): string {
	return slashCommandName(def.name, def.source);
}

// ── Directory Scanning WITH global fallback ──────
// cwd dirs first so project wins on dedupe, then global fallback.
// Each dir is tagged with its source ("pi" or "claude"); anything under a
// `.claude/agents` path is "claude", everything else (`agents`, `.pi/agents`,
// getAgentDir()/agents) is "pi".
//
// Dedupe is keyed by the FINAL COMMAND NAME (after applying the cc- prefix),
// so a .pi "reviewer" (=> "reviewer") and a hypothetical .claude "reviewer"
// (=> "cc-reviewer") can BOTH register. Within a command name, first-seen
// wins, and cwd dirs are listed before global dirs so project wins.

function scanAgentDirs(cwd: string): AgentDef[] {
	const dirs: Array<{ dir: string; source: AgentSource }> = [
		{ dir: join(cwd, "agents"), source: "pi" },
		{ dir: join(cwd, ".claude", "agents"), source: "claude" },
		{ dir: join(cwd, ".pi", "agents"), source: "pi" },
		{ dir: join(cwd, ".pi", "agents", "pi-pi"), source: "pi" },
		// Global fallback: user-level agents (cwd dirs listed first so project wins).
		{ dir: join(homedir(), ".claude", "agents"), source: "claude" },
		{ dir: join(getAgentDir(), "agents"), source: "pi" },
		{ dir: join(getAgentDir(), "agents", "pi-pi"), source: "pi" },
	];

	const agents: AgentDef[] = [];
	const seen = new Set<string>();

	for (const { dir, source } of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const fullPath = resolve(dir, file);
				const parsed = parseAgentFile(fullPath);
				if (!parsed) continue;
				const def: AgentDef = { ...parsed, source };
				const cmd = commandNameFor(def).toLowerCase();
				if (!seen.has(cmd)) {
					seen.add(cmd);
					agents.push(def);
				}
			}
		} catch {}
	}

	return agents;
}

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// Duplicate-load guard (global install + project settings): first copy wins.
	const g = globalThis as Record<string, unknown>;
	if (g[ACTIVE_KEY]) return;
	g[ACTIVE_KEY] = true;

	let registered = false;
	// Track registered commands with their source for grouped listing.
	const registeredCommands: Array<{ command: string; source: AgentSource }> = [];

	// ── Dispatch Agent (returns Promise) ──

	function dispatchAgent(
		def: AgentDef,
		task: string,
		ctx: any,
	): Promise<{ output: string; ok: boolean; error?: string; elapsed: number }> {
		const startTime = Date.now();

		// Inherit the session's model; without one, let the subprocess use pi's
		// own default instead of hardcoding a provider here.
		const modelArgs = ctx.model ? ["--model", `${ctx.model.provider}/${ctx.model.id}`] : [];

		// Ephemeral one-shot dispatch — --no-session keeps each invocation simple.
		const args = [
			"--mode", "json",
			"-p",
			"--no-extensions",
			...modelArgs,
			"--tools", def.tools,
			"--thinking", "off",
			"--append-system-prompt", def.systemPrompt,
			"--no-session",
			task,
		];

		const textChunks: string[] = [];
		// pi --mode json exits 0 even when the assistant turn fails — failure is
		// only visible in the terminal assistant message's stopReason.
		let stopError: string | undefined;
		let stderrTail = "";

		const consumeEvent = (line: string) => {
			try {
				const event = JSON.parse(line);
				if (event.type === "message_update") {
					const delta = event.assistantMessageEvent;
					if (delta?.type === "text_delta") textChunks.push(delta.delta || "");
				} else if (event.type === "message_end" && event.message?.role === "assistant") {
					const reason = event.message.stopReason;
					if (reason === "error" || reason === "aborted") {
						stopError = event.message.errorMessage || `assistant stopped: ${reason}`;
					}
				}
			} catch {}
		};

		return new Promise((resolvePromise) => {
			const proc = spawn("pi", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			});

			let buffer = "";

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (line.trim()) consumeEvent(line);
				}
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (chunk: string) => {
				stderrTail = (stderrTail + chunk).slice(-2000);
			});

			proc.on("close", (code) => {
				if (buffer.trim()) consumeEvent(buffer);

				const failed = (code ?? 1) !== 0 || stopError !== undefined;
				const error = failed
					? stopError || stderrTail.trim().split("\n").slice(-3).join("\n") || `pi exited with code ${code}`
					: undefined;

				resolvePromise({
					output: textChunks.join(""),
					ok: !failed,
					error,
					elapsed: Date.now() - startTime,
				});
			});

			proc.on("error", (err) => {
				resolvePromise({
					output: "",
					ok: false,
					error: `Error spawning agent: ${err.message}`,
					elapsed: Date.now() - startTime,
				});
			});
		});
	}

	// ── Register one command per agent ───────────

	function registerAgentCommands(ctx: any) {
		if (registered) return;
		registered = true;

		const cwd = ctx?.cwd || process.cwd();
		const defs = scanAgentDirs(cwd);

		if (defs.length === 0) {
			ctx?.ui?.notify?.("agent-slash: no agent personas found to register", "warning");
			return;
		}

		for (const def of defs) {
			const command = commandNameFor(def); // e.g. "scout" or "cc-architect"
			const label = def.source === "claude" ? "claude" : "pi";
			registeredCommands.push({ command, source: def.source });

			const shortDesc = (def.description || "").slice(0, 120);

			pi.registerCommand(command, {
				description: `[${label}] ${shortDesc}`.slice(0, 200),
				handler: async (args: string, hctx: any) => {
					const task = (args || "").trim();
					if (!task) {
						hctx.ui.notify(`Usage: /${command} <task>`, "warning");
						return;
					}

					hctx.ui.setStatus("agent-slash", `Running /${command}…`);
					hctx.ui.notify(`Dispatching /${command}…`, "info");

					const result = await dispatchAgent(def, task, hctx);

					const status = result.ok ? "done" : "error";
					const secs = Math.round(result.elapsed / 1000);

					hctx.ui.setStatus("agent-slash", undefined);
					hctx.ui.notify(`[${command}] ${status} in ${secs}s`, result.ok ? "success" : "error");

					const out = result.ok
						? result.output || "(no output)"
						: `FAILED: ${result.error}${result.output ? `\n\nPartial output:\n${result.output}` : ""}`;
					const truncated = out.length > 4000
						? out.slice(0, 4000) + "\n\n... [truncated]"
						: out;

					// Surface output in the session AND inject back into the
					// conversation so the main agent/user can see it.
					pi.sendMessage(
						{
							customType: "agent-slash-result",
							content: `/${command} ${status} in ${secs}s — task: "${task}"\n\n${result.ok ? "Result" : "Error"}:\n${out}`,
							display: true,
							details: { agent: command, source: def.source, status, elapsed: result.elapsed, error: result.error },
						},
						{ deliverAs: "followUp", triggerTurn: false },
					);

					// Fallback visible summary (truncated) via notify.
					hctx.ui.notify(`/${command} ${result.ok ? "output" : "error"}:\n${truncated}`, result.ok ? "info" : "error");
				},
			});
		}

		// Helper command listing all per-agent commands, grouped by source.
		pi.registerCommand("agents-slash-list", {
			description: "List all per-agent slash commands registered by agent-slash",
			handler: async (_args: string, hctx: any) => {
				if (registeredCommands.length === 0) {
					hctx.ui.notify("agent-slash: no per-agent commands registered", "warning");
					return;
				}
				const piCmds = registeredCommands
					.filter((c) => c.source === "pi")
					.map((c) => `/${c.command}`);
				const ccCmds = registeredCommands
					.filter((c) => c.source === "claude")
					.map((c) => `/${c.command}`);

				const parts: string[] = [
					`agent-slash — ${registeredCommands.length} per-agent commands`,
					"",
					`Pi agents (${piCmds.length}):`,
					piCmds.join("  ") || "(none)",
					"",
					`Claude agents (cc-*) (${ccCmds.length}):`,
					ccCmds.join("  ") || "(none)",
				];
				hctx.ui.notify(parts.join("\n"), "info");
			},
		});

		const piCount = registeredCommands.filter((c) => c.source === "pi").length;
		const ccCount = registeredCommands.filter((c) => c.source === "claude").length;

		ctx.ui.setStatus("agent-slash", `${registeredCommands.length} persona commands`);
		ctx.ui.notify(
			`agent-slash: registered ${registeredCommands.length} persona commands ` +
			`(${piCount} pi, ${ccCount} claude)\n` +
			registeredCommands.map((c) => `/${c.command}`).join("  ") +
			`\n\n/agents-slash-list   List all per-agent commands`,
			"info",
		);
	}

	// ── Session Start — register commands (ctx/cwd available) ──

	pi.on("session_start", async (_event, ctx) => {
		// Release the duplicate-load claim for the next reload generation.
		(globalThis as Record<string, unknown>)[ACTIVE_KEY] = false;
		registerAgentCommands(ctx);
	});
}
