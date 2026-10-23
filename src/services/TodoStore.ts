import { App, normalizePath, TAbstractFile, TFile, TFolder } from "obsidian";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { SimboardSettings } from "../settings/types";
import { addDays, localIso, startOfDay } from "../utils/date";

/** Any markdown checkbox line: `- [ ] …`, `* [x] …`. */
export const TASK_LINE_RE = /^\s*[-*]\s*\[[ xX]\]/;
const TASK_PARSE_RE = /^\s*[-*]\s*\[([ xX])\]\s*(.*)$/;
const EMPTY_TASK_RE = /^\s*[-*]\s*\[[ xX]\]\s*$/;
const HEADING_RE = /^#{1,6}\s/;
const SECTION_RE = /^##\s*Todos\b/i;
const SECTION_HEADING = "## Todos";
/** Tasks-plugin style date stamps, hidden from the card text. */
const DATE_STAMPS_RE = /[📅✅⏳🛫]\s*\d{4}-\d{2}-\d{2}\s*/gu;
const ADDED_RE = /📅\s*(\d{4}-\d{2}-\d{2})/u;
const DONE_RE = /✅\s*(\d{4}-\d{2}-\d{2})/u;

export interface ParsedTask {
	done: boolean;
	/** Text after the checkbox, including date stamps. */
	body: string;
}

export interface TodoItem {
	/** Line index in the backing file. */
	line: number;
	/** Exact line text, re-verified before every write. */
	raw: string;
	/** Text shown on the card (date stamps stripped). */
	text: string;
	/** ISO date from the 📅 stamp, if any. */
	addedIso: string | null;
}

/** `fn(lines)` returns the new lines, `null` for "nothing to do", or `false` when the file no longer matches. */
export type LineMutator = (lines: string[]) => string[] | null | false;

/**
 * Reads and writes the markdown file behind the todo widget. Pure line helpers
 * are static so they can be unit-tested without an App.
 */
export class TodoStore {
	/**
	 * Contents written recently, tagged with the dashboard that wrote them. A modify
	 * event carrying one of these is that dashboard's own echo (already shown in its
	 * DOM); other open dashboards still refresh.
	 */
	private ownWrites: { origin: unknown; content: string }[] = [];

	constructor(
		private readonly app: App,
		private readonly getSettings: () => SimboardSettings,
	) {}

	// ---------- pure helpers ----------

	static parseLine(line: string): ParsedTask | null {
		const m = String(line ?? "").match(TASK_PARSE_RE);
		return m ? { done: m[1].toLowerCase() === "x", body: m[2] ?? "" } : null;
	}

	static displayText(body: string): string {
		return String(body ?? "")
			.replace(DATE_STAMPS_RE, "")
			.replace(/\s+/g, " ")
			.trim();
	}

	static addedDate(body: string): string | null {
		const m = String(body ?? "").match(ADDED_RE);
		return m ? m[1] : null;
	}

	static newTaskLine(text: string, date: Date): string {
		return `- [ ] ${text} 📅 ${localIso(date)}`;
	}

	/** Checks the box and appends a ✅ completion stamp (once). */
	static completeLine(line: string, date: Date): string {
		let out = line.replace(/\[\s\]/, "[x]");
		if (!DONE_RE.test(out)) out = out.replace(/\s*$/, "") + ` ✅ ${localIso(date)}`;
		return out;
	}

	/**
	 * Inserts `line` under the "## Todos" heading, after the section's last
	 * non-empty checkbox (or at the end of the file without a heading).
	 * Returns the index it was inserted at.
	 */
	static insertInSection(lines: string[], line: string): number {
		const h = lines.findIndex((l) => SECTION_RE.test(l));
		if (h < 0) {
			lines.push("", line);
			return lines.length - 1;
		}
		let last = -1;
		let lastFull = -1;
		for (let j = h + 1; j < lines.length; j++) {
			if (HEADING_RE.test(lines[j])) break;
			if (TASK_LINE_RE.test(lines[j])) {
				last = j;
				if (!EMPTY_TASK_RE.test(lines[j])) lastFull = j;
			}
		}
		const at = (lastFull >= 0 ? lastFull : last >= 0 ? last : h) + 1;
		lines.splice(at, 0, line);
		return at;
	}

	/** Lines with done tasks whose ✅ date is older than `keepDays` removed; `null` if none were. */
	static pruneDone(lines: string[], keepDays: number, today = new Date()): string[] | null {
		const cutIso = localIso(addDays(startOfDay(today), -Math.max(0, keepDays)));
		let removed = 0;
		const kept = lines.filter((ln) => {
			const p = TodoStore.parseLine(ln);
			if (!p?.done) return true;
			const m = ln.match(DONE_RE);
			if (m && m[1] < cutIso) {
				removed++;
				return false;
			}
			return true;
		});
		return removed ? kept : null;
	}

	/** Index of the row's line: its recorded index if unchanged, else the first exact match. */
	static resolveLine(lines: string[], raw: string, at: number): number {
		if (lines[at] === raw) return at;
		const i = lines.indexOf(raw);
		return i >= 0 && TASK_LINE_RE.test(lines[i]) ? i : -1;
	}

	// ---------- file access ----------

	get path(): string {
		const raw = this.getSettings().todos.path.replace(/^\/+/, "").trim();
		return normalizePath(raw || DEFAULT_SETTINGS.todos.path);
	}

	file(): TFile | null {
		const f = this.app.vault.getAbstractFileByPath(this.path);
		return f instanceof TFile ? f : null;
	}

	/** True when a vault event on `file` concerns the todo file. */
	concerns(file: TAbstractFile, oldPath?: string): boolean {
		return file.path === this.path || oldPath === this.path;
	}

	noteOwnWrite(content: string, origin: unknown): void {
		this.ownWrites.push({ origin, content });
		if (this.ownWrites.length > 20) this.ownWrites.shift();
	}

	/** True when the file's current content is one `origin` just wrote. */
	async isOwnEcho(file: TFile, origin: unknown): Promise<boolean> {
		if (!this.ownWrites.some((w) => w.origin === origin)) return false;
		try {
			const content = await this.app.vault.cachedRead(file);
			return this.ownWrites.some((w) => w.origin === origin && w.content === content);
		} catch {
			return false;
		}
	}

	/** Open todos in file order, after pruning old finished ones. */
	async load(origin: unknown): Promise<TodoItem[]> {
		const f = this.file();
		if (!f) return [];
		let content = await this.app.vault.read(f);
		const pruned = TodoStore.pruneDone(content.split("\n"), this.getSettings().todos.keepDays);
		if (pruned) {
			await this.mutate((lines) => TodoStore.pruneDone(lines, this.getSettings().todos.keepDays), origin);
			content = await this.app.vault.read(f);
		}
		const items: TodoItem[] = [];
		content.split("\n").forEach((raw, line) => {
			const p = TodoStore.parseLine(raw);
			if (!p || p.done) return;
			items.push({ line, raw, text: TodoStore.displayText(p.body), addedIso: TodoStore.addedDate(p.body) });
		});
		return items;
	}

	/**
	 * Atomically rewrites the todo file through `fn`. Returns `fn`'s result, or
	 * `false` when the file is missing.
	 */
	async mutate(fn: LineMutator, origin: unknown): Promise<string[] | null | false> {
		const f = this.file();
		if (!f) return false;
		let result: string[] | null | false = null;
		await this.app.vault.process(f, (data) => {
			result = fn(data.split("\n"));
			const out = Array.isArray(result) ? result.join("\n") : data;
			this.noteOwnWrite(out, origin);
			return out;
		});
		return result;
	}

	/** Returns the todo file, creating it (and its folders) when missing. */
	async ensureFile(origin: unknown): Promise<TFile> {
		const existing = this.file();
		if (existing) return existing;
		const path = this.path;
		const parts = path.split("/");
		parts.pop();
		let cur = "";
		for (const part of parts) {
			cur = cur ? `${cur}/${part}` : part;
			if (!(this.app.vault.getAbstractFileByPath(cur) instanceof TFolder)) {
				try {
					await this.app.vault.createFolder(cur);
				} catch {
					/* created concurrently */
				}
			}
		}
		const content = SECTION_HEADING + "\n";
		this.noteOwnWrite(content, origin);
		try {
			return await this.app.vault.create(path, content);
		} catch (e) {
			const again = this.file();
			if (again) return again;
			throw e;
		}
	}
}
