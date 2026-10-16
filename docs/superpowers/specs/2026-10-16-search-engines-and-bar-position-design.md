# Search bar: ChatGPT and Gemini, and moving the bar between tile rows

Date: 2026-10-16
Status: approved

Builds on `2026-10-16-search-bar-and-claude-design.md`.

## Engines

- Engines, in this order: Google, Claude, ChatGPT, Gemini. `prefs.search` gains `chatgpt: false`
  and `gemini: false` (Google and Claude stay on by default). Preferences → Page → Search bar has a
  switch for each under the Search bar switch; only the ones that are on show on the bar.
- The bar's icon shows the active engine. Clicking it opens a menu of the engines that are on, the
  active one ticked (the shared `showMenu`). Tab moves to the next engine. With one engine on, the
  icon is only a label. Placeholders: "Search Google", "Ask Claude", "Ask ChatGPT", "Ask Gemini".
- A saved mode that is off or unknown falls back to the first engine that is on.

## Sending to a chat site

- `askChat(engine, text)` stores `{ id, engine, text, at }` under `chatHandoffs` (was
  `claudeHandoffs`) and opens the engine's new-chat page with `#nt=<id>`: `claude.ai/new`,
  `chatgpt.com/`, `gemini.google.com/app`. Outside the extension it copies the text and opens the
  page.
- `content/claude.js` becomes `content/chat.js`, run on all three sites. A table keyed by hostname
  gives each site's engine, message box and send button selectors. It takes a handoff only when the
  id matches, the entry's engine is the site's, and it is under 2 minutes old. A `<textarea>` box
  gets its value set with the native setter and an `input` event; a contenteditable box gets the
  paste, then `insertText` if the paste wasn't handled. The send button is looked for next to the
  box, then anywhere on the page.
- `manifest.json`: the content script also matches `chatgpt.com` and `gemini.google.com`.

## Moving the bar

- `prefs.search.row`: how many rows of tiles are above the bar. 0 is the top, `-1` is the bottom
  (it stays under the tiles as more are added). If a group has fewer rows than `row`, the bar goes
  under its tiles.
- Layout: `.grid-wrap` becomes the CSS grid and `#grid` is `display: contents`, so the bar
  (full width) and the tiles share one grid. The bar sits in grid row `row + 1` and the tiles flow
  around it; at the bottom it is auto-placed with `order: 1`. `grid.js` is unchanged.
- A grip (⠿) at the right end of the bar, shown on hover and focus. Dragging it (pointer events)
  measures the tile rows, shows a line at the nearest gap (top, between rows, bottom) and saves
  that gap on release. Esc cancels. With the grip focused, ↑ and ↓ move the bar one gap.
- Pure helpers in `ask.js`: `rowBands` (tile rects → row bands), `gapY`, `nearestSlot`,
  `barSlot` (saved row → slot for the current tile rows) and `slotToRow`.

## Ctrl+Space

Ctrl+Space anywhere on the page (no dialog open, bar on) puts the cursor in the bar and selects
what's there. A "Ctrl Space" hint shows in the bar until it has the cursor; then the Tab hint (with
more than one engine on) takes its place.

## Testing

Unit tests for the engine helpers, the position helpers, the content script's site table and
handoff checks, and the new defaults. Browser checks: dragging to every gap, keyboard moves, tile
drag-and-drop still working, the engine menu, and the content script against stand-in editors.
