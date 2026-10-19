# Timers widget: the Countdown widget renamed, with a stopwatch

Date: 2026-10-19
Status: approved (asked for as "add a stopwatch to the countdown and rename the widget to be
appropriate to all (stopwatch/countdown/timer)"; name picked: **Timers**)

The Countdown widget ([2026-10-17 spec](2026-10-17-countdown-widget-design.md)) becomes **Timers**
and gets a third kind, **Stopwatch**, next to Timer and Date.

## Rename

Only what people see: the type's label, its tagline ("Timers, stopwatches and days to go"), its
about text, the empty state ("No timers yet. Add one"), the picker's button (**New**) and list
label, the dialog's titles, README and docs/onboarding.md. What's saved keeps its names (type
`countdown`, `state.countdowns`, alarms `countdown:<id>:<end>`), so saved pages, backups and
pending alarms carry on untouched.

## Stopwatch

- **Made** in the dialog (Timer | Stopwatch | Date): only a name; **Start** saves it running.
  Edit changes its name; switching another kind to Stopwatch (or back) starts it afresh.
- **Shows** `12:34` counting up in whole seconds (`h:mm:ss` from an hour, hours past 99 allowed),
  "Started 19:34" / "Paused" / "Ready" under it (12/24-hour from the Clock), and ▶ / ❚❚ and ↺
  (reset, while running or paused). No bar, no +1 min.
- **Never ends:** no confetti, no notification, no alarm (`endOf` is null, as for a timer that
  isn't running, so the background script already skips it).
- **Next up:** a finished, undismissed one, then the soonest end, then running stopwatches (the
  latest started first), then paused timers and stopwatches, then ready ones.
- **Ticks** once a second while running, on the second it shows. No tenths (ten redraws a second
  on the new tab page) and no laps.
- **List row:** "12:34", "Paused · 4:00", "Ready".

## Icons

Timer: the hourglass. Stopwatch: the stopwatch icon timers had. Date: the calendar. The widget
(tray, empty head, Next up) keeps the hourglass.

## Data

`{ id, kind: 'stopwatch', name, startedAt, elapsed, seen }`: `elapsed` is the ms counted before
`startedAt`. Running: `startedAt` (epoch ms). Paused: `startedAt` null, `elapsed` > 0. Ready:
both empty. A running one keeps both: what it shows is `elapsed` plus the time since `startedAt`.
Cleaning keeps `elapsed` a whole number of ms, 0 or more.

## Files

`js/countdown.js` (kind, cleaning, status, elapsed, start/pause/reset, labels, Next up) with
`test/countdown.test.js`; `js/countdown-widget.js`; `js/layout.js` (label); `js/widget-about.js`;
`css/newtab.css` if the three-way kind picker needs it; `README.md`; `docs/onboarding.md`.
