# First-run setup (onboarding)

The first new tab opens a short setup: a card over the real page, and the page builds itself behind
it as you answer. This document says what setup does, what it covers and what it leaves out on
purpose, and how a new feature gets into it. Keep it current: the commit check below reads it.

- **Code:** `js/onboarding.js` (the card and its steps), `js/onboarding-fx.js` (the opening word and
  the ending ripple), `js/suggest.js` (ranking history into sites, reading the bookmarks bar).
- **Design history:** `docs/superpowers/specs/2026-10-17-onboarding-design.md`, and the interactive
  guide it was reviewed in: https://claude.ai/artifact/5aUPBQ2ujjDdX8eHCJ6jq8

## Who sees it

| Page | Setup |
| --- | --- |
| A new install (nothing saved yet) | Opens on the first new tab, and on every new tab until it's finished or skipped |
| A page saved before setup existed | Never on its own: it counts as set up |
| A restored backup | Never on its own |
| After Preferences → Backup → **Reset everything** | Opens again on the next new tab |
| Anyone, any time | Preferences → Page → **Run setup again**, over the page as it is (nothing hidden) |

The state key is `onboarding: { done, step }` in `store.js`. `step` is saved at every step, so
closing the tab mid-way resumes there on the next new tab, without the opening.

## The experience

| # | Step | What the user does | What changes on the page | Skipped when |
| --- | --- | --- | --- | --- |
| – | Opening | Begin, or Skip, keep the defaults | The ASCII letters spell *hello*, then the card rises. The rest of the page is hidden | Not skipped; without the ASCII background or with reduced motion, the card just fades in |
| 1 | Name | Types a first name; picks 24- or 12-hour | The clock appears; its greeting follows the typing | There's no clock on the page |
| 2 | Look | Picks theme, accent, background (ASCII, plain, or a picture by upload or link) | Everything re-themes on each click | – |
| 3 | Sites | Ticks sites in Most visited or Bookmarks bar, or drops a file (From a file) | Each tick adds or removes a tile on the active group; the tiles block appears | – |
| 4 | Widgets | Ticks the widgets they want | Widgets slide into their default places; the rest of the page appears | – |
| 5 | Arrange | Drags, resizes, swaps, stacks, removes, adds from the tray (hovering a chip previews its widget) | The real Layout mode, with the card docked above the tray | The window is under 900px wide |
| 6 | Connect | Fills in what the picked widgets need | Each widget fills in behind the card | No picked widget needs anything |
| 7 | Moves | Tries Ctrl+K, Ctrl+Space and a right-click (or Show me) | Each item ticks when it really happens | – |
| – | Done | Finish (or Skip the rest at any step) | The card shrinks into ☰, a ripple runs out from it, a note says where setup lives | – |

Details per step:

- **Sites, Most visited:** 90 days of Chrome history grouped by site and ranked by visits; search
  results, sign-in pages, localhost and non-web pages left out, and sites already on a tile too. Each
  site is named from its own pages' titles ("Inbox - Gmail" → Gmail). On an empty group the top six
  start ticked. Outside the extension the list shows marked samples.
- **Sites, Bookmarks bar:** its links, and its folders as tile folders (links one level down).
- **Sites, From a file:** a Speed Dial 2 export replaces tiles, groups and settings like
  Preferences does and setup carries on at Widgets; a New Tab backup restores the whole page and
  ends setup.
- **Widgets:** on a page still in its default places, every tick re-flows the page
  (`placeDefaults`). Once something was arranged by hand, a tick adds a copy where it fits and an
  untick removes it; nothing else moves. Setup works on the layout of the tab you're on.
- **Connect:** search engines (one always stays on), GitHub username (saved when typing pauses),
  Markets coins, indexes, commodities and pairs, Sports (Messi's teams, F1, NBA and NFL teams from a list), a
  Website address (Show asks Chrome for access to the site).
- **Moves:** noticed by watching the page (Jump's dialog opening, the search bar's input getting
  the cursor, `body.layout-editing`), so those modules don't know about setup. Layout mode opened
  in Arrange doesn't count.

Throughout:

- **The card stays clear of what the step changes:** opposite the clock column while the page fills
  in, beside it for Connect and Moves, above the tray in Arrange, a sheet along the bottom under 900px.
- **Esc** folds the card into **Resume setup**; Layout mode and dialogs keep their own Esc. Opening
  Layout mode from the top bar or a right-click hides the card until Done.
- **Every answer goes straight into the store.** Nothing is applied at the end, so skipping keeps
  what was chosen.
- **Another tab finishing setup** makes this tab take its page and close its card.

## What setup covers

| Feature | Where |
| --- | --- |
| Clock: name, 24/12-hour | Name |
| Theme, accent, background (ASCII, plain, picture) | Look |
| Tiles from history, the bookmarks bar, Speed Dial 2, a backup | Sites |
| Every widget type: Clock, Search bar, Tasks, Notes, Markets, GitHub, Sports, Website, Claude, Marvel (Tiles always on) | Widgets |
| Layout mode: drag, resize, swap, remove, the tray and its previews | Arrange, Moves |
| Widget stacks (a tip: drop onto another's middle) | Arrange |
| Search bar engines (Google, Claude, ChatGPT, Gemini) | Connect |
| GitHub username | Connect |
| Markets coins, US indexes, commodities, currency pairs | Connect |
| Sports teams and F1 | Connect |
| Website address and site access | Connect |
| Jump (Ctrl+K) | Moves |
| Search bar shortcut (Ctrl+Space) | Moves |

## Left out on purpose

| Feature | Why it isn't in setup |
| --- | --- |
| GitHub access token | A credential: it belongs in Preferences → GitHub, with its how-to |
| Groups, a tab's own layout | Home is enough to start; right-clicking a tab shows them when needed |
| Folders made by dropping a tile on a tile | Learned by doing; the README covers it |
| What's in Tasks, Notes and Marvel | Used, not configured |
| Clock faces, tile style and size, plain background colour, blur and dim | Taste, adjusted later in Preferences |
| Markets segments and order, GitHub parts, Sports F1 sessions, Website zoom | Each widget's ✎ or its group in Preferences |
| The sidebar, Preferences search | Found from the top bar |

Setup has seven steps and should stay at about that. A feature goes in only if a new user needs it
to get value on the first day.

## Adding a feature to setup

1. **Prefer an existing step.** In `js/onboarding.js`:
   - a new widget type goes in `WIDGETS` (its one-line description);
   - a widget that's empty until it's told something gets a part in Connect (`CONNECTS` and
     `VIEWS.connect`), asking only the minimum;
   - a new way into a feature (a shortcut, a gesture) goes in `MOVES`, with a way to notice it from
     the page;
   - a widget whose column matters joins `NEAR` if it sits in the clock column.
2. **A new step** only for something every new user should decide, placed where the page needs it.
3. **Write through the store** (`store.update`, `setCopy`, `setPrefs`), so the page changes as the
   user answers.
4. **Update this document** (What setup covers, or Left out on purpose) and the README's First run
   section.
5. **Check it** on a fresh profile, or with Preferences → Page → Run setup again.

## The commit check

A Claude Code hook (`.claude/settings.json` → `.claude/hooks/onboarding-check.mjs`) runs before
every `git commit` in this repo. It looks at what the commit adds:

- a new widget type in `js/layout.js` that `WIDGETS` in `js/onboarding.js` doesn't have;
- a new row in the README's "What's on the page" table;
- a new Preferences section in `js/prefs.js`;
- a new module in `js/` in a `feat` commit.

If one of those shows up and the commit doesn't touch `js/onboarding.js` or this document, the hook
stops the commit and Claude asks you whether to add the feature to setup:

- **Add it:** Claude adds it as described above and commits that with the feature (touching
  `js/onboarding.js` or this document lets the commit through).
- **Don't:** Claude adds the line `Onboarding: not needed` to the commit message and commits
  again. If it's a lasting decision, the feature also goes under Left out on purpose.

The check only reads the change; it never edits anything. If it fails for any reason it lets the
commit through.
