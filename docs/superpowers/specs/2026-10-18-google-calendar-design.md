# Google Calendar widget: your agenda from the calendars' private iCal links

Date: 2026-10-18
Status: approved (answers: see the agenda, read-only; every calendar merged into one list, with
chips in the widget to filter it; now/next, Join buttons and a hover card; our own iCal parser).
Revised: adding a calendar is a guided window that opens Google Calendar's settings and adds on
paste (answer: the guided window, not "Sign in with Google").

A new widget type, **Google Calendar**, lists today's events and the next two weeks' from one or
more Google calendars, merged, each in its colour. Chips under the head hide or show a calendar in
that copy. Read-only: clicking an event opens it in Google Calendar. Up to two copies.

## Why the iCal link

Google's Calendar API needs a Google Cloud project, the `identity` permission and, for a public
Web Store release, Google's verification of the `calendar.readonly` scope. Every Google calendar
also has a **secret address in iCal format** (Settings → the calendar → Integrate calendar), a
plain `.ics` file anyone with the link can read. The widget reads that. It works the same for any
other iCal link (Outlook, iCloud), though only Google's get event links.

Google sends no CORS headers on it (checked: `calendar/ical/…/basic.ics` answers 200,
`text/calendar`, no `Access-Control-Allow-Origin`), so the extension needs access to the host. The
manifest's `optional_host_permissions: *://*/*` covers it: Add asks Chrome's prompt for the link's
site (`sitePattern` from website.js, `*://*.calendar.google.com/*`), as the Website widget does.
No manifest change, no reload, nothing new in the store's install warning.

## Data

- **Calendars are the page's.** `prefs.gcal.calendars`: `[{ id, name, color }]`, up to 10, shared by
  every copy. A copy keeps only `settings.hidden`: the calendar ids its chips turned off.
- **The links stay out of chrome.storage.** A secret link is a password to the calendar, and
  content scripts on other sites (content/chat.js, content/site-frame.js) can read
  chrome.storage.local. The links live in this extension's own localStorage, `newtab:gcal-links`
  (`{ id: url }`), in `gcal-links.js`. A backup has none (a restore keeps the ones on this
  computer); **Reset everything** deletes them and gives back the access they were granted. On the
  Live Server preview (no `chrome`) nothing is stored or fetched: "The calendar loads in the
  extension."
- **Adding:** through the Add a calendar window (below). The name is the feed's `X-WR-CALNAME`
  (else the host), the colour the next of 8; both can be changed in ✎.
- **Removing** a calendar (✎, after a confirm) deletes its link and cached events, and gives the
  site's access back unless another calendar link or a Website widget still uses that site.
  Website's own release checks the calendar links too.
- **Fetching:** each link through `net.js`'s `feed('gcal:<id>', 10 min)`, shared by every copy and
  tab. Asked every minute while visible (the cache answers until 10 min have passed) and on coming
  back into view. The cache holds the parsed events from yesterday to 16 days on (UTC days), not
  the raw feed, which can be megabytes for an old calendar; descriptions are cut at 500 characters
  and a calendar keeps at most 400 events.
- **Failures:** the last events stay. One calendar down: its chip shows ⚠ with the reason on
  hover; all down with nothing saved: "Couldn't reach the calendar" and Try again. A 4xx (the
  secret address was reset, the calendar deleted, or a Workspace admin turned the addresses off):
  "Google doesn't answer this link any more. Remove it and add the calendar's new secret address."
  No access to the site (taken back in chrome://extensions): "Allow access" asks again. A calendar
  in the list with no link on this computer (a backup restored elsewhere): "No link on this
  computer".

## Parsing (`js/gcal.js`, pure, unit-tested)

- Unfolds lines, unescapes `\n \, \; \\`, reads parameters (`TZID`, `VALUE=DATE`).
- **Times:** UTC (`…Z`), in a zone (`TZID=Europe/Paris`, converted with `Intl`, DST included),
  floating (this computer's zone; a TZID `Intl` doesn't know falls back to `X-WR-TIMEZONE`, then to
  floating), and all-day dates (`VALUE=DATE`, kept as `YYYY-MM-DD`, end exclusive). No `DTEND`:
  `DURATION`, else a day for all-day and nothing for a timed event.
- **Repeats:** `RRULE` with `FREQ` DAILY, WEEKLY, MONTHLY or YEARLY; `INTERVAL`, `COUNT`, `UNTIL`,
  `BYDAY` (with ordinals in MONTHLY and YEARLY-with-BYMONTH, e.g. `2TU`, `-1FR`), `BYMONTHDAY`
  (negative from the month's end), `BYMONTH`, `WKST`. Occurrences keep their wall-clock time in
  their zone across DST. `EXDATE` (any number, lists, with TZID or as dates) removes occurrences; a
  `RECURRENCE-ID` event replaces its occurrence (or removes it when `STATUS:CANCELLED`). A rule with
  parts it doesn't know (`BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`, `BYHOUR`…, HOURLY and finer) gives
  only its first occurrence.
- **Left out:** `STATUS:CANCELLED` events, and events you declined: your attendee entry is the one
  whose address is the calendar's id, read from a Google link's path
  (`/calendar/ical/<id>/…/basic.ics`).
- **Meeting link:** `X-GOOGLE-CONFERENCE`, else the first Google Meet, Zoom, Teams or Webex link
  in the location, then the description.
- **Description:** HTML (Google writes some) to text, Google's Meet boilerplate block
  (`-::~:~::~…`) removed, blank lines collapsed.
- **Event link** (Google links only): `https://calendar.google.com/calendar/event?eid=` + base64url
  of `<event id> <calendar id>`, the event id being the UID without `@google.com`, plus
  `_<original start>` for an occurrence of a repeating event (`20261020T070000Z`, or `20261020` all
  day). Else the event's own `URL` when it's http(s), else none.

## What the widget shows

- **Head:** a calendar icon and "Google Calendar"; ✎ on hover. Hover: "Times in your time zone".
- **Chips** (two calendars or more): a colour dot and the name each; pressed = shown. One click
  hides or shows it in this copy; the last one shown stays on. ⚠ on a calendar that failed.
- **The list:** "Today" always, then each day with an event up to 13 days on ("Tomorrow",
  "Thu 23 Oct", sports.js's `dayLabel`). Today with nothing left: "Nothing else today" (or
  "Nothing today"). All-day events first. A row: the time (Clock's 12/24-hour setting), the
  calendar's colour bar, the title, and on the right the state; an event over several days shows on
  each, as "All day" or, on its last day, "–14:00".
- **Now and next:** an event going on has an accent bar and "until 14:30"; the first event ahead
  says "in 25 m"; today's events that ended are dimmed, with a line where the ones ahead start.
- **Join:** an event with a meeting link that hasn't ended gets a camera button, a filled "Join"
  from 10 min before it starts until it ends. Under 260px wide, Join and "until 14:30" go (the tint
  and the card still say it). It opens the call; Open links in a new tab applies, as to the
  event link.
- **Hover card** (econ-card.js, now shared): the calendar as a pill, the title, when (time range,
  long date, how long until or since), the place, the meeting link's site, the description
  (clamped). Rows are focusable: Tab opens it, Esc closes it.
- **Empty:** no calendars: "Your Google Calendar agenda shows here." and **Add a calendar**, which
  opens the window.

## Editor (✎)

- **Calendars:** a row each: the colour (a click takes the next of 8), the name (saved as you
  type), the state when it's not fine, and Remove.
- **Add a calendar** opens the window (or, at 10, says that's the most). A note: anyone with a
  secret address can see the calendar; it stays on this computer, not in backups.
- Preferences → Layout lists each copy with "Calendars: use ✎ on the widget".

## Adding a calendar (`js/gcal-add.js`)

Revised the same day: users didn't know where the secret address is. A window (the page's dialog)
walks through it in four numbered steps:

1. **Open Google Calendar settings** (a button; `calendar.google.com/calendar/r/settings`, always a
   new tab, so this one stays).
2. Under **Settings for my calendars**, click your calendar.
3. Scroll to **Integrate calendar** and click the copy button next to **Secret address in iCal
   format**. A drawing of that page (an inline SVG in the page's colours) marks the calendar and
   the copy button with the steps' numbers, 2 and 3, and shows the public address above it.
4. **Come back and paste it.** Coming back to the tab (focus or visibility) puts the cursor in the
   box with a glow and "Now paste it here: Ctrl+V" (⌘V on a Mac). A paste adds at once; Enter or
   Add adds what was typed. "Added Work." and the window closes after 1.2 s.

The calendar's ID or URL can't be deep-linked without knowing the account, and reading the
clipboard on return would need the `clipboardRead` permission, so the paste does it.

Checks before anything is asked (`pasteProblem`, `isPublicAddress` in gcal.js): an address that
looks like an email is the **Calendar ID** ("further down, under Integrate calendar"); a link to
Google Calendar itself (its page, embed or settings) says so; anything else that isn't a web
address says what to copy. `webcal://` becomes `https://`; http(s) only, no user name or password;
up to 10; the same address twice is refused. Then Chrome's prompt for the site, in the paste or
click that asked (a user gesture), then one fetch: not a calendar → "That address doesn't give a
calendar"; a 4xx on the public address → "this calendar isn't public, copy the secret address just
below it"; another 4xx → "Google doesn't know that address"; unreachable → "Check the connection".
Nothing is kept from a failed add, and the access goes back. A footnote: the address is a
password and stays on this computer; a work or school admin may have turned it off; Outlook and
iCloud work the same way.

## Layout and setup

- `gcal: { label: 'Google Calendar', size: [3, 5], min: [2, 3], max: 2 }`. In the default places
  it goes under the clock (after Weather), and is the first to move to the other column when the
  clock column is full, as `SPARE` does for Countdown.
- A Speed Dial 2 import (Preferences and setup) keeps the calendars, as it keeps the layout.
- Setup's Widgets step offers it (after Tasks); Connect doesn't ask for a link (a credential, like the GitHub
  token: it belongs in ✎ with its how-to), so it goes under "Left out on purpose".

## README

A Google Calendar section; a row in "What's on the page"; in "Your data", `calendar.google.com`
(or the host of each iCal link you add): the secret link, every 10 min while visible; in "Known
limits": read-only, the link is a password and stays on this computer, Workspace admins can turn
the addresses off, rules Google doesn't write show only their first occurrence.

## Testing

- `test/gcal.test.js`: unfolding and escapes; UTC, zoned (across a DST change), floating and
  all-day times; DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY (plain and ordinal),
  BYMONTHDAY (negative too), BYMONTH; EXDATE; RECURRENCE-ID moved and cancelled; unknown parts;
  declined and cancelled events; meeting links; HTML descriptions and Meet boilerplate; eids; the
  agenda's days, states and multi-day rows; settings and calendar cleaning.
- `test/layout.test.js`: the type's limits and default place.
- In Playwright's Chromium with the extension loaded: Google's public US holidays calendar (a real
  Google feed) added through ✎, chips, card, Join on a seeded event, removal giving the access back.
