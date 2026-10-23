# Changelog

## Unreleased

- Commands: open the dashboard note, insert a dashboard block, refresh open dashboards.
- Optional ribbon icon that opens the dashboard; "Dashboard note" setting.
- Settings appear in Obsidian's settings search (1.13+), with a fallback for older versions.
- Quick flicks when dragging a todo now land in the right slot.
- More reliable Enter handling with IME input (e.g. pinyin) in the todo field.
- Desktop-only for now (`isDesktopOnly: true`).
- Passes Obsidian's official lint rules (`npm run lint`, also run in CI).

## 0.1.0

- First version as a standalone plugin (previously a vault-local "dashboard" plugin).
- Widgets: banner, calendar, quick links, todos, vault stats.
- The code block picks its widgets, their order and per-widget options.
- Colors follow the active theme; the e-ink grayscale mode is now an opt-in setting.
- The activity log is stored in `activity.json` instead of `data.json`.
