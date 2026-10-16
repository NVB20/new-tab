# Task extras and local tile logos — design

Date: 2026-10-16
Status: approved

## Goal

1. Tasks get a due date, a priority, drag-to-reorder and a one-off Sort button.
2. Tile logos (above all the imported Speed Dial 2 ones) are saved in this Chrome profile, so tiles
   keep their logos if Speed Dial 2's image server goes away.

## Non-goals

Due times, reminders or notifications, recurring tasks, typed shortcuts in the add box, caching
Chrome's own site icons, a permission to read every website.

## Tasks

### Data

Each task gains two fields; older saved tasks load with both `null`.

```js
{ id, text, done, createdAt, doneAt, due: 'YYYY-MM-DD' | null, priority: 'high' | 'medium' | 'low' | null }
```

The task history keeps its current shape (it feeds the daily counts and nothing reads due/priority).

### Pure functions (`js/tasks.js`)

- `setDue(s, id, day | null)`: only `YYYY-MM-DD` strings or `null` are accepted.
- `setPriority(s, id, level | null)`: only the three levels or `null`.
- `editTask(s, id, text)`: trims; empty text is ignored (delete is a separate action).
- `moveTask(s, id, beforeId | null)`: moves before another task, or to the end.
- `sortTasks(s)`: stable sort, unfinished before finished, then by due date (no date last), then
  priority (high, medium, low, none), ties keep their current order.
- `dueLabel(day, now)`: `{ text, overdue }`. Text is *Today*, *Tomorrow*, *Yesterday*, a weekday name
  within the next 6 days, otherwise *Oct 30* (with the year when it isn't the current one).
  `overdue` is true for any day before today.

### Widget (`js/widgets.js`)

- **Right-click a task:** Due today, Due tomorrow, Pick a date… (dialog with a date input), Clear due
  date (only when set); a *Priority* heading with High, Medium, Low, None (the current one marked);
  Edit text; Delete.
- **Edit text** swaps the text for an input in place: Enter or blur saves, Esc cancels.
- **Priority** colours the checkbox ring: high red, medium amber, low blue.
- **Due label** sits right of the text in small muted type; overdue and unfinished turns it red.
  Finished tasks always show it muted.
- **Drag:** rows are draggable with a drop line above or below the target (top or bottom half), using
  their own drag type so tile drop zones ignore them.
- **Sort** appears in the heading next to *Clear done* when there are at least two tasks.

## Local tile logos

### Storage

Saved under a separate `chrome.storage.local` key, `icons`: `{ [iconUrl]: dataUrl }`, out of the
state written on every edit, so that stays small and each tile keeps its original icon link (shown
in the edit dialog, used for Speed Dial 2 banner cropping). A copy goes to localStorage
(`newtab:icon-copy`, skipped past 3 MB) so a new tab's first paint can use the logos without waiting
for chrome.storage; the store itself is unchanged.

Nothing is deleted automatically: a link always stands for the same image, a logo whose server is
gone can't be fetched again, and the page can briefly start from a stale state copy. Only Reset
everything clears the map.

### Fetching (`js/icon-cache.js`)

- `iconsToFetch(tiles, saved, failed)`: pure. Unique `http(s)` custom icon links on non-folder tiles
  that aren't saved yet and didn't fail this session.
- `pruneIcons(tiles, saved)`: pure. The saved logos the given tiles use (for backups).
- `startIconCache(store)`: reads the saved map (merging the localStorage copy), then downloads the
  missing logos now and whenever tiles change (debounced 500 ms). Up to 4 at a time with a 15 s
  timeout; keeps responses whose type is `image/*` and size is at most 2 MB, merges with what another
  tab may have saved, then writes once. A link that failed is not tried again until the next new tab.
  Changes during a round start one more round afterwards.
- `localIcon(url)`: the saved data URL for a link, or `''`.

`manifest.json` adds `https://*.speeddial2.com/*` to `host_permissions` so Speed Dial 2 logos can
always be read (exports use both `assets.` and `image.speeddial2.com`, neither sends CORS headers).
Other hosts only work when they send CORS headers; otherwise the tile keeps loading the remote link
as now. Outside the extension (local preview) downloads fail quietly the same way.

### Display

`tileIcon` uses the saved copy for a custom icon link and marks the image with `data-icon`, so a
logo saved later replaces the one on screen (an `<img>` keeps the old picture until the new one is
ready). Banner cropping tests the original link instead of `currentSrc`, so saved Speed Dial 2
banners are still cropped.

### Backup

Exports include `icons` for the tiles in use (`iconsFor`); restoring a backup merges them into the
saved map. A Speed Dial 2 import changes the tiles, which starts a download round. Reset everything
clears the map.

## Testing

- `test/tasks.test.js`: `setDue`, `setPriority`, `editTask`, `moveTask`, `sortTasks`, `dueLabel`.
- `test/store.test.js`: `due` and `priority` normalised (valid kept, invalid dropped to `null`).
- `test/icon-cache.test.js`: `iconsToFetch`, `pruneIcons`.
- Headless Chrome checks: the Tasks menu, labels, drag, Sort, inline edit and date dialog in the
  preview; logo saving, the on-screen swap, the next tab using saved copies and banner cropping in
  the unpacked extension.

## Docs

README: Tasks section, the data table (logo downloads), and the Known limits line about Speed Dial 2
logos.
