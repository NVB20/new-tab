# GitHub widget: open issues, a Commits / Issues / Both choice, settings in one place

Date: 2026-10-16
Status: approved (answers: issues involving me, everything in Preferences, PRs always on top)

## What the widget shows

- Contribution heatmap (unchanged), then **Open pull requests** when there are any (unchanged,
  shown in every mode), then the lists picked by the new **Show** choice:
  - **Commits**: Latest commits (today's widget).
  - **Issues**: Open issues.
  - **Both** (default): Open issues, then Latest commits.
- **Open issues**: the 5 most recently updated open issues that involve the user (opened by,
  assigned to, mentioning or commented on by them), across every repo and organisation. Search
  query `is:issue is:open involves:<user> archived:false`, sorted by `updated`. Private repos' issues
  show when the token has *Issues: read-only*. Row: issue icon, title, `#123 · 3d`; tooltip
  `owner/repo #123` and the title; click opens the issue. None found: "No open issues."
- The token note about missing *Contents* access only shows while commits are shown.

## Data

- New pref `widgets.github.show`: `'commits' | 'issues' | 'both'`, default `'both'`. Saved states
  without it (or with any other value) get the default in `normalizeState`.
- One GitHub feed keeps holding everything (`github-v6:<user>:<token|public>` →
  `{ commits, pulls, issues, tokenInfo }`), fetched at most once an hour as before. The issue search
  is one extra request per hour. Show only changes what is drawn, so switching it is instant and
  never fetches. (Fetching per mode would save that request but refetch on every switch.)
- `parsePulls` becomes `parseIssues` (same rows; it parses issue search results, PRs or issues).

## Settings in one place

- Preferences → Widgets → GitHub holds every GitHub setting: the switch, Username, **Show**
  (Commits · Issues · Both), Access token. The token hint names the permissions it needs.
- The widget gets a ✎ in its heading (visible on hover, like Markets and Clock) titled "GitHub
  settings". It opens Preferences at Widgets, scrolled to GitHub.
- Without a username the widget no longer has its own username box: one line explains what it
  shows and a **Set up GitHub** button opens the same place, with the Username box focused.
- `prefs.open(id, anchor)` gains an optional anchor; main.js passes `openPrefs` to
  `mountSideWidgets`.

## README

- Feature table, agent setup prompt and GitHub section mention issues and the Show choice, and say
  that all settings are in Preferences → Widgets → GitHub.
- "Private repos" becomes a step-by-step guide to making a token: fine-grained (recommended,
  read-only: Contents, Issues, Pull requests; one owner per token; org approval), and classic
  (`repo` scope, for private repos spread over several owners; SSO authorisation), what each
  permission unlocks, and what the widget says when something is missing.

## Parallel work

The prefs-redesign branch rewrites `prefs.js`. Its panel draws optional rows from the data, so it
should show the Show choice when `widgets.github.show` exists and keep `open(id, anchor)`.

## Testing

Unit tests for `parseIssues` and the `show` default/validation in `normalizeState`. Visual check of
the three modes, the ✎ and the setup button in headless Chrome against the static preview.
