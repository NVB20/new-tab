# Widget preview: hover a tray chip to see the widget before adding it

Date: 2026-10-17
Status: approved, not built

Builds on `2026-10-16-layout-mode-design.md` (the tray) and `2026-10-17-tab-layouts-design.md`
(the layout shown is the active tab's own, else the main one).

## Goal

In Layout mode, the tray's chips say only a name and a count. Hovering or focusing a chip opens a
card above it that shows the real widget as it would look on this page, with a line on what it is
and a sentence or two on what it does, and outlines on the canvas the cells a click would fill.

## What the user sees

- **Opening.** Pointer over a chip for 300 ms, or keyboard focus on it (`:focus-visible` only, so
  the focus a click leaves doesn't reopen it), opens the card. With a card open, moving onto
  another chip switches it at once. Leaving a chip closes the card 150 ms later unless the pointer
  reaches another chip first, so cutting across the tray doesn't flicker.
- **Closing.** Leaving the chips (after the 150 ms), blur, clicking the chip (which adds the
  widget, as today), a press on the canvas (a drag starting), and leaving Layout mode. Esc leaves
  Layout mode as it does now, which closes the card with it.
- **Where.** Above the chip, centred on it, 10px clear of the tray's top edge, kept 12px inside the
  window; a small arrow under the card points at the chip's centre. The card takes no pointer
  events: moving onto it counts as leaving the chip. It sits over the setup card that Arrange docks
  above the tray (z-index above `.ob-card`).
- **The card, top to bottom:**
  1. Header: the type's icon and label, and on the right its size in cells and its count:
     `3 × 5 · 1 of 5`, or for single types `3 × 4 · On the page` / `3 × 4 · Not on the page`. The
     size is the one a click would give (see below).
  2. Tagline, one line (table below).
  3. About, one or two sentences (table below).
  4. The live widget: the real widget, with this page's data and theme, drawn at its true pixel
     size for the cells it would take, then shrunk to fit a box of at most 400 × 240 px, keeping its
     proportions and never enlarged. Full opacity (not dimmed like the canvas in Layout mode), on
     the surface colour with a frame's corner radius, and inert: no clicks, focus or scrolling.
  5. A footer line, only when the chip can't add right now: `Only one Clock, and it's on the page`
     (single types) or `Up to 5 Markets widgets, all on the page` (others) at the limit;
     `No room: shrink or remove a widget first` when nothing fits.
- **The size shown.** The size a click would give: the type's default size where that fits, else
  its minimum. At the limit or with no room, the default size.
- **On the canvas.** The accent outline Layout mode uses for drags (`.canvas-ghost`) appears on the
  cells a click would fill. None at the limit or with no room.
- **Greyed-out chips** open the card too, with the footer and no outline, so any widget can be
  looked at. They are marked `aria-disabled="true"` instead of `disabled`, keep their dimmed look,
  stay focusable, and a click on one does nothing.
- **What some previews show.** Tiles: the group a new block would show (the next group not on the
  page, as Add picks it) with the columns it would get. Tasks and Notes: the real tasks and notes.
  GitHub without a username or token: its *Set up GitHub* note. Website: its address form (a new
  copy has no address). Search bar: the real bar, engines as set.
- **Reduced motion:** the card appears without its rise.

### Card text

| Type | Tagline | About |
| --- | --- | --- |
| `clock` | Time and a greeting | The time, the date and a greeting with your name. Pick a face with ✎, from a slim classic clock to big stencil digits; the time grows to fill its space. |
| `tiles` | Your sites as tiles | Speed-dial tiles for the group tab you're on, or pinned to one group. Each block has its own number of columns; drag a tile onto another block to move it there. |
| `search` | Google and AI chats | Search Google, or type a message that opens a new chat on Claude, ChatGPT or Gemini. Ctrl+Space puts the cursor in it from anywhere on the page. |
| `tasks` | To-dos with due dates | A to-do list with importance flags, due dates, repeats and subtasks, and Today, Upcoming and High views. Type "Call the bank !high tomorrow" and the flag and date are set for you. |
| `notes` | A scratch pad | A notes pad that saves as you type. Removing it keeps what you wrote for when you add it back. |
| `claude` | A box for long prompts | Room to write a long message; Enter sends it to a new chat on Claude, Shift+Enter starts a new line. |
| `markets` | Coins, indexes, currencies | Live prices with a line for the last few days: coins, SPY, QQQ, the Dow and currency pairs. Choose and order what it lists with ✎; each copy can list different things. |
| `github` | Your activity and PRs | Your stats, contribution map, open pull requests, review requests, issues, repos and latest commits, in the order you choose. Private repos need a token in Preferences → GitHub. |
| `sports` | Your teams' games | Your NBA and NFL teams' games, Messi's matches and F1 sessions in one list by day, with live scores. Choose who to follow with ✎. |
| `website` | Any site, live | Any site, live and signed in as you are, like your Pinterest feed. Give it an address and a zoom; Chrome asks once for access to the site. |
| `marvel` | The MCU in story order | Every MCU film, series, short and special in the order the story happens, with the next one to watch highlighted. Tick what you've watched as you go. |

The taglines are the ones first-run setup shows next to its widget ticks today (with Tiles new);
setup reads them from the same place from now on.

## Modules

- **`js/widget-about.js`** (new, data only): `ABOUT = { [type]: { tagline, about } }` for every
  type in `TYPES`. `onboarding.js` keeps its `WIDGETS` object (the commit check in
  `.claude/hooks/onboarding-check.mjs` reads its keys as the types setup offers), but each value
  becomes `ABOUT[type].tagline`. Kept out of `layout.js` so `TYPES`, which other work is changing,
  isn't rewritten line by line.
- **`js/layout.js`**: `plannedCopy(layout, type, groups = [], activeGroupId = null)` returns the
  copy `addCopy` would add, without an id and without adding it: `{ type, x, y, w, h, settings }`,
  or `null` at the limit or when nothing fits. `addCopy` becomes `plannedCopy` plus an id, the
  caller's settings over the planned ones (as now: given `group` or `columns` win), and the push.
  The outline, the preview and the click therefore agree.
- **`js/widget-preview.js`** (new, imported by `edit-mode.js`): `createPreview(store, ctx,
  { pitch })` returns `{ show(chip, type), hide(), type }`; `pitch()` gives the canvas's cell
  pitch, `show` returns the planned copy (or `null`), `type` is the type shown or `null`.
  - `show` plans the copy (`plannedCopy` on the active layout; if `null`, the type's defaults at
    its default size at 0,0), fills the header, tagline, about and footer, and mounts the widget:
    `<section class="widget-frame frame-<type> preview-frame" inert>` with a `.widget-root`
    inside, sized in px from the canvas's cell pitch (`w × pitchX − gap`, `h × pitchY − gap`),
    scaled with `transform: scale(k)` from its top left inside a box of the scaled size.
    Container queries see the unscaled size, so the widget lays out as on the canvas.
  - The widget is mounted with `WIDGETS[type].mount(root, previewStore, { id, type }, ctx)`, where
    `id` is `preview` and `previewStore` wraps the real store: `get()` and the state handed to
    `subscribe` callbacks are the real state with one extra layout, `prefs.layouts.preview =
    { cols, rows, widgets: [copy] }`, so `copyById` finds the copy (widgets return early when it
    doesn't). The derived state is a fresh shallow copy on every read, since the store changes
    its state object in place. `update` goes to the real store;
    the copy isn't in any real layout, so nothing a widget writes can move or change the page's
    copies, and shared things (caches, `notes`, `tasks`) are written as by any copy.
  - The previous widget is destroyed before the next is mounted, and on `hide`. Re-hovering a chip
    mounts it again; Markets, GitHub and Sports read the shared request cache. A `show` for the
    type already shown, with the same planned copy and cell pitch, keeps the mounted widget and
    only refreshes the text and position, so a widget that writes to the store as it mounts
    can't start a redraw loop (the write redraws the tray, which shows the card again).
  - The card is appended to `body`, positioned with fixed coordinates from the chip's rect.
- **`js/edit-mode.js`**:
  - `renderTray` builds chips with `aria-disabled` instead of `disabled`, and without their
    `title` tooltips (the card says the same, and a native tooltip would cover it); `add(type)`
    returns at once when `plannedCopy` says it can't add. The chips' container gets delegated
    `pointerover`, `pointerout`, `focusin` and `focusout` handlers (they survive `renderTray`
    replacing the chips) that drive the open and close timing above and call `preview.show` /
    `preview.hide`.
  - While the card is open the existing `ghost` shows the planned rect (`gridArea`), without
    `.bad`; it's hidden with the card. A pointerdown on the canvas hides both before the drag
    takes the ghost over.
  - The cell pitch the drag measures moves into a helper (`cellPitch(root)` → `{ x, y, gx, gy }`:
    the column and row pitch and gaps) used by the drag and the preview.
  - When `renderTray` redraws while a card is open (a store change, a window resize), the card is
    shown again for the same type on its new chip (re-planned).
  - `exit` destroys the preview.
- **`js/ui.js`**: `scaleOf(node)`: `node.getBoundingClientRect().width / node.offsetWidth`, or 1
  when the node has no width.
- **`js/clock-widget.js`**: `sizeFor` and `textWidth` divide their rect widths and heights by
  `scaleOf(section)`, so the time fits its box when the widget is drawn scaled. The preview mounts
  its widget with `{ ...ctx, preview: true }`; `mountClock` takes `ctx` and skips its new-tab intro
  when `ctx.preview` is set (it would replay on every hover).
- **`js/github-widget.js`**: `fitCommits` divides the rect `bottom` difference by
  `scaleOf(section)` before comparing it with `scrollHeight − clientHeight`.
- **`js/onboarding.js`**: taglines from `ABOUT`; Arrange's tips list ends with
  `The tray adds; hover a widget there to preview it`.
- **`docs/onboarding.md`**: the Arrange row and the coverage table mention the preview.
- **`README.md`**: Layout mode's tray bullet says hovering a chip previews the widget and outlines
  where it would go.

## CSS

- `.widget-preview`: fixed, `z-index: 47` (over the tray at 40, `.ob-card` at 45 and setup's toast
  at 46), width = the scaled widget box + 2 ×
  14px padding, at least 300px; surface background, border, `--shadow`, 12px radius; header row
  (icon, label, size and count in `--muted`, tabular numbers), tagline (600 weight), about
  (`--muted`, 12.5px), the widget box, footer (`--muted`, 11.5px); `pointer-events: none`. A small
  arrow (`::after`, rotated square) at `--arrow-x`. Rises 4px and fades in over 120 ms;
  `prefers-reduced-motion` turns that off.
- `.preview-frame`: `position: absolute; top: 0; left: 0; transform-origin: 0 0;` and overrides
  for the frame rules of Layout mode, wallpaper and setup: no outline, `cursor: default`, the page
  background (`var(--bg)`, widgets sit flat on the page), no text shadow, full opacity, and
  `.widget-root` at full opacity.
- `.tray-chip[aria-disabled="true"]` takes the current `:disabled` rules.

## Edge cases

- The tray redraws on every store change; the open card follows its type (above).
- The page is full (a new page fills every cell): every chip opens the card with the No room
  footer and no outline.
- A tab with its own layout: the plan, the counts and the outline use the layout shown, as Add
  does.
- The Search bar preview's own Ctrl+Space handler lives only while the card is open; its input is
  inert, so it can't take the cursor from the canvas's bar.
- A widget that fails to mount (throws) leaves the card with its text and an empty box; the error
  goes to the console.
- Windows under 900px have no Layout mode, so no tray and no preview.

## Testing

- `test/layout.test.js`: `plannedCopy` gives the default size in the first free spot, the minimum
  size when only that fits, `null` at the limit and when nothing fits, and for tiles the next
  unshown group and columns for the width; `addCopy` adds exactly the planned copy with an id.
- `test/widget-about.test.js`: every type in `TYPES` has a non-empty tagline and about in `ABOUT`,
  and `ABOUT` has no other types.
- Browser (Playwright's Chromium against the static preview, then the loaded extension, per the
  project's headless-check notes): in Layout mode, hover each of the 11 chips and check the card
  opens after the delay, the widget renders at full opacity inside 400 × 240 with its content
  (clock digits within their box, GitHub commit rows not cut off), and the outline sits on the
  cells a click then fills; a greyed-out chip opens the card with the footer, no outline, and a
  click adds nothing; moving across chips switches without the delay; leaving closes; a click adds
  and closes; a drag on the canvas closes; keyboard focus opens and blur closes; the card stays
  inside the window for the first and last chips; dark theme and a tab with its own layout; during
  setup's Arrange step the card sits over the setup card.
