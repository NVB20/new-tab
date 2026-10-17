# First-run setup (onboarding) — design

Reviewed as an interactive guide: https://claude.ai/artifact/5aUPBQ2ujjDdX8eHCJ6jq8 (prototype,
today's first run, three shapes, eight calls). Every call took the recommended option.

## What a new install shows today

An empty Home group with one +, a clock that says "Good night" to no one, Markets with someone
else's picks, a GitHub widget asking for setup, and no hint that Ctrl+K, Ctrl+Space, right-click
for Layout mode or tile-on-tile folders exist. Layout mode on that page is worse: the 12 × 12 grid
is full, so every Add chip is greyed out and the first drag always turns red.

## The shape: a card over the real page

Setup is a card over the real page, and every answer writes straight to the store, so the page
behind the card changes as you answer. There is no apply step: skipping keeps what was chosen.
On a first run the page starts nearly empty and builds itself: the clock arrives at Name, the
tiles block at Sites, everything else at Widgets.

## Steps

| Step | Asks | Writes |
| --- | --- | --- |
| Opening | Begin, or Skip, keep the defaults | `onboarding.step` from here on |
| Name | first name, 24/12-hour | the clock copy's `name`, `hour24` |
| Look | theme, accent, background (ASCII, Plain, Image: upload or link) | `prefs.theme`, `prefs.accent`, `prefs.background`, the wallpaper |
| Sites | tiles from Most visited, Bookmarks bar, a Speed Dial 2 file or a backup | `tiles` (and, for an import, the whole state) |
| Widgets | which widgets go on the page; tiles always stay | `prefs.layout` |
| Arrange | Layout mode inside setup | `prefs.layout` |
| Connect | only what picked widgets need: engines, GitHub username, Markets, Sports, a Website address | `prefs.search`, `prefs.github.user`, copy settings |
| Moves | try Ctrl+K, Ctrl+Space, right-click | nothing |
| Done | — | `onboarding.done` |

- **Opening:** the ASCII field spells *hello* for about two seconds, then the card rises. Only on
  the ASCII background without reduced motion; otherwise the card fades in. A fresh new tab keeps
  the cursor in Chrome's address bar, so Begin is the click that lets the page hear keys.
- **Name:** skipped when there is no clock copy. Empty is fine.
- **Look:** a theme brings its own accent until one is picked by hand (`setTheme`).
- **Sites:** Most visited ranks 90 days of history by site (search results, sign-in pages,
  localhost and non-web pages left out; sites already on a tile left out), titles cleaned to the
  site's name. When the group is empty the top six start ticked. Bookmarks bar folders become
  tile folders. Ticks add and remove tiles on the active group as you click. A Speed Dial 2 import
  replaces tiles, groups and settings like Preferences does and carries on at Widgets; a backup
  restores the whole page and ends setup. Outside the extension Most visited shows marked samples.
- **Widgets:** on a page still in its default places, every click re-flows the page with
  `defaultPositions` (Website gets a place in the far column). Once something was arranged by hand,
  a tick adds a copy where it fits and an untick removes it; nothing else moves.
- **Arrange:** opens the real Layout mode; the card docks above the tray. Done, Esc or "Done
  arranging" keeps the result and moves on; Cancel puts it back and moves on. Skipped under 900px
  (Layout mode's minimum).
- **Connect:** skipped when none of the picked widgets needs input. The GitHub token is not asked
  for here. Show is a click, so Chrome's site-access prompt can open for the Website widget.
- **Moves:** each item ticks when it really happens (Jump's dialog opens, the search bar gets the
  cursor, Layout mode starts); Show me does it for you. Ctrl+Space is left out without a search bar.
- **Done:** the card shrinks into ☰, a ripple runs out from it on the ASCII field, a note says
  where setup lives.

## Layout mode on a full page (call 8: swap)

A drop on a taken spot swaps with the copy it lands on when the target overlaps exactly one copy
and both fit after the trade. Neighbours in a column (same x and width) or a row (same y and
height) swap order; other pairs trade corners, each keeping its size. A second, dashed ghost shows
where the other copy goes. When no Add chip fits, the tray says "Page full: shrink or remove a
widget to add one" in words.

## Who sees it

- A new install (no saved state) gets `onboarding: { done: false, step: 'intro' }`.
- A page saved before this release has no `onboarding` key and counts as done.
- A restored backup counts as done. Reset everything starts setup again on the next new tab.
- Preferences → Page → **Run setup again** opens it over the page as it is (nothing hidden).
- No welcome tab on install; no manifest change.

## Behaviour

- **Resume:** closing the tab mid-way resumes at the saved step on the next new tab, without the
  opening.
- **Other tabs:** when another tab finishes setup, this tab takes its state and closes its card
  (`chrome.storage.onChanged`, or the `storage` event outside the extension).
- **Esc** folds the card into a Resume setup button; nothing is thrown away. Layout mode keeps its
  own Esc.
- **Layout mode during setup** (top bar, right-click): the card hides and comes back on exit.
- **Narrow window:** under 900px the card is a sheet along the bottom.
- **Reduced motion:** no word, no shrink into ☰, no ripple; cross-fades only.

## Code

- `js/onboarding.js` (new): the card, its steps, the staged reveal, Moves detection, the hand-off.
  Loaded by main.js only while setup isn't done, or from Preferences.
- `js/onboarding-fx.js` (new): the opening word and the ending ripple, drawn on a canvas of their
  own on the ASCII background's grid, so `ascii-bg.js` is untouched.
- `js/suggest.js` (new, pure): `rankSites`, `siteName`, `barItems`.
- `js/layout.js`: Website in the far column; `placeDefaults`, `atDefaultPlaces`, `swapPlan`,
  `swapCopy`.
- `js/store.js`: the `onboarding` key.
- `js/edit-mode.js`: swap on drop with a second ghost; the tray's Page full note.
- `js/prefs.js`: Run setup again; `shrinkImage` exported for the Look step's upload.
- `js/main.js`: hides the canvas before first paint on a first run and loads setup.
- `css/newtab.css`: an `ob-` section; the second ghost and the tray note.
- Tests: `test/suggest.test.js`; layout (Website's place, placeDefaults, atDefaultPlaces, swaps);
  store (new install, old page, kept key).

## Not in this round

Sync between computers, a tour of every widget, analytics (nothing about setup leaves the
browser), Safari (no history or bookmarks for extensions there).
