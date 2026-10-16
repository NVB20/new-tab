# Preferences redesign: regrouped, fewer controls on screen, movable panel

Date: 2026-10-16
Status: approved

Every setting stays. The panel keeps its layout (section list on the left, settings on the right).
What changes is which section a setting lives in, a few controls merge into one, and options only
show when they do something.

## Sections, grouped by what they change

| Section | Holds |
|---|---|
| **Page** (was General + Appearance) | *Colours*: Theme (Auto · Light · Dark), Accent. *Background*: one choice ASCII · Plain · Image. ASCII shows the motion switch; Image shows Upload / Remove, the image link, Blur and Dim. *Top bar*: Sidebar button. |
| **Tiles** (was General + Tiles) | *Layout*: Columns, Width, Spacing, Center vertically, Compact layout. *Look*: Style (Flat · Cards), Icons (Logos · Site icons), Show titles; with Cards only: Corner radius and one Colours row (White / Dark presets, card colour, title colour). *Behaviour*: Open tiles in a new tab, Show + button. |
| **Widgets** | Clock side (Left · Right) on top, then one heading per column, named after the side it is on ("Left column" / "Right column"). Each widget is one row with its own switch; its options appear under it, indented, only while it is on. Clock: 24-hour clock, Greeting with the name box beside it (the box only while Greeting is on). Markets: coins, USD/ILS rate. GitHub: username, token. |
| **Backup** | Unchanged: Export, Import, Reset. |

Removed: the "Show widgets" master switch (each widget has its own) and the shortcuts footnote.

## Data

- No pref is renamed. One is added: `background.showImage` (default `true`). The page shows
  `backgroundImage(background, wallpaper)` (in `util.js`, used by theme, ASCII field and panel):
  nothing while `showImage` is off, else the upload when `useUpload`, else `url`. Saved states
  without the field keep showing their image.
- The Background choice reads Image when an image is shown, otherwise `pattern`. Choosing ASCII or
  Plain sets `pattern` and turns `showImage` off, keeping the upload and the link, so choosing Image
  again brings them back (also after a reload: `useUpload` stays on, so the file is still loaded).
  Upload and Apply link turn `showImage` on. Remove deletes the file and the link.
- Blur and Dim only apply while an image is shown, so a hidden slider never darkens the plain or
  ASCII background.
- `widgets.enabled` stays in the data, always `true`. `normalizeState` turns an old `false` into
  every widget switched off, so a page that hid its widgets with the master switch looks the same.
  (A Speed Dial 2 import with widgets off goes through the same path.) `widgets-off` (the layout
  without side columns) is set when no widget is on.

## Movable panel

- The header is the drag handle (grip icon, grab cursor). Dragging moves the panel anywhere; it may
  go partly off-screen but at least 120px of it and the whole header stay inside the window.
- No dim or blur behind the panel, so the page shows exactly as it will look. A click outside still
  closes it; Esc closes it.
- Double-click the header to put it back in the middle. The position is remembered in
  `localStorage` (`newtab:prefs-offset`) and re-fitted to the window on open and on resize.

## One-line clock faces (asked for during this work)

Stencil, Rounded and Serif also come on one line: faces `stencil-line`, `rounded-line`,
`serif-line` (`{ font }` in `CLOCK_FACES`, styled by the same `face-<font>` class without
`stacked`, sized to fit the column). The ✎ strip becomes four columns: stacked faces on the top row,
their one-line twins under them, Dot under Classic. Preferences → Clock: Style picks the font
(Classic · Stencil · Rounded · Serif · Dot); for the three fonts with both layouts an
"Hours over minutes" switch picks stacked or one line, and changing font keeps that choice.

## Features being built in parallel

The panel draws these from the data, so it is right before and after each one lands on main:

- Widgets refresh: when `widgets.markets.items` exists, Markets has no Coins box or USD/ILS switch
  (the widget's own ✎ picker replaces them); when `widgets.clock.face` exists, Clock gets a Style
  choice (Classic · Stencil · Rounded · Serif · Dot).
- Search bar: when `prefs.search` exists, Page gets a *Search bar* group: the bar's switch, and under
  it Google and Claude ("Sends what you type to claude.ai and runs it"). When
  `widgets.claude` exists, a Claude switch sits after Notes.
- Perf pass: `setupPrefs(store)` keeps returning `{ open(id?) }` (main.js loads it lazily), and the
  Speed Dial 2 importer is loaded with `import()` only when a file is imported.

Once all three are merged, the branches for older data (Coins, USD/ILS) and the "exists" checks go.

## Testing

Unit tests for the `widgets.enabled` migration, the `showImage` default and `backgroundImage`. Visual check in headless Chrome against the static
preview: each section, conditional rows appearing and disappearing, dragging, double-click reset,
light and dark.
