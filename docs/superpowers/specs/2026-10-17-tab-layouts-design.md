# Tab layouts: a tab can have a layout of its own

Date: 2026-10-17
Status: approved (asked for as "a tab with the regular layout and another with a custom layout",
e.g. a Marvel tab with only the Marvel widget)

Today every tab (group) shows the same canvas, `prefs.layout`; switching tabs only changes which
group's tiles a "follows the tabs" block shows. Now a tab can have its own layout. Every other tab
keeps showing the main one.

## Data

- `prefs.layouts = { [groupId]: layout }`, beside `prefs.layout` (the main layout). Under `prefs`
  because that's the key widget settings are saved and heard under (`setCopy` and the widgets'
  subscriptions compare `prefs` only).
- Normalized like the main layout. A key that isn't a group is dropped; a copy id already used by
  an earlier layout gets a new one, so `copyById` finds one copy per id.
- Deleting a group deletes its layout. A tiles block pinned to a deleted group, in any layout,
  goes back to following the tabs.
- Limits (`max`) count per layout: the main page and the Marvel tab can each have a Marvel widget.
  Both show the same progress (`state.marvel`).
- A backup carries them (it's the whole state). A Speed Dial 2 import replaces the groups, so it
  drops them.

## The layout you see

`activeLayout(state)`: the active group's own layout, else the main one. Everything that shows or
edits "the layout" uses it: the canvas, Layout mode (adding, moving, Reset, Cancel), Preferences →
Layout and → GitHub, and setup (it sets up the page you're on). `copyById` searches every layout;
the Website rules and frame script cover the sites of every layout, so switching tabs doesn't
rewrite them.

The canvas mounts the copies of the layout shown: switching between two tabs with different
layouts unmounts one set and mounts the other (feeds come from the shared request cache, so
nothing refetches early). Between two tabs on the main layout nothing remounts, as before.

Switching tabs in Layout mode ends it, keeping the changes (Cancel would otherwise restore one
tab's layout into another).

## Making one

- **Right-click a tab → Own layout…** asks: start from a **copy of the main layout** or an **empty
  page**. The tab becomes active and Layout mode opens on it. A copy gets new ids.
- **Right-click a tab with its own layout → Use the main layout** confirms, then deletes its layout.
- **Preferences → Layout** says which layout the tab you're on uses, with the same two actions.
- The Layout-mode tray names it: "Marvel’s own layout".
- A tab with its own layout says so in its tooltip.

## Marvel, full size

On a tab of its own the Marvel widget is likely the whole page. From 640px wide (a container query
on the frame) its list fills the width in columns of at least 250px, read row by row (the numbers
keep the order plain). Nothing else changes: the head and progress bar stay across the top.
