import { normalizePath, Plugin, TFile } from "obsidian";
import { addDays, localIso, startOfDay } from "../utils/date";

const KEEP_DAYS = 200;
const SAVE_DELAY_MS = 5000;
const BACKFILL_TTL_MS = 10 * 60 * 1000;

export interface HeatCell {
	iso: string;
	date: Date;
	count: number;
}

/**
 * Counts vault changes (create / modify / delete / rename) per day.
 *
 * The log lives in its own file — `<plugin dir>/activity.json` — rather than in
 * data.json: it changes constantly, is device-local, and keeping it apart means
 * settings can be synced or versioned without the churn.
 */
export class ActivityTracker {
	private counts: Record<string, number> = {};
	private saveTimer: number | null = null;
	private backfill: { at: number; map: Record<string, number> } | null = null;

	constructor(private readonly plugin: Plugin) {}

	private get file(): string {
		return normalizePath(`${this.plugin.manifest.dir ?? ""}/activity.json`);
	}

	async load(): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		try {
			if (!(await adapter.exists(this.file))) return;
			const parsed: unknown = JSON.parse(await adapter.read(this.file));
			const days = (parsed as { days?: unknown })?.days;
			if (days && typeof days === "object" && !Array.isArray(days)) {
				for (const [k, v] of Object.entries(days)) {
					if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "number" && v > 0) this.counts[k] = v;
				}
			}
		} catch (e) {
			console.warn("Simboard: could not read activity log", e);
		}
	}

	/** Imports counts (e.g. from an older install), keeping the larger value per day. */
	merge(days: Record<string, number>): void {
		for (const [k, v] of Object.entries(days)) {
			if (typeof v === "number") this.counts[k] = Math.max(this.counts[k] ?? 0, v);
		}
		this.scheduleSave();
	}

	record(): void {
		const iso = localIso(new Date());
		this.counts[iso] = (this.counts[iso] ?? 0) + 1;
		this.scheduleSave();
	}

	countFor(iso: string): number {
		return this.counts[iso] ?? 0;
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => void this.flush(), SAVE_DELAY_MS);
	}

	async flush(): Promise<void> {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = null;
		const cutIso = localIso(addDays(new Date(), -KEEP_DAYS));
		for (const k of Object.keys(this.counts)) if (k < cutIso) delete this.counts[k];
		try {
			const sorted = Object.fromEntries(Object.entries(this.counts).sort(([a], [b]) => a.localeCompare(b)));
			await this.plugin.app.vault.adapter.write(this.file, JSON.stringify({ version: 1, days: sorted }, null, "\t"));
		} catch (e) {
			console.warn("Simboard: could not save activity log", e);
		}
	}

	/** Rough history for days before tracking started: files grouped by last-modified day. */
	private mtimeBackfill(): Record<string, number> {
		const now = Date.now();
		if (this.backfill && now - this.backfill.at < BACKFILL_TTL_MS) return this.backfill.map;
		const map: Record<string, number> = {};
		for (const f of this.plugin.app.vault.getFiles()) {
			if (!(f instanceof TFile) || !f.stat?.mtime) continue;
			const iso = localIso(new Date(f.stat.mtime));
			map[iso] = (map[iso] ?? 0) + 1;
		}
		this.backfill = { at: now, map };
		return map;
	}

	/**
	 * `weeks` full weeks of daily counts, Sunday-aligned and ending with the
	 * current week. Live counts win; days without any fall back to mtimes.
	 */
	heat(weeks = 18): HeatCell[] {
		const today = startOfDay(new Date());
		const start = addDays(today, -today.getDay() - (weeks - 1) * 7);
		const backfill = this.mtimeBackfill();
		const cells: HeatCell[] = [];
		for (let i = 0; i < weeks * 7; i++) {
			const date = addDays(start, i);
			const iso = localIso(date);
			cells.push({ iso, date, count: this.counts[iso] || backfill[iso] || 0 });
		}
		return cells;
	}
}
