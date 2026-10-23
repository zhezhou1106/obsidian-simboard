import { TFolder } from "obsidian";
import { DashboardWidget } from "../../core/types";
import { t } from "../../i18n";
import { HeatCell } from "../../services/ActivityTracker";
import { formatDate, localIso } from "../../utils/date";

interface VaultStatsData {
	notes: number;
	attachments: number;
	folders: number;
	changesToday: number;
	heat: HeatCell[];
}

/** Heat level 0–4 for a day's change count. */
function level(n: number): number {
	if (n <= 0) return 0;
	if (n <= 2) return 1;
	if (n <= 5) return 2;
	if (n <= 9) return 3;
	return 4;
}

/** Note / attachment / folder counts plus an 18-week activity heatmap. */
export const VaultStatsWidget: DashboardWidget<VaultStatsData> = {
	id: "vault-stats",
	layout: "card",
	cardWeight: 2,

	collect(ctx) {
		const { vault } = ctx.app;
		let notes = 0;
		let attachments = 0;
		for (const f of vault.getFiles()) {
			if (f.extension === "md") notes++;
			else attachments++;
		}
		const folders = vault.getAllLoadedFiles().filter((f) => f instanceof TFolder && !f.isRoot()).length;
		const tracker = ctx.plugin.activity;
		return {
			notes,
			attachments,
			folders,
			changesToday: tracker.countFor(localIso(new Date())),
			heat: tracker.heat(18),
		};
	},

	render(el, data) {
		const header = el.createEl("h3", { cls: "sb-card-header", text: t("vault.title") });
		header.createSpan({ cls: "sb-card-badge", text: t("vault.today", { n: data.changesToday }) });

		const stats = el.createDiv({ cls: "sb-stats" });
		const tiles: [number, string][] = [
			[data.notes, t("vault.notes")],
			[data.attachments, t("vault.attachments")],
			[data.folders, t("vault.folders")],
			[data.changesToday, t("vault.changesToday")],
		];
		for (const [n, label] of tiles) {
			const tile = stats.createDiv({ cls: "sb-stat" });
			tile.createSpan({ cls: "sb-stat-value", text: String(n) });
			tile.createSpan({ cls: "sb-stat-label", text: label });
		}

		const heat = el.createDiv({ cls: "sb-heat" });
		heat.setCssProps({ "--sb-heat-weeks": String(Math.ceil(data.heat.length / 7)) });
		for (const cell of data.heat) {
			const lvl = level(cell.count);
			const c = heat.createDiv({ cls: "sb-heat-cell" });
			if (lvl) c.addClass(`is-l${lvl}`);
			if (cell.count > 0) {
				const date = formatDate(cell.date, "MMM D");
				c.setAttr("title", cell.count === 1 ? t("vault.heat.tooltip.one", { date }) : t("vault.heat.tooltip", { date, n: cell.count }));
			}
		}
	},

	// Every vault change moves the counters.
	shouldRefresh() {
		return true;
	},
};
