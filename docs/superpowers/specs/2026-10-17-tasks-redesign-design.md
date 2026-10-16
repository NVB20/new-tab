# Tasks redesign — design

Date: 2026-10-17
Status: approved

## Goal

Everything a task can have is visible and set from the widget itself, not from a right-click menu
nobody finds:

1. Importance (High, Medium, Low) shown and set with a flag on each row.
2. Click a task's text to retype it in place.
3. A details tray under a row: importance, due date, repeat, subtasks, delete.
4. Repeating tasks (daily, weekdays, weekly, monthly, yearly).
5. Subtasks: a checklist inside a task, with progress on the row.
6. Views (All, Today, Upcoming, High), search, and finished tasks folded away.
7. Quick-add shorthand: `Call bank !high tomorrow` sets the importance and due date.

## Non-goals

Stats or charts of finished tasks, your own importance levels, time tracking, reminders or
notifications, due times, notes on a task, custom fields, reordering subtasks, undo, shorthand in
languages other than English, shorthand when retyping a task.

## What it looks like

```
✓ Tasks                                           ⌕
All   Today 2   Upcoming   ⚑ High              Sort
○  Call the bank                    ⚑   Tomorrow
○  Renew passport    ↻  ☑ 2/5       ⚑   Fri      ⌃
   Importance  [⚑ High] [⚑ Medium] [⚑ Low] [None]
   Due         [Today] [Tomorrow] [ 23/10/2026 ] ×
   Repeat      [Weekly ▾]
   Subtasks    ☑ Photos
               ☐ Form
               + Add a subtask
   Added Oct 12                             Delete
○  Water plants      ↻                      Today
+  Add a task…                          ⚐    📅
▸  Finished (3)                             Clear
```

### Heading

- *Tasks*, then **⌕** on the right. ⌕ swaps the tabs row for a search box (focused); Esc or its ×
  empties it and brings the tabs back.
- **Tabs:** All · Today · Upcoming · ⚑ High. Today carries a count of unfinished tasks due today or
  earlier, shown in red when any of them is overdue (hidden at 0).
- **Sort** sits at the end of the tabs row in All when there are at least two unfinished tasks. It
  sorts once, as today (due date, then importance; finished last).

### Views

| View | Shows | Order | Drag |
|---|---|---|---|
| All | unfinished tasks, then the Finished fold | yours | yes |
| Today | unfinished, due today or earlier | yours | yes |
| Upcoming | unfinished, due after today | due date, ties in yours | no |
| High | unfinished, importance High | yours | yes |
| Search | every task whose text or a subtask's text contains the query (any case), unfinished then finished (muted) | yours | no |

Each view shows a short muted line when it's empty (*Nothing due today*, *Nothing coming up*,
*No high-importance tasks*, *No matches*; All shows nothing extra).

### A row

Left to right:

- **Tick circle:** ticks or unticks. It no longer takes the importance colour; the flag does.
- **Text:** click to retype in place (Enter or clicking away saves, Esc cancels, empty text is
  ignored). Works on finished tasks too.
- **↻** when the task repeats (title: *Repeats weekly* and so on).
- **☑ 2/5** when it has subtasks (finished/total); click opens the tray.
- **Flag:** coloured when set (High red, Medium amber, Low blue). Unset, an empty flag shows on
  row hover or keyboard focus. Click: a menu of High, Medium, Low, None with the current one ticked.
- **Due label:** *Today*, *Tomorrow*, a weekday or a date as now, red when overdue and unfinished;
  click opens the tray.
- **⌄** on hover or focus opens the tray; while it's open it shows ⌃ and stays visible.

Right-clicking a row also opens its tray (the old context menu goes). The hover × goes: Delete is
in the tray. Finished rows are muted with struck text, and their tray still works.

### The tray

Opens under its row; one tray is open at a time (opening another closes the first). Esc or the
row's ⌃ closes it and puts focus back on the ⌄ button.

- **Importance:** High, Medium, Low, None as toggle buttons, the current one pressed.
- **Due:** Today, Tomorrow, a date input, and × to clear (only when a date is set). Clearing the
  date of a repeating task also sets Repeat to Never.
- **Repeat:** a select: Never, Daily, Weekdays, Weekly, Monthly, Yearly. Picking a repeat for a
  task with no date dates it (see *Repeating tasks*).
- **Subtasks:** each has a small tick, text you click to retype in place (emptying it deletes the
  subtask) and × on hover. *+ Add a subtask*: Enter adds one and keeps the box focused for the next.
- **Footer:** *Added Oct 12* in muted type on the left, **Delete** (danger) on the right. Delete
  acts at once, as the × did.

### Add bar

`+  Add a task…  ⚐  📅`

- **⚐** picks the importance the next task gets (High, Medium, Low, None); it shows the colour once
  set. **📅** picks its date (Today, Tomorrow, Pick a date…, No date) and shows the date's label
  once set, plus ↻ when shorthand sets a repeat.
- Both buttons show the shorthand typed so far, live, so you see what Enter will set. Shorthand
  wins over a button choice for the field it sets.
- Each view presets the bar so a new task stays in sight: Today → due today, Upcoming → due
  tomorrow, High → importance High, All → nothing. After Enter the bar goes back to the view's
  preset.

### Finished fold

In All, finished tasks sit under **▸ Finished (3)** at the bottom, closed by default; click to open
or close. **Clear** on that line replaces *Clear done* (finished tasks go to the week's history, as
now). Whether it's open is remembered.

### Narrow (2 cells)

The text keeps about 5em (7em wider); when the flag, date and counts don't fit beside it they wrap
onto their own line on the right. The tray stacks each label above its controls, and the High tab
shows its flag alone.

### Drag

Rows drag by their line (not the tray, so its inputs select text normally), with the drop line as
now, in All, Today and High. Dropping places the task before or after the target in your overall
order. Rows don't drag while their text is being retyped.

## Repeating tasks

`repeat` is one of `daily`, `weekdays`, `weekly`, `monthly`, `yearly`, or `null`.

- **Needs a date.** Setting a repeat on a task with no due date dates it today; Weekdays dates it
  today if today is Monday to Friday, otherwise the coming Monday.
- **Ticking** a repeating task: it counts as finished today (daily counts +1), a copy goes to the
  week's history (`doneAt` and `clearedAt` now), and the task itself stays unfinished with its
  next due date and every subtask unticked. Its due label briefly highlights.
- **Next date:** one step on from the current due date, repeated until the date is after today.
  An overdue daily task lands on tomorrow; a weekly one keeps its weekday; a task ticked early
  moves one step on from its due date.

  | Repeat | One step |
  |---|---|
  | daily | +1 day |
  | weekdays | +1 day, skipping Saturday and Sunday |
  | weekly | +7 days |
  | monthly | same day next month, or that month's last day when it's shorter |
  | yearly | same day next year (29 Feb → 28 Feb) |

- **Known limit:** a monthly task on the 29th–31st that lands on a shorter month's last day stays
  on that day afterwards (31st → 30th in November, then the 30th from then on).
- **Stopping:** set Repeat to Never, then tick it (or delete it).

## Quick-add shorthand

`parseTask(text, now)` → `{ text, priority, due, repeat }`, used by the add bar only. Words are
split on spaces and matched in any case.

- **Importance, anywhere:** a whole word `!high` / `!h` / `!1`, `!medium` / `!med` / `!m` / `!2`,
  `!low` / `!l` / `!3`. Each is removed from the text; the last one wins.
- **Date and repeat, at the end only:** phrases are read from the end of the text backwards and
  removed, stopping at the first word that isn't part of one. So `Watch Friday night lights`
  stays as typed, and `Call mom friday !high` is due Friday with High importance.
  - **Dates:** `today`; `tomorrow`, `tmr`, `tmrw`; a day name (`mon`…`sun`, `tue`, `tues`, `thu`,
    `thur`, `thurs`, or in full), meaning the coming one, a week on when it's that day today;
    `next week` (the coming Monday); `in N days` / `in N weeks` with N a whole number from 1 (also
    `in 1 day` / `in 1 week`);
    a month and day either way round (`oct 30`, `30 oct`, `october 30`, `sept 3`), meaning the
    next time it comes round, today included; `YYYY-MM-DD`. Impossible dates (`feb 30`) aren't
    shorthand.
  - **Repeats:** `daily` / `every day`; `weekdays` / `every weekday`; `weekly` / `every week`;
    `monthly` / `every month`; `yearly` / `every year`; `every <day name>`, which is weekly and
    dated the coming such day (a week on when it's that day today).
  - A phrase that would set a date or repeat that's already set (`today tomorrow`) ends the
    reading; it stays in the text.
- A repeat with no date gets one when the task is added: the add bar's date if it has one,
  otherwise as in *Repeating tasks* (`parseTask` itself leaves `due` empty).
- **Nothing left:** if removing the shorthand would leave no text (`tomorrow`), nothing is read and
  the whole input is the task's text.

## Data

```js
// a task
{ id, text, done, createdAt, doneAt, due, priority,
  repeat: null | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly',   // new
  subtasks: [{ id, text, done }] }                                         // new
```

- `store.js` normalising: older tasks load with `repeat: null` and `subtasks: []`. An unknown
  repeat, or a repeat on a task with no valid due date, becomes `null`. Subtasks need a non-empty
  string `text`; `id` is kept or made, `done` is a boolean.
- The Tasks widget's layout entry gets settings `{ view: 'all' | 'today' | 'upcoming' | 'high',
  showDone: boolean }` (defaults `all`, `false`), written the way the Clock writes its face. There's
  still no Preferences section for Tasks.
- `taskHistory` and `taskStats` keep their shape.

## Code

- **`js/tasks.js`** (pure, existing): `addTask(s, text, now, { priority, due, repeat })`; `toggleTask` rolls a repeating task on; `setDue` clears the repeat with the date;
  new `setRepeat(s, id, repeat, now)`, `nextDue(day, repeat, today)`, `firstDue(repeat, today)`,
  `addSubtask`, `toggleSubtask`, `editSubtask` (empty deletes), `deleteSubtask`, and
  `viewTasks(tasks, view, query, today)` → `{ open, finished }` plus `todayCount(tasks, today)` →
  `{ count, overdue }`. `REPEATS` and `VIEWS` exported. Day arithmetic stays on `YYYY-MM-DD`
  strings and local dates, as `dueLabel` does.
- **`js/task-parse.js`** (new, pure): `parseTask`.
- **`js/task-widget.js`** (existing): the widget's frame: heading, tabs, search, the list, add bar,
  Finished fold, drag, settings and the redraw on a new day.
- **`js/task-row.js`** (new): one row and its tray, given the task and callbacks; returns the `<li>`.
- **`js/layout.js`:** Tasks type `defaults` and `clean` for the new settings.
- **`js/store.js`:** normalising as above.
- **`js/ui.js`:** `flag` and `repeat` icons.
- **`css/newtab.css`:** tabs, row parts, flag colours (the existing `--prio-*` tokens), the tray,
  the add bar buttons, the Finished fold; the old ring colour rules go.
- **README:** the Tasks section and the features table line.

## Testing

- **`test/task-parse.test.js`** (new): every importance form; each date and repeat form; the
  end-only rule; a day name on that day; a month-day that has passed rolls to next year, today's
  doesn't; impossible dates left alone; a second date ends the reading; nothing-left fallback;
  repeat without a date gets one.
- **`test/tasks.test.js`:** `nextDue` for each repeat, including overdue, ticked early, month ends,
  29 Feb and weekdays over a weekend; ticking a repeating task (count, history copy, new date,
  subtasks unticked); `setRepeat` dating an undated task; `setDue(null)` clearing the repeat;
  subtask add, tick, retype, empty-retype deleting, delete; `viewTasks` for each view and search;
  `todayCount`.
- **`test/store.test.js`:** `repeat` and `subtasks` normalised.
- **`test/layout.test.js`:** Tasks settings cleaned to valid values.
- **Headless browser check** (static preview, Playwright Chromium on its own CDP port): flag menu,
  retype in place, tray fields, a repeating tick, subtasks, each tab, search, the Finished fold,
  add-bar shorthand preview and presets, drag in All, and the widget at its minimum width (2 cells)
  with the tabs fitting.
