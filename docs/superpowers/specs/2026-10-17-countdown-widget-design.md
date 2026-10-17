# Countdown widget: timers and days to go, confetti and a notification at zero

Date: 2026-10-17
Status: approved (asked for as "create countdown widget"; both kinds, one widget type, one count
per widget picked from a list, confetti + dismiss, a Chrome notification)

A new widget type, **Countdown**, shows one countdown big: the days to go until a date, or a
timer. The page keeps one list of countdowns; each widget picks the one it shows.

## Kinds

Picked when a countdown is made, in its dialog (Timer | Date first, then a name):

- **Timer:** a duration up to 99:59:59, typed (h, m, s) or from chips (5 min, 10 min, 25 min,
  1 hour). The dialog's button is **Start**: it's saved running. Ready, running, paused or done.
- **Date:** a day and an optional time (without one: the start of the day), and **Every year**.
  A one-off date already passed can't be added (the dialog says so). A yearly date counts to its
  next day on or after today; Feb 29 falls on Feb 28 in other years.

## What a widget shows

- **Head:** the kind's icon (stopwatch or calendar) and the countdown's name; ✎ on hover.
- **The count**, as big as the widget allows (measured, like the clock: it fills what the line
  under it and the buttons leave):
  - a date: "42 days" until its last 24 hours, then `18:05:12` live; "Sat, Nov 28 · 09:00" under
    it (the year when it isn't this one, "· every year" for a yearly one; the time follows the
    Clock's 12/24-hour setting).
  - a timer: `24:13` (`h:mm:ss` from an hour), "Ends 19:34" / "Paused" / "Ready", a progress bar,
    and ▶ / ❚❚, ↺ (reset), **+1 min**.
- **Short** (under 150px for the body): a timer's line goes and its buttons shrink. **Two cells
  wide:** the line goes.
- **Empty list:** "No countdowns yet. Add one".
- **✎** swaps the count for the list: **Next up** (the soonest; the default for a new copy) and
  every countdown with its time left; click one to show it here. ⋯ on a row: Edit…, Delete.
  **New countdown** at the bottom (up to 50).
- **Next up** order: a finished, undismissed one first (the latest), then the soonest end, then
  paused timers, then ready ones.

## At zero

- **Confetti** from the widget for 3 s (a canvas over the page, accent-coloured with setup's other
  accents), once per finish: the finish is saved as seen (`seen` = its end), so other tabs and a
  reload don't replay it, and one that ended over a day ago isn't celebrated. None with reduced
  motion, in the tray's preview, or in a hidden tab (it plays when the tab is shown).
- The count pops in the accent: **Time's up**, **Today**, **Yesterday** or "3 days ago", with
  **Dismiss** (a timer goes back to ready, a yearly date to next year, a one-off date leaves the
  list) and, for a timer, **+1 min** (runs it for another minute).
- **A Chrome notification** ("Pasta · Time's up", "Trip to Japan · It's time / It's today"), even
  with no new tab open. A timer's stays until clicked; clicking opens a new tab.

## Background script

`background.js`, a module service worker (manifest: `background`, permissions `alarms` and
`notifications`; Chrome needs the extension reloaded once). The page never talks to it: it
follows `chrome.storage` (`state`), and syncs when the countdowns in it change, on install and on
browser start. One alarm per countdown with an end ahead, named `countdown:<id>:<end ms>`, so a
changed end is a new name; alarms no countdown wants are cleared. When one fires it re-reads the
saved countdown and notifies only if its end is still that one.

## Data

- `state.countdowns`: one list for the page (top-level key; in backups; kept by a Speed Dial 2
  import, like tasks and Marvel progress; kept when the widgets are removed).
  - timer `{ id, kind: 'timer', name, duration, endsAt, left, seen }`
  - date `{ id, kind: 'date', name, date, time, yearly, since, seen }`; `since` is the day a
    yearly date counts from, moved past its day by Dismiss.
- The copy's settings: `{ show: 'next' | <id> }`; an id that's gone shows Next up.
- Up to three copies, default 3 × 3, minimum 2 × 2, no Preferences group.
- Default place: under the clock, after Weather. It's a spare (layout.js `SPARE`): when the clock
  column's minimums pass 12 rows it moves to the other column, before Weather does, and it's left
  out when both are full. Never added to a page converted from before Layout mode.
- Known limit, as for tasks and notes: a new tab left open from before doesn't see a countdown
  changed in another tab, and its next save writes its own list.

## Setup

In the Widgets step after Notes (its tagline "Timers and days to go"), and in the clock column's
list. Not in Connect: an empty Countdown says so and has Add one.

## Files

- `js/countdown.js` (pure, tested in `test/countdown.test.js`): the list's cleaning, ends,
  statuses, Next up, start/pause/reset/+1 min/dismiss, and the labels.
- `js/countdown-widget.js`, `js/confetti.js`, `background.js`, `manifest.json`.
- `js/layout.js` (type, column, spare), `js/registry.js`, `js/store.js` (key, default, normalize),
  `js/widget-about.js`, `js/onboarding.js` (Widgets step, clock column, import keeps them),
  `js/prefs.js` (import keeps them), `js/ui.js` (hourglass, timer, pause and ⋯ icons),
  `css/newtab.css`, `README.md`, `docs/onboarding.md`.
