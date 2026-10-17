# Marvel widget: the MCU in chronological order, ticked off as you watch

Date: 2026-10-17
Status: approved (asked for as "a tracker to follow what I watched, in the needed order")

A new widget type, **Marvel**, lists every MCU film, series, short and special in the order the
story happens, says what to watch next, and remembers what you've watched.

## The order

From Digital Spy's "How to watch the MCU in chronological order"
(<https://www.digitalspy.com/movies/a825774/marvel-cinematic-universe-in-chronological-order/>,
updated 14 Oct 2026): 115 entries, from Eyes of Wakanda to VisionQuest. It's typed into
`js/marvel.js` (no fetching: the page is HTML for people, and the order changes a few times a
year). The widget names the source and its date, linked.

What the article does that the list keeps:

- Seasons split where other things happen in between: Agents of SHIELD seasons 1–5 in parts
  ("Season 1 · episodes 1–7"), Daredevil season 2 and Luke Cage season 1 interleaved.
- Placement notes, shortened: Captain Marvel's mid-credits scene is set after Infinity War; watch
  Ant-Man and the Wasp's credits scene after Infinity War and Black Widow's after Endgame; Agents
  of SHIELD 5 (19–22) runs alongside Infinity War, seasons 6 and 7 in Endgame's five-year jump;
  What If…? is other universes and fits anywhere; The Fantastic Four: First Steps is a separate
  universe.
- Kinds: the article bolds films and italicises shorts. Its italics slip on three Agents of SHIELD
  entries; those are series here. Kinds: **Film**, **Series**, **Short** (the One-Shots and
  Slingshot) and **Special** (Werewolf by Night, the Holiday Special, The Punisher: One Last Kill).
- Its count: 38 films, the same as its films-only list.

Each entry: a stable id (`aos-1a`, `iron-man-3`), title, part (season/episodes, or ''), kind,
release year, whether it's a Marvel Television show (ABC, Netflix, Hulu, Freeform, 2013–2020: the
ones the article says are now outside the main timeline), and an optional note. Three entries also
name the entry whose end their credits scene belongs after.

## What the widget shows

- **Head:** the shield icon, "Marvel", and "37 / 115" on the right.
- **Progress bar** under the head, in the accent colour.
- **Up next:** the first unwatched entry of those shown, with its number in the order, title, part
  or kind, year and note, and a **Watched** button. When it's an entry whose end some credits
  scenes belong after (Infinity War, Endgame), a line says "Then the credits scenes of …" — but
  only for those films already watched. All watched: "All caught up".
- **The list**, scrolling under it: number, a round tick (like Tasks), title, and a muted line with
  the part (or kind) and year. The next entry is marked. Ticking a row toggles it. Watched rows are
  dimmed and struck through. On opening, and after Watched, the list scrolls to the next entry.
- **Right-click a row** (or the context-menu key): "Watched everything up to here" and "Not watched
  from here on", for starting the tracker midway or undoing a run of ticks. Both act on the rows
  shown.
- **Footer:** "Order: Digital Spy, 14 Oct 2026", linked.
- Under 3 cells wide the numbers and years go.

## Settings (Preferences → Layout → Marvel)

- **Show:** Everything (115) · No Marvel TV (skips the 2013–2020 shows) · Films only (38).
  Progress and Up next count what's shown.
- **Hide watched:** off by default.
- **Progress:** "Clear", after a confirm.

## Data

- What's watched is the page's, not the copy's: `state.marvel = { watched: [ids] }`, a new
  top-level key, so removing the widget and adding it back keeps the progress. Ids the list
  doesn't know are dropped; order follows the list. It's in backups (they carry the whole state)
  and kept by a Speed Dial 2 import, like tasks and notes.
- The copy's settings: `{ show: 'all' | 'studios' | 'films', hideWatched: false }`.
- One copy per page (`max: 1`), default size 3 × 6, minimum 2 × 3.
- Default place: the clock column, last (after Claude). The far column can't take a fifth widget
  at minimum height; the clock column's minimums sum to exactly 12 with it.
- An old page converted from before Layout mode never gets it, and neither does a new state.

## Files

- `js/marvel.js` (pure, tested in `test/marvel.test.js`): the list, `cleanWatched`, `shownEntries`,
  `nextUp`, `creditsAfter`, the kind labels and the source.
- `js/marvel-widget.js`: the widget.
- `js/layout.js` (type, default place, legacy list), `js/registry.js`, `js/store.js` (key,
  default, normalize), `js/prefs.js` (settings group, import keeps progress), `js/onboarding.js`
  (Widgets step entry, clock-column list, import keeps progress), `js/ui.js` (shield icon),
  `css/newtab.css`, `README.md`.
