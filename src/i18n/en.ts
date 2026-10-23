/**
 * English UI strings. To add a language, copy this file (e.g. `zh.ts`), translate
 * the values, and register it in `i18n/index.ts`. Keys missing from a translation
 * fall back to English.
 */
export const en = {
	// banner
	"greeting.night": "Still up",
	"greeting.morning": "Good morning",
	"greeting.afternoon": "Good afternoon",
	"greeting.evening": "Good evening",
	"greeting.late": "Winding down",
	"banner.alt": "Dashboard banner",

	// todos
	"todos.title": "Todos",
	"todos.empty": "Nothing on the list yet.",
	"todos.clearAll": "clear all",
	"todos.clearAll.tooltip": "Remove every todo from the list",
	"todos.clearAll.confirm": "confirm?",
	"todos.openNote": "open note",
	"todos.openNote.tooltip": "Open {path}",
	"todos.refresh.tooltip": "Refresh todos",
	"todos.add.placeholder": "Add a task…",
	"todos.add.tooltip": "Add task",
	"todos.markDone": "Mark done",
	"todos.delete": "Delete this task",
	"todos.added": "added {date}",
	"todos.error.update": "Todo update failed: {error}",
	"todos.error.create": "Couldn't create the todo file: {error}",

	// vault stats
	"vault.title": "Vault",
	"vault.today": "{n} today",
	"vault.notes": "Notes",
	"vault.attachments": "Attachments",
	"vault.folders": "Folders",
	"vault.changesToday": "Today",
	"vault.heat.tooltip": "{date} — {n} changes",
	"vault.heat.tooltip.one": "{date} — 1 change",

	// renderer
	"error.render": "Simboard error: {error}",
	"error.unknownWidget": "Unknown widget \"{id}\". Available: {list}",
} as const;

export type StringKey = keyof typeof en;
