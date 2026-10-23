/** True when the OS asks for reduced motion. */
export function prefersReducedMotion(): boolean {
	try {
		return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	} catch {
		return false;
	}
}

/** Clamps `value` into [min, max]; non-numbers fall back to `fallback`. */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	const n = typeof value === "number" ? value : parseInt(String(value), 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/** Makes a non-button element keyboard-activatable (Enter / Space) like a button. */
export function makeActivatable(el: HTMLElement, onActivate: (ev: Event) => void, label?: string): void {
	el.setAttr("role", "button");
	el.setAttr("tabindex", "0");
	if (label) el.setAttr("aria-label", label);
	el.addEventListener("click", onActivate);
	el.addEventListener("keydown", (ev: KeyboardEvent) => {
		if (ev.key === "Enter" || ev.key === " ") {
			ev.preventDefault();
			onActivate(ev);
		}
	});
}
