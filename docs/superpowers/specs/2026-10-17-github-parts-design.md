# GitHub widget: parts chosen and ordered in Preferences → GitHub, three new parts

Date: 2026-10-17
Status: approved (answers: latest repos = repos I worked in; add review requests and profile stats;
on/off and reorder)

## Where

- What a GitHub copy shows moves from its group under Preferences → Layout to Preferences →
  **GitHub**, which becomes: Account (username) → **What the widget shows** → Private repos (token
  and how-to). `TYPES.github.prefs = 'github'`, so GitHub copies leave the Layout section.
- One copy on the page: one list titled "What the widget shows". Several: one list per copy, titled
  "Widget 1 · Map + PRs + 2 more" (numbered in layout order, so copies showing the same parts are
  told apart, and search results don't say "GitHub · GitHub"). None: a row "No GitHub widget on
  the page" with an **Edit layout** button.
- Opening a group by its anchor scrolls its title into view with it (any section).
- Each list is anchored by the copy id: the widget's ✎ ("Choose what to show" too) and the ⚙ in
  Layout mode open Preferences → GitHub scrolled to that copy's list.
- Each part is a row: its name and a short hint, ↑ and ↓ buttons (disabled at the ends) and a
  switch. Rows are in the copy's order, switched-off parts included, so a part switched back on
  comes back in its place. The search finds the rows like any other.

## Parts

Default order, with the four existing parts on and the three new ones off:

1. **Profile stats** (new): `128 followers · 42 repos · 310 stars`, linking to the profile.
   Followers and public repos from `/users/<user>`; stars summed over the user's own non-fork public
   repos (`/users/<user>/repos?type=owner&sort=pushed&per_page=100`, so the 100 most recently pushed).
   Its own feed `github-stats:<user>`, fetched only while the part is on (like the map), at most
   once an hour. Failure: a short note in its place.
2. **Activity map**: unchanged.
3. **Pull requests**: unchanged.
4. **Review requests** (new): open PRs waiting for the user's review
   (`is:pr is:open review-requested:<user> archived:false`, 4 newest by update), drawn like PRs.
   "No review requests." when none.
5. **Issues**: unchanged.
6. **Latest repos** (new): the 5 repos with the user's newest commits, any owner, built from the
   commits already fetched (no extra request). Row: repo icon (lock if private), name (own repos
   without the owner), time of the last commit; click opens the repo. "No repos found." when none.
7. **Commits**: unchanged; still fills the frame down to its bottom wherever it sits.

## Data

- A GitHub copy's settings: `order` (all seven parts, the copy's order) and `parts` (the ones
  shown, in that order). `clean` keeps known parts once each; parts missing from a saved `order`
  (copies saved before this change, or parts added later) go in after their nearest predecessor in
  the default order; saved copies without `order` keep their shown parts.
- Pure helpers in layout.js, unit-tested: `cleanGithubParts`, `moveGithubPart(settings, part, -1|1)`,
  `showGithubPart(settings, part, on)`.
- The activity feed (`github-v8:…`, was v7) adds `reviews` (one more search an hour) and `repos`.
  `latestRepos(commits, limit)` in feeds.js; `parseStats(profile, repos)` likewise.
- The widget draws `parts` in order. Loading and "couldn't reach GitHub" show once, where the
  first activity part (PRs, reviews, issues, repos, commits) sits. The token note (missing
  Contents access) follows the later of commits and repos.
- The stats feed goes through the saved-copy-first `get()` and into the skip-redraw signature.
- `copyTitle` with more than three parts: the first two and "N more" (`GitHub · Map + PRs + 3 more`).

## Testing

Unit tests: `cleanGithubParts` (old saves, unknown and repeated parts, missing parts' places), the
move and show helpers, `latestRepos`, `parseStats`, `copyTitle`, `prefsSection('github')`.
Headless Chrome against the static preview: reordering, switching, two copies, the new parts drawn.
