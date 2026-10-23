# Simboard — notes for AI assistants

Obsidian community plugin (TypeScript + esbuild). Source in `src/`; see README "Project layout".

## Workflow rules (from the owner)
- **Commit every change, never push.** After each logical change, run `npm run build`
  (type-checks, builds and syncs into the vault), then `git commit`. The owner pushes
  and publishes releases manually.
- The dev vault is configured in `.env.local` (git-ignored); builds sync automatically to
  `<vault>/.obsidian/plugins/simboard/` and hot-reload through the Obsidian CLI.
- Never edit the vault copy of `main.js` / `styles.css`; they are build output.

## Conventions
- DOM is built with Obsidian helpers (`createEl`, `createDiv`, `setIcon`); no `innerHTML`.
- CSS: every rule is scoped under `.simboard`, `.simboard-home` or `simboard-*`; inner
  classes use the `sb-` prefix and `is-*` for state. Colors go through `--sb-*` tokens.
- UI strings live in `src/i18n/en.ts` and are read with `t()`.
- Settings: grouped per widget; any shape change needs a `normalize.ts` update
  (and a `SETTINGS_VERSION` bump if old data must be migrated).
- Plugin id `simboard` and the `simboard` code block language must never change.
