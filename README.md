# New Tab

A personal new-tab page for Chrome: groups of tiles, clock / tasks / notes, a Jump launcher, a
bookmarks-and-history sidebar, and a Claude Code–style animated ASCII background that lights up
around the mouse (or your own wallpaper). No account, no subscription — everything is
stored in this Chrome profile.

## Install

1. Open `chrome://extensions` and switch on **Developer mode** (top right).
2. Click **Load unpacked** and pick this folder.
3. Turn off Speed Dial 2 — Chrome only lets one extension own the new tab page.
4. Open a new tab. If Chrome asks whether you meant to change the page, choose **Keep it**.

## Bring over your Speed Dial 2 tiles

Open the menu (☰) → **Preferences** → **Backup** → **Import file**, and pick your Speed Dial 2
export (`.json`). Groups, tiles and layout settings come over; tasks and notes here are kept.

## Using it

- **Tiles** — click to open; Ctrl+click or middle-click opens a new tab. Right-click to edit, move
  to another group or delete. Drag to reorder, or drop on a group tab to move it there.
- **Groups** — click to switch, double-click or right-click to rename or delete, **+** next to the
  tabs adds one. Drag tabs to reorder.
- **Jump** — **Ctrl+K** or **/** (or the search icon). Searches tiles, open tabs, bookmarks, history
  and recently closed tabs. ↑ ↓ to pick, Enter to open, Ctrl+Enter for a new tab.
- **Sidebar** — the panel icon in the header: Chrome bookmarks, the last week of history and
  recently closed tabs.
- **Markets** — BTC, SOL, XRP and ETH (Bybit spot, USDT) with a 24h sparkline, plus the USD/ILS
  daily ECB rate. Change the coins in Preferences → Widgets; click a row to open its chart.
- **GitHub** — type your username into the widget. It lists your recently pushed repos and open PRs.
  Without a token only public repos show. To include private ones (e.g. eitan-capital), create a
  fine-grained token on GitHub (Settings → Developer settings → Personal access tokens →
  Fine-grained), give it read-only *Metadata* and *Pull requests* access to the repos or orgs you
  want (an org may need to approve it), and paste it into Preferences → Widgets → Access token. The
  token stays in this browser and is never written into backup files.
- **Background** — Preferences → Appearance: ASCII or Plain, animation on/off, or upload a
  wallpaper (a wallpaper replaces the ASCII field while it's set).
- **Backup** — Preferences → Backup → **Download backup** saves everything (including the
  wallpaper) to one file you can import again on another computer.

## Known limits

- On a fresh new tab Chrome keeps the cursor in the address bar, so Ctrl+K and / work once you've
  clicked the page. The search icon always works.
- Imported tile logos are still loaded from Speed Dial 2's image server. If one stops showing,
  right-click → Edit and clear the icon field (uses the site's own icon) or paste another image link.
- No sync between computers; use a backup file to move your setup.

## Development

```
npm test
```

Runs the unit tests (store, importer, tile/group actions, helpers) with Node's built-in runner.

To preview outside the extension, serve the folder (`python -m http.server 5517`) and open
`http://127.0.0.1:5517/newtab.html`. Data is then kept in `localStorage`, and the Chrome-only parts
(sidebar, bookmarks/history in Jump, site icons) show placeholders.

After editing files, reload the new tab. Changes to `manifest.json` need the extension's reload
button on `chrome://extensions`.
