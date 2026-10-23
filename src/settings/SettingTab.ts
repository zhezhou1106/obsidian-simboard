import { App, PluginSettingTab, Setting, TextComponent } from "obsidian";
import type SimboardPlugin from "../main";
import { BUILTIN_WIDGET_ORDER } from "./defaults";
import { PathKind, PathSuggest } from "./PathSuggest";
import { BANNER_RATIOS, BannerRatio } from "./types";

const RATIO_LABELS: Record<BannerRatio, string> = {
	"16 / 9": "16:9 — widescreen",
	"21 / 9": "21:9 — ultrawide",
	"3 / 2": "3:2",
	"4 / 3": "4:3",
	"1 / 1": "1:1 — square",
};

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

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ---------- dashboard note ----------
		new Setting(containerEl)
			.setName("Dashboard note")
			.setDesc("Note opened by the \"Open dashboard\" command and ribbon icon. Leave empty to use the first note that contains a simboard block.")
			.addText((text) => this.pathText(text, "markdown", this.s.home.notePath, (v) => (this.s.home.notePath = v)));

		new Setting(containerEl)
			.setName("Ribbon icon")
			.setDesc("Show an icon in the left ribbon that opens the dashboard note.")
			.addToggle((tg) =>
				tg.setValue(this.s.home.ribbonIcon).onChange((v) => {
					this.s.home.ribbonIcon = v;
					this.plugin.updateRibbon();
					this.save();
				}),
			);

		// ---------- layout ----------
		new Setting(containerEl)
			.setName("Content max width")
			.setDesc("Maximum width of the dashboard column, in pixels.")
			.addText((text) =>
				text
					.setPlaceholder("900")
					.setValue(String(this.s.layout.maxWidth))
					.onChange((v) => {
						const n = parseInt(v, 10);
						if (Number.isFinite(n)) {
							this.s.layout.maxWidth = Math.min(2000, Math.max(320, n));
							this.save();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Default widgets")
			.setDesc(
				`Widgets shown by a simboard block that doesn't list its own, in order (comma-separated). Available: ${BUILTIN_WIDGET_ORDER.join(", ")}.`,
			)
			.addText((text) =>
				text
					.setPlaceholder(BUILTIN_WIDGET_ORDER.join(", "))
					.setValue(this.s.layout.defaultWidgets.join(", "))
					.onChange((v) => {
						const list = v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
						this.s.layout.defaultWidgets = list.length ? list : [...BUILTIN_WIDGET_ORDER];
						this.save();
					}),
			);

		new Setting(containerEl)
			.setName("E-ink light mode")
			.setDesc("In light mode, draw the dashboard in high-contrast grayscale without glows or blur — easier to read on e-ink screens.")
			.addToggle((tg) =>
				tg.setValue(this.s.appearance.einkLightMode).onChange((v) => {
					this.s.appearance.einkLightMode = v;
					this.save();
				}),
			);

		// ---------- banner ----------
		new Setting(containerEl).setName("Banner").setHeading();

		new Setting(containerEl)
			.setName("Banner image")
			.setDesc("An image file, or a folder of images (the first by name is used). Leave empty for a plain banner.")
			.addText((text) => this.pathText(text, "image-or-folder", this.s.banner.path, (v) => (this.s.banner.path = v)));

		new Setting(containerEl)
			.setName("Banner ratio")
			.setDesc("Aspect ratio of the banner. Images with another ratio are cropped to their center — never stretched.")
			.addDropdown((dd) => {
				for (const r of BANNER_RATIOS) dd.addOption(r, RATIO_LABELS[r]);
				dd.setValue(this.s.banner.ratio).onChange((v) => {
					this.s.banner.ratio = v as BannerRatio;
					this.save();
				});
			});

		// ---------- calendar ----------
		new Setting(containerEl).setName("Calendar").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "With a banner, the calendar floats over its upper-right corner; otherwise it is shown as a card.",
		});

		const slider = (name: string, desc: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addSlider((sl) =>
					sl
						.setLimits(min, max, step)
						.setValue(get())
						.setDynamicTooltip()
						.onChange((v) => {
							set(v);
							this.save();
						}),
				);

		slider("Calendar width", "Width of the overlaid calendar, in pixels.", 160, 420, 10, () => this.s.calendar.width, (v) => (this.s.calendar.width = v));
		slider("Calendar opacity", "Opacity of the calendar panel over the banner (%).", 30, 100, 1, () => this.s.calendar.opacity, (v) => (this.s.calendar.opacity = v));
		slider("Calendar margin", "Distance from the banner's top and right edges, in pixels.", 0, 48, 2, () => this.s.calendar.margin, (v) => (this.s.calendar.margin = v));

		// ---------- daily notes ----------
		new Setting(containerEl).setName("Daily notes").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "The calendar follows the core Daily notes plugin. Fill these in only to override its folder or date format.",
		});

		new Setting(containerEl)
			.setName("Daily notes folder")
			.setDesc("Leave empty to use the Daily notes plugin's folder.")
			.addText((text) => this.pathText(text, "folder", this.s.dailyNotes.folder, (v) => (this.s.dailyNotes.folder = v)));

		new Setting(containerEl)
			.setName("Daily note format")
			.setDesc("Moment.js format of daily note names, e.g. YYYY-MM-DD. Leave empty to use the Daily notes plugin's format.")
			.addText((text) =>
				text
					.setPlaceholder("YYYY-MM-DD")
					.setValue(this.s.dailyNotes.format)
					.onChange((v) => {
						this.s.dailyNotes.format = v.trim();
						this.save();
					}),
			);

		// ---------- todos ----------
		new Setting(containerEl).setName("Todos").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "The todo card is backed by one file. Its checkbox lines show up on the card; checking one off hides it (the line stays in the file), and finished todos are removed after the keep period.",
		});

		new Setting(containerEl)
			.setName("Todo file")
			.setDesc("Vault path of the file behind the todo list. Created on first use if missing.")
			.addText((text) => this.pathText(text, "markdown", this.s.todos.path, (v) => (this.s.todos.path = v)));

		slider(
			"Keep finished todos",
			"Days a finished todo stays in the file before it is removed automatically.",
			1,
			30,
			1,
			() => this.s.todos.keepDays,
			(v) => (this.s.todos.keepDays = v),
		);

		// ---------- quick links ----------
		new Setting(containerEl).setName("Quick links").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Buttons in a row below the banner. Give each a label and the note it opens; use the arrows to reorder.",
		});

		const listEl = containerEl.createDiv({ cls: "simboard-quicklinks-list" });
		const renderList = () => {
			listEl.empty();
			const links = this.s.quickLinks;
			if (!links.length) listEl.createEl("p", { cls: "setting-item-description", text: "No quick links yet." });

			links.forEach((link, idx) => {
				const row = new Setting(listEl).setClass("simboard-quicklink-row");
				row.addText((text) =>
					text
						.setPlaceholder("Label")
						.setValue(link.name)
						.onChange((v) => {
							link.name = v;
							this.save();
						}),
				);
				row.addText((text) => {
					text.setPlaceholder("Note name or path");
					this.pathText(text, "markdown", link.path, (v) => (link.path = v));
				});
				const move = (delta: number) => {
					const j = idx + delta;
					if (j < 0 || j >= links.length) return;
					[links[idx], links[j]] = [links[j], links[idx]];
					this.save();
					renderList();
				};
				row.addExtraButton((b) => b.setIcon("arrow-up").setTooltip("Move up").onClick(() => move(-1)));
				row.addExtraButton((b) => b.setIcon("arrow-down").setTooltip("Move down").onClick(() => move(1)));
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
