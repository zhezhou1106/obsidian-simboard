import { App, PluginSettingTab, requireApiVersion, Setting, SettingDefinitionItem, TextComponent } from "obsidian";
import type SimboardPlugin from "../main";
import { DEFAULT_DAILY_FORMAT } from "../services/DailyNotes";
import { BUILTIN_WIDGET_ORDER } from "./defaults";
import { PathKind, PathSuggest } from "./PathSuggest";
import { BANNER_RATIOS, BannerRatio, QuickLink } from "./types";

const RATIO_LABELS: Record<BannerRatio, string> = {
	"16 / 9": "16:9 — widescreen",
	"21 / 9": "21:9 — ultrawide",
	"3 / 2": "3:2",
	"4 / 3": "4:3",
	"1 / 1": "1:1 — square",
};

const WIDGET_LIST = BUILTIN_WIDGET_ORDER.join(", ");
const MIN_WIDTH = 480;
const MAX_WIDTH = 1600;

/** One settings row: a name, a description, and the controls `render` adds. */
interface Row {
	name: string;
	desc?: string;
	render: (setting: Setting) => void;
}

interface Section {
	heading?: string;
	rows: Row[];
}

/**
 * The settings are described once (`sections()` + the quick link rows) and
 * rendered two ways: declaratively through `getSettingDefinitions()` on
 * Obsidian 1.13+ (so they show up in the app's settings search), and
 * imperatively through `display()` on older versions.
 */
export class SimboardSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: SimboardPlugin,
	) {
		super(app, plugin);
	}

	private get s() {
		return this.plugin.settings;
	}

	private save(): void {
		void this.plugin.saveSettings();
	}

	// ---------- control helpers ----------

	/** Text field with vault path type-ahead. */
	private pathText(text: TextComponent, kind: PathKind, value: string, onChange: (v: string) => void): void {
		text.setValue(value).onChange((v) => {
			onChange(v.trim());
			this.save();
		});
		new PathSuggest(this.app, text.inputEl, kind, (v) => {
			onChange(v);
			this.save();
		});
	}

	private slider(min: number, max: number, step: number, get: () => number, set: (v: number) => void): Row["render"] {
		return (setting) =>
			void setting.addSlider((sl) =>
				sl
					.setLimits(min, max, step)
					.setValue(get())
					.onChange((v) => {
						set(v);
						this.save();
					}),
			);
	}

	// ---------- the settings ----------

	private sections(): Section[] {
		const s = this.s;
		return [
			{
				rows: [
					{
						name: "Dashboard note",
						desc: "The note that the open-dashboard command and the ribbon icon open. Leave empty to use the first note that contains a simboard block.",
						render: (st) => void st.addText((text) => this.pathText(text, "markdown", s.home.notePath, (v) => (s.home.notePath = v))),
					},
					{
						name: "Ribbon icon",
						desc: "Show an icon in the left ribbon that opens the dashboard note.",
						render: (st) =>
							void st.addToggle((tg) =>
								tg.setValue(s.home.ribbonIcon).onChange((v) => {
									s.home.ribbonIcon = v;
									this.plugin.updateRibbon();
									this.save();
								}),
							),
					},
					{
						name: "Dashboard width",
						desc: "Maximum width of the dashboard, in pixels. A note without the simboard-home class is also limited by the readable line width.",
						render: (st) =>
							void st.addSlider((sl) =>
								sl
									.setLimits(MIN_WIDTH, MAX_WIDTH, 20)
									.setValue(s.layout.maxWidth)
									.onChange((v) => {
										s.layout.maxWidth = v;
										void this.plugin.saveAppearance();
									}),
							),
					},
					{
						name: "Default widgets",
						desc: `Widgets shown by a simboard block that doesn't list its own, in order (comma-separated). Available: ${WIDGET_LIST}.`,
						render: (st) =>
							void st.addText((text) =>
								text
									.setPlaceholder(WIDGET_LIST)
									.setValue(s.layout.defaultWidgets.join(", "))
									.onChange((v) => {
										const list = v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
										s.layout.defaultWidgets = list.length ? list : [...BUILTIN_WIDGET_ORDER];
										this.save();
									}),
							),
					},
					{
						name: "E-ink light mode",
						desc: "In light mode, draw the dashboard in high-contrast grayscale without glows or blur — easier to read on e-ink screens.",
						render: (st) =>
							void st.addToggle((tg) =>
								tg.setValue(s.appearance.einkLightMode).onChange((v) => {
									s.appearance.einkLightMode = v;
									void this.plugin.saveAppearance();
								}),
							),
					},
				],
			},
			{
				heading: "Banner",
				rows: [
					{
						name: "Banner image",
						desc: "An image file, or a folder of images (the first by name is used). Leave empty for a plain banner.",
						render: (st) => void st.addText((text) => this.pathText(text, "image-or-folder", s.banner.path, (v) => (s.banner.path = v))),
					},
					{
						name: "Banner ratio",
						desc: "Aspect ratio of the banner. Images with another ratio are cropped to their center — never stretched.",
						render: (st) =>
							void st.addDropdown((dd) => {
								for (const r of BANNER_RATIOS) dd.addOption(r, RATIO_LABELS[r]);
								dd.setValue(s.banner.ratio).onChange((v) => {
									s.banner.ratio = v as BannerRatio;
									this.save();
								});
							}),
					},
				],
			},
			{
				heading: "Calendar",
				rows: [
					{
						name: "Calendar width",
						desc: "Width of the calendar when it floats over the banner, in pixels. Without a banner it is shown as a card.",
						render: this.slider(160, 420, 10, () => s.calendar.width, (v) => (s.calendar.width = v)),
					},
					{
						name: "Calendar opacity",
						desc: "Opacity of the calendar panel over the banner, in percent.",
						render: this.slider(30, 100, 1, () => s.calendar.opacity, (v) => (s.calendar.opacity = v)),
					},
					{
						name: "Calendar margin",
						desc: "Distance from the banner's top and right edges, in pixels.",
						render: this.slider(0, 48, 2, () => s.calendar.margin, (v) => (s.calendar.margin = v)),
					},
					{
						name: "Daily notes folder",
						desc: "The calendar follows the daily notes core plugin. Set a folder here only to override that plugin's folder.",
						render: (st) => void st.addText((text) => this.pathText(text, "folder", s.dailyNotes.folder, (v) => (s.dailyNotes.folder = v))),
					},
					{
						name: "Daily note format",
						desc: "Moment.js format of daily note names. Leave empty to use the daily notes core plugin's format.",
						render: (st) =>
							void st.addText((text) =>
								text
									.setPlaceholder(DEFAULT_DAILY_FORMAT)
									.setValue(s.dailyNotes.format)
									.onChange((v) => {
										s.dailyNotes.format = v.trim();
										this.save();
									}),
							),
					},
				],
			},
			{
				heading: "Todos",
				rows: [
					{
						name: "Todo file",
						desc: "The file behind the todo card; created on first use. Its checkbox lines show up on the card, and checking one off hides it while the line stays in the file.",
						render: (st) => void st.addText((text) => this.pathText(text, "markdown", s.todos.path, (v) => (s.todos.path = v))),
					},
					{
						name: "Keep finished todos",
						desc: "Days a finished todo stays in the file before it is removed automatically.",
						render: this.slider(1, 30, 1, () => s.todos.keepDays, (v) => (s.todos.keepDays = v)),
					},
				],
			},
		];
	}

	/** Label + target fields for one quick link. */
	private quickLinkControls(setting: Setting, link: QuickLink): void {
		setting.addText((text) =>
			text
				.setPlaceholder("Label")
				.setValue(link.name)
				.onChange((v) => {
					link.name = v;
					this.save();
				}),
		);
		setting.addText((text) => {
			text.setPlaceholder("Note name or path");
			this.pathText(text, "markdown", link.path, (v) => (link.path = v));
		});
	}

	private moveQuickLink(from: number, to: number): void {
		const links = this.s.quickLinks;
		if (to < 0 || to >= links.length || from === to) return;
		const [item] = links.splice(from, 1);
		links.splice(to, 0, item);
		this.save();
	}

	// ---------- declarative rendering (Obsidian 1.13+) ----------

	/** Re-reads the definitions after the quick link list changed shape (declarative mode only). */
	private refreshDefinitions(): void {
		if (requireApiVersion("1.13.0")) this.update();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const groups: SettingDefinitionItem[] = this.sections().map((sec) => ({
			type: "group",
			heading: sec.heading,
			items: sec.rows.map((row) => ({ name: row.name, desc: row.desc, render: (setting: Setting) => row.render(setting) })),
		}));

		groups.push({
			type: "list",
			heading: "Quick links",
			emptyState: "No quick links yet. Quick links are buttons below the banner that open a note.",
			items: this.s.quickLinks.map((link, i) => ({
				name: link.name.trim() || `Link ${i + 1}`,
				render: (setting: Setting) => this.quickLinkControls(setting, link),
			})),
			onReorder: (from, to) => {
				this.moveQuickLink(from, to);
				this.refreshDefinitions();
			},
			onDelete: (i) => {
				this.s.quickLinks.splice(i, 1);
				this.save();
				this.refreshDefinitions();
			},
			addItem: {
				name: "Add quick link",
				action: () => {
					this.s.quickLinks.push({ name: "", path: "" });
					this.save();
					this.refreshDefinitions();
				},
			},
		});
		return groups;
	}

	// ---------- imperative fallback (Obsidian < 1.13) ----------

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const sec of this.sections()) {
			if (sec.heading) new Setting(containerEl).setName(sec.heading).setHeading();
			for (const row of sec.rows) {
				const setting = new Setting(containerEl).setName(row.name);
				if (row.desc) setting.setDesc(row.desc);
				row.render(setting);
			}
		}

		new Setting(containerEl).setName("Quick links").setHeading();
		containerEl.createEl("p", { cls: "setting-item-description", text: "Buttons below the banner that open a note. Use the arrows to reorder." });
		const listEl = containerEl.createDiv({ cls: "simboard-quicklinks-list" });
		const renderList = () => {
			listEl.empty();
			const links = this.s.quickLinks;
			if (!links.length) listEl.createEl("p", { cls: "setting-item-description", text: "No quick links yet." });
			links.forEach((link, idx) => {
				const row = new Setting(listEl).setClass("simboard-quicklink-row");
				this.quickLinkControls(row, link);
				row.addExtraButton((b) =>
					b
						.setIcon("arrow-up")
						.setTooltip("Move up")
						.onClick(() => {
							this.moveQuickLink(idx, idx - 1);
							renderList();
						}),
				);
				row.addExtraButton((b) =>
					b
						.setIcon("arrow-down")
						.setTooltip("Move down")
						.onClick(() => {
							this.moveQuickLink(idx, idx + 1);
							renderList();
						}),
				);
				row.addExtraButton((b) =>
					b
						.setIcon("trash")
						.setTooltip("Delete")
						.onClick(() => {
							links.splice(idx, 1);
							this.save();
							renderList();
						}),
				);
			});
		};
		renderList();

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("Add quick link")
				.setCta()
				.onClick(() => {
					this.s.quickLinks.push({ name: "", path: "" });
					this.save();
					renderList();
				}),
		);
	}
}
