import { getLanguage } from "obsidian";
import { en, StringKey } from "./en";

type Strings = Partial<Record<StringKey, string>>;

/** Registered translations, keyed by Obsidian language code (e.g. "zh", "de"). */
const LOCALES: Record<string, Strings> = {
	en,
};

let active: Strings | null = null;

function strings(): Strings {
	if (!active) {
		let lang = "en";
		try {
			lang = getLanguage();
		} catch {
			/* older Obsidian without getLanguage() */
		}
		active = LOCALES[lang] ?? LOCALES[lang.split("-")[0]] ?? en;
	}
	return active;
}

/** Looks up a UI string and fills `{placeholders}` from `vars`. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
	let s = strings()[key] ?? en[key];
	if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
	return s;
}

export type { StringKey };
