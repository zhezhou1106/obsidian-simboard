import { parseYaml } from "obsidian";

/**
 * Options from the `simboard` code block body (YAML). All keys are optional:
 *
 * ```simboard
 * widgets: banner, calendar, todos   # or a YAML list; omit for the default set
 * name: Alex                         # greeting name (else the note's `name` property)
 * banner:                            # per-widget options, keyed by widget id
 *   path: Attachments/banner.jpg
 * ```
 */
export interface BlockConfig {
	widgets: string[] | null;
	name: string | null;
	/** Per-widget option objects keyed by widget id. */
	options: Record<string, Record<string, unknown>>;
	/** Problem parsing the block, shown above the dashboard. */
	error: string | null;
}

function toList(v: unknown): string[] | null {
	if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
	if (typeof v === "string") return v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
	return null;
}

export function parseBlockConfig(source: string): BlockConfig {
	const cfg: BlockConfig = { widgets: null, name: null, options: {}, error: null };
	if (!source.trim()) return cfg;
	let parsed: unknown;
	try {
		parsed = parseYaml(source);
	} catch (e) {
		cfg.error = `Invalid simboard block: ${e instanceof Error ? e.message : String(e)}`;
		return cfg;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return cfg;
	for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (key === "widgets") cfg.widgets = toList(value);
		else if (key === "name") cfg.name = value == null ? null : String(value);
		else if (value && typeof value === "object" && !Array.isArray(value)) cfg.options[key] = value as Record<string, unknown>;
	}
	return cfg;
}

/** Options the block sets for one widget (empty object when none). */
export function widgetOptions(cfg: BlockConfig, id: string): Record<string, unknown> {
	return cfg.options[id] ?? {};
}
