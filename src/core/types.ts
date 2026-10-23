import { App, TAbstractFile } from "obsidian";
import type SimboardPlugin from "../main";
import { BlockConfig } from "./blockConfig";

/** Everything a widget needs to know about the dashboard it lives in. */
export interface WidgetContext {
	app: App;
	plugin: SimboardPlugin;
	/** Path of the note containing the code block. */
	sourcePath: string;
	/** Parsed code block options. */
	block: BlockConfig;
}

/** Per-widget handle the renderer passes to `render()`. */
export interface WidgetScope {
	/** Where the widget was placed: in the page flow, or inside another widget's slot. */
	readonly placement: "flow" | "slot";
	/** Registers cleanup that runs before the widget re-renders and when the dashboard unloads. */
	register(cleanup: () => void): void;
	/** Re-collects data and re-renders this widget only. */
	refresh(): void;
	/**
	 * Defers refreshes while held (e.g. during a drag or while an input has focus);
	 * a deferred refresh runs once every hold is released.
	 */
	hold(reason: string): void;
	release(reason: string): void;
	/** Exposes `el` as a named slot other widgets can render into (see `preferredSlot`). */
	provideSlot(name: string, el: HTMLElement): void;
}

/**
 * A dashboard building block. Implement this interface, add the widget to
 * `widgets/registry.ts`, and it can be listed in any `simboard` code block.
 *
 * Lifecycle: `collect()` gathers data (may be async, runs in parallel with the
 * other widgets) → `render()` builds DOM synchronously into `el`. On refresh the
 * widget's registered cleanups run, `el` is emptied, and both run again.
 */
export interface DashboardWidget<D = unknown> {
	/** Identifier used in code blocks, e.g. `widgets: banner, todos`. */
	readonly id: string;
	/**
	 * `full` takes a whole row; consecutive `card` widgets share a row, sized by
	 * `cardWeight` (CSS fr units) and stacked on narrow screens.
	 */
	readonly layout: "full" | "card";
	readonly cardWeight?: number;
	/** Slot to render into when another widget provides it (falls back to the flow). */
	readonly preferredSlot?: string;
	/** Slots this widget provides; lets the renderer know a slot will exist before rendering. */
	readonly providesSlots?: readonly string[];

	collect(ctx: WidgetContext): D | Promise<D>;
	render(el: HTMLElement, data: D, ctx: WidgetContext, scope: WidgetScope): void;

	/**
	 * Return true when a vault change affects this widget. Settings changes and
	 * day rollover always refresh every widget. Defaults to never.
	 */
	shouldRefresh?(file: TAbstractFile, oldPath: string | undefined, ctx: WidgetContext): boolean | Promise<boolean>;
}

/** Erases a widget's data type so heterogeneous widgets can share one registry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWidget = DashboardWidget<any>;
