import { AnyWidget } from "../core/types";
import { BannerWidget } from "./banner/BannerWidget";
import { CalendarWidget } from "./calendar/CalendarWidget";
import { QuickLinksWidget } from "./quick-links/QuickLinksWidget";
import { TodoWidget } from "./todos/TodoWidget";
import { VaultStatsWidget } from "./vault-stats/VaultStatsWidget";

/**
 * Every widget a `simboard` code block can list. To add one, create
 * `widgets/<id>/<Name>Widget.ts` implementing `DashboardWidget`, add its styles
 * in `styles/widgets/<id>.css`, and register it here.
 */
const WIDGETS: AnyWidget[] = [BannerWidget, CalendarWidget, QuickLinksWidget, TodoWidget, VaultStatsWidget];

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export function getWidget(id: string): AnyWidget | undefined {
	return BY_ID.get(id.trim().toLowerCase());
}

export function widgetIds(): string[] {
	return WIDGETS.map((w) => w.id);
}
