import { debounce, Plugin } from "obsidian";
import { DashboardRenderer } from "./core/DashboardRenderer";
import { ActivityTracker } from "./services/ActivityTracker";
import { DailyNotesService } from "./services/DailyNotes";
import { TodoStore } from "./services/TodoStore";
import { normalizeSettings } from "./settings/normalize";
import { SimboardSettingTab } from "./settings/SettingTab";
import { SimboardSettings } from "./settings/types";

/** Code block language that renders a dashboard: ```simboard``` */
export const CODE_BLOCK_LANGUAGE = "simboard";

export default class SimboardPlugin extends Plugin {
	settings!: SimboardSettings;
	activity!: ActivityTracker;
	dailyNotes!: DailyNotesService;
	todos!: TodoStore;
	/** Dashboards currently rendered in any open note. */
	readonly renderers = new Set<DashboardRenderer>();

	/** Coalesces rapid setting edits (typing, slider drags) into one re-render. */
	private readonly refreshDebounced = debounce(() => this.refreshDashboards(), 200, true);

	async onload(): Promise<void> {
		await this.loadSettings();

		const getSettings = () => this.settings;
		this.dailyNotes = new DailyNotesService(this.app, getSettings);
		this.todos = new TodoStore(this.app, getSettings);
		this.activity = new ActivityTracker(this);
		await this.activity.load();

		// Count every vault change for the activity heatmap. Registered after the
		// layout is ready so the initial file index doesn't count as "created".
		this.app.workspace.onLayoutReady(() => {
			const record = () => this.activity.record();
			this.registerEvent(this.app.vault.on("create", record));
			this.registerEvent(this.app.vault.on("modify", record));
			this.registerEvent(this.app.vault.on("delete", record));
			this.registerEvent(this.app.vault.on("rename", record));
		});

		this.registerMarkdownCodeBlockProcessor(CODE_BLOCK_LANGUAGE, (source, el, ctx) => {
			ctx.addChild(new DashboardRenderer(el, this, ctx.sourcePath, source));
		});

		this.addSettingTab(new SimboardSettingTab(this.app, this));
	}

	onunload(): void {
		void this.activity?.flush();
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	/** Persists settings and refreshes every open dashboard. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshDebounced();
	}

	refreshDashboards(): void {
		this.renderers.forEach((r) => r.rebuild());
	}
}
