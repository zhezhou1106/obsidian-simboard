export const BANNER_RATIOS = ["16 / 9", "21 / 9", "3 / 2", "4 / 3", "1 / 1"] as const;
export type BannerRatio = (typeof BANNER_RATIOS)[number];

export interface QuickLink {
	/** Button label; falls back to the path when empty. */
	name: string;
	/** Note name or vault path, resolved like a wikilink. */
	path: string;
}

/**
 * Persisted plugin settings (data.json). Grouped by the widget that owns them,
 * so a new widget adds its own group without touching the others.
 *
 * Bump `SETTINGS_VERSION` and extend `normalizeSettings()` whenever a stored
 * shape changes, so older data.json files keep loading.
 */
export interface SimboardSettings {
	settingsVersion: number;
	layout: {
		/** Max width of the dashboard column, in px. */
		maxWidth: number;
		/** Widgets shown by a code block that doesn't list its own, in order. */
		defaultWidgets: string[];
	};
	appearance: {
		/** High-contrast grayscale palette while Obsidian is in light mode (for e-ink screens). */
		einkLightMode: boolean;
	};
	banner: {
		/** Image file, or a folder whose first image (by name) is used. */
		path: string;
		ratio: BannerRatio;
	};
	calendar: {
		width: number;
		/** Panel opacity over the banner, 30–100 (%). */
		opacity: number;
		margin: number;
	};
	dailyNotes: {
		/** Overrides the core Daily notes folder. Empty = use the core plugin's setting. */
		folder: string;
		/** Overrides the core Daily notes date format. Empty = use the core plugin's setting. */
		format: string;
	};
	todos: {
		/** File backing the todo widget; created on first use. */
		path: string;
		/** Finished todos are removed from the file after this many days. */
		keepDays: number;
	};
	quickLinks: QuickLink[];
}
