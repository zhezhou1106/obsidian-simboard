import { MarkdownRenderChild, TAbstractFile } from "obsidian";
import { t } from "../i18n";
import type SimboardPlugin from "../main";
import { localIso } from "../utils/date";
import { getWidget, widgetIds } from "../widgets/registry";
import { BlockConfig, parseBlockConfig } from "./blockConfig";
import { AnyWidget, WidgetContext, WidgetScope } from "./types";

const REFRESH_DEBOUNCE_MS = 250;
const DAY_CHECK_MS = 60 * 1000;

interface Instance {
	widget: AnyWidget;
	host: HTMLElement;
	scope: WidgetScope;
	cleanups: (() => void)[];
	holds: Set<string>;
	/** A refresh was requested while held. */
	deferred: boolean;
	rendering: boolean;
	/** A refresh was requested while one was in flight. */
	rerender: boolean;
}

/**
 * One rendered `simboard` code block. Lays the widgets out, renders each into
 * its own host element, and refreshes only the widgets a vault change affects.
 */
export class DashboardRenderer extends MarkdownRenderChild {
	private readonly block: BlockConfig;
	private readonly ctx: WidgetContext;
	private instances: Instance[] = [];
	/** Slot name → hosts of widgets that render into that slot. */
	private slotted = new Map<string, HTMLElement[]>();
	private dirty = new Set<Instance>();
	private dirtyTimer: number | null = null;
	/** Bumped on every full rebuild so stale async renders are dropped. */
	private generation = 0;
	private rebuildPending = false;
	private dayIso = localIso(new Date());

	constructor(
		containerEl: HTMLElement,
		private readonly plugin: SimboardPlugin,
		sourcePath: string,
		source: string,
	) {
		super(containerEl);
		this.block = parseBlockConfig(source);
		this.ctx = { app: plugin.app, plugin, sourcePath, block: this.block };
	}

	onload(): void {
		this.plugin.renderers.add(this);
		this.build();

		const { vault } = this.plugin.app;
		this.registerEvent(vault.on("modify", (f) => this.onVaultEvent(f)));
		this.registerEvent(vault.on("create", (f) => this.onVaultEvent(f)));
		this.registerEvent(vault.on("delete", (f) => this.onVaultEvent(f)));
		this.registerEvent(vault.on("rename", (f, oldPath) => this.onVaultEvent(f, oldPath)));

		// Day rollover: calendar, greeting date and heatmap all move on at midnight.
		this.registerInterval(
			window.setInterval(() => {
				const iso = localIso(new Date());
				if (iso !== this.dayIso) {
					this.dayIso = iso;
					this.rebuild();
				}
			}, DAY_CHECK_MS),
		);
	}

	onunload(): void {
		this.plugin.renderers.delete(this);
		if (this.dirtyTimer !== null) window.clearTimeout(this.dirtyTimer);
		this.dirtyTimer = null;
		this.instances.forEach((inst) => this.runCleanups(inst));
		this.instances = [];
	}

	/** Full re-layout (settings changed). Deferred while any widget is held. */
	rebuild(): void {
		if (this.instances.some((i) => i.holds.size)) {
			this.rebuildPending = true;
			return;
		}
		this.build();
	}

	// ---------- layout ----------

	private build(): void {
		this.generation++;
		this.rebuildPending = false;
		this.instances.forEach((inst) => this.runCleanups(inst));
		this.instances = [];
		this.slotted.clear();
		this.dirty.clear();

		const settings = this.plugin.settings;
		const el = this.containerEl;
		el.empty();

		const root = el.createDiv({ cls: "simboard" });
		root.toggleClass("simboard--eink", settings.appearance.einkLightMode);
		root.setCssProps({ "--sb-max-width": `${settings.layout.maxWidth}px` });

		if (this.block.error) root.createDiv({ cls: "sb-error", text: this.block.error });

		const ids = this.block.widgets ?? settings.layout.defaultWidgets;
		const widgets: AnyWidget[] = [];
		for (const id of ids) {
			const w = getWidget(id);
			if (w) widgets.push(w);
			else root.createDiv({ cls: "sb-error", text: t("error.unknownWidget", { id, list: widgetIds().join(", ") }) });
		}

		const provided = new Set(widgets.flatMap((w) => w.providesSlots ?? []));
		const column = root.createDiv({ cls: "sb-column" });
		let row: HTMLElement | null = null;
		let weights: number[] = [];
		const closeRow = () => {
			if (row) row.setCssProps({ "--sb-cols": weights.map((w) => `minmax(0, ${w}fr)`).join(" ") });
			row = null;
			weights = [];
		};

		for (const widget of widgets) {
			let host: HTMLElement;
			let placement: WidgetScope["placement"] = "flow";
			if (widget.preferredSlot && provided.has(widget.preferredSlot)) {
				host = createDiv();
				placement = "slot";
				const list = this.slotted.get(widget.preferredSlot) ?? [];
				list.push(host);
				this.slotted.set(widget.preferredSlot, list);
			} else if (widget.layout === "card") {
				if (!row) row = column.createDiv({ cls: "sb-row" });
				host = row.createDiv({ cls: "sb-card" });
				weights.push(widget.cardWeight ?? 1);
			} else {
				closeRow();
				host = column.createDiv();
			}
			host.addClass("sb-widget", `sb-widget-${widget.id}`);
			this.instances.push(this.createInstance(widget, host, placement));
		}
		closeRow();

		this.instances.forEach((inst) => void this.renderInstance(inst));
	}

	private createInstance(widget: AnyWidget, host: HTMLElement, placement: WidgetScope["placement"]): Instance {
		const inst: Instance = {
			widget,
			host,
			cleanups: [],
			holds: new Set<string>(),
			deferred: false,
			rendering: false,
			rerender: false,
			scope: {
				placement,
				register: (fn) => void inst.cleanups.push(fn),
				refresh: () => this.markDirty(inst, true),
				hold: (reason) => void inst.holds.add(reason),
				release: (reason) => this.release(inst, reason),
				provideSlot: (name, el) => this.provideSlot(name, el),
			},
		};
		return inst;
	}

	private provideSlot(name: string, el: HTMLElement): void {
		for (const host of this.slotted.get(name) ?? []) el.appendChild(host);
	}

	// ---------- rendering ----------

	private runCleanups(inst: Instance): void {
		const fns = inst.cleanups;
		inst.cleanups = [];
		for (const fn of fns) {
			try {
				fn();
			} catch (e) {
				console.error("Simboard: widget cleanup failed", e);
			}
		}
	}

	private async renderInstance(inst: Instance): Promise<void> {
		if (inst.holds.size) {
			inst.deferred = true;
			return;
		}
		if (inst.rendering) {
			inst.rerender = true;
			return;
		}
		const gen = this.generation;
		inst.rendering = true;
		inst.rerender = false;
		try {
			const data: unknown = await inst.widget.collect(this.ctx);
			if (gen !== this.generation) return;
			// Held while data was loading (e.g. a drag started): don't pull the DOM away.
			if (inst.holds.size) {
				inst.deferred = true;
				return;
			}
			this.runCleanups(inst);
			inst.host.empty();
			inst.widget.render(inst.host, data, this.ctx, inst.scope);
		} catch (err) {
			if (gen !== this.generation) return;
			this.runCleanups(inst);
			inst.host.empty();
			inst.host.createDiv({ cls: "sb-error", text: t("error.render", { error: err instanceof Error ? err.message : String(err) }) });
			console.error(`Simboard: widget "${inst.widget.id}" failed`, err);
		} finally {
			inst.rendering = false;
			if (inst.rerender && gen === this.generation) {
				inst.rerender = false;
				this.markDirty(inst);
			}
		}
	}

	// ---------- refresh scheduling ----------

	private onVaultEvent(file: TAbstractFile, oldPath?: string): void {
		for (const inst of this.instances) {
			if (!inst.widget.shouldRefresh) continue;
			void Promise.resolve(inst.widget.shouldRefresh(file, oldPath, this.ctx))
				.then((yes) => {
					if (yes) this.markDirty(inst);
				})
				.catch((e) => console.error(e));
		}
	}

	private markDirty(inst: Instance, immediate = false): void {
		if (!this.instances.includes(inst)) return;
		if (immediate) {
			this.dirty.delete(inst);
			void this.renderInstance(inst);
			return;
		}
		this.dirty.add(inst);
		if (this.dirtyTimer !== null) window.clearTimeout(this.dirtyTimer);
		this.dirtyTimer = window.setTimeout(() => {
			this.dirtyTimer = null;
			const batch = [...this.dirty];
			this.dirty.clear();
			batch.forEach((i) => void this.renderInstance(i));
		}, REFRESH_DEBOUNCE_MS);
	}

	private release(inst: Instance, reason: string): void {
		inst.holds.delete(reason);
		if (inst.holds.size) return;
		if (this.rebuildPending && !this.instances.some((i) => i.holds.size)) {
			this.build();
			return;
		}
		if (inst.deferred) {
			inst.deferred = false;
			this.markDirty(inst);
		}
	}
}
