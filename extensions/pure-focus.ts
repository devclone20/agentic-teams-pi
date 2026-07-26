/**
 * Pure Focus — Strip all footer, status line, and widget UI
 *
 * Removes the footer bar, all status items, and any above/below-editor
 * widgets entirely — leaving only the conversation and input editor.
 * Pure distraction-free mode.
 *
 * Usage:  /pi-focus   (slash layer toggle)
 *   or:   pi -e extensions/pure-focus.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyExtensionDefaults } from "./themeMap.ts";

// Known status keys set by bundled extensions (minimal.ts, theme-cycler.ts, etc.)
const STATUS_KEYS_TO_CLEAR = ["theme", "thinking", "model", "context", "tool-count"];

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		applyExtensionDefaults(import.meta.url, ctx);

		// ── Blank the footer ──────────────────────────────────────────────────
		ctx.ui.setFooter((_tui, _theme, _footerData) => ({
			dispose: () => {},
			invalidate() {},
			render(_width: number): string[] {
				return [];
			},
		}));

		// ── Clear all known status-line items ─────────────────────────────────
		// Defer slightly so other session_start handlers (minimal, theme-cycler)
		// have already run and placed their keys before we wipe them.
		setTimeout(() => {
			for (const key of STATUS_KEYS_TO_CLEAR) {
				ctx.ui.setStatus(key, undefined);
			}
		}, 50);

		// ── Remove any dangling widgets ───────────────────────────────────────
		setTimeout(() => {
			ctx.ui.setWidget("theme-swatch", undefined);
		}, 50);
	});
}
