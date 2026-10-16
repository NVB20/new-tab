# Search bar and Claude chat

Date: 2026-10-16
Status: approved

## What the user sees

- A **search bar** above the tiles, as wide as the tile grid. A button on its left shows the active
  mode, **G** (Google) or **✳** (Claude); clicking it, or **Tab** in the bar, switches modes. The
  placeholder follows the mode ("Search Google" / "Ask Claude") and the last mode used is
  remembered. With only one mode on, the icon is shown but does nothing; with neither on, there is
  no bar.
- A **Claude widget** (off by default): a card in the clock column after Notes, with a box that
  grows as you type. Enter sends, Shift+Enter starts a new line, Ctrl+Enter sends in a new tab.
- Enter opens the result in the current tab, or a new tab when "Open tiles in a new tab" is on;
  Ctrl+Enter always opens a new tab (as in Jump). The box clears after sending.
- Google mode goes to `https://www.google.com/search?q=…` (not Chrome's default engine; the bar
  says Google). No suggestions are fetched while typing.

## Prefs

```js
search: { enabled: true, google: true, claude: true, mode: 'google' },  // top level
widgets: { …, claude: { enabled: false } },
```

`mode` is written by the bar. A saved mode that is switched off (or invalid) falls back to the
first mode that is on, so `normalizeState` needs no change. Preferences: General gets a "Search
bar" heading with Search bar, Google and Claude switches, and Widgets a Claude switch after Notes.
The Preferences redesign (being built in parallel) moves the first three to Page → Search bar.

## Handing a message to claude.ai

1. The page adds `{ id, text, at }` to the list under `claudeHandoffs` in `chrome.storage.local`
   (entries older than 2 minutes are dropped on every write), then opens
   `https://claude.ai/new#nt=<id>`.
2. `content/claude.js`, a content script on `https://claude.ai/*` at `document_start`, does nothing
   unless the address ends in `#nt=<id>`. It removes the fragment, takes the entry with that id out
   of the list, and uses it only if it is under 2 minutes old.
3. It waits up to 20 s for the message box (`div.ProseMirror[contenteditable]`), focuses it and
   pastes the text as a synthetic `paste` event. If the editor didn't handle the paste, it falls
   back to `execCommand('insertText')`.
4. It waits up to 10 s for an enabled send button (`aria-label` containing "send") inside the
   box's form and clicks it. If none appears, the text stays in the box for the user to send.

The message never goes in a URL, so it isn't in history or sent to claude.ai's server as part of
the link, and a link alone can't make Claude send anything. If the user is signed out, the box never
appears and nothing is sent. Outside the extension (the static preview) Claude mode copies the text
to the clipboard and opens `claude.ai/new`.

`manifest.json` gains the content script. Chrome then lists "Read and change your data on
claude.ai".

## Code

- `js/ask.js`: pure helpers (active mode, next mode, Google and Claude URLs, adding a handoff).
- `js/searchbar.js`: the bar, mounted into `#search` above `#grid` in `.grid-wrap`.
- `js/chrome-api.js`: `askClaude(text, { newTab })`.
- `js/widgets.js`: the Claude card.
- `content/claude.js`: classic script; its pure parts (`handoffId`, `takeHandoff`) are tested by
  loading the file in a Node `vm` context, where `chrome` is absent and nothing runs.

## Testing

Unit tests for `ask.js`, the content script's handoff parsing, and the new defaults. A visual check
of the bar and widget in the static preview. Sending to claude.ai is checked by hand in Chrome
(it needs a signed-in account).
