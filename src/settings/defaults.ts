import { SimboardSettings } from "./types";

export const SETTINGS_VERSION = 1;

/** Built-in widget order used when neither the code block nor the settings say otherwise. */
export const BUILTIN_WIDGET_ORDER = ["banner", "calendar", "quick-links", "todos", "vault-stats"];

export const DEFAULT_SETTINGS: SimboardSettings = {
	settingsVersion: SETTINGS_VERSION,
	layout: {
		maxWidth: 900,
		defaultWidgets: [...BUILTIN_WIDGET_ORDER],
	},
	appearance: {
		einkLightMode: false,
	},
	banner: {
		path: "",
		ratio: "16 / 9",
	},
	calendar: {
		width: 240,
		opacity: 90,
		margin: 16,
	},
	dailyNotes: {
		folder: "",
		format: "",
	},
	todos: {
		path: "Simboard Todos.md",
		keepDays: 7,
	},
	quickLinks: [],
};
