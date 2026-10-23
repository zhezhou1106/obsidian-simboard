import { Editor, Notice, TFile } from "obsidian";
import { t } from "./i18n";
import type SimboardPlugin from "./main";

export const RIBBON_ICON = "layout-dashboard";

/** Finds the dashboard note: the configured one, else the first note containing a simboard block. */
export async function findDashboardNote(plugin: SimboardPlugin, language: string): Promise<TFile | null> {
	const { vault, metadataCache } = plugin.app;
	const configured = plugin.settings.home.notePath;
	if (configured) {
		const f = vault.getAbstractFileByPath(configured.endsWith(".md") ? configured : `${configured}.md`);
		if (f instanceof TFile) return f;
	}
	const fence = new RegExp("^\\s*(```+|~~~+)\\s*" + language + "\\s*$", "m");
	// Only read notes the metadata cache says contain a code block.
	const candidates = vault
		.getMarkdownFiles()
		.filter((f) => metadataCache.getFileCache(f)?.sections?.some((s) => s.type === "code"))
		.sort((a, b) => a.path.localeCompare(b.path));
	for (const f of candidates) {
		if (fence.test(await vault.cachedRead(f))) return f;
	}
	return null;
}

/** Opens the dashboard note, reusing a tab that already shows it. */
export async function openDashboard(plugin: SimboardPlugin, language: string): Promise<void> {
	const file = await findDashboardNote(plugin, language);
	if (!file) {
		new Notice(t("command.open.notFound"), 6000);
		return;
	}
	const { workspace } = plugin.app;
	const existing = workspace.getLeavesOfType("markdown").find((leaf) => (leaf.view as { file?: TFile }).file?.path === file.path);
	if (existing) {
		workspace.setActiveLeaf(existing, { focus: true });
		return;
	}
	await workspace.getLeaf(false).openFile(file);
}

/** Inserts an empty simboard block at the cursor, on its own lines. */
export function insertDashboardBlock(editor: Editor, language: string): void {
	const cursor = editor.getCursor();
	const lineText = editor.getLine(cursor.line);
	const before = cursor.ch > 0 && lineText.slice(0, cursor.ch).trim() ? "\n" : "";
	const after = lineText.slice(cursor.ch).trim() ? "\n" : "";
	editor.replaceSelection(`${before}\`\`\`${language}\n\`\`\`\n${after}`);
}

export function registerCommands(plugin: SimboardPlugin, language: string): void {
	plugin.addCommand({
		id: "open-dashboard",
		name: t("command.open"),
		callback: () => void openDashboard(plugin, language),
	});

	plugin.addCommand({
		id: "insert-dashboard-block",
		name: t("command.insert"),
		editorCallback: (editor) => insertDashboardBlock(editor, language),
	});

	plugin.addCommand({
		id: "refresh-dashboards",
		name: t("command.refresh"),
		checkCallback: (checking) => {
			if (!plugin.renderers.size) return false;
			if (!checking) plugin.refreshDashboards();
			return true;
		},
	});
}
