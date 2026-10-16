# New Tab

A personal new-tab page for Chrome: tiles in groups and folders, live crypto prices, your GitHub
activity, tasks and notes, a Jump launcher, and a Claude Code–style ASCII background that lights up
around the mouse. No account, no server, no build step. Everything stays in your Chrome profile.

## Set it up with your AI agent

Copy this into Claude Code, Codex, Cursor or any coding agent that can run commands on your
computer. It downloads the extension and walks you through the few clicks that only you can do in
Chrome.

```text
Set up the "New Tab" Chrome extension for me from https://github.com/NVB20/new-tab.

1. Clone the repo into a folder that will stay where it is, such as new-tab in my home
   directory. Chrome loads the extension straight from that folder, so don't use a temp or
   Downloads folder. If git isn't installed, download and unzip
   https://github.com/NVB20/new-tab/archive/refs/heads/main.zip there instead.
2. Check that manifest.json is at the top of that folder. There is no build step and nothing
   to install.
3. You can't load the extension into Chrome for me, so give me the full folder path and walk
   me through these steps one at a time:
   - open chrome://extensions and switch on Developer mode (top right)
   - click Load unpacked and pick the folder
   - turn off any other extension that replaces the new tab page (Speed Dial 2, Momentum, ...)
   - open a new tab; if Chrome asks whether I meant to change the page, choose Keep it
4. Ask which of these I want, then walk me through the ones I pick:
   - Bring over my Speed Dial 2 tiles: Preferences (the ☰ button, top right) → Backup →
     Import file, then pick my Speed Dial 2 export (.json).
   - GitHub widget: I type my username into the widget. For private repos, help me create a
     fine-grained token at https://github.com/settings/personal-access-tokens/new with
     Contents and Pull requests set to read-only, which I paste into Preferences → Widgets →
     Access token myself. Never ask me to paste the token into this chat.
   - Markets: pick the coins I want to follow (Preferences → Widgets → Coins; any Bybit spot
     coin, priced in USDT).
5. Finish by telling me how to update later: git pull in that folder, then the reload button
   on the extension's card in chrome://extensions.
```

Rather do it yourself? See [Install by hand](#install-by-hand).

## What's on the page

| Feature | What it does |
| --- | --- |
| **Tiles and groups** | Speed-dial tiles, organised into groups shown as tabs along the top. |
| **Folders** | Drop one tile on another to make a folder; it shows up to four icons inside. |
| **Markets** | BTC, SOL, XRP and ETH (or any coin on Bybit) with 24h sparklines, plus the USD/ILS rate. |
| **GitHub** | Your latest commit in each repo and your open pull requests, including private repos with a token. |
| **Tasks and notes** | A to-do list with a week of finished-task history, and a notes pad. |
| **Jump** | Ctrl+K searches tiles, open tabs, bookmarks, history and recently closed tabs. |
| **Sidebar** | Chrome bookmarks, the last week of history and recently closed tabs. |
| **Background** | An animated ASCII field that reacts to the mouse, or your own wallpaper. |
| **Backup and import** | One-file backups, and an importer for Speed Dial 2 exports. |

## Install by hand

1. Download this repo (`git clone https://github.com/NVB20/new-tab.git`, or **Code → Download ZIP**
   and unzip it) into a folder you'll keep. Chrome loads the extension from there.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the folder that contains `manifest.json`.
4. Turn off Speed Dial 2 or any other new-tab extension. Chrome only lets one extension own the new
   tab page.
5. Open a new tab. If Chrome asks whether you meant to change the page, choose **Keep it**.

### Bring over your Speed Dial 2 tiles

Open Preferences (☰, top right) → **Backup** → **Import file**, and pick your Speed Dial 2 export
(`.json`). Groups, tiles and layout settings come over; your tasks and notes here are kept.

### Updating

Run `git pull` in the folder (or download the ZIP again over it), then press the reload button on
the extension's card in `chrome://extensions`. Your tiles and settings stay as they are.

Keep the extension in the same folder. Chrome ties your saved data to the folder's location, so a
copy loaded from somewhere else starts empty. If you need to move it, download a backup first and
import it afterwards.

## Folders

- **Make one:** drag a tile onto the middle of another tile. Both go into a new folder and its name
  field opens so you can type a name. (Dropping near a tile's edge reorders instead.)
- **Add to one:** drop more tiles on the folder.
- **Open one:** click it. In the folder window you can rename it, drag its tiles to reorder them,
  or drag a tile outside the window to take it out.
- **Down to one tile:** you're asked whether to remove the folder (the last tile takes its place)
  or keep it. An empty folder goes away on its own.
- **Right-click a folder** to open, rename, move it to another group, or remove it. Removing a
  folder keeps its tiles.

A folder moves with its tiles when you move it to another group. Folders can't go inside folders.

## Markets

The Markets widget sits in the column opposite the clock.

- **Coins:** BTC, SOL, XRP and ETH by default, as Bybit spot prices in USDT. Each row shows the
  price, its 24h change and a sparkline of the last 24 hours. Change the list in Preferences →
  Widgets → **Coins** (comma separated, e.g. `BTC, ETH, DOGE`). A coin Bybit doesn't list shows a dash.
- **USD/ILS:** the daily ECB reference rate, with a sparkline of the last 12 days. Turn it off in
  the same place.
- **Click a row** to open the coin's chart on Bybit (or USD/ILS on Google Finance).

Prices refresh every 30 seconds while the tab is open and visible, and all open new tabs share one
copy, so having many tabs open doesn't multiply the requests.

## GitHub

Type your GitHub username into the widget and it shows:

- **Your latest commit in each repo** you've committed to, in any account or organisation
  (default branches), newest first. Private repos get a lock icon.
- **Your open pull requests**: the most recently updated ones you opened, are assigned to,
  commented on or are mentioned in.

The heading opens your GitHub profile. GitHub is checked at most once an hour to stay well inside
its rate limit; **Refresh** next to the heading fetches straight away.

### Private repos

Without a token only public repos show. To include private ones, add a read-only token:

1. Create a fine-grained token at <https://github.com/settings/personal-access-tokens/new>.
2. **Resource owner:** you, or the organisation whose private repos you want to see. A
   fine-grained token covers one owner.
3. **Repository access:** all repositories, or just the ones you want.
4. **Permissions:** *Contents* and *Pull requests*, both read-only.
5. If the organisation requires approval, an owner approves it under the organisation's
   **Settings → Personal access tokens**.
6. Paste it into Preferences → Widgets → **Access token**, then press **Refresh** on the widget.

The token stays in this browser and is never written into backup files. If it can't see what it
should, the widget says why (for example, missing *Contents* access or org approval still pending).

## Everything else

- **Tiles:** click to open; Ctrl+click or middle-click opens a new tab. Right-click to edit, move to
  another group or delete. Drag to reorder, or drop on a group tab to move it there.
- **Groups:** click to switch, double-click or right-click to rename or delete, and **+** next to
  the tabs adds one. Drag tabs to reorder.
- **Jump:** **Ctrl+K** or **/** (or the search icon). Searches tiles, open tabs, bookmarks, history
  and recently closed tabs. ↑ ↓ to pick, Enter to open, Ctrl+Enter for a new tab.
- **Sidebar:** the panel icon in the header: Chrome bookmarks, the last week of history and
  recently closed tabs.
- **Tasks:** Enter adds a task; tick to finish. **Clear done** (next to the heading) removes
  finished tasks. Finished tasks are kept in a history for 7 days, and the number completed per day
  is kept for good (counted on the day you tick it; unticking takes it back).
- **Clock:** your name, a greeting and 12/24-hour time, all set in Preferences → Widgets.
- **Background:** Preferences → Appearance: ASCII or Plain, animation on or off, or upload a
  wallpaper (a wallpaper replaces the ASCII field while it's set).
- **Backup:** Preferences → Backup → **Download backup** saves everything (including the wallpaper)
  to one file you can import again on another computer.

## Your data

Tiles, groups, folders, tasks, notes, settings and the wallpaper are stored in this Chrome profile
only. Nothing is sent anywhere except the requests the widgets need:

| Widget | Talks to | How often |
| --- | --- | --- |
| Markets (coins) | `api.bybit.com` (public market data) | every 30 s while visible; sparklines every 5 min |
| Markets (USD/ILS) | `api.frankfurter.dev` (ECB rates) | once an hour |
| GitHub | `api.github.com` | once an hour, or when you press Refresh |

Turn a widget off in Preferences → Widgets and it stops fetching. Tile images load from wherever
their icon link points.

## Known limits

- On a fresh new tab Chrome keeps the cursor in the address bar, so Ctrl+K and / work once you've
  clicked the page. The search icon always works.
- Imported tile logos are still loaded from Speed Dial 2's image server. If one stops showing,
  right-click → Edit and clear the icon field (uses the site's own icon) or paste another image link.
- USD/ILS is the only currency pair for now.
- No sync between computers; use a backup file to move your setup.

## Development

Plain HTML, CSS and JavaScript modules: no framework, no bundler, no dependencies.

```
npm test
```

Runs the unit tests (store, importer, tile/group/folder actions, feeds, network cache, tasks,
helpers) with Node's built-in runner.

To preview outside the extension, serve the folder (`python -m http.server 5517`) and open
`http://127.0.0.1:5517/newtab.html`. Data is then kept in `localStorage`, and the Chrome-only parts
(sidebar, bookmarks/history in Jump, site icons) show placeholders.

After editing files, reload the new tab. Changes to `manifest.json` need the extension's reload
button on `chrome://extensions`.
