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
   - open a new tab; if Chrome asks whether I meant to change the page, choose Keep it. A short
     setup opens on that first tab (my name, the look, tiles from my most visited sites or
     bookmarks bar, the widgets and what they need); I go through it myself
4. Ask which of these I want, then walk me through the ones I pick:
   - Bring over my Speed Dial 2 tiles: Preferences (the ☰ button, top right) → Backup →
     Import file, then pick my Speed Dial 2 export (.json).
   - GitHub widget: my username, the access token and what each widget shows (profile stats,
     activity map, pull requests, review requests, issues, latest repos, commits, in any order) are
     in the GitHub section of Preferences (the ✎ on the widget opens it). For private repos, walk me through
     making a token as described under "Tokens for private repos" in the README: usually a
     fine-grained token at https://github.com/settings/personal-access-tokens/new with Contents,
     Issues and Pull requests set to read-only. I paste it into the Access token box myself.
     Never ask me to paste the token into this chat.
   - Markets: pick the coins and currency pairs I want to follow (the ✎ in the Markets widget's
     heading; any Bybit spot coin, priced in USDT, the SPY, QQQ and DJIA indexes, plus pairs such as
     USD/ILS and EUR/ILS).
5. Finish by telling me how to update later: git pull in that folder, then the reload button
   on the extension's card in chrome://extensions.
```

Rather do it yourself? See [Install by hand](#install-by-hand).

## What's on the page

| Feature | What it does |
| --- | --- |
| **Tiles and groups** | Speed-dial tiles, organised into groups shown as tabs along the top. |
| **Layout mode** | One 12 × 12 canvas: drag, resize, add, duplicate and remove the widgets, the search bar and blocks of tiles. |
| **Folders** | Drop one tile on another to make a folder; it shows up to four icons inside. |
| **Markets** | Coins from Bybit, SPY, QQQ and the Dow from CNBC, and currency pairs (USD/ILS, EUR/ILS, …), with sparklines, picked from a checklist, dragged into order and grouped under your own headings. |
| **GitHub** | Any of your profile stats, contribution heatmap, open pull requests, review requests, open issues, latest repos and latest commits, in the order you choose, including private repos with a token; up to five copies can split them up. |
| **Sports** | Your NBA and NFL teams' games, Messi's (Inter Miami and Argentina) and F1 sessions in one list by day, with live scores and a day of results. |
| **Website** | Any site, live and logged in as you are, such as your Pinterest feed; up to five, each with its own address and zoom. |
| **Marvel** | Every MCU film, series, short and special in the order the story happens, what to watch next, and what you've watched. |
| **Clock** | One UI–style faces, from a slim classic clock to big stencil digits, stacked or on one line. |
| **Tasks and notes** | A to-do list with importance flags, due dates, repeats, subtasks, Today / Upcoming / High views, search, quick-add shorthand and a week of finished-task history, and a notes pad. |
| **Search bar and AI chats** | Search Google, or type a message that runs in a new chat on Claude, ChatGPT or Gemini. Ctrl+Space to type; a widget of its own that you place in Layout mode. Also a Claude box widget. |
| **Jump** | Ctrl+K searches tiles, open tabs, bookmarks, history and recently closed tabs. |
| **Sidebar** | Chrome bookmarks, the last week of history and recently closed tabs. |
| **Background** | An animated ASCII field that reacts to the mouse, a plain colour (Chrome's greys or any other), or your own wallpaper. |
| **Backup and import** | One-file backups, and an importer for Speed Dial 2 exports. |
| **First-run setup** | A card on the first new tab sets your name, look, tiles (from your most visited sites or bookmarks bar), widgets and what they need, and teaches Ctrl+K, Ctrl+Space and Layout mode; the page fills in as you answer. |

## Install by hand

1. Download this repo (`git clone https://github.com/NVB20/new-tab.git`, or **Code → Download ZIP**
   and unzip it) into a folder you'll keep. Chrome loads the extension from there.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the folder that contains `manifest.json`.
4. Turn off Speed Dial 2 or any other new-tab extension. Chrome only lets one extension own the new
   tab page.
5. Open a new tab. If Chrome asks whether you meant to change the page, choose **Keep it**. A short
   setup opens there; see [First run](#first-run).

### Bring over your Speed Dial 2 tiles

Open Preferences (☰, top right) → **Backup** → **Import file**, and pick your Speed Dial 2 export
(`.json`). Groups, tiles and layout settings come over; your tasks and notes here are kept.

### Updating

Run `git pull` in the folder (or download the ZIP again over it), then press the reload button on
the extension's card in `chrome://extensions`. Your tiles and settings stay as they are.

Keep the extension in the same folder. Chrome ties your saved data to the folder's location, so a
copy loaded from somewhere else starts empty. If you need to move it, download a backup first and
import it afterwards.

### Safari (Mac only)

Safari runs the extension on a Mac as it is, with a few features missing. There's no Safari for
Windows, and an iPhone needs an Xcode build.

1. In Safari, open **Settings → Advanced** and tick **Show features for web developers**.
2. Open **Settings → Developer**, click **Add Temporary Extension…** and pick the folder that
   contains `manifest.json`.
3. In **Settings → General**, choose the extension under **New tabs open with**.
4. Allow the extension on the sites Safari asks about: github.com for the heatmap, and claude.ai,
   chatgpt.com and gemini.google.com for sending messages from the search bar.

Safari removes a temporary extension when you quit it or after 24 hours, so download a backup now
and then (Preferences → **Backup**) in case it comes back empty. To keep it installed, package it
as a Mac app with Xcode (`xcrun safari-web-extension-packager /path/to/new-tab`) and run the app.
Without an Apple Developer account, tick **Allow unsigned extensions** in Settings → Developer each
time you open Safari.

Safari has no extension APIs for bookmarks, history or recently closed tabs, so Jump and the
sidebar don't show them. Tiles show their own logo or a letter instead of the site's icon, and
searches go to google.com rather than the browser's search engine. The Website widget hasn't been
tried in Safari.

## First run

The first new tab opens a short setup: a card over the page, and the page fills in behind it as
you answer. **Skip** keeps whatever you've picked so far, and all of it can be changed later in
Preferences.

1. **Name:** what the clock calls you, and 24- or 12-hour time.
2. **Look:** theme, accent and background (ASCII, plain, or your own picture).
3. **Sites:** tiles from your most visited sites of the last 90 days (the top six start ticked on
   an empty group), your bookmarks bar (its folders stay folders), or a file: a Speed Dial 2 export,
   or a backup from this page, which restores everything and ends setup.
4. **Widgets:** which go on the page; they take their default places as you tick them.
5. **Arrange:** Layout mode, inside setup. Skipped in a window under 900px wide.
6. **Connect:** only what your widgets need: search engines, your GitHub username, coins and pairs,
   teams, a Website address.
7. **Moves:** Ctrl+K, Ctrl+Space and a right-click, ticked off as you try them.

- Esc folds the card into **Resume setup**. Closing the tab keeps your place: the next new tab
  carries on at the same step.
- **Run setup again** is in Preferences → Page, over the page as it is.
- A page set up before this version doesn't see it, nor does a restored backup. **Reset
  everything** brings it back.

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

The Markets widget starts on the right of the page; Layout mode moves it anywhere, and up to five
copies can each follow their own list (say, coins in one and currencies in another).

- **Choose what's shown:** hover the widget and click **✎** next to the heading. Tick the coins,
  indexes and currency pairs you want and untick the rest; the list updates as you go. To follow a
  coin that isn't listed, type its ticker (e.g. `PEPE`) and press **Add**. Click **✓** when you're
  done. New picks go to the bottom of the list.
- **Coins:** BTC, SOL, XRP and ETH by default, as Bybit spot prices in USDT. Each row shows the
  price, its 24h change and a sparkline of the last 24 hours. A coin Bybit doesn't list shows a dash.
- **US indexes:** SPY, QQQ and the Dow (DJIA), as CNBC quotes. Each row shows the last
  regular-session price, its change on the day and a sparkline of that session; outside market
  hours that's the last close.
- **Currency pairs:** USD/ILS by default; EUR/ILS, GBP/ILS, EUR/USD, GBP/USD, USD/JPY and USD/CHF
  are in the list too. They use the daily ECB reference rates, with a sparkline of the last 12 days.
- **Click a row** to open the coin's chart on Bybit (the index on CNBC, or the pair on Google
  Finance); the candles icon at the end opens it on TradingView.
- **Drag a row** up or down to reorder the list; a line shows where it will land.
- **Segments:** right-click a row and choose **New segment above** to put a heading over it (say,
  *US* over SPY), type its name and press Enter (Esc cancels). The rows below a heading, up to the
  next one, belong to it, and dragging a heading moves its rows with it. Right-click a heading to
  rename or remove it (its rows stay, under the heading above), or right-click anywhere else in the
  widget for a new segment at the bottom. Rows that belong to no segment stay at the top.

Prices refresh every 30 seconds while the tab is open and visible, and all open new tabs share one
copy, so having many tabs open doesn't multiply the requests.

## GitHub

Everything about the widget lives in the **GitHub** section of Preferences: your username, what
each copy shows, and the optional access token with a short how-to for getting one. Until there's a
username the widget shows a **Set up GitHub** button that opens that section; hover the widget and
click **✎** to go straight to its own list.

Each copy lists the seven parts below in its own order. A switch shows or hides a part, and **↑**
and **↓** move it, so the widget draws them top to bottom in that order. A part you switch off keeps
its place for when you switch it back on. A new copy shows the activity map, pull requests, issues
and commits. Up to five copies can split the parts up: the map in one corner, commits in another,
issues in a third. With more than one, each copy has its own numbered list.

- **Profile stats:** one line with your followers, public repos and the stars on your own repos
  (forks left out; counted over your 100 most recently pushed repos). Click it to open your profile.
- **Activity map:** your contribution heatmap, the past year as on your profile, with the yearly
  total. Hover a square for that day's count; click the map to open your profile. Private
  contributions count if you've switched on *Include private contributions on my profile* in your
  GitHub settings.
- **Pull requests:** the four most recently updated open ones you opened, are assigned to,
  commented on or are mentioned in.
- **Review requests:** the four most recently updated open pull requests waiting for your review.
- **Issues:** the five most recently updated open issues you opened, are assigned to, commented on
  or are mentioned in, in any repo (archived repos are left out).
- **Latest repos:** the five repos you committed to most recently, in any organisation, with the
  time of your last commit there. Private repos get a lock icon.
- **Commits:** your newest, as many as fill the widget down to its bottom (at least six), across
  every repo and organisation you've committed to (default branches). Private repos get a lock icon.

Pull requests, review requests, issues, repos and commits come from one fetch, whichever of them
are shown, so switching them is instant; the stats and the map are fetched only while they're
shown. Every copy shares the same fetches, at most once an hour.

The heatmap is read from `github.com/users/<you>/contributions`, which is why the extension asks
for access to github.com. After updating from an older version, press the extension's reload
button on `chrome://extensions` once so Chrome grants it.

The heading opens your GitHub profile. GitHub is checked at most once an hour to stay well inside
its rate limit; **Refresh** next to the heading fetches straight away.

### Tokens for private repos

Without a token the widget shows public repos only. To add your private repos' commits, issues and
pull requests, give it a personal access token. GitHub has two kinds:

- **Fine-grained token** (recommended): read-only and limited to the repos you pick. One token
  covers one owner: your own account *or* one organisation.
- **Classic token**: only if your private repos belong to more than one owner (say, your account
  and an organisation). It reaches every repo your account can.

#### Fine-grained token

1. Open <https://github.com/settings/personal-access-tokens/new> (your avatar → **Settings** →
   **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new
   token**). If GitHub asks, verify your email address first.
2. **Token name:** anything, e.g. `New Tab`. **Expiration:** up to you; when it runs out the widget
   says GitHub rejected the token, and you make a new one.
3. **Resource owner:** you, or the organisation whose private repos you want to see.
4. **Repository access:** **All repositories**, or **Only select repositories** and pick them.
5. **Permissions:** add these repository permissions, each set to **Read-only**. *Metadata*
   (read-only) is added on its own; leave everything else out.

   | Permission | Lets the widget show |
   | --- | --- |
   | Contents | your commits in private repos |
   | Issues | open issues in private repos |
   | Pull requests | open pull requests in private repos |

6. Click **Generate token** and copy it. GitHub shows it only once.
7. If the owner is an organisation that requires approval, the token is *pending* and sees only
   public repos until an organisation owner approves it under the organisation's **Settings →
   Personal access tokens**. Organisation owners are approved automatically.

#### Classic token

A classic token can't be limited to reading: the `repo` scope, the only one that opens private
repos, also allows changes. Treat it like a password.

1. Open <https://github.com/settings/tokens/new> (**Settings** → **Developer settings** →
   **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**).
2. **Note:** e.g. `New Tab`. Pick an **Expiration**.
3. Tick **repo** and nothing else.
4. Click **Generate token** and copy it.
5. If an organisation uses SAML single sign-on, click **Configure SSO** next to the token on the
   tokens page and **Authorize** it for that organisation. Until you do, its private repos stay
   hidden.

#### Add the token

Paste it into Preferences → GitHub → **Access token**, then press **Refresh** on the
widget (otherwise it checks again within the hour). The token stays in this browser and is never
written into backup files.

#### If something is missing

| What you see | What to do |
| --- | --- |
| "GitHub rejected the token" | It expired, was deleted or was pasted incompletely. Make a new one. |
| "Token works but sees no private repos in …" | Fine-grained: check the resource owner, the repositories it can access and *Contents*; an organisation may still have to approve it. Classic: authorise SSO. |
| "Token sees N private repos but can't read commits in …" | Give it *Contents: Read-only*. |
| Private issues or pull requests don't show | Give it *Issues* or *Pull requests: Read-only*. A fine-grained token only sees repos of its own owner. |

## Sports

Add the **Sports** widget in [Layout mode](#layout-mode). It lists what's coming up for the teams
you follow in one list by day (Today, Tomorrow, Sun 18 Oct), in your computer's time zone.

- **Choose what's shown:** hover the widget and click **✎**. Press the NBA and NFL teams you
  follow (hover a button for the team's full name), tick Messi's teams (Inter Miami, Argentina)
  and F1, and pick the F1 sessions you want (Practice, Sprint, Qualifying, Race). Changes apply as
  you go; **✓** closes the editor. A new widget follows Inter Miami, Argentina and F1.
- **A row:** the league or competition (NBA, NFL, MLS, Leagues Cup, World Cup, F1, …), the
  teams with yours in bold (F1: a race car, the race and the session), the start time and the TV channel. A moon marks games that start
  between midnight and 7 in the morning. Times follow the Clock's 12/24-hour setting.
- **Live:** a red dot, the score and the clock (Q3 5:21, 67'). Scores refresh every 30 seconds
  while the tab is in view. F1 sessions read LIVE while they're scheduled to run.
- **Results:** a finished game stays for a day with its score and W, L or D for your team; after
  a race, the podium.
- **Click a row** to open the game on ESPN (F1: the season on formula1.com).
- The list covers the next 14 days; a team with nothing in that time still shows its next game.
  Up to five copies can each follow their own list (say, F1 alone in a corner).

Schedules come from ESPN's public site API and from Jolpica F1 (the successor of the Ergast API),
both free and without a key. Team schedules are checked every 6 hours and the F1 calendar once a
day; every copy and every open tab shares one fetch.

## Marvel

Add the **Marvel** widget in [Layout mode](#layout-mode) (or in setup's Widgets step). It lists
all 115 entries of the MCU in chronological order, the order the story happens in rather than the
order they came out, from Eyes of Wakanda to VisionQuest. The order is Digital Spy's (updated 14 Oct 2026; the
link is at the bottom of the list), including where it splits a season because something else
happens in the middle of it (Agents of SHIELD season 1 in three parts, around Thor: The Dark World
and The Winter Soldier).

- **The list** has every entry, numbered as in the article, with its kind or season and episodes,
  and the year it came out. Click a row to tick or untick it. It opens scrolled to your next
  entry, the first you haven't watched, which is highlighted. Hover an entry for its note, where
  it needs care ("Watch its credits scene after Avengers: Endgame").
- **Starting midway:** right-click an entry and choose **Watched everything up to here**. **Not
  watched from here on** undoes a run of ticks.
- **Disney+:** the ▶ at the end of a row (it shows when you hover, and always on your next entry)
  opens that title's page on Disney+, like a tile: Ctrl+click for a new tab. Right-click → **Watch
  on Disney+** does the same. A series' seasons and parts all open the series. Runaways (on Hulu),
  the Slingshot web series and Spider-Man: Brand New Day aren't on Disney+, so they have none.
  Which titles play depends on your country's catalog: in Israel, as of October 2026, the
  One-Shots, The Incredible Hulk and Cloak & Dagger open an empty page.
- **Preferences → Layout → Marvel:** **Show** everything, everything but the Marvel TV shows
  (Agents of SHIELD, the Netflix shows and the rest of 2013–2020, which the MCU now places outside
  its main timeline), or the 38 films only. Progress and the next entry count only what's shown. **Hide
  watched** drops ticked entries from the list; **Clear** starts over.

What you've watched belongs to the page, not the widget: removing the widget and adding it back
keeps it, and backups include it. The order is part of the extension, so nothing is fetched.

**A Marvel tab:** give a tab [its own layout](#a-tab-with-its-own-layout) and stretch the widget
over the whole page; a wide widget lays the list out in columns.

## Website

The Website widget shows a page from any site, live, the way it looks in a tab: your Pinterest
feed, a GitHub repo, a dashboard. Add it from the Layout mode tray (up to five), type an address
in it and press **Show**.

- **Access, once per site.** Most sites refuse to be shown inside another page, so the extension
  lifts that refusal for its own widgets, and only for sites you give it access to: Show opens
  Chrome's prompt (*Read and change your data on …pinterest.com*). Everywhere else in Chrome the
  site keeps its protection. If you decline, the widget offers **Allow access** again.
  chrome://extensions → New Tab → Details → Site access lists the sites, and removing one there
  takes it off the widget too.
- **Logged in as you are.** The widget uses your Chrome cookies, so log in to the site once in a
  normal tab and the widget shows your own feed.
- **The head:** **Home** goes back to the start address, **Reload** reloads the page the widget is
  on, **Open** opens that page in a tab (a new one if *Open links in a new tab* is on), and the
  gear opens its settings.
- **Settings** (Preferences → Layout → *Website · pinterest.com*): the **Address** it starts on,
  and **Zoom** (50–100%). Sites lay themselves out for the widget's width, so a narrow widget gets
  the phone layout; at 60% a site is drawn as if the widget were two thirds wider, so more fits.
- Only in the extension: on the Live Server preview the widget is a link to the site.
- **After updating the files:** Chrome keeps the extension's old permissions until it's reloaded,
  so the widget says so and offers **Reload the extension** (or press ↻ on New Tab in
  chrome://extensions).

## Search bar and AI chats

The bar searches Google or sends your message to **Claude**, **ChatGPT** or **Gemini**. Choose
which of the four it offers in the **Search bar** section of Preferences (Google and Claude are on to
start with). The icon on the left shows the engine in use; click it to pick another, or press
**Tab** in the bar to go to the next one. The bar remembers the one you used last.

- **Ctrl+Space** puts the cursor in the bar from anywhere on the page.
- **Google:** Enter opens the Google results.
- **Claude, ChatGPT, Gemini:** Enter opens a new chat and sends your message, so the answer starts
  straight away. You need to be signed in to that site in this browser.
- Enter opens in this tab, or in a new tab when *Open tiles in a new tab* is on. Ctrl+Enter always
  opens a new tab.
- **Move it:** the bar is a widget of its own, and there is one on the page. In
  [Layout mode](#layout-mode) drag it anywhere, make it wider or narrower, or remove it; the tray
  brings it back.

The **Claude** widget (add it in Layout mode) sends to Claude from a box with room for longer
messages: Enter sends, Shift+Enter starts a new line.

How the message gets there: it waits in the extension's own storage, and a small script the
extension runs on claude.ai, chatgpt.com and gemini.google.com types it into the message box and
presses send. Only a random id goes in the address, so your message isn't in your history, and the
script leaves alone any page the new tab didn't open. That script is why Chrome lists the extension
as able to read and change your data on those three sites.

## Layout mode

Everything under the top bar sits on one grid of 12 × 12 cells that scales with the window. Each
widget, each block of tiles and the search bar takes a rectangle of cells, and Layout mode lets you
rearrange them.

- **Enter it** with the layout button in the top bar, by right-clicking the empty background, or
  from Preferences → Layout → **Edit layout**. **Done** or Esc keeps the result; **Cancel** undoes
  everything since you entered. It needs a window at least 900px wide.
- **Drag** a widget anywhere on it; an outline shows the cells it will snap to. Nothing else moves.
  A spot that is taken, or off the canvas, shows red, and letting go there puts the widget back.
- **Swap** by dropping a widget on another one: when both fit after the trade, they swap places
  (neighbours in a column or a row trade order), and a dashed outline shows where the other goes.
- **Resize** from any corner or edge. Lists scroll inside their widget; the clock grows with it.
- **Each widget's toolbar:** settings (its group in Preferences, or for the search bar its own
  section; Tasks, Notes and Claude have none), duplicate, remove. Removing Tasks
  or Notes only takes them off the page; their content comes back when you add them again.
- **The tray** along the bottom adds widgets: one chip per type with its count. Clock, Tasks, Notes
  and the search bar are single; Markets, GitHub, Sports, Website, tiles blocks and Claude allow five each. A
  chip is greyed out at the limit or when nothing fits; a new page fills every cell, and the tray
  then says so. **Reset layout** puts one copy of each widget back in its default place, keeping
  its settings.
- **Tiles blocks:** each block either follows the group tabs or is pinned to one group (its
  heading), with its own number of columns (Preferences → Layout). Two blocks can show Work and
  Personal side by side. Drag a tile from one block onto another to move it to that group.
- **Keyboard:** Tab moves between widgets; arrows move the focused one by a cell, Shift+arrows
  resize it, D duplicates, Delete removes.
- Under 900px the widgets stack in one column, top to bottom then left to right.

### A tab with its own layout

Every group tab shows the same page, the main layout, until you give one a layout of its own: a
Marvel tab with only the Marvel widget across the whole page, say, while Home keeps the clock,
tiles and the rest.

- **Right-click the tab → Own layout…** and start from an **empty page** or a **copy of the main
  layout**. The tab opens in Layout mode, and the tray says whose layout you're editing
  ("Marvel’s own layout"). Add, move and resize as on the main page; limits count per layout, so
  the Marvel tab and Home can each have a Marvel widget (both show the same progress).
- A tab with its own layout has a small layout mark after its name.
- **Right-click it → Use the main layout** deletes its own layout, and the tab shows the main
  page again. Preferences → Layout has the same switch for the tab you're on, and lists the
  widgets of the layout that tab shows.
- Switching to a tab with another layout while Layout mode is on ends Layout mode and keeps what
  you changed. Deleting a group deletes its layout too.
- A tiles block that follows the tabs shows the tab's own tiles, on either kind of layout.

## Everything else

- **Tiles:** click to open; Ctrl+click or middle-click opens a new tab. Right-click to edit, move to
  another group or delete. Drag to reorder, or drop on a group tab to move it there.
- **Groups:** click to switch, double-click or right-click to rename or delete, and **+** next to
  the tabs adds one. Drag tabs to reorder. Right-click one to give it
  [its own layout](#a-tab-with-its-own-layout).
- **Jump:** **Ctrl+K** or **/** (or the search icon). Searches tiles, open tabs, bookmarks, history
  and recently closed tabs. ↑ ↓ to pick, Enter to open, Ctrl+Enter for a new tab.
- **Sidebar:** the panel icon in the header: Chrome bookmarks, the last week of history and
  recently closed tabs.
- **Tasks:** type in the add bar and press Enter; tick to finish. Shorthand at the end of the text
  sets the date and repeat (`today`, `tomorrow`, `fri`, `next week`, `in 3 days`, `oct 30`,
  `every monday`, `daily`, `weekdays`, `weekly`, `monthly`, `yearly`), and `!high` / `!med` /
  `!low` anywhere sets the importance. The add bar's flag and calendar buttons show what Enter will
  set, or set it themselves. On a task, click the text to retype it, the flag to change its
  importance (High red, Medium amber, Low blue), and **⌄** (or right-click) for the details tray:
  importance, due date, repeat, subtasks and Delete. The due date shows as *Today*, *Tomorrow*, a
  weekday or a date, in red once it has passed. Ticking a repeating task moves it on to its next
  date (an overdue daily one to tomorrow) and counts it as finished today. The tabs show **All**,
  **Today** (due today or overdue, with a count), **Upcoming** (by date) and **High**; ⌕ searches
  every task and subtask. Drag to reorder (not in Upcoming); **Sort** puts them in order once
  (by due date, then importance). Finished tasks fold under **Finished** at the bottom of All, and
  **Clear** removes them. Finished tasks are kept in a history for 7 days, and the number completed
  per day is kept for good (counted on the day you tick it; unticking takes it back).
- **Clock:** your name, a greeting and 12/24-hour time, all set under Preferences → Layout → Clock. Hover
  the clock and click **✎** to pick a face: Classic, Stencil (hours stacked over minutes, as on a
  Samsung One UI lock screen), Rounded, Serif or Dot. Stencil, Rounded and Serif also come on one
  line (the second row of the picker, or **Hours over minutes** off in Preferences), and one-line
  faces can drop the colon (1541). The time grows to fill its frame; the date and greeting move
  beside it when that gives it more room (hours over minutes in a wide frame) or when the frame is
  too short for them underneath. Each new tab builds the time out of a single point (skipped if
  Windows is set to reduce animations). The faces' fonts are bundled in `fonts/` (SIL Open Font
  License), so they work offline.
- **Background:** Preferences → Page: ASCII, Plain or Image (upload a picture or paste a link).
  Plain is the theme's background, one of Chrome's greys or any colour you pick; Light and the
  dark themes each keep their own pick, so text stays readable. Switching back to ASCII or Plain
  keeps your picture, so Image brings it back.
- **Preferences:** drag the panel by its top edge or the empty part of its sidebar to see the page
  behind it change as you adjust; double-click there to put it back in the middle. Type in the search box (it has the cursor
  when the panel opens, or press Ctrl+F) to list matching settings from every section; options
  whose switch is off show dimmed. Esc clears the search, then closes the panel.
- **Tile logos:** each tile's logo is saved in this Chrome profile the first time it loads, so tiles
  keep their logos even if the server they came from (such as Speed Dial 2's) goes away. Speed Dial 2
  logos are always saved; logos from other sites are saved when the site allows it, otherwise they
  keep loading from their link. A logo over 150 KB is saved at most 768 pixels across, so one huge
  image doesn't slow down every new tab.
- **Backup:** Preferences → Backup → **Download backup** saves everything (including the wallpaper
  and the saved tile logos) to one file you can import again on another computer.

## Your data

Tiles, groups, folders, tasks, notes, Marvel progress, settings and the wallpaper are stored in this
Chrome profile only. Nothing is sent anywhere except the requests the widgets need:

| Widget | Talks to | How often |
| --- | --- | --- |
| Markets (coins) | `api.bybit.com` (public market data) | every 30 s while visible; sparklines every 5 min |
| Markets (indexes) | `quote.cnbc.com` and `ts-api.cnbc.com` (public quotes and charts) | every 30 s while visible; sparklines every 5 min |
| Markets (currency pairs) | `api.frankfurter.dev` (ECB rates) | once an hour |
| GitHub | `api.github.com`, and `github.com` for the heatmap | once an hour, or when you press Refresh |
| Sports (NBA, NFL, soccer) | `site.api.espn.com` (schedules, scores); team logos from `a.espncdn.com` | every 6 hours; every 30 s while one of your games is on |
| Sports (F1) | `api.jolpi.ca` | calendar once a day; hourly after a race until the result is in |
| Tile logos | wherever each tile's icon link points (e.g. `assets.speeddial2.com`) | once per logo, then it's saved |
| Search bar | `google.com`, `claude.ai`, `chatgpt.com` or `gemini.google.com`, opened like any link | only when you press Enter |
| Website | the site you put in it, exactly as a tab would, with your cookies for that site | whenever a new tab opens, and as you use it |

Remove a widget in Layout mode and it stops fetching. Setup's site suggestions read Chrome's
history and bookmarks on this computer; nothing about them is sent anywhere.

## Known limits

- On a fresh new tab Chrome keeps the cursor in the address bar, so Ctrl+K, / and Ctrl+Space work
  once you've clicked the page. The search icon and clicking the bar always work.
- A tile logo from a site that doesn't allow saving it (no CORS headers) still loads from its link.
  If one stops showing, right-click → Edit and clear the icon field (uses the site's own icon) or
  paste another image link.
- Claude, ChatGPT, Gemini: if you're signed out of the site, nothing is sent; sign in and send it
  again. If a site changes its page and the send button can't be found, your message is left in
  the box and you press Enter yourself.
- Website: some sign-ins refuse to run inside a widget (Google's, among others), so log in to the
  site in a normal tab. A few sites notice they're in a widget and stay blank; **Open** shows them
  in a tab. A link to another site loads in the widget only if that site allows it. The page's
  shortcuts (Ctrl+K, …) don't work while the site has the cursor; click outside it first.
- No sync between computers; use a backup file to move your setup.
- Sports: ESPN's site API is public but unofficial and can change without notice. The widget then
  keeps the last schedule it had and says ESPN is unreachable. F1 "live" follows the timetable,
  not live timing (there is no free live timing).

## Development

Plain HTML, CSS and JavaScript modules: no framework, no bundler, no dependencies.

```
npm test
```

Runs the unit tests (store, importer, tile/group/folder actions, feeds, sports schedules and timeline,
network cache, tasks, helpers) with Node's built-in runner.

To preview outside the extension, serve the folder (`python -m http.server 5517`) and open
`http://127.0.0.1:5517/newtab.html`. Data is then kept in `localStorage`, and the Chrome-only parts
(sidebar, bookmarks/history in Jump, site icons) show placeholders.

After editing files, reload the new tab. Changes to `manifest.json` need the extension's reload
button on `chrome://extensions`.

The tab icon is drawn by `icons/make-icons.mjs`: one stroke tracing an "N", mint to sky, ending in
a cursor point. It writes `icons/icon.svg`, and the PNGs Chrome needs for the favicon and the
extension card when given a Chrome or chrome-headless-shell binary to rasterize with:

```
node icons/make-icons.mjs path/to/chrome-headless-shell.exe
```
