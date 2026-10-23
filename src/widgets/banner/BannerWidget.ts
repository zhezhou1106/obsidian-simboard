import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { widgetOptions } from "../../core/blockConfig";
import { DashboardWidget, WidgetContext } from "../../core/types";
import { t } from "../../i18n";
import { BANNER_RATIOS, BannerRatio } from "../../settings/types";
import { formatDate, two } from "../../utils/date";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg"]);
export const BANNER_OVERLAY_SLOT = "banner-overlay";

interface BannerData {
	src: string;
	ratio: BannerRatio;
	name: string;
}

function isImage(f: TAbstractFile): f is TFile {
	return f instanceof TFile && IMAGE_EXT.has(f.extension.toLowerCase());
}

/** Resolves an image file, or the first image (by name) in a folder. */
export function resolveBannerFile(app: App, rawPath: string): TFile | null {
	const raw = rawPath.trim().replace(/\/+$/, "");
	if (!raw) return null;
	const node = app.vault.getAbstractFileByPath(raw);
	if (node && isImage(node)) return node;
	if (node instanceof TFolder) {
		return node.children.filter(isImage).sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
	}
	return null;
}

function bannerPath(ctx: WidgetContext): string {
	const override = widgetOptions(ctx.block, "banner").path;
	return typeof override === "string" ? override : ctx.plugin.settings.banner.path;
}

function greetingFor(hour: number): string {
	if (hour < 5) return t("greeting.night");
	if (hour < 12) return t("greeting.morning");
	if (hour < 17) return t("greeting.afternoon");
	if (hour < 22) return t("greeting.evening");
	return t("greeting.late");
}

/** Greeting name: block `name:` option, else the note's `name` property. */
function greetingName(ctx: WidgetContext): string {
	if (ctx.block.name != null) return ctx.block.name;
	const file = ctx.app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (!(file instanceof TFile)) return "";
	const fm = ctx.app.metadataCache.getFileCache(file)?.frontmatter;
	return fm?.name != null ? String(fm.name) : "";
}

/** Wallpaper with greeting, live clock and date. Provides the `banner-overlay` slot (used by the calendar). */
export const BannerWidget: DashboardWidget<BannerData> = {
	id: "banner",
	layout: "full",
	providesSlots: [BANNER_OVERLAY_SLOT],

	collect(ctx) {
		const file = resolveBannerFile(ctx.app, bannerPath(ctx));
		const optRatio = widgetOptions(ctx.block, "banner").ratio;
		const ratio = (BANNER_RATIOS as readonly unknown[]).includes(optRatio) ? (optRatio as BannerRatio) : ctx.plugin.settings.banner.ratio;
		return {
			src: file ? ctx.app.vault.getResourcePath(file) : "",
			ratio,
			name: greetingName(ctx),
		};
	},

	render(el, data, _ctx, scope) {
		const wrap = el.createDiv({ cls: "sb-banner-wrap" });
		const banner = wrap.createDiv({ cls: "sb-banner" });
		banner.setCssProps({ "--sb-banner-ratio": data.ratio });
		if (data.src) banner.createEl("img", { cls: "sb-banner-img", attr: { src: data.src, alt: t("banner.alt") } });
		else banner.addClass("sb-banner--empty");
		banner.createDiv({ cls: "sb-banner-scrim" });

		const greet = banner.createDiv({ cls: "sb-greet" });
		const line = greet.createDiv({ cls: "sb-greet-line" });
		const greetText = line.createSpan();
		if (data.name) line.appendText(`, ${data.name}`);
		const clock = greet.createDiv({ cls: "sb-clock" });
		const hm = clock.createSpan();
		const secs = clock.createSpan({ cls: "sb-clock-secs" });
		const date = greet.createDiv({ cls: "sb-date" });

		const tick = () => {
			const now = new Date();
			hm.setText(`${two(now.getHours())}:${two(now.getMinutes())}`);
			secs.setText(two(now.getSeconds()));
			date.setText(formatDate(now, "dddd, MMMM D, YYYY"));
			greetText.setText(greetingFor(now.getHours()));
		};
		tick();
		const timer = window.setInterval(tick, 1000);
		scope.register(() => window.clearInterval(timer));

		scope.provideSlot(BANNER_OVERLAY_SLOT, wrap.createDiv({ cls: "sb-banner-overlay" }));
	},

	shouldRefresh(file, oldPath, ctx) {
		const p = bannerPath(ctx).trim().replace(/\/+$/, "");
		if (!p) return false;
		const hit = (path?: string) => !!path && (path === p || path.startsWith(p + "/"));
		return hit(file.path) || hit(oldPath) || file.path === ctx.sourcePath;
	},
};
