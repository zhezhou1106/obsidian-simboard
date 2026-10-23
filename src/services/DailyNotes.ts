import { App, moment, normalizePath, TAbstractFile, TFile, TFolder } from "obsidian";
import { SimboardSettings } from "../settings/types";
import { localIso } from "../utils/date";

const DEFAULT_FORMAT = "YYYY-MM-DD";
const ISO_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

interface DailyNotesConfig {
	/** Vault-relative folder without trailing slash; "" = vault root. */
	folder: string;
	format: string;
}

/**
 * Minimal view of Obsidian internals used to read the core Daily notes options
 * and run its "open today" command. Neither is part of the public API, so every
 * access is guarded and the plugin's own settings can override both values.
 */
interface AppInternals {
	internalPlugins?: {
		getPluginById?(id: string): { enabled?: boolean; instance?: { options?: { folder?: string; format?: string } } } | null;
	};
	commands?: { executeCommandById?(id: string): boolean };
}

/** Locates, lists and opens daily notes, following the core Daily notes plugin's settings. */
export class DailyNotesService {
	constructor(
		private readonly app: App,
		private readonly getSettings: () => SimboardSettings,
	) {}

	private coreOptions(): { folder?: string; format?: string } {
		try {
			const core = (this.app as unknown as AppInternals).internalPlugins?.getPluginById?.("daily-notes");
			return core?.instance?.options ?? {};
		} catch {
			return {};
		}
	}

	config(): DailyNotesConfig {
		const own = this.getSettings().dailyNotes;
		const core = this.coreOptions();
		const folder = (own.folder || core.folder || "").trim();
		const format = (own.format || core.format || DEFAULT_FORMAT).trim();
		return { folder: folder ? normalizePath(folder) : "", format };
	}

	/** True when `file` (or a path it was renamed from) lives in the daily notes folder. */
	isInFolder(file: TAbstractFile, oldPath?: string): boolean {
		const { folder } = this.config();
		if (!folder) return file instanceof TFile && file.extension === "md";
		const prefix = folder + "/";
		return file.path.startsWith(prefix) || (!!oldPath && oldPath.startsWith(prefix));
	}

	/** Parses a daily note's date from its basename (strictly by format, then a YYYY-MM-DD prefix). */
	dateOf(file: TFile): string | null {
		const { format } = this.config();
		const strict = moment(file.basename, format, true);
		if (strict.isValid()) return strict.format("YYYY-MM-DD");
		const m = file.basename.match(ISO_PREFIX);
		return m ? m[1] : null;
	}

	/** ISO dates (YYYY-MM-DD) of every daily note that exists. */
	listDates(): Set<string> {
		const { folder } = this.config();
		const out = new Set<string>();
		const start = folder ? this.app.vault.getAbstractFileByPath(folder) : this.app.vault.getRoot();
		const walk = (node: TAbstractFile | null) => {
			if (!(node instanceof TFolder)) return;
			for (const child of node.children) {
				if (child instanceof TFolder) walk(child);
				else if (child instanceof TFile && child.extension === "md") {
					const iso = this.dateOf(child);
					if (iso) out.add(iso);
				}
			}
		};
		walk(start);
		return out;
	}

	/** Vault path of the daily note for `date` (whether or not it exists). */
	pathFor(date: Date): string {
		const { folder, format } = this.config();
		const name = moment(date).format(format) + ".md";
		return normalizePath(folder ? `${folder}/${name}` : name);
	}

	/** Finds the existing note for `date`, also matching files named in an older format. */
	findFile(date: Date): TFile | null {
		const direct = this.app.vault.getAbstractFileByPath(this.pathFor(date));
		if (direct instanceof TFile) return direct;
		const iso = localIso(date);
		const { folder } = this.config();
		const prefix = folder ? folder + "/" : "";
		return (
			this.app.vault
				.getMarkdownFiles()
				.find((f) => f.path.startsWith(prefix) && this.dateOf(f) === iso) ?? null
		);
	}

	/**
	 * Opens the daily note for `date`. Today's note goes through the core
	 * "Open today's daily note" command when available, so its template applies.
	 */
	async open(date: Date): Promise<void> {
		const existing = this.findFile(date);
		if (existing) {
			await this.app.workspace.getLeaf(false).openFile(existing);
			return;
		}
		if (localIso(date) === localIso(new Date())) {
			try {
				const ran = (this.app as unknown as AppInternals).commands?.executeCommandById?.("daily-notes");
				if (ran) return;
			} catch {
				/* fall through */
			}
		}
		await this.app.workspace.openLinkText(this.pathFor(date).replace(/\.md$/, ""), "", false);
	}
}
