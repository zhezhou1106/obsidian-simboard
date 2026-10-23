import { AbstractInputSuggest, App, TAbstractFile, TFile, TFolder } from "obsidian";

export type PathKind = "markdown" | "folder" | "image-or-folder";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg"]);

function accepts(kind: PathKind, f: TAbstractFile): boolean {
	if (kind === "folder") return f instanceof TFolder && !f.isRoot();
	if (kind === "markdown") return f instanceof TFile && f.extension === "md";
	return (f instanceof TFolder && !f.isRoot()) || (f instanceof TFile && IMAGE_EXT.has(f.extension.toLowerCase()));
}

/** Type-ahead for vault paths in setting text fields. */
export class PathSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly kind: PathKind,
		onPick: (path: string) => void,
	) {
		super(app, inputEl);
		this.onSelect((path) => {
			this.setValue(path);
			onPick(path);
			this.close();
		});
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase().trim();
		return this.app.vault
			.getAllLoadedFiles()
			.filter((f) => accepts(this.kind, f) && f.path.toLowerCase().includes(q))
			.map((f) => f.path)
			.sort((a, b) => a.length - b.length || a.localeCompare(b))
			.slice(0, 50);
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.setText(path);
	}
}
