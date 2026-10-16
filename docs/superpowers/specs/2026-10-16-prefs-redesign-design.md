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

- No pref is renamed. The Background choice is read from the existing fields: Image when an
  uploaded image (`useUpload` and a stored wallpaper) or a `url` is set, otherwise `pattern`.
  Choosing ASCII or Plain sets `pattern` and clears `url` and `useUpload`; the uploaded file stays
  stored, so choosing Image again brings it back. Remove deletes the file and the link.
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

## Widgets refresh (being built in parallel)

When `widgets.markets.items` and `widgets.clock.face` land on main, the Widgets section follows that
spec: Markets loses Coins and USD/ILS (the widget's own picker replaces them) and Clock gets a Style
control. This is done while merging the two.

## Testing

Unit tests for the `widgets.enabled` migration. Visual check in headless Chrome against the static
preview: each section, conditional rows appearing and disappearing, dragging, double-click reset,
light and dark.
