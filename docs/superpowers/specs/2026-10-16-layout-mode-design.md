# Layout mode: one canvas for widgets, bars and tiles

Date: 2026-10-16
Status: approved, built

Builds on `2026-10-16-search-engines-and-bar-position-design.md` (merged as 796d96c).

**Revision, same day (asked for after the first build):** the search bar is a widget of its own
and nothing else: the docked bar inside a tiles block, its grip, `settings.bar` and the row helpers
in `ask.js` are gone, and the Search bar type's `max` is 1. The conversion puts the bar in a row of
its own above the tiles block (below it when the old `search.row` was `-1`), and a layout saved by
the first build with a bar still docked in a block gets the same treatment on load. Where the text
below describes a docked bar or several bars, this paragraph wins.

## Goal

The three fixed columns go. Everything under the top bar sits on one 12 × 12 grid of cells, and a
Layout mode lets the user drag, resize, add, duplicate and remove any of it. A block of tiles is a
widget like the others, so several blocks can show different groups in different places. Outside
Layout mode nothing changes visually: widgets stay flat on the background as they are today.

## What the user sees

- **The canvas.** The page below the 56px top bar is a grid of 12 columns × 12 rows with a 12px
  gap, filling the window (`height: calc(100vh - 56px)`, never under 560px, so a very short window
  scrolls instead of squashing the rows). Cells are proportional, so one layout looks the same on a
  laptop and a monitor. Each widget copy occupies a rectangle of cells.
- **Entering and leaving.** A layout button in the top bar (between Jump and the sidebar button),
  right-click on the empty canvas → *Edit layout*, or Preferences → Layout → *Edit layout*. *Done*
  or Esc keeps the result; *Cancel* undoes everything since entering. Under 900px wide the button
  explains that Layout mode needs a wider window.
- **While editing.** Faint cell outlines show. Every copy gets a dashed frame, a label in its bottom
  left corner ("Tiles · Work"), a toolbar in its top right (settings, duplicate, remove), and eight
  resize handles (corners and edges). The widgets' own content is inert and slightly dimmed. The
  ASCII background does not ripple on clicks inside the canvas.
- **Dragging.** Press anywhere on a frame and move it; it follows the pointer while an outline shows
  the cells it will snap to. Nothing else moves: a copy never pushes its neighbours.
- **No overlap.** A spot that is taken, or partly off the canvas, shows the outline in red. Release
  there and the copy springs back. The same rule applies to resizing.
- **Resizing.** From any handle, snapping to cells, never below the type's minimum size. The frame
  shows the new size live. List widgets gain or lose rows and scroll inside their frame; the page
  itself never scrolls. The clock scales its face to fill its frame.
- **Toolbar.** *Settings* opens Preferences at that copy's own group. *Duplicate* adds a copy in the
  first free spot (default size, else minimum size), greyed out at the type's limit or when there
  is no room. *Remove* takes the copy off the page; Tasks and Notes keep their content and bring it
  back when added again.
- **Tray.** A bar along the bottom of the window while editing: one chip per widget type with its
  count ("Markets 2/5"; "Notes on/off" for the single ones), *Reset layout*, *Cancel*, *Done*. A
  chip adds the widget at its default size in the first free spot, at its minimum size if that is
  all that fits, and is greyed out at the limit or when nothing fits.
- **Reset layout** puts one copy of each default widget back where the default layout has it,
  keeping its settings, and removes extra copies after one confirmation that names them.
- **Keyboard.** Tab moves between frames. Arrows move the focused one by a cell, Shift+arrows resize
  it, `D` duplicates, Delete or Backspace removes, Esc leaves Layout mode. Plain keys are free
  because the content is inert (Ctrl+D is Chrome's bookmark shortcut).
- **Narrow windows** (under 900px): the copies stack in one column in reading order (top to bottom,
  then left to right), each as tall as its content, like the page stacks today.

## Widget types

One registry entry per type. `size` and `min` are `[w, h]` in cells; `max` is the number of copies
allowed.

| Type | Label | Default | Min | Max | Settings per copy |
| --- | --- | --- | --- | --- | --- |
| `clock` | Clock | 3 × 4 | 2 × 2 | 1 | `hour24`, `name`, `greeting`, `face`, `colon` (as today) |
| `tasks` | Tasks | 3 × 4 | 2 × 3 | 1 | none |
| `notes` | Notes | 3 × 3 | 2 × 2 | 1 | none |
| `claude` | Claude | 3 × 2 | 2 × 2 | 5 | none |
| `markets` | Markets | 3 × 5 | 2 × 3 | 5 | `items` (as today) |
| `github` | GitHub | 3 × 6 | 3 × 3 | 5 | `user`, `parts` |
| `tiles` | Tiles | 6 × 6 | 3 × 3 | 5 | `group`, `columns`, `bar` |
| `search` | Search bar | 6 × 1 | 3 × 1 | 5 | none |

Per type:

- **Clock.** The frame is a size container; the faces size themselves with container query units
  instead of a fixed `--clock-size`: `font-size: min(var(--fit-w) * 1cqw, var(--fit-h) * 1cqh)`
  with per-face factors (starting points: classic 30/45, dot 26/45, one-line stencil 32/45, rounded
  28/45, serif 30/45; stacked stencil 55/34, rounded 50/34, serif 52/36; tuned in the browser). Under
  a container height of 160px the date and greeting are hidden. The ✎ face strip still opens under
  the clock; the frame scrolls if it does not fit.
- **Tasks, Notes, Claude.** As today. The notes textarea fills its frame and scrolls inside it (no
  `max-height: 40vh`). Removing Tasks or Notes keeps `state.tasks` and `state.notes`.
- **Markets.** As today, per copy: the ✎ editor writes the copy's `items`. Rows under 3 cells wide
  drop the sparkline column.
- **GitHub.** `parts` is an ordered subset of `['heatmap', 'pulls', 'issues', 'commits']`, shown in
  that order (activity map, open pull requests, open issues, latest commits). The calendar is
  fetched only when `heatmap` is on; the activity feed when any list is on. The token is shared
  (`prefs.github.token`). A copy with an empty `parts` shows a one-line note with a link to its
  settings. *Set up GitHub* and ✎ open the copy's group in Preferences. All copies share one hourly
  fetch through the request cache.
- **Tiles.** `group` is a group id, or `null` to follow the tabs (what the converted block does).
  A pinned block shows the group's title as its heading, read live from the group. `columns`
  (2–10) is per block; tile size follows from the block's width. Spacing, Flat/Cards, icons, titles,
  the + button, open in new tab and Center vertically stay global and apply inside every block. The
  + button and the add dialog default to the block's group. A block whose group has no tiles says so.
  A block with more rows than fit scrolls inside, with a soft fade at its bottom edge while there is
  more below. `bar` docks the search bar inside the block: `0` above the tiles, `n` after n rows,
  `-1` under them, `null` for no bar; the grip and ↑ ↓ move it exactly as today. The bar moves with
  the block and takes no cells of its own.
  - Dragging a tile from one block to another moves it to that block's group (same as dropping on a
    tab). Dropping on a tile there reorders or makes a folder as it does now; dropping on the block's
    empty space puts the tile last in that group. Drag state is shared by every block
    (`tileDrag` in `ui.js`: `{ id, folder }`), because `dataTransfer.getData` is unreadable until
    the drop.
  - Deleting a pinned block's group sets its `group` to `null` (in `deleteGroup`); renaming only
    changes the heading.
- **Search bar (free).** The bar on its own, without the grip. Which engines are on, and the last
  one used, stay in `prefs.search` and are shared by every bar, docked or free. A bar with every
  engine off shows a note with a link to Preferences instead of hiding. Ctrl+Space puts the cursor
  in the first bar in reading order.

## Data

```js
prefs.layout = {
  cols: 12, rows: 12,
  widgets: [
    { id, type: 'clock',   x: 0, y: 0, w: 3, h: 4,  settings: { hour24: true, name: '', greeting: true, face: 'classic', colon: true } },
    { id, type: 'tasks',   x: 0, y: 4, w: 3, h: 4,  settings: {} },
    { id, type: 'notes',   x: 0, y: 8, w: 3, h: 4,  settings: {} },
    { id, type: 'tiles',   x: 3, y: 0, w: 6, h: 12, settings: { group: null, columns: 5, bar: 0 } },
    { id, type: 'markets', x: 9, y: 0, w: 3, h: 5,  settings: { items: ['BTC', 'SOL', 'XRP', 'ETH', 'USD/ILS'] } },
    { id, type: 'github',  x: 9, y: 5, w: 3, h: 7,  settings: { user: '', parts: ['heatmap', 'pulls', 'issues', 'commits'] } },
  ],
};
prefs.github = { token: '' };                                  // shared; never written to backups
prefs.search = { google, claude, chatgpt, gemini, mode };       // shared by every bar
```

Removed from `prefs`: `columns`, `width`, `widgets`, `search.enabled`, `search.row`. `notes`,
`tasks`, `taskHistory`, `taskStats`, `tiles` and `groups` are unchanged.

`DEFAULT_PREFS.layout` is `null`; `defaultState()` and `normalizeState()` fill it with
`defaultLayout(...)`. The old per-widget defaults stay in `store.js` as `LEGACY_PREFS`, used only
by the conversion.

### Conversion of a saved state without `prefs.layout`

Done once, on load, by `defaultLayout(old)` where `old = deepMerge(LEGACY_PREFS, raw.prefs)`:

| Old | New |
| --- | --- |
| `widgets.position` | Which side the clock column lands on (x 0 or 9); Markets and GitHub take the other |
| `widgets.<type>.enabled` | Whether that copy exists. An old `widgets.enabled: false` means no widget copies at all |
| `widgets.clock.*`, `widgets.markets.items`, `widgets.github.user` | That copy's `settings` |
| `widgets.github.show` | `parts`: `both` → all four; `commits` → heatmap, pulls, commits; `issues` → heatmap, pulls, issues |
| `widgets.github.token` | `prefs.github.token` |
| `search.enabled`, `search.row` | `bar` on the tiles block: the row, or `null` when the bar was off |
| `columns` | `columns` on the tiles block |
| `width` | Dropped; the block's width in cells replaces it |
| `centerVertically`, `compact`, `spacing`, `tiles.*`, `openInNewTab`, `showAddButton` | Unchanged, global |

The near column stacks the enabled widgets of clock (4), tasks (4), notes (4), claude (2) from the
top; if their heights exceed 12 the tallest is shrunk first, never below its minimum. The far column
stacks markets (5) and github (7); a lone one takes all 12. The tiles block is `x = 3` if the near
column exists on the left else `0`, `w = 12 − 3 × (columns present)`, `h = 12`. Old backup files and
Speed Dial 2 exports go through the same path.

A Speed Dial 2 import keeps the current layout: only its `columns` is applied to the first tiles
block that follows the tabs.

### Validation (`normalizeLayout`, inside `normalizeState`)

Unknown types are dropped; `x y w h` are integers clamped to the canvas and the type's minimum; a
copy's settings are merged over the type's defaults and cleaned (`items` through
`cleanMarketItems`, `parts` filtered to known parts in canonical order, `group` must be an existing
group else `null`, `columns` clamped 2–10, `bar` an integer ≥ −1 or `null`, `face` a known face);
a copy that overlaps an earlier one is moved to the first free spot or dropped; a copy past its
type's `max` is dropped; a missing id gets `uid()`.

## Modules

- **`js/layout.js`** (pure, unit-tested): `TYPES` (label, icon, size, min, max, defaults(),
  cleanSettings(settings, state)); `fits(layout, rect, ignoreId)`; `firstFree(layout, w, h)`;
  `defaultLayout(old)`; `normalizeLayout(raw, state)`; `stackOrder(widgets)` (ids sorted by y then
  x); `copyById(state, id)`; `countOf(layout, type)`; `addCopy(layout, type, settings?)`,
  `duplicateCopy(layout, id)`, `removeCopy(layout, id)`, `moveCopy(layout, id, rect)` (all refuse
  invalid results and return what they did); `resetLayout(layout)` (keeps the first copy of each
  type with its settings, at the default layout's positions; returns the removed copies).
- **`js/registry.js`**: `TYPES` from `layout.js` joined with `mount(root, store, copy, ctx)` per
  type. `ctx` carries `openPrefs(section, anchor)`. A mount returns `{ destroy() }`, which
  unsubscribes from the store and clears its timers.
- **`js/canvas.js`**: `mountCanvas(root, store, ctx)`. Keeps a map id → `{ frame, handle }`. On
  every `prefs` change it mounts new copies into `<section class="widget-frame" data-id data-type>`,
  destroys removed ones, sets each frame's `grid-area`, and keeps the frames in DOM order
  `stackOrder` (so Tab order and the narrow fallback both follow reading order). Settings changes
  are the widgets' own business: each reads `copyById(store.get(), id).settings` from its
  subscription. Exposes `frames()` and `onFrame(fn)` for Layout mode.
- **`js/edit-mode.js`**: `setupEditMode(store, canvas, ctx)` → `{ enter, exit, toggle, active }`.
  Loaded with `import()` on first use like Jump and Preferences. Owns `body.layout-editing`, the
  frames' labels, toolbars and handles, the ghost outline (a grid child of the canvas), the pointer
  drag and resize (`setPointerCapture`, cell pitch measured from the canvas's padding and gap),
  keyboard moves, the tray (appended to `body`), the snapshot *Cancel* restores, and *Reset layout*.
  Every change goes through `store.update` with the `layout.js` helpers; nothing is written while
  the pointer is down.
- **Widget modules.** `widgets.js` splits into `clock-widget.js` and `notes-widget.js` (Notes and
  the Claude box); `side-widgets.js` splits into `markets-widget.js` and `github-widget.js`, with
  the shared heading/sub/empty helpers moving to `ui.js`; `task-widget.js` stays; `grid.js` becomes
  the tiles block (`mountTiles`), containing the `.grid-wrap` with the docked bar and the tile grid,
  with `--cols` set on the block; `searchbar.js` keeps `mountSearchBar(root, store, { grid })`,
  docked when `grid` is given (grip, placement) and free otherwise. Every mount takes `(root, store,
  copy, ctx)` and reads its settings from the copy.
- **`js/ask.js`**: `activeMode` no longer looks at `search.enabled`.
- **`js/net.js`**: requests in flight are shared. `feed()` checks the fresh cache, then an in-flight
  promise for the key, then the recorded attempt; a second caller during a load gets the same
  promise.
- **`js/actions.js`**: `deleteGroup` sets `group: null` on tiles copies pinned to the group.
- **`js/prefs.js`**: sections Page, Tiles, Layout, GitHub, Backup. Page → Search bar keeps only the
  engine switches (hint: add a bar in Layout mode or dock one in a tiles block). Tiles loses Columns
  and Width. Layout has *Edit layout* (closes the panel, enters the mode), *Reset layout*, then one
  group per copy (anchor = copy id) titled "Clock", "Tiles · Work", "Tiles · follows the tabs",
  "Markets 2", "GitHub · Map + commits": clock rows as today; tiles: Group (select: Follow the tabs,
  then every group), Columns slider, Search bar (select: Off, Above the tiles, Below the tiles, and
  "After row n" when it currently sits between rows); GitHub: Username and four switches for the
  parts, plus a pointer to the GitHub section; Markets: a hint to use ✎; Tasks, Notes, Claude and
  the free bar: "No settings". GitHub keeps the token and its how-to. Backup export blanks
  `prefs.github.token`. The Speed Dial 2 import keeps the layout as described above.
- **`js/theme.js`**: no `--cols`, `--width`, `widgets-right`, `widgets-off`.
- **`js/ascii-bg.js`**: `NO_RIPPLE` also matches `.layout-editing .canvas`.
- **`js/main.js`, `newtab.html`**: `<main id="canvas" class="canvas">` replaces the three columns;
  `mountCanvas` replaces the four mounts; a `btn-layout` button and a right-click handler on the
  canvas open Layout mode.

## CSS

```css
.canvas { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(12, minmax(0, 1fr)); gap: 12px; padding: 8px 24px 24px; height: calc(100vh - 56px); min-height: 560px; }
.widget-frame { position: relative; min-width: 0; min-height: 0; display: flex; flex-direction: column; container-type: size; }
.widget-frame > .widget { flex: 1; min-height: 0; overflow: hidden auto; }
@media (max-width: 900px) { .canvas { display: flex; flex-direction: column; height: auto; } .widget-frame { grid-area: auto !important; container-type: normal; } }
```

Layout mode: `body.layout-editing .canvas` shows the cell outlines (an absolutely placed overlay
grid with the same tracks and gap); frames get a dashed outline, `cursor: grab`, inert dimmed
content; the lifted frame gets a shadow and `z-index`; the ghost is a grid child with an accent
border, red when invalid; handles are 12px squares on the corners and 8px strips on the edges; the
tray is fixed to the bottom of the window. `prefers-reduced-motion` turns the transitions off.

## Testing

- `test/layout.test.js`: `fits`, `firstFree`, `stackOrder`, `defaultLayout` (default prefs, clock on
  the right, every widget off, the bar off, the bar at row 2, Claude on, GitHub `show` values),
  `normalizeLayout` (unknown type, out of bounds, overlap, more than max, settings cleaning, group
  fallback), `addCopy`/`duplicateCopy`/`removeCopy`/`moveCopy`, `resetLayout`.
- `test/store.test.js`: an old saved state converts to a layout and loses the legacy keys; the token
  moves; `notes` and `tasks` are untouched; a state with a layout keeps it.
- `test/net.test.js`: two concurrent `feed` calls for one key load once and both resolve with the
  data.
- `test/actions.test.js`: `deleteGroup` unpins blocks.
- `test/ask.test.js`: `activeMode` without `enabled`.
- Browser (Playwright's Chromium against the static preview, then the loaded extension): the page
  after conversion looks like before on the default, right-hand and widgets-off layouts; every drop
  position and resize direction, the red refusal, Cancel; add, duplicate, remove, the limits; tiles
  between blocks; GitHub parts; the docked bar in a block and a free bar; the narrow fallback.
