# Markets: drag to reorder, and named segments from the right-click menu

Date: 2026-10-16
Status: approved (answers: segments are named sections; dragging a heading moves its rows)

## What it does

- **Segments** are named headings in a Markets copy's list, drawn like the editor's "CRYPTO ·
  BYBIT" labels. The rows below a heading, up to the next one, belong to it; rows above the first
  heading belong to none and always stay at the top.
- **Right-click a row:** New segment above (a heading over that row, splitting its segment there),
  Remove <product>, Choose products… (opens ✎).
- **Right-click a heading:** Rename, Remove segment (its rows stay and join the segment above), New
  segment.
- **Right-click anywhere else in the widget:** New segment (at the bottom), Choose products….
- **Naming:** the heading becomes a text box. Enter or clicking away saves, Escape cancels; a new
  segment cancelled or left blank isn't added, and a blank rename keeps the old name. Names are up
  to 24 characters, shown in capitals, stored as typed.
- **Drag a row:** native drag like the task list. The top half of a row drops above it, the bottom
  half below; the empty space under the list drops at the end. A 2px accent line marks the spot and
  the dragged row fades.
- **Drag a heading:** it moves with its rows. The drop snaps to segment boundaries: a heading's top
  half puts it above that segment, anywhere else below that segment's last row; a drop on rows that
  belong to no segment lands above the first heading. A drop inside its own block does nothing.
- No drag or menu while ✎ is open (that's the browser's own menu there) or in Layout mode (the
  widget moves as a whole). Products ticked in ✎ still go to the bottom, so into the last segment.
- Each Markets copy has its own segments.

## Data

- A segment is an entry in the copy's existing `settings.items` list: `'#' + name`. The list stays
  one flat, ordered list of strings, so drawing, dragging and saving don't change shape, and saved
  states need no migration.
- `cleanMarketItems` keeps headings (trimmed, spaces collapsed, cut to 24, case kept, repeats
  allowed, empty ones dropped) and products as before (valid, uppercased, once each).
- `isPair` becomes a pair-pattern test, so a heading with a slash in its name isn't read as a pair.
- Pure helpers in `feeds.js`, unit-tested: `segmentItem(name)`, `blockEnd(items, i)`,
  `moveMarketItem(items, from, to)` (moves a row, or a heading with its block),
  `headingDropIndex(items, over, upper)` (the boundary a heading drop snaps to).

## Widget

- Each drawn entry carries `data-index` (its place in the items) and is draggable; the row's links
  are not, so a drag anywhere on the row moves the row.
- While a drag or a name box is open, new prices are kept but not drawn, so the list doesn't redraw
  under the pointer or the text box; they are drawn when it ends.
- A drop applies only if the saved list is still the one drawn when the drag began (another tab may
  have changed it).
- A change to the list cancels any price load started for the old list, so a load that was
  running during a drag can't redraw the old order.

## Testing

- Unit tests for the helpers and `cleanMarketItems` with headings.
- Headless Chromium on the static preview, with real input: right-click menus, naming with Enter
  and Escape, row and heading drags (via `Input.setInterceptDrags` / `dispatchDragEvent`), rename,
  remove, and the order surviving a reload.
