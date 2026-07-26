/**
 * smoke — static load test for every extension in this repo.
 *
 * For each module: call its factory with a recording mock of ExtensionAPI and
 * assert it loads without throwing. Then assert, across the whole stack:
 *   - the master registers the exact expected command set
 *   - no two files register the same command or tool name
 *   - the REGISTRY covers every engine file in extensions/ (except themeMap.ts)
 *
 * Run: bun test/smoke.ts   (or: just smoke)
 */

import { readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Recorded {
	commands: Map<string, string>; // name → source file
	tools: Map<string, string>;
	shortcuts: Map<string, string>;
	errors: string[];
	sessionStart: Array<{ source: string; handler: (e: unknown, c: unknown) => unknown }>;
}

function makeMockPi(source: string, rec: Recorded): unknown {
	const record = (map: Map<string, string>, kind: string) => (nameOrDef: unknown, maybeDef?: unknown) => {
		const name =
			typeof nameOrDef === "string"
				? nameOrDef
				: ((nameOrDef as { name?: string })?.name ?? "(anonymous)");
		void maybeDef;
		if (map.has(name)) {
			rec.errors.push(`duplicate ${kind} "${name}" — ${map.get(name)} vs ${source}`);
		} else {
			map.set(name, source);
		}
	};
	const registerCommand = record(rec.commands, "command");
	const registerTool = record(rec.tools, "tool");
	const registerShortcut = record(rec.shortcuts, "shortcut");
	return new Proxy(
		{},
		{
			get(_t, prop: string) {
				if (prop === "registerCommand") return registerCommand;
				if (prop === "registerTool") return registerTool;
				if (prop === "registerShortcut") return registerShortcut;
				if (prop === "on") {
					return (event: string, handler: (e: unknown, c: unknown) => unknown) => {
						if (event === "session_start") rec.sessionStart.push({ source, handler });
					};
				}
				// registerFlag, sendMessage, appendEntry, … — accept and ignore.
				return (..._args: unknown[]) => undefined;
			},
		},
	);
}

let failures = 0;
const fail = (msg: string) => {
	failures++;
	console.error(`  ✗ ${msg}`);
};
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

// ── 1. Every module loads standalone ───────────────────────────────────────

const engineDir = join(ROOT, "extensions");
const engineFilesOnDisk = readdirSync(engineDir).filter((f) => f.endsWith(".ts")).sort();

const slashFiles = ["slash/agentic-teams.ts", "slash/agent-slash.ts"];
const allModules = [...slashFiles, ...engineFilesOnDisk.map((f) => `extensions/${f}`)];

console.log(`\nLoad check — ${allModules.length} modules`);
const stack: Recorded = { commands: new Map(), tools: new Map(), shortcuts: new Map(), errors: [], sessionStart: [] };

for (const rel of allModules) {
	const path = join(ROOT, rel);
	try {
		const mod = await import(path);
		const factory = mod.default;
		if (typeof factory !== "function") {
			fail(`${rel}: no default export factory`);
			continue;
		}
		// cross-agent registers commands discovered from the surrounding machine
		// (~/.claude etc.) at load time — record it standalone but keep its
		// dynamic registrations out of the cross-file collision map.
		const isDynamic = rel.endsWith("cross-agent.ts");
		const rec: Recorded = isDynamic
			? { commands: new Map(), tools: new Map(), shortcuts: new Map(), errors: [], sessionStart: [] }
			: stack;
		factory(makeMockPi(rel, rec));
		ok(rel);
	} catch (err) {
		fail(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
	}
}

// ── 1b. agent-slash registers persona commands at session_start ────────────
// Drive only ITS handler (engine session_starts do heavy things like sockets).

const mockCtx = { cwd: ROOT, hasUI: false, ui: { notify() {}, setStatus() {} } };
for (const { source, handler } of stack.sessionStart) {
	if (source === "slash/agent-slash.ts") {
		await handler({ type: "session_start", reason: "startup" }, mockCtx);
	}
}

const expectedPersonas = [
	"scout", "planner", "builder", "reviewer", "documenter", "red-team",
	"plan-reviewer", "bowser", "ext-expert", "agents-slash-list",
];
console.log(`\nPersona commands (via agent-slash session_start)`);
for (const p of expectedPersonas) {
	if (stack.commands.has(p)) ok(`/${p}`);
	else fail(`missing persona command /${p}`);
}

// ── 2. Master registers the expected command set ───────────────────────────

const { REGISTRY, allEngineFiles } = await import(join(ROOT, "slash", "agentic-teams.ts"));

const expected = [
	"teams", "pi-list", "commands-pi", "pi-themes", "pi-off",
	...REGISTRY.map((f: { cmd: string }) => f.cmd),
];

console.log(`\nMaster command set — ${expected.length} expected`);
for (const cmd of expected) {
	if (stack.commands.has(cmd)) ok(`/${cmd}`);
	else fail(`missing command /${cmd}`);
}

// ── 3. No cross-file collisions ────────────────────────────────────────────

console.log(`\nCollisions`);
if (stack.errors.length === 0) {
	ok(`none — ${stack.commands.size} commands, ${stack.tools.size} tools, ${stack.shortcuts.size} shortcuts unique`);
} else {
	for (const e of stack.errors) fail(e);
}

// ── 4. Registry ↔ disk completeness (both directions) ──────────────────────

console.log(`\nCoverage`);
const registryEngines = new Set<string>(allEngineFiles());
const helperFiles = new Set(["themeMap.ts"]);

for (const f of registryEngines) {
	if (!engineFilesOnDisk.includes(f)) fail(`REGISTRY references missing engine file: ${f}`);
}
for (const f of engineFilesOnDisk) {
	if (!registryEngines.has(f) && !helperFiles.has(f)) {
		fail(`engine on disk not covered by any command: ${f}`);
	}
}
if (failures === 0) {
	ok(`all ${engineFilesOnDisk.length} files covered (${registryEngines.size} engines + ${helperFiles.size} shared helper)`);
}

// ── Result ─────────────────────────────────────────────────────────────────

console.log("");
if (failures > 0) {
	console.error(`SMOKE FAILED — ${failures} problem(s)`);
	process.exit(1);
}
console.log("SMOKE PASSED");
