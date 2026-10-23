import { DashboardWidget } from "../../core/types";
import { QuickLink } from "../../settings/types";
import { makeActivatable } from "../../utils/dom";

/** A row of buttons that open notes, configured in the plugin settings. */
export const QuickLinksWidget: DashboardWidget<QuickLink[]> = {
	id: "quick-links",
	layout: "full",

	collect(ctx) {
		return ctx.plugin.settings.quickLinks.filter((l) => l.path.trim());
	},

	render(el, links, ctx) {
		if (!links.length) {
			el.addClass("sb-hidden");
			return;
		}
		el.removeClass("sb-hidden");
		const row = el.createDiv({ cls: "sb-quicklinks" });
		for (const link of links) {
			const label = link.name.trim() || link.path;
			const btn = row.createDiv({ cls: "sb-qlink", text: label, attr: { title: link.path } });
			makeActivatable(btn, (ev) => {
				ev.preventDefault();
				void ctx.app.workspace.openLinkText(link.path, ctx.sourcePath, false);
			});
		}
	},
};
