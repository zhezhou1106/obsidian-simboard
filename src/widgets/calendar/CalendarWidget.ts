import { DashboardWidget } from "../../core/types";
import { formatDate, localIso } from "../../utils/date";
import { makeActivatable } from "../../utils/dom";
import { BANNER_OVERLAY_SLOT } from "../banner/BannerWidget";

interface CalendarData {
	year: number;
	month: number;
	todayIso: string;
	/** ISO dates in this month that have a daily note. */
	notes: Set<string>;
	width: number;
	opacity: number;
	margin: number;
}

/**
 * Month calendar; days with a daily note get a dot and open the note on click.
 * Floats over the banner when one is present, otherwise renders as a card.
 */
export const CalendarWidget: DashboardWidget<CalendarData> = {
	id: "calendar",
	layout: "card",
	cardWeight: 2,
	preferredSlot: BANNER_OVERLAY_SLOT,

	collect(ctx) {
		const now = new Date();
		const prefix = localIso(now).slice(0, 8); // "YYYY-MM-"
		const notes = new Set([...ctx.plugin.dailyNotes.listDates()].filter((iso) => iso.startsWith(prefix)));
		const { width, opacity, margin } = ctx.plugin.settings.calendar;
		return { year: now.getFullYear(), month: now.getMonth(), todayIso: localIso(now), notes, width, opacity, margin };
	},

	render(el, data, ctx, scope) {
		el.addClass(scope.placement === "slot" ? "sb-calendar--overlay" : "sb-calendar--card");
		el.setCssProps({
			"--sb-cal-width": `${data.width}px`,
			"--sb-cal-margin": `${data.margin}px`,
			"--sb-cal-opacity": String(data.opacity / 100),
		});

		const first = new Date(data.year, data.month, 1);
		el.createDiv({ cls: "sb-cal-title", text: formatDate(first, "MMMM YYYY") });
		const grid = el.createDiv({ cls: "sb-cal-grid" });

		// Weekday initials, Sunday first, in the app's locale.
		for (let i = 0; i < 7; i++) {
			grid.createDiv({ cls: "sb-cal-dow", text: formatDate(new Date(2023, 0, 1 + i), "dd").charAt(0) });
		}
		for (let i = 0; i < first.getDay(); i++) grid.createDiv({ cls: "sb-cal-day sb-cal-pad" });

		const days = new Date(data.year, data.month + 1, 0).getDate();
		for (let d = 1; d <= days; d++) {
			const date = new Date(data.year, data.month, d);
			const iso = localIso(date);
			const isToday = iso === data.todayIso;
			const hasNote = data.notes.has(iso);
			const cell = grid.createDiv({ cls: "sb-cal-day", text: String(d) });
			cell.toggleClass("is-today", isToday);
			cell.toggleClass("has-note", hasNote);
			if (isToday || hasNote) {
				cell.addClass("is-clickable");
				makeActivatable(
					cell,
					(ev) => {
						ev.preventDefault();
						ev.stopPropagation();
						void ctx.plugin.dailyNotes.open(date);
					},
					formatDate(date, "LL"),
				);
			}
		}
	},

	shouldRefresh(file, oldPath, ctx) {
		return ctx.plugin.dailyNotes.isInFolder(file, oldPath);
	},
};
