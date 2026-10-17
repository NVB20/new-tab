# Widget stacks: 2–3 widgets in one spot

Date: 2026-10-17
Status: approved (asked for as "an option to stack up to 3 widgets on top of each other"; the
switcher picked from the mockups at https://claude.ai/artifact/MLtmGgQBpHo9rSwbE9Nyqk is B+C,
"dots that turn into icons", with the recommended answer to every smaller choice)

Layout mode already puts widgets one above another in a column. A stack is different: two or three
widgets share one rectangle, one shows at a time, and you switch between them, like the iPhone's
Smart Stack.

## On the page

- **The switcher** is a row along the bottom of the stack: one dot per widget, the long one the
  widget showing. Pointing at the stack, focusing something in it or touching it turns the dots into
  the widgets' icons (the name is the tooltip); in Layout mode they're always icons.
- **Switching:** click a dot or icon; the wheel over the row; a sideways swipe over the stack (a
  trackpad, or a finger) unless it's over something that scrolls sideways; ← → on a focused button.
- **The widget showing is saved** with the layout (`front`), so every new tab opens on it.
- **The widgets behind keep running** (feeds, timers, a Website's page), so switching is instant.
  They keep their real size too, hidden and inert, so anything that measures itself (the clock's
  face, GitHub's commit rows, Marvel's scroll to the next entry) stays right.
- **Under 900px** a stack is one block in the column, showing its front widget at its height.

## Data

A stack is one entry in `layout.widgets`:

```js
{ id, type: 'stack', x, y, w, h, front: '<id of the copy showing>',
  items: [{ id, type, settings }, …] }   // 2–3 copies, without a place of their own
```

- The rectangle code (`fits`, `firstFree`, `moveCopy`, `swapPlan`, `stackOrder`) is unchanged: a
  stack is one rectangle. `'stack'` isn't in `TYPES`; it's never in the tray.
- `copiesOf(layout)` lists every copy, stacked or not. Everything that asks "which copies are on the
  page" uses it: `countOf` (limits count stacked copies), the Website rules and frame script, the
  Sports widget's 12/24-hour lookup, deleting a group, Preferences → Layout and → GitHub, setup.
- `copyById` finds a stacked copy (widgets read their settings by it) and a stack.
- `minOf(entry)`: a stack's minimum size is its biggest member's, each way.
- The search bar is never stacked. A stack holds at most `STACK_MAX` (3).
- `normalizeLayout`: each member is cleaned by its type and counted against its limit; a search bar
  or a fourth member comes out to a free spot; a stack of one is that copy, in the stack's spot; an
  empty one goes; a `front` that isn't a member becomes the first. Ids stay unique across stacks and
  layouts (`normalizeLayouts`), and a tab's own layout copied from the main one gets new ones.

## Layout mode

- **Make one:** drag a widget (or a stack) onto the middle of another, the middle half each way. The
  outline over the target reads "Stack with Markets"; near an edge it swaps as before. It turns red,
  saying why, when the stack would hold more than three, when the target's spot is under a member's
  minimum size, or for the search bar. The stack takes the target's spot and shows what joined.
- **Stack onto…** in a widget's toolbar does the same from a menu (the keyboard way): every other
  widget and stack, greyed out with the reason when it can't take it.
- **A stack's toolbar acts on the widget showing:** Settings (its section), Duplicate (to a free
  spot), **Take out** (to a free spot at its default size, else its minimum; greyed out when nothing
  fits) and Remove. D and Delete do the same. With one widget left, it's a plain widget again.
- The frame label reads "Stack · Markets, Sports"; resizing stops at the stack's minimum.
- **Reset layout** takes stacks apart: default places have none (the first copy of each type stays).

## Setup

- The Arrange step lists stacking with its other moves ("Onto another's middle stacks them"), and
  its hint says a swap is a drop near a neighbour's edge (docs/onboarding.md records it).
- A page in setup's default places has no stack; a page with one counts as arranged by hand, so the
  Widgets step adds and removes copies without re-flowing (removing takes a type's copies out of
  stacks too).

## Build order

1. `layout.js`: stack helpers, `copiesOf` call sites, normalisation; tests in `test/layout.test.js`.
2. `canvas.js` and `stack-bar.js`: the stack frame, the switcher, `front`.
3. `edit-mode.js`: drop on the middle, Stack onto…, the stack toolbar; `ui.js` menu items that are
   greyed out with a note, two icons.
4. The other call sites, CSS, README (Layout mode).
5. Browser check: build a stack by dragging and from the menu, switch every way, reload (same
   widget), take out and remove down to one, a narrow window, a Website widget in a stack.
