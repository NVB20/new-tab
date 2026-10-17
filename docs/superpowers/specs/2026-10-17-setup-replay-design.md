# Setup tab and first-run replay — design

## The ask

An option in Preferences to see the onboarding again. "Run setup again" already exists, but it sits
at the bottom of Preferences → Page and wasn't found. Two things were picked:

- **Replay the first run:** setup as a new install sees it, without resetting anything.
- **Easier to find:** a place of its own, and Preferences search finds it under the words people use.

## What exists

`start({ again: true })` (onboarding.js) resets `onboarding` to `{ done: false, step: 'intro' }` and
runs setup with `staged = false`: the opening ("hello" in the letters) and the closing ripple already
play, but every widget stays in view the whole time. A first run sets `staged = true`, and
`reveal()` hides each frame until the step that brings it: the clock at Name, tiles at Sites, the
rest at Widgets.

## The design

**Preferences → Setup**, a tab of its own after Backup (icon: play), holding:

| Row | Button | What it does |
| --- | --- | --- |
| Run setup again | Run setup | Today's button: setup over the page as it is, nothing hidden |
| Replay the first run | Replay | The same setup staged like a first run: the widgets fade out, the opening plays, each widget comes back at its step, and it ends with the card flying into ☰ and the ripple |

The Page tab loses its Setup group. A line at the top of the tab says what setup covers and that
what's picked changes the page.

**Nothing is reset by a replay.** Tiles, widgets and settings stay; each step starts from them and
writes to the store as it does today. Only `onboarding` is set back to the start, as Run setup again
already does.

**Search.** The two buttons carry `data-search="onboarding tour tutorial walkthrough welcome intro"`;
the panel's search reads `data-search` alongside `aria-label`, so any of those words lists both rows
under Setup.

**Code.**

- `onboarding.js`: `start({ again = false, staged = !again })`. Passing `staged: true` with `again`
  is the replay; nothing else in setup changes.
- `prefs.js`: a `setup` section; `runSetup(opts)` closes the panel and passes `opts` on.
- `main.js`: `runSetup: opts => setup().then(s => s.start({ again: true, ...opts }))`.

**Wording.** The closing notes say "Setup is in Preferences → Setup…" instead of "→ Page". The
README's First run section and `docs/onboarding.md` (Who sees it, Adding a feature step 5) point to
the new tab and mention the replay.

## Kept as it is

- No animated ASCII background, or reduced motion: no "hello", the card fades in (as on a first run).
- Skip, at any step, brings the whole page back.
- Closing the tab mid-way resumes on the next new tab as a first run does (true of Run setup again
  today as well).
- Esc folds the card into Resume setup; the hidden widgets stay hidden until it's resumed or skipped.

## Checks

- Headless, Playwright Chromium with the extension loaded: Replay hides every frame at the opening,
  shows the clock at Name, tiles at Sites and everything at Widgets; Skip mid-way shows all frames
  again; Run setup again never hides a frame.
- Preferences search for "onboarding", "tour" and "tutorial" lists both rows; the Setup tab shows in
  the nav; the Page tab no longer has the group.
- `npm test`.
