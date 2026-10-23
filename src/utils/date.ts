import { moment } from "obsidian";

/** Zero-pads a number to two digits. */
export function two(n: number): string {
	return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` in local time (ISO-like but never shifted to UTC). */
export function localIso(d: Date): string {
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** Midnight (local) of the given date, as a new Date. */
export function startOfDay(d: Date): Date {
	const out = new Date(d);
	out.setHours(0, 0, 0, 0);
	return out;
}

/** Adds `days` (may be negative) to a copy of `d`. */
export function addDays(d: Date, days: number): Date {
	const out = new Date(d);
	out.setDate(out.getDate() + days);
	return out;
}

/**
 * Formats a date with moment, which Obsidian keeps in sync with the app's
 * display language — so month/day names follow the user's locale.
 */
export function formatDate(d: Date | string, format: string): string {
	return moment(d).format(format);
}
