# New Tab — design

Date: 2026-10-16
Status: approved

## Goal

A personal Chrome new-tab page that replaces Speed Dial 2. Same layout (group tabs, clock/tasks/notes
column, tile grid, preferences panel), every feature included, no account or subscription. Built from
scratch — no Speed Dial 2 code or assets are copied. The user's existing tiles come over through the
JSON export Speed Dial 2 already produces.

## Non-goals

Cross-device sync, weather, calendar, focus mode, mobile app, publishing to the Chrome Web Store.

## Approach

Plain HTML/CSS/JS ES modules packaged as a Manifest V3 extension, no build step. Loaded via
`chrome://extensions` → Load unpacked. Edit a file, reload the tab.

Rejected: React + Vite (build step on every change, framework not needed for this size); forking an
open-source new-tab project (inherits someone else's structure and still needs most features built).

## Extension manifest

- `chrome_url_overrides.newtab` → `newtab.html`
- Permissions: `storage`, `unlimitedStorage` (wallpaper image), `bookmarks`, `history`, `sessions`
  (recently closed), `tabs` (switch to open tab), `favicon` (icon fallback), `search` (default engine).

## Data model

Stored in `chrome.storage.local` under key `state`; the uploaded wallpaper is stored separately under
key `wallpaper` (a data URL) so the large blob is not rewritten on every edit.

```js
state = {
  version: 1,
  groups: [{ id, title }],                       // display order = array order
  tiles:  [{ id, groupId, title, url, icon }],   // order within a group = array order; icon may be ""
  activeGroupId,
  tasks:  [{ id, text, done }],
  notes:  "",
  prefs:  {
    theme: "dark" | "light" | "auto",
    columns: 5,            // 2–10
    spacing: 8,            // px, 0–40
    width: 720,            // px, 480–1600
    centerVertically: true,
    showAddButton: true,
    compact: false,
    openInNewTab: false,
    accent: "#d97757",
    tiles: { radius: 10, showTitle: true, color: "#ffffff", textColor: "#202124" },
    background: { url: "", useUpload: false, blur: 0, dim: 0 },  // empty → theme colour
    widgets: {
      enabled: true, position: "left",
      clock: { enabled: true, hour24: true, name: "", greeting: true },
      tasks: { enabled: true },
      notes: { enabled: true },
    },
    sidebar: { enabled: true },
  },
}
```

Loading deep-merges saved `prefs` over defaults, so prefs added later get their default value.

Outside an extension context (plain browser tab, used for development checks) the storage adapter falls
back to `localStorage` and the Chrome-API features degrade (see each section).

## Theme

Default "Claude dark", matching the Claude Code desktop app (sampled from a screenshot):

| token        | dark      | light     |
|--------------|-----------|-----------|
| `--bg`       | `#151515` | `#faf9f5` |
| `--surface`  | `#212121` | `#ffffff` |
| `--surface-2`| `#1a1a1a` | `#f0eee6` |
| `--text`     | `#faf9f5` | `#141413` |
| `--muted`    | `#c2c0b6` | `#5e5d59` |
| `--border`   | `rgba(222,220,209,.12)` | `rgba(31,30,29,.15)` |
| `--accent`   | from prefs (`#d97757`) | same |

`auto` follows `prefers-color-scheme`. Tiles default to flat (icon and title straight on the background,
icons in a rounded square box, a faint outline on dark logos); a Cards style with configurable colours
is kept. Icons come from each tile's logo, or optionally from Chrome's site favicons.

Background: by default a minimal animated ASCII field in the style of the Claude Code app — faint
streaks of letters on a 7×14px grid (theme text colour at 3–12% opacity) that drift slowly; a soft,
sparse brightening around the mouse; and a single soft ring that spreads from a click on empty
background, brightening letters as it passes (`js/ascii-field.js` pure maths, `js/ascii-bg.js` canvas
renderer that redraws only changed cells from a glyph atlas). Can be switched to Plain, or made static
(also static when the OS asks for reduced motion). A wallpaper (uploaded file or image URL) with blur (0–20px) and dim (0–80%) sliders.

## Components (one file each under `js/`)

- **store.js** — load, save (debounced 200ms), `update(fn)`, `subscribe(fn)`; defaults; deep merge;
  storage adapter (`chrome.storage.local` or `localStorage`).
- **chrome-api.js** — thin wrappers over `chrome.bookmarks/history/tabs/sessions/search` that return
  empty results when the API is unavailable.
- **ui.js** — `el()` DOM helper, `uid()`, context menu, `<dialog>` helpers, fuzzy match/score.
- **theme.js** — writes prefs to CSS custom properties, applies theme and background.
- **groups.js** — header tab bar: switch, add, rename, delete (moves tiles to first group or deletes
  them, user chooses), drag to reorder. Remembers `activeGroupId`.
- **grid.js** — tile grid for the active group; `columns`, `spacing`, `width`, `compact`,
  `centerVertically` applied. Click opens (same tab, or new tab per `openInNewTab`; middle-click / Ctrl
  always new tab). Drag to reorder; drop on a group tab moves the tile there. Right-click menu: Edit,
  Open in new tab, Move to group, Delete. "+" tile opens the add dialog (title, URL, optional icon URL,
  group). Icon fallback chain: `icon` → Chrome `_favicon` (extension only) → letter avatar.
- **widgets.js** — left or right column: clock (date line, HH:MM, 12/24h, "Good morning/afternoon/
  evening/night, <name>"), tasks (add, toggle, delete), notes (textarea, saved as you type; not
  re-rendered while focused).
- **prefs.js** — modal with sections: General (includes the sidebar toggle), Appearance (theme,
  accent, background), Tiles, Widgets, Backup. Backup: export state as JSON download, one Import
  button that detects an own backup or a Speed Dial 2 export, reset all. Imports replace groups, tiles
  and prefs after a confirm prompt (tasks and notes are kept for Speed Dial 2 imports).
- **jump.js** — Ctrl+K (or header search icon) palette. Sources: tiles (always), Chrome bookmarks,
  history, open tabs, recently closed. Fuzzy-ranked, arrow keys + Enter. Open tab → focus it; closed →
  restore it. Last row: "Search the web for …" via `chrome.search.query` (Google URL outside extension).
- **sidebar.js** — slide-out panel from the right: Chrome bookmarks tree (collapsible folders), recent
  history (last 30), recently closed (last 10). Hidden header button when `sidebar.enabled` is false.
- **importer.js** — pure function `fromSpeedDial2(json) → { groups, tiles, prefs }`, no DOM or Chrome
  access.
- **main.js** — boots store, mounts components, wires the header buttons and keyboard shortcuts.

## Speed Dial 2 import mapping

Export shape: `{ dials: [{ id, idgroup, position, title, url, thumbnail, ... }], groups: [{ id, title,
position }], preferences: {...} }`.

- Groups sorted by `position`, then `id`. New ids generated; old → new id map kept for tiles.
- Tiles grouped by `idgroup`, sorted by `position`, then `id` (`position: 999` = appended, so these
  land at the end in creation order). `title` trimmed. `thumbnail` → `icon`. Tiles whose group is
  missing go to the first group. Visit counters are dropped.
- Prefs: `columns`, `spacing`, `maxWidth → width`, `centeredLayout → centerVertically`,
  `showAddButton`, `openInNewTab`, `theme.theme → theme`, `bookmarks.showTitle → tiles.showTitle`,
  `widgets.position`, `widgets.clock.{name, hourCycle → hour24, showGreeting → greeting, enabled}`,
  `widgets.tasks.enabled`, `widgets.notes.enabled`. Anything else keeps our default (accent, tile and
  background colours stay "Claude dark").
- Missing or malformed fields are skipped, never thrown on; a file without a `dials` array is rejected
  with a readable error.

Imported icons point at Speed Dial 2's image host; if that host stops serving them the favicon
fallback takes over.

## Error handling

- Corrupt or missing saved state → start from defaults (and log once to the console).
- Invalid URL in the tile dialog → inline message, save disabled. URLs without a scheme get `https://`.
- Failed image → next step in the icon fallback chain.
- Failed import → alert with the reason, current data untouched.

## Testing

- `node --test` unit tests for `importer.js` (ordering, 999 positions, missing groups, prefs mapping,
  rejection of bad input) and for the store's deep merge of prefs.
- Manual check in the built-in browser via a static server (localStorage mode): grid, groups, widgets,
  preferences, Jump with tile results, import of the real export file.
- Final check by loading unpacked in Chrome (bookmarks/history/tabs features need the real extension).
