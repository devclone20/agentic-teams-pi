/**
 * agentic-teams — every engine in this repo as an in-session slash command.
 *
 * One command per engine. The same command activates AND deactivates it:
 *
 *   /pi-team        agent-team dispatcher engine on   (again → off)
 *   /pi-damage      safety rails: strict|continue|off
 *   /teams          show every team, chain and agent available right now
 *   /pi-list        status board of every feature
 *   /commands-pi    full reference table
 *   /pi-off         deactivate everything at once
 *
 * How activation works: toggling a feature writes the engine file into
 * ~/.pi/agent/settings.json "extensions" and calls ctx.reload() — Pi reloads
 * extensions in place, so the engine's commands, tools and widgets appear
 * (or disappear) in the SAME session. No restart, no relaunch flags.
 *
 * Design notes:
 * - Engines are matched in settings by basename, so a copy of the same engine
 *   loaded from another directory is recognised (and replaced in place, keeping
 *   load order) instead of being doubled.
 * - This file has NO dependencies beyond pi itself — it must load on a fresh
 *   clone before any `bun install`. The tiny YAML readers below only feed the
 *   /teams display; engines do their own real parsing.
 * - A duplicate-load guard keeps the global install and the repo's project
 *   settings from registering everything twice.
 *
 * Origin: engines from disler/pi-vs-claude-code (MIT), slash-command layer
 * grown from Alex Rider's pi-commands experiment.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { slashCommandName } from "./agent-slash.ts";

// ── Paths ──────────────────────────────────────────────────────────────────
const HERE = dirname(fileURLToPath(import.meta.url)); // …/slash
const PKG_ROOT = resolve(HERE, "..");                 // repo root or ~/.pi/agent/agentic-teams
const ENGINE_DIR = join(PKG_ROOT, "extensions");
const AGENT_DIR = join(homedir(), ".pi", "agent");
const SETTINGS_PATH = join(AGENT_DIR, "settings.json");

// Survive ctx.reload() (same process, fresh module instances).
const STASH_KEY = "__agenticTeamsToggle";
const ACTIVE_KEY = "__agenticTeamsActive";

// ── ANSI palette (synthwave, matches the engine family) ────────────────────
const pink = (s: string) => `\x1b[38;2;255;126;219m${s}\x1b[39m`;
const cyan = (s: string) => `\x1b[38;2;54;249;246m${s}\x1b[39m`;
const green = (s: string) => `\x1b[38;2;114;241;184m${s}\x1b[39m`;
const yellow = (s: string) => `\x1b[38;2;254;222;93m${s}\x1b[39m`;
const dim = (s: string) => `\x1b[38;2;120;100;140m${s}\x1b[39m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;

// ── Feature registry — single source of truth ──────────────────────────────
// scripts/gen-commands.ts imports REGISTRY to generate docs/COMMANDS.md.

export type Group = "Orchestration" | "Workflow" | "Communication" | "Safety" | "Interface";

export interface EngineMode {
	name: string;   // argument that selects this mode, e.g. "strict"
	engine: string; // engine filename in extensions/
	label: string;
}

export interface Feature {
	cmd: string;          // command name without the slash, e.g. "pi-team"
	label: string;
	desc: string;         // one line shown in autocomplete
	shows: string;        // what appears in the session once active (for tables)
	unlocks: string[];    // commands/tools the engine provides
	group: Group;
	engine?: string;      // single-engine toggle
	modes?: EngineMode[]; // multi-engine mode command (mutually exclusive)
	excludes?: string[];  // engine files that must be OFF while this one is on
	requires?: { rel: string; globalAbs?: string; hint: string }[];
}

export const REGISTRY: Feature[] = [
	// ── Orchestration ──
	{
		cmd: "pi-team", label: "Agent Team", group: "Orchestration",
		engine: "agent-team.ts",
		desc: "Team dispatcher engine — /agents-team picks the team (again → off)",
		shows: "Live team grid dashboard above the editor; the agent delegates via dispatch_agent",
		unlocks: ["/agents-team", "/agents-list", "/agents-grid <1-6>", "dispatch_agent tool"],
		requires: [{ rel: ".pi/agents/teams.yaml", hint: "team rosters (install.sh puts a starter set in ~/.pi/agent/agents/)" }],
	},
	{
		cmd: "pi-chain", label: "Agent Chain", group: "Orchestration",
		engine: "agent-chain.ts",
		desc: "Sequential pipeline engine — /chain picks the pipeline (again → off)",
		shows: "Pipeline widget with step cards and arrows; run with the run_chain tool",
		unlocks: ["/chain", "/chain-list", "run_chain tool"],
		requires: [{ rel: ".pi/agents/agent-chain.yaml", hint: "pipeline definitions" }],
	},
	{
		cmd: "pi-sub", label: "Subagents", group: "Orchestration",
		engine: "subagent-widget.ts",
		desc: "Background Pi subagents with live streaming widgets (again → off)",
		shows: "One live progress widget per subagent: status, elapsed, tools, last output line",
		unlocks: ["/sub <task>", "/subcont <id> <prompt>", "/subrm <n>", "/subclear", "subagent_* tools"],
	},
	{
		cmd: "pi-experts", label: "Pi-Pi Experts", group: "Orchestration",
		engine: "pi-pi.ts",
		desc: "Meta-agent consulting parallel Pi-framework experts (again → off)",
		shows: "Expert grid with per-expert status; answers assembled from parallel research",
		unlocks: ["/experts", "/experts-grid <1-5>", "query_experts tool"],
		requires: [{ rel: ".pi/agents/pi-pi", hint: "expert persona directory" }],
	},

	// ── Workflow ──
	{
		cmd: "pi-tilldone", label: "TillDone", group: "Workflow",
		engine: "tilldone.ts",
		desc: "Task discipline: tools blocked until a task list exists (again → off)",
		shows: "Persistent task list in the footer with live progress; nudges until everything is done",
		unlocks: ["/tilldone", "tilldone tool"],
	},
	{
		cmd: "pi-system", label: "System Select", group: "Workflow",
		engine: "system-select.ts",
		desc: "Switch system prompt to any discovered agent persona (again → off)",
		shows: "Persona picker dialog; active persona name in the status line",
		unlocks: ["/system"],
	},
	{
		cmd: "pi-cross", label: "Cross-Agent", group: "Workflow",
		engine: "cross-agent.ts",
		desc: "Register commands/skills from .claude, .gemini, .codex dirs (again → off)",
		shows: "Boot summary of discovered commands; each one becomes /name or /skill:name",
		unlocks: ["/<discovered-command>", "/skill:<name>"],
	},
	{
		cmd: "pi-replay", label: "Session Replay", group: "Workflow",
		engine: "session-replay.ts",
		desc: "Scrollable timeline overlay of this session's history (again → off)",
		shows: "Full-screen timeline: every user/assistant/tool step with timestamps",
		unlocks: ["/replay"],
	},
	{
		cmd: "pi-gate", label: "Purpose Gate", group: "Workflow",
		engine: "purpose-gate.ts",
		desc: "Declare the session's single purpose before any work (again → off)",
		shows: "Blocking purpose prompt, then a persistent purpose banner above the editor",
		unlocks: ["purpose banner + system-prompt focus"],
	},

	// ── Communication ──
	{
		cmd: "pi-coms", label: "Coms (local)", group: "Communication",
		engine: "coms.ts",
		excludes: ["coms-net.ts"],
		desc: "Peer-to-peer agent messaging over Unix sockets, same machine (again → off)",
		shows: "Live peer-pool widget; agents message each other with the coms_* tools",
		unlocks: ["/coms", "coms_list", "coms_send", "coms_get", "coms_await"],
	},
	{
		cmd: "pi-coms-net", label: "Coms-Net (network)", group: "Communication",
		engine: "coms-net.ts",
		excludes: ["coms.ts"],
		desc: "Peer-to-peer over an HTTP/SSE hub — LAN or remote (again → off)",
		shows: "Live peer-pool widget across machines; hub via scripts/coms-net-server.ts",
		unlocks: ["/coms-net", "coms_net_list", "coms_net_send", "coms_net_get", "coms_net_await"],
	},

	// ── Safety ──
	{
		cmd: "pi-damage", label: "Damage Control", group: "Safety",
		modes: [
			{ name: "strict", engine: "damage-control.ts", label: "strict (block & abort)" },
			{ name: "continue", engine: "damage-control-continue.ts", label: "continue (block & keep going)" },
		],
		desc: "Safety rails for bash/file access: strict | continue | off",
		shows: "🛡️ shield in the status line; dangerous tool calls blocked (or blocked-with-feedback)",
		unlocks: ["rule enforcement from damage-control-rules.yaml"],
		requires: [{
			rel: ".pi/damage-control-rules.yaml",
			// The safety engines read the global copy from ~/.pi/, NOT ~/.pi/agent/.
			globalAbs: join(homedir(), ".pi", "damage-control-rules.yaml"),
			hint: "rules file (project) or ~/.pi/damage-control-rules.yaml (global)",
		}],
	},

	// ── Interface ──
	{
		cmd: "pi-focus", label: "Pure Focus", group: "Interface",
		engine: "pure-focus.ts",
		desc: "Distraction-free: hide footer, status and widgets (again → restore)",
		shows: "Nothing — that is the point. Conversation and editor only",
		unlocks: ["clean screen"],
	},
	{
		cmd: "pi-minimal", label: "Minimal Footer", group: "Interface",
		engine: "minimal.ts",
		desc: "Compact footer: model name + 10-block context meter (again → off)",
		shows: "One-line footer like  deepseek-v4  [###-------] 30%",
		unlocks: ["footer meter"],
	},
	{
		cmd: "pi-counter", label: "Tool Counter", group: "Interface",
		modes: [
			{ name: "footer", engine: "tool-counter.ts", label: "footer (2-line stats bar)" },
			{ name: "widget", engine: "tool-counter-widget.ts", label: "widget (colored tally above editor)" },
		],
		desc: "Per-tool call tally: footer | widget | off",
		shows: "Tokens, cost, branch and per-tool counts — as a footer or a colored widget",
		unlocks: ["live tool tally"],
	},
	{
		cmd: "pi-cycler", label: "Theme Cycler", group: "Interface",
		engine: "theme-cycler.ts",
		desc: "Theme hotkeys (terminal-dependent) + /theme picker (again → off)",
		shows: "🎨 theme name in the status line; swatch flash on change",
		unlocks: ["/theme [name]", "ctrl+shift+x", "ctrl+q"],
	},
];

const GROUPS: Group[] = ["Orchestration", "Workflow", "Communication", "Safety", "Interface"];

/** Every engine filename the registry can toggle. */
export function allEngineFiles(): string[] {
	const files: string[] = [];
	for (const f of REGISTRY) {
		if (f.engine) files.push(f.engine);
		for (const m of f.modes ?? []) files.push(m.engine);
	}
	return files;
}

function featureByEngine(engine: string): Feature | undefined {
	return REGISTRY.find((f) => f.engine === engine || (f.modes ?? []).some((m) => m.engine === engine));
}

// ── settings.json helpers ──────────────────────────────────────────────────

interface SettingsRead {
	data: Record<string, unknown>;
	/** true = the file exists but is not a valid JSON object — never write over it */
	corrupt: boolean;
}

function readSettings(): SettingsRead {
	let raw: string;
	try {
		raw = readFileSync(SETTINGS_PATH, "utf-8");
	} catch {
		return { data: {}, corrupt: false }; // missing file is a legitimate empty state
	}
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return { data: parsed as Record<string, unknown>, corrupt: false };
		}
	} catch {
		/* fall through */
	}
	return { data: {}, corrupt: true };
}

function writeSettings(s: Record<string, unknown>): void {
	writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2) + "\n", "utf-8");
}

function extensionEntries(s: Record<string, unknown>): string[] {
	if (!Array.isArray(s.extensions)) return [];
	return (s.extensions as unknown[]).filter((p): p is string => typeof p === "string");
}

/** Basenames of every extension currently enabled in global settings. */
function activeBasenames(): Set<string> {
	return new Set(extensionEntries(readSettings().data).map((p) => basename(p)));
}

function isEngineActive(engine: string): boolean {
	return activeBasenames().has(engine);
}

const CORRUPT_SETTINGS_MSG =
	`settings.json is not valid JSON — fix it by hand before toggling anything:\n  ${SETTINGS_PATH}`;

/**
 * Enable/disable engines in global settings.
 *
 * Matching is by basename, so a copy of the same engine loaded from any other
 * directory is replaced IN PLACE (load order is preserved — order decides which
 * engine owns singleton UI slots like the footer). Non-string entries are left
 * untouched. A corrupt settings file aborts instead of being overwritten.
 */
function applyEngines(changes: Array<{ engine: string; on: boolean }>): { changed: boolean; error?: string } {
	const { data: s, corrupt } = readSettings();
	if (corrupt) return { changed: false, error: CORRUPT_SETTINGS_MSG };

	const before = Array.isArray(s.extensions) ? (s.extensions as unknown[]).slice() : [];
	const turnOn = new Set(changes.filter((c) => c.on).map((c) => c.engine));
	const turnOff = new Set(changes.filter((c) => !c.on).map((c) => c.engine));
	const placed = new Set<string>();
	const out: unknown[] = [];

	for (const entry of before) {
		if (typeof entry !== "string") {
			out.push(entry);
			continue;
		}
		const b = basename(entry);
		if (turnOff.has(b)) continue;
		if (turnOn.has(b)) {
			if (!placed.has(b)) {
				out.push(join(ENGINE_DIR, b)); // replace in place with our copy
				placed.add(b);
			}
			continue;
		}
		out.push(entry);
	}
	for (const engine of turnOn) {
		if (!placed.has(engine)) out.push(join(ENGINE_DIR, engine));
	}

	const changed = JSON.stringify(out) !== JSON.stringify(before);
	if (changed) {
		s.extensions = out;
		writeSettings(s);
	}
	return { changed };
}

// ── Post-reload continuity ─────────────────────────────────────────────────

interface ToggleStash {
	title: string;
	detail: string;
	kind: "on" | "off";
}

function stash(t: ToggleStash): void {
	(globalThis as Record<string, unknown>)[STASH_KEY] = t;
}

function unstash(): ToggleStash | undefined {
	const g = globalThis as Record<string, unknown>;
	const t = g[STASH_KEY] as ToggleStash | undefined;
	delete g[STASH_KEY];
	return t;
}

// ── Discovery: teams, chains, personas, prompt templates ───────────────────

interface Persona {
	command: string; // final slash-command name, exactly as agent-slash registers it
	description: string;
	source: "pi" | "claude";
}

function parseFrontmatter(raw: string): Record<string, string> {
	const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
	if (!match) return {};
	const lines = match[1].split(/\r?\n/);
	const fm: Record<string, string> = {};
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const idx = line.indexOf(":");
		if (idx > 0 && !/^\s/.test(line)) {
			const key = line.slice(0, idx).trim();
			const val = line.slice(idx + 1).trim();
			if (/^[>|][+-]?$/.test(val)) {
				// YAML folded/literal block: gather indented continuation lines.
				const collected: string[] = [];
				i++;
				while (i < lines.length && (/^\s+/.test(lines[i]) || lines[i].trim() === "")) {
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

/**
 * Mirror of agent-slash.ts discovery: same directories, same order, same
 * name rules — so the board only ever advertises commands that exist.
 */
function scanPersonas(cwd: string): Persona[] {
	const dirs: Array<{ dir: string; source: Persona["source"] }> = [
		{ dir: join(cwd, "agents"), source: "pi" },
		{ dir: join(cwd, ".claude", "agents"), source: "claude" },
		{ dir: join(cwd, ".pi", "agents"), source: "pi" },
		{ dir: join(cwd, ".pi", "agents", "pi-pi"), source: "pi" },
		{ dir: join(homedir(), ".claude", "agents"), source: "claude" },
		{ dir: join(AGENT_DIR, "agents"), source: "pi" },
		{ dir: join(AGENT_DIR, "agents", "pi-pi"), source: "pi" },
	];
	const seen = new Set<string>();
	const out: Persona[] = [];
	for (const { dir, source } of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const fm = parseFrontmatter(readFileSync(join(dir, file), "utf-8"));
				if (!fm.name) continue; // agent-slash skips files without a frontmatter name
				const command = slashCommandName(fm.name, source);
				const key = command.toLowerCase();
				if (seen.has(key)) continue;
				seen.add(key);
				out.push({ command, description: fm.description || "", source });
			}
		} catch {
			/* unreadable dir — skip */
		}
	}
	return out;
}

// Tiny purpose-built YAML readers (display only — engines do real parsing).
// This file must load with zero installed dependencies, so no yaml import.

function parseTeamsYaml(raw: string): Record<string, string[]> {
	const teams: Record<string, string[]> = {};
	let current: string | null = null;
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim() || line.trim().startsWith("#")) continue;
		const top = /^\s/.test(line) ? null : line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (top) {
			const rest = top[2].trim();
			if (rest.startsWith("[")) {
				teams[top[1]] = rest
					.replace(/^\[|\]\s*$/g, "")
					.split(",")
					.map((s) => s.trim().replace(/^["']|["']$/g, ""))
					.filter(Boolean);
				current = null;
			} else {
				teams[top[1]] = [];
				current = top[1];
			}
			continue;
		}
		const item = current ? line.match(/^\s+-\s*(.+?)\s*$/) : null;
		if (item) teams[current!].push(item[1].replace(/^["']|["']$/g, ""));
	}
	return teams;
}

function parseChainStepCounts(raw: string): Record<string, number> {
	const chains: Record<string, number> = {};
	let current: string | null = null;
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim() || line.trim().startsWith("#")) continue;
		const top = /^\s/.test(line) ? null : line.match(/^([A-Za-z0-9_-]+):\s*$/);
		if (top) {
			current = top[1];
			chains[current] = 0;
			continue;
		}
		if (current && /^\s+-\s+agent:/.test(line)) chains[current]++;
	}
	return chains;
}

interface YamlBoard<T> {
	data: T;
	/** Path of an existing file that could not be read as expected. */
	malformed?: string;
}

/**
 * Read the first EXISTING candidate — never fall back past a broken file,
 * because the engines will use that same broken file and fail.
 */
function readBoardYaml<T>(paths: string[], parse: (raw: string) => T, isEmpty: (t: T) => boolean): YamlBoard<T> {
	for (const p of paths) {
		if (!existsSync(p)) continue;
		try {
			const raw = readFileSync(p, "utf-8");
			const data = parse(raw);
			if (isEmpty(data) && raw.trim().length > 0) return { data, malformed: p };
			return { data };
		} catch {
			return { data: parse(""), malformed: p };
		}
	}
	return { data: parse("") };
}

function loadTeams(cwd: string): YamlBoard<Record<string, string[]>> {
	return readBoardYaml(
		[join(cwd, ".pi", "agents", "teams.yaml"), join(AGENT_DIR, "agents", "teams.yaml")],
		parseTeamsYaml,
		(t) => Object.keys(t).length === 0,
	);
}

function loadChains(cwd: string): YamlBoard<Record<string, number>> {
	return readBoardYaml(
		[join(cwd, ".pi", "agents", "agent-chain.yaml"), join(AGENT_DIR, "agents", "agent-chain.yaml")],
		parseChainStepCounts,
		(c) => Object.keys(c).length === 0,
	);
}

function scanPromptTemplates(cwd: string): string[] {
	const dirs = new Set<string>([join(AGENT_DIR, "prompts"), join(cwd, ".pi", "prompts")]);

	// Honor "prompts" arrays in both settings scopes (paths resolve relative
	// to the settings file's own directory, matching pi's rules).
	const addFromSettings = (settingsPath: string, baseDir: string) => {
		try {
			const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
			if (Array.isArray(parsed?.prompts)) {
				for (const p of parsed.prompts) {
					if (typeof p === "string") dirs.add(isAbsolute(p) ? p : resolve(baseDir, p));
				}
			}
		} catch {
			/* missing or malformed — skip */
		}
	};
	addFromSettings(SETTINGS_PATH, AGENT_DIR);
	addFromSettings(join(cwd, ".pi", "settings.json"), join(cwd, ".pi"));

	const names = new Set<string>();
	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const f of readdirSync(dir)) {
				if (f.endsWith(".md")) names.add(basename(f, ".md"));
			}
		} catch {
			/* skip */
		}
	}
	return [...names].sort();
}

// ── Requirement warnings (never block activation) ──────────────────────────

function requirementWarnings(f: Feature, cwd: string): string[] {
	const warnings: string[] = [];
	for (const req of f.requires ?? []) {
		const project = join(cwd, req.rel);
		const global = req.globalAbs ?? join(AGENT_DIR, req.rel.replace(/^\.pi\//, ""));
		if (!existsSync(project) && !existsSync(global)) {
			warnings.push(`missing ${req.rel} — ${req.hint}`);
		}
	}
	return warnings;
}

// ── Rendering helpers ──────────────────────────────────────────────────────

function stateDot(on: boolean): string {
	return on ? green("●") : dim("○");
}

function featureState(f: Feature): { on: boolean; modeName?: string } {
	if (f.engine) return { on: isEngineActive(f.engine) };
	for (const m of f.modes ?? []) {
		if (isEngineActive(m.engine)) return { on: true, modeName: m.name };
	}
	return { on: false };
}

function pad(s: string, n: number): string {
	// Pad by visible length (ANSI-aware enough for our own strings).
	const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
	return s + " ".repeat(Math.max(0, n - visible.length));
}

function clip(s: string, n: number): string {
	return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ═══════════════════════════════════════════════════════════════════════════
// Extension
// ═══════════════════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
	// Duplicate-load guard: a global install plus the repo's project settings
	// would load this file twice (two different paths) and pi would rename
	// every duplicated command to name:1/name:2. First copy wins; the claim is
	// released at session_start so the next reload generation can claim again.
	const g = globalThis as Record<string, unknown>;
	if (g[ACTIVE_KEY]) return;
	g[ACTIVE_KEY] = true;

	let themeNames: string[] = [];

	// ── Shared toggle plumbing ────────────────────────────────────────────

	async function commitAndReload(ctx: ExtensionCommandContext, t: ToggleStash): Promise<void> {
		stash(t);
		try {
			await ctx.reload();
		} catch (err) {
			unstash();
			ctx.ui.notify(
				`Setting saved but reload failed (${err instanceof Error ? err.message : String(err)}).\nRun /reload to apply.`,
				"warning",
			);
		}
	}

	function engineMissing(engine: string, ctx: ExtensionContext): boolean {
		const p = join(ENGINE_DIR, engine);
		if (existsSync(p)) return false;
		ctx.ui.notify(`Engine not found:\n  ${p}\nReinstall agentic-teams (install.sh).`, "error");
		return true;
	}

	// ── Engine toggles (one command = on / off) ───────────────────────────

	for (const f of REGISTRY) {
		if (!f.engine) continue;
		const engine = f.engine;

		pi.registerCommand(f.cmd, {
			description: f.desc.slice(0, 120),
			handler: async (_args, ctx) => {
				if (engineMissing(engine, ctx)) return;
				const turningOn = !isEngineActive(engine);

				const changes: Array<{ engine: string; on: boolean }> = [{ engine, on: turningOn }];
				let excludedNote = "";
				if (turningOn) {
					const warnings = requirementWarnings(f, ctx.cwd);
					if (warnings.length > 0) {
						ctx.ui.notify(warnings.map((w) => `⚠ ${w}`).join("\n"), "warning");
					}
					for (const ex of f.excludes ?? []) {
						if (isEngineActive(ex)) {
							changes.push({ engine: ex, on: false });
							const exLabel = featureByEngine(ex)?.label ?? ex;
							excludedNote = `\n${exLabel} was turned OFF — the two engines cannot run together.`;
						}
					}
				}

				const res = applyEngines(changes);
				if (res.error) {
					ctx.ui.notify(res.error, "error");
					return;
				}
				if (!res.changed) {
					ctx.ui.notify(`${f.label}: nothing to change.`, "info");
					return;
				}

				await commitAndReload(ctx, {
					kind: turningOn ? "on" : "off",
					title: `${f.label} ${turningOn ? "ON" : "OFF"}`,
					detail: turningOn
						? `Now available: ${f.unlocks.join("  ")}${excludedNote}`
						: `Removed: ${f.unlocks.join("  ")}\nSame command turns it back on.`,
				});
			},
		});
	}

	// ── Mode commands (strict|continue|off · footer|widget|off) ───────────

	for (const f of REGISTRY) {
		if (!f.modes) continue;
		const modes = f.modes;

		pi.registerCommand(f.cmd, {
			description: f.desc.slice(0, 120),
			getArgumentCompletions: (prefix: string): AutocompleteItem[] => {
				const options = [
					...modes.map((m) => ({ value: m.name, label: m.name, description: m.label })),
					{ value: "off", label: "off", description: `deactivate ${f.label}` },
				];
				const p = prefix.trim().toLowerCase();
				return options.filter((o) => o.value.startsWith(p));
			},
			handler: async (args, ctx) => {
				for (const m of modes) {
					if (engineMissing(m.engine, ctx)) return;
				}
				const current = modes.find((m) => isEngineActive(m.engine));
				const arg = (args || "").trim().toLowerCase();

				let target: EngineMode | null;
				if (arg === "") {
					target = current ? null : modes[0]; // bare command = toggle
				} else if (arg === "off") {
					target = null;
				} else {
					const found = modes.find((m) => m.name === arg);
					if (!found) {
						ctx.ui.notify(
							`Unknown mode "${arg}". Use: ${modes.map((m) => m.name).join(" | ")} | off`,
							"warning",
						);
						return;
					}
					target = found;
				}

				if (target && current?.name === target.name) {
					// Still enforce exclusivity — a stray second mode engine may linger.
					const cleanup = applyEngines(modes.map((m) => ({ engine: m.engine, on: m.name === target!.name })));
					if (cleanup.error) {
						ctx.ui.notify(cleanup.error, "error");
						return;
					}
					if (cleanup.changed) {
						await commitAndReload(ctx, {
							kind: "on",
							title: `${f.label} → ${target.name}`,
							detail: `Cleaned up a stray duplicate mode engine.`,
						});
						return;
					}
					ctx.ui.notify(`${f.label} already in ${target.name} mode. Use /${f.cmd} off to deactivate.`, "info");
					return;
				}
				if (!target && !current) {
					ctx.ui.notify(`${f.label} is already off.`, "info");
					return;
				}

				if (target) {
					const warnings = requirementWarnings(f, ctx.cwd);
					if (warnings.length > 0) {
						ctx.ui.notify(warnings.map((w) => `⚠ ${w}`).join("\n"), "warning");
					}
				}

				const res = applyEngines(modes.map((m) => ({ engine: m.engine, on: m.name === target?.name })));
				if (res.error) {
					ctx.ui.notify(res.error, "error");
					return;
				}

				await commitAndReload(ctx, {
					kind: target ? "on" : "off",
					title: target ? `${f.label} → ${target.name}` : `${f.label} OFF`,
					detail: target
						? `${target.label}. Switch modes any time: /${f.cmd} ${modes.map((m) => m.name).join(" | ")} | off`
						: `Same command turns it back on.`,
				});
			},
		});
	}

	// ── /clear — wipe the transcript, keep the boards ─────────────────────

	pi.registerCommand("clear", {
		description: "Wipe every message from the screen — fresh session, agent boards stay",
		handler: async (_args, ctx) => {
			stash({
				kind: "on",
				title: "Screen cleared",
				detail: "Fresh session — engines, boards and toggles intact.",
			});
			const result = await ctx.newSession();
			if (result.cancelled) unstash();
		},
	});

	// ── /pi-off — deactivate everything ───────────────────────────────────

	pi.registerCommand("pi-off", {
		description: "Deactivate every agentic-teams engine and return to plain pi",
		handler: async (_args, ctx) => {
			const active = REGISTRY.filter((f) => featureState(f).on);
			if (active.length === 0) {
				ctx.ui.notify("Nothing active — already plain pi.", "info");
				return;
			}
			const res = applyEngines(allEngineFiles().map((engine) => ({ engine, on: false })));
			if (res.error) {
				ctx.ui.notify(res.error, "error");
				return;
			}
			await commitAndReload(ctx, {
				kind: "off",
				title: `All engines OFF (${active.length})`,
				detail: `Deactivated: ${active.map((f) => f.label).join(" · ")}\nReactivate any of them with its own command.`,
			});
		},
	});

	// ── /teams — the roster board ─────────────────────────────────────────

	pi.registerCommand("teams", {
		description: "Show every agent team, chain and persona available in this session",
		handler: async (_args, ctx) => {
			const teams = loadTeams(ctx.cwd);
			const chains = loadChains(ctx.cwd);
			const personas = scanPersonas(ctx.cwd);
			const teamOn = isEngineActive("agent-team.ts");
			const chainOn = isEngineActive("agent-chain.ts");

			const L: string[] = [
				"",
				pink(bold("  ◆ AGENT TEAMS")),
				`  ${green(String(Object.keys(teams.data).length))} teams · ${green(String(Object.keys(chains.data).length))} chains · ${green(String(personas.length))} agents loaded`,
				"",
			];

			if (teams.malformed) {
				L.push(`  ${yellow("⚠")} could not read ${teams.malformed} — fix it; the team engine reads this same file`);
			}
			const teamNames = Object.keys(teams.data);
			if (teamNames.length > 0) {
				for (const name of teamNames) {
					L.push(`  ${yellow(pad(name, 14))} ${teams.data[name].map((m) => cyan(m)).join(dim(" · "))}`);
				}
			} else if (!teams.malformed) {
				L.push(dim("  no teams.yaml found — run install.sh or add .pi/agents/teams.yaml"));
			}
			L.push("");
			L.push(
				`  ${stateDot(teamOn)} team engine ${teamOn ? green("on") : dim("off")}` +
					dim("  →  ") +
					(teamOn ? `${yellow("/agents-team")} to choose the active team` : `${yellow("/pi-team")} to turn it on`),
			);

			if (chains.malformed) {
				L.push("", `  ${yellow("⚠")} could not read ${chains.malformed} — fix it; the chain engine reads this same file`);
			}
			const chainNames = Object.keys(chains.data);
			if (chainNames.length > 0) {
				L.push("", pink(bold("  ◆ CHAINS")), "");
				for (const name of chainNames) {
					L.push(`  ${yellow(pad(name, 20))} ${dim(`${chains.data[name]} steps`)}`);
				}
				L.push(
					"",
					`  ${stateDot(chainOn)} chain engine ${chainOn ? green("on") : dim("off")}` +
						dim("  →  ") +
						(chainOn ? `${yellow("/chain")} to choose the active chain` : `${yellow("/pi-chain")} to turn it on`),
				);
			}

			const piPersonas = personas.filter((p) => p.source === "pi");
			const ccPersonas = personas.filter((p) => p.source === "claude");
			L.push("", pink(bold(`  ◆ AGENTS (${personas.length})`)), "");
			if (piPersonas.length > 0) {
				L.push(`  ${dim("pi:")}     ${piPersonas.map((p) => yellow("/" + p.command)).join("  ")}`);
			}
			if (ccPersonas.length > 0) {
				L.push(`  ${dim("claude:")} ${ccPersonas.map((p) => yellow("/" + p.command)).join("  ")}`);
			}
			if (personas.length === 0) {
				L.push(dim("  no personas found — add .md files to .pi/agents/"));
			}
			L.push(dim("  each agent is a slash command — /<name> <task> dispatches it directly"));

			L.push("", dim(`  engines: ${yellow("/pi-list")}   full table: ${yellow("/commands-pi")}`), "");
			ctx.ui.notify(L.join("\n"), "info");
		},
	});

	// ── /pi-list — status board ───────────────────────────────────────────

	pi.registerCommand("pi-list", {
		description: "Status board: every agentic-teams feature, active or available",
		handler: async (_args, ctx) => {
			const L: string[] = ["", pink(bold("  🧩 agentic-teams — feature board")), ""];
			let activeCount = 0;

			for (const group of GROUPS) {
				const features = REGISTRY.filter((f) => f.group === group);
				if (features.length === 0) continue;
				L.push(`  ${dim(group.toUpperCase())}`);
				for (const f of features) {
					const st = featureState(f);
					if (st.on) activeCount++;
					const state = st.on ? green(st.modeName ? `ON:${st.modeName}` : "ON ") : dim("off");
					L.push(`   ${stateDot(st.on)} ${pad(state, 12)} ${pad(yellow("/" + f.cmd), 24)} ${f.desc}`);
				}
				L.push("");
			}

			L.push(
				dim(`  ${activeCount} active · ${REGISTRY.length} features · same command = on/off · `) +
					yellow("/pi-off") +
					dim(" = all off · ") +
					yellow("/commands-pi") +
					dim(" = full table"),
			);
			L.push("");
			ctx.ui.notify(L.join("\n"), "info");
		},
	});

	// ── /commands-pi — full reference table ───────────────────────────────

	pi.registerCommand("commands-pi", {
		description: "Full reference: every command, what it does, what it shows",
		handler: async (_args, ctx) => {
			const personas = scanPersonas(ctx.cwd);
			const prompts = scanPromptTemplates(ctx.cwd);
			const L: string[] = [];

			L.push("", pink(bold("  ══════════  agentic-teams command reference  ══════════")), "");

			L.push(pink(bold("  Meta")));
			L.push(`   ${pad(yellow("/teams"), 24)} show every team, chain and agent available now`);
			L.push(`   ${pad(yellow("/pi-list"), 24)} status board of every feature`);
			L.push(`   ${pad(yellow("/commands-pi"), 24)} this table`);
			L.push(`   ${pad(yellow("/pi-themes [name]"), 24)} switch theme instantly (picker or by name)`);
			L.push(`   ${pad(yellow("/clear"), 24)} wipe every message — fresh session, boards stay`);
			L.push(`   ${pad(yellow("/pi-off"), 24)} deactivate every engine at once`);
			L.push("");

			for (const group of GROUPS) {
				const features = REGISTRY.filter((f) => f.group === group);
				if (features.length === 0) continue;
				L.push(pink(bold(`  ${group}`)));
				for (const f of features) {
					const st = featureState(f);
					const modeHint = f.modes ? ` ${f.modes.map((m) => m.name).join("|")}|off` : "";
					L.push(`   ${stateDot(st.on)} ${pad(yellow(`/${f.cmd}${modeHint}`), 34)} ${f.desc}`);
					L.push(`     ${dim("shows:")} ${dim(f.shows)}`);
					L.push(`     ${dim("gives:")} ${f.unlocks.map((u) => cyan(u)).join(dim("  "))}`);
				}
				L.push("");
			}

			if (personas.length > 0) {
				L.push(pink(bold(`  Agents as commands (${personas.length})`)) + dim("  — /<name> <task> dispatches that agent as a subprocess"));
				for (const p of personas.filter((x) => x.source === "pi")) {
					L.push(`   ${pad(yellow("/" + p.command), 26)} ${dim(clip(p.description || "", 76))}`);
				}
				for (const p of personas.filter((x) => x.source === "claude")) {
					L.push(`   ${pad(yellow("/" + p.command), 26)} ${dim(clip(p.description || "", 76))}`);
				}
				L.push(`   ${pad(yellow("/agents-slash-list"), 26)} ${dim("list every per-agent command, grouped by source")}`);
				L.push("");
			}

			if (prompts.length > 0) {
				L.push(pink(bold(`  Prompt templates (${prompts.length})`)));
				L.push(`   ${prompts.map((p) => yellow("/" + p)).join("  ")}`);
				L.push("");
			}

			L.push(pink(bold("  Built-in pi")));
			L.push(`   ${dim("/reload /new /resume /fork /model /compact /settings /session /tree /export …")}`);
			L.push("");
			L.push(dim("  ● active · ○ available · toggles persist across sessions · docs: docs/COMMANDS.md"));
			L.push("");

			ctx.ui.notify(L.join("\n"), "info");
		},
	});

	// ── /pi-themes — instant theme switch (no engine needed) ──────────────

	pi.registerCommand("pi-themes", {
		description: "Switch theme: /pi-themes for the picker, /pi-themes <name> direct",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] => {
			const p = prefix.trim().toLowerCase();
			return themeNames
				.filter((n) => n.toLowerCase().startsWith(p))
				.map((n) => ({ value: n, label: n }));
		},
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Theme selection needs an interactive session.", "warning");
				return;
			}
			const themes = ctx.ui.getAllThemes?.() ?? [];
			themeNames = themes.map((t) => t.name); // keep completions fresh
			const arg = (args || "").trim();
			if (arg) {
				const result = ctx.ui.setTheme(arg);
				ctx.ui.notify(result.success ? `Theme: ${arg}` : `Theme not found: ${arg}`, result.success ? "success" : "error");
				return;
			}
			if (themes.length === 0) {
				ctx.ui.notify("No themes found.", "warning");
				return;
			}
			const current = ctx.ui.theme?.name ?? "";
			const items = themes.map((t) => (t.name === current ? `${t.name} (active)` : t.name));
			const selected = await ctx.ui.select("Select Theme", items);
			if (!selected) return;
			const name = selected.replace(/ \(active\)$/, "");
			const result = ctx.ui.setTheme(name);
			if (result.success) ctx.ui.notify(`Theme: ${name}`, "success");
		},
	});

	// ── Session lifecycle ─────────────────────────────────────────────────

	pi.on("session_start", async (event, ctx) => {
		// Release the duplicate-load claim for the next reload generation.
		(globalThis as Record<string, unknown>)[ACTIVE_KEY] = false;

		themeNames = (ctx.ui.getAllThemes?.() ?? []).map((t) => t.name);

		const toggled = unstash();
		if ((event.reason === "reload" || event.reason === "new") && toggled) {
			const dot = toggled.kind === "on" ? green("●") : dim("○");
			ctx.ui.notify(`${dot} ${bold(toggled.title)}\n${toggled.detail}`, toggled.kind === "on" ? "success" : "info");
			return;
		}

		if (event.reason === "startup") {
			const active = REGISTRY.filter((f) => featureState(f).on);
			const activeNote = active.length > 0 ? `  ·  ${green(String(active.length))} engine${active.length === 1 ? "" : "s"} on` : "";
			ctx.ui.notify(
				`${pink("agentic-teams")} ready${activeNote}  ·  ${yellow("/teams")}  ${yellow("/pi-list")}  ${yellow("/commands-pi")}`,
				"info",
			);
		}
	});
}
