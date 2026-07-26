/**
 * gen-commands — regenerate docs/COMMANDS.md from the REGISTRY in
 * slash/agentic-teams.ts, so the docs can never drift from the code.
 *
 * Run: bun scripts/gen-commands.ts   (or: just gen-docs)
 */

import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTRY, allEngineFiles, type Feature } from "../slash/agentic-teams.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "COMMANDS.md");

const GROUPS = ["Orchestration", "Workflow", "Communication", "Safety", "Interface"] as const;

function commandCell(f: Feature): string {
	if (f.modes) {
		const modeNames = f.modes.map((m) => m.name).join("\\|");
		return `\`/${f.cmd} ${modeNames}\\|off\``;
	}
	return `\`/${f.cmd}\``;
}

function unlocksCell(f: Feature): string {
	return f.unlocks.map((u) => `\`${u}\``).join(" · ");
}

const L: string[] = [];
L.push("# Command Reference");
L.push("");
L.push("> Generated from `REGISTRY` in [`slash/agentic-teams.ts`](../slash/agentic-teams.ts) by `scripts/gen-commands.ts`.");
L.push("> Do not edit by hand — run `just gen-docs` after changing the registry.");
L.push("");
L.push("Every feature command is a switch: the **same command activates and deactivates** it,");
L.push("live in the current session (no restart). Mode commands take `off` as an argument.");
L.push("");

L.push("## Meta commands (always available)");
L.push("");
L.push("| Command | What it does | What it shows |");
L.push("| --- | --- | --- |");
L.push("| `/teams` | Shows every agent team, chain and persona available right now | Roster board: teams with members, chains with steps, agents as slash commands, engine state |");
L.push("| `/pi-list` | Status board of every feature | Grouped list with ●/○ state dots and one-line descriptions |");
L.push("| `/commands-pi` | Full in-session reference | Every command, what it unlocks, personas, prompt templates |");
L.push("| `/pi-themes [name]` | Instant theme switch | Theme picker (or direct switch by name, with autocomplete) |");
L.push("| `/pi-off` | Deactivates every engine at once | Summary of what was turned off; plain pi again |");
L.push("");

for (const group of GROUPS) {
	const features = REGISTRY.filter((f) => f.group === group);
	if (features.length === 0) continue;
	L.push(`## ${group}`);
	L.push("");
	L.push("| Command | Engine | What it does | What it shows when active | Unlocks |");
	L.push("| --- | --- | --- | --- | --- |");
	for (const f of features) {
		const engines = f.engine ? `\`${f.engine}\`` : (f.modes ?? []).map((m) => `\`${m.engine}\``).join(" / ");
		L.push(`| ${commandCell(f)} | ${engines} | ${f.desc} | ${f.shows} | ${unlocksCell(f)} |`);
	}
	L.push("");
}

L.push("## Agents as commands");
L.push("");
L.push("`slash/agent-slash.ts` turns every discovered agent persona into its own slash command:");
L.push("");
L.push("| Source | Command shape | Example |");
L.push("| --- | --- | --- |");
L.push("| `.pi/agents/*.md` (project or global) | `/<name> <task>` | `/scout map this codebase` |");
L.push("| `.pi/agents/pi-pi/*.md` | `/<name> <task>` | `/ext-expert how do widgets work?` |");
L.push("| `.claude/agents/*.md` (project or `~/.claude`) | `/cc-<name> <task>` | `/cc-architect review this design` |");
L.push("");
L.push("Names that collide with a built-in or agentic-teams command get an `agent-` prefix.");
L.push("`/agents-slash-list` lists everything that was registered, grouped by source.");
L.push("");

L.push("## Coverage");
L.push("");
const engineCount = new Set(allEngineFiles()).size;
L.push(`${REGISTRY.length} feature commands cover **${engineCount} engines** (every extension in \`extensions/\` except the shared helper \`themeMap.ts\`).`);
L.push("");

writeFileSync(OUT, L.join("\n") + "\n", "utf-8");
console.log(`wrote ${OUT} — ${REGISTRY.length} features, ${engineCount} engines`);
