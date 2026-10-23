import { clampNumber } from "../utils/dom";
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from "./defaults";
import { BANNER_RATIOS, BannerRatio, QuickLink, SimboardSettings } from "./types";

type Raw = Record<string, unknown>;

function obj(v: unknown): Raw {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}

function str(v: unknown, fallback: string): string {
	return typeof v === "string" ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
	return typeof v === "boolean" ? v : fallback;
}

function strList(v: unknown, fallback: string[]): string[] {
	if (!Array.isArray(v)) return [...fallback];
	const out = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
	return out.length ? out : [...fallback];
}

function quickLinks(v: unknown): QuickLink[] {
	if (!Array.isArray(v)) return [];
	return v
		.map(obj)
		.map((l) => ({ name: str(l.name, ""), path: str(l.path, "") }));
}

/**
 * Turns whatever is stored in data.json into a complete, valid settings object.
 * Unknown keys are dropped; missing or invalid values get their defaults.
 */
export function normalizeSettings(stored: unknown): SimboardSettings {
	const s = obj(stored);
	const D = DEFAULT_SETTINGS;
	const layout = obj(s.layout);
	const appearance = obj(s.appearance);
	const banner = obj(s.banner);
	const calendar = obj(s.calendar);
	const daily = obj(s.dailyNotes);
	const todos = obj(s.todos);

	const ratio = str(banner.ratio, D.banner.ratio);

	return {
		settingsVersion: SETTINGS_VERSION,
		layout: {
			maxWidth: clampNumber(layout.maxWidth, 320, 2000, D.layout.maxWidth),
			defaultWidgets: strList(layout.defaultWidgets, D.layout.defaultWidgets),
		},
		appearance: {
			einkLightMode: bool(appearance.einkLightMode, D.appearance.einkLightMode),
		},
		banner: {
			path: str(banner.path, D.banner.path).trim(),
			ratio: (BANNER_RATIOS as readonly string[]).includes(ratio) ? (ratio as BannerRatio) : D.banner.ratio,
		},
		calendar: {
			width: clampNumber(calendar.width, 120, 600, D.calendar.width),
			opacity: clampNumber(calendar.opacity, 0, 100, D.calendar.opacity),
			margin: clampNumber(calendar.margin, 0, 96, D.calendar.margin),
		},
		dailyNotes: {
			folder: str(daily.folder, D.dailyNotes.folder).trim(),
			format: str(daily.format, D.dailyNotes.format).trim(),
		},
		todos: {
			path: str(todos.path, D.todos.path).trim(),
			keepDays: clampNumber(todos.keepDays, 0, 365, D.todos.keepDays),
		},
		quickLinks: quickLinks(s.quickLinks),
	};
}
