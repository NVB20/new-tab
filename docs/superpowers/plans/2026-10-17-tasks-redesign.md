# Tasks Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Tasks widget so importance, due dates, repeats and subtasks are set from visible controls (a flag per row and a details tray), text is retyped in place, and tasks can be viewed by tab, searched and quick-added with shorthand.

**Architecture:** Pure logic stays in `js/tasks.js` (repeats, subtasks, views) and a new pure `js/task-parse.js` (shorthand); both are unit-tested in Node. The widget splits into `js/task-widget.js` (frame: heading, tabs, search, list, add bar, Finished fold, drag) and a new `js/task-row.js` (one row and its tray). Rows are rebuilt on every render; a small `ui` object owned by the widget carries what isn't in the store (which text is being edited, which tray is open, which control to refocus).

**Tech Stack:** Plain ES modules, no build step, `node --test`, the existing `el`/`icon`/`showMenu`/`openDialog` helpers in `js/ui.js`.

Spec: `docs/superpowers/specs/2026-10-17-tasks-redesign-design.md`.

## Global Constraints

- Days are `YYYY-MM-DD` strings in local time (`dayKey`), compared as strings.
- Importance levels are exactly `high`, `medium`, `low` (or `null`); colours come from `--prio-high`, `--prio-medium`, `--prio-low`.
- `repeat` is exactly one of `daily`, `weekdays`, `weekly`, `monthly`, `yearly`, or `null`; a repeat always has a due date.
- Views are exactly `all`, `today`, `upcoming`, `high`.
- Task and subtask text: `maxLength` 300, `dir="auto"`.
- `taskHistory` and `taskStats` keep their shape.
- Run tests with `npm test` from the worktree root (`node --test`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Files

| File | Change |
|---|---|
| `js/tasks.js` | repeats, subtasks, `viewTasks`, `todayCount`; `addTask` takes extra fields; `setDue(null)` clears the repeat |
| `js/task-parse.js` | new: `parseTask(text, now)` |
| `js/store.js` | normalise `repeat` and `subtasks` |
| `js/layout.js` | Tasks settings `{ view, showDone }` |
| `js/ui.js` | `flag` and `repeat` icons |
| `js/task-row.js` | new: `taskRow(task, ctx)` |
| `js/task-widget.js` | rewritten frame |
| `css/newtab.css` | the Tasks block rewritten |
| `README.md` | Tasks bullet and features table |
| `test/tasks.test.js`, `test/task-parse.test.js` (new), `test/store.test.js`, `test/layout.test.js` | tests |

---

### Task 1: Repeats, subtasks and views in `tasks.js`

**Files:**
- Modify: `js/tasks.js`
- Test: `test/tasks.test.js`

**Interfaces:**
- Produces: `REPEATS`, `VIEWS`, `addDays(day, n)`, `firstDue(repeat, today)`, `nextDue(day, repeat, today)`, `addTask(s, text, now, { priority, due, repeat } = {})`, `setRepeat(s, id, repeat, now)`, `addSubtask(s, id, text)` → subtask or `null`, `toggleSubtask(s, id, subId)`, `editSubtask(s, id, subId, text)`, `deleteSubtask(s, id, subId)`, `viewTasks(tasks, view, query, today)` → `{ open, finished }`, `todayCount(tasks, today)` → `{ count, overdue }`. Tasks now carry `repeat` and `subtasks`.

- [ ] **Step 1: Write the failing tests**

In `test/tasks.test.js`, extend the import:

```js
import {
  dayKey, addTask, toggleTask, deleteTask, clearDone, pruneHistory, HISTORY_DAYS,
  setDue, setPriority, editTask, moveTask, sortTasks, dueLabel,
  REPEATS, VIEWS, addDays, firstDue, nextDue, setRepeat,
  addSubtask, toggleSubtask, editSubtask, deleteSubtask, viewTasks, todayCount,
} from '../js/tasks.js';
```

Replace the `addTask stamps the creation time` test with:

```js
test('addTask stamps the creation time and takes importance, due date and repeat', () => {
  const s = empty();
  const t = addTask(s, 'Write tests', at(2026, 10, 16));
  assert.deepEqual(s.tasks, [{ id: t.id, text: 'Write tests', done: false, createdAt: at(2026, 10, 16), doneAt: null, due: null, priority: null, repeat: null, subtasks: [] }]);
  const u = addTask(s, 'Gym', at(2026, 10, 16), { priority: 'high', due: '2026-10-20', repeat: 'weekly' });
  assert.deepEqual([u.priority, u.due, u.repeat], ['high', '2026-10-20', 'weekly']);
  const v = addTask(s, 'Junk', at(2026, 10, 16), { priority: 'urgent', due: 'soon', repeat: 'hourly' });
  assert.deepEqual([v.priority, v.due, v.repeat], [null, null, null]);
});

test('addTask dates a repeating task that has no date', () => {
  const s = empty();
  assert.equal(addTask(s, 'Water', at(2026, 10, 16), { repeat: 'daily' }).due, '2026-10-16');
  assert.equal(addTask(s, 'Standup', at(2026, 10, 17), { repeat: 'weekdays' }).due, '2026-10-19');   // Saturday → Monday
});
```

Append:

```js
test('REPEATS and VIEWS list the allowed values', () => {
  assert.deepEqual(REPEATS, ['daily', 'weekdays', 'weekly', 'monthly', 'yearly']);
  assert.deepEqual(VIEWS, ['all', 'today', 'upcoming', 'high']);
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('firstDue: today, or the coming Monday for weekdays at a weekend', () => {
  assert.equal(firstDue('daily', '2026-10-17'), '2026-10-17');
  assert.equal(firstDue('weekdays', '2026-10-16'), '2026-10-16');   // Friday
  assert.equal(firstDue('weekdays', '2026-10-17'), '2026-10-19');   // Saturday
  assert.equal(firstDue('weekdays', '2026-10-18'), '2026-10-19');   // Sunday
});

test('nextDue steps on from the due date until it is after today', () => {
  const today = '2026-10-16';   // a Friday
  assert.equal(nextDue('2026-10-16', 'daily', today), '2026-10-17');
  assert.equal(nextDue('2026-10-10', 'daily', today), '2026-10-17');     // overdue lands on tomorrow
  assert.equal(nextDue('2026-10-20', 'daily', today), '2026-10-21');     // ticked early: one step on
  assert.equal(nextDue('2026-10-16', 'weekdays', today), '2026-10-19');  // Friday → Monday
  assert.equal(nextDue('2026-10-14', 'weekly', today), '2026-10-21');    // keeps the weekday
  assert.equal(nextDue('2026-10-16', 'weekly', today), '2026-10-23');
  assert.equal(nextDue('2026-10-16', 'monthly', today), '2026-11-16');
  assert.equal(nextDue('2027-01-31', 'monthly', '2027-01-31'), '2027-02-28');   // shorter month: its last day
  assert.equal(nextDue('2026-10-16', 'yearly', today), '2027-10-16');
  assert.equal(nextDue('2028-02-29', 'yearly', '2028-02-29'), '2029-02-28');
});

test('ticking a repeating task counts it, keeps a copy in the history and moves it to its next date', () => {
  const s = empty();
  const t = addTask(s, 'Water plants', at(2026, 10, 10), { due: '2026-10-14', repeat: 'daily' });
  addSubtask(s, t.id, 'Kitchen');
  toggleSubtask(s, t.id, s.tasks[0].subtasks[0].id);
  toggleTask(s, t.id, at(2026, 10, 16, 9));
  assert.equal(s.tasks[0].done, false);
  assert.equal(s.tasks[0].doneAt, null);
  assert.equal(s.tasks[0].due, '2026-10-17');
  assert.equal(s.tasks[0].subtasks[0].done, false);
  assert.deepEqual(s.taskStats, { '2026-10-16': 1 });
  assert.equal(s.taskHistory.length, 1);
  assert.equal(s.taskHistory[0].text, 'Water plants');
  assert.notEqual(s.taskHistory[0].id, t.id);
  assert.equal(s.taskHistory[0].doneAt, at(2026, 10, 16, 9));
  assert.equal(s.taskHistory[0].clearedAt, at(2026, 10, 16, 9));
});

test('setRepeat dates an undated task and ignores unknown repeats; clearing the date ends the repeat', () => {
  const s = withTasks('a');
  const id = s.tasks[0].id;
  setRepeat(s, id, 'weekly', at(2026, 10, 16));
  assert.deepEqual([s.tasks[0].repeat, s.tasks[0].due], ['weekly', '2026-10-16']);
  setRepeat(s, id, 'hourly', at(2026, 10, 16));
  assert.equal(s.tasks[0].repeat, 'weekly');
  setDue(s, id, '2026-10-20');
  assert.equal(s.tasks[0].repeat, 'weekly');
  setDue(s, id, null);
  assert.deepEqual([s.tasks[0].repeat, s.tasks[0].due], [null, null]);
  setRepeat(s, id, 'monthly', at(2026, 10, 16));
  setRepeat(s, id, null, at(2026, 10, 16));
  assert.deepEqual([s.tasks[0].repeat, s.tasks[0].due], [null, '2026-10-16']);
});

test('subtasks: add, tick, retype, empty retype deletes, delete', () => {
  const s = withTasks('Renew passport');
  const id = s.tasks[0].id;
  const photos = addSubtask(s, id, '  Photos ');
  assert.equal(addSubtask(s, id, '   '), null);
  assert.equal(addSubtask(s, 'missing', 'x'), null);
  const form = addSubtask(s, id, 'Form');
  assert.deepEqual(s.tasks[0].subtasks.map(st => st.text), ['Photos', 'Form']);
  toggleSubtask(s, id, photos.id);
  assert.equal(s.tasks[0].subtasks[0].done, true);
  toggleSubtask(s, id, photos.id);
  assert.equal(s.tasks[0].subtasks[0].done, false);
  editSubtask(s, id, form.id, ' Fill the form ');
  assert.equal(s.tasks[0].subtasks[1].text, 'Fill the form');
  editSubtask(s, id, form.id, '  ');
  assert.deepEqual(s.tasks[0].subtasks.map(st => st.text), ['Photos']);
  deleteSubtask(s, id, photos.id);
  assert.deepEqual(s.tasks[0].subtasks, []);
});

test('viewTasks: each view, and search across tasks and subtasks', () => {
  const s = withTasks('overdue', 'today high', 'later', 'sooner', 'no date', 'done');
  const byText = Object.fromEntries(s.tasks.map(t => [t.text, t.id]));
  setDue(s, byText.overdue, '2026-10-10');
  setDue(s, byText['today high'], '2026-10-16');
  setPriority(s, byText['today high'], 'high');
  setDue(s, byText.later, '2026-10-30');
  setDue(s, byText.sooner, '2026-10-20');
  addSubtask(s, byText['no date'], 'Call the Bank');
  toggleTask(s, byText.done, at(2026, 10, 16));
  const today = '2026-10-16';
  const show = (view, query = '') => {
    const { open, finished } = viewTasks(s.tasks, view, query, today);
    return [open.map(t => t.text), finished.map(t => t.text)];
  };
  assert.deepEqual(show('all'), [['overdue', 'today high', 'later', 'sooner', 'no date'], ['done']]);
  assert.deepEqual(show('today'), [['overdue', 'today high'], []]);
  assert.deepEqual(show('upcoming'), [['sooner', 'later'], []]);
  assert.deepEqual(show('high'), [['today high'], []]);
  assert.deepEqual(show('today', 'bank'), [['no date'], []]);   // search ignores the view
  assert.deepEqual(show('all', '  DON '), [[], ['done']]);
  assert.deepEqual(show('all', 'zzz'), [[], []]);
});

test('todayCount counts unfinished tasks due today or earlier and flags overdue ones', () => {
  const s = withTasks('a', 'b', 'c');
  const [a, b, c] = s.tasks.map(t => t.id);
  assert.deepEqual(todayCount(s.tasks, '2026-10-16'), { count: 0, overdue: false });
  setDue(s, a, '2026-10-16');
  setDue(s, b, '2026-10-17');
  assert.deepEqual(todayCount(s.tasks, '2026-10-16'), { count: 1, overdue: false });
  setDue(s, c, '2026-10-01');
  assert.deepEqual(todayCount(s.tasks, '2026-10-16'), { count: 2, overdue: true });
  toggleTask(s, c, at(2026, 10, 16));
  assert.deepEqual(todayCount(s.tasks, '2026-10-16'), { count: 1, overdue: false });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- test/tasks.test.js`
Expected: FAIL — `REPEATS` and the other new exports are missing (SyntaxError on import).

- [ ] **Step 3: Implement in `js/tasks.js`**

Update the header comment to: `// Task list logic: timestamps, due dates, priorities, repeats, subtasks, ordering, views, a one-week history of finished tasks, and an all-time count of tasks completed per day (taskStats, kept forever for charts). Pure; called inside store.update().`

After `const DAY_MS = …` add:

```js
export const REPEATS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
export const VIEWS = ['all', 'today', 'upcoming', 'high'];
```

Move `fromDay` up to just below `dayKey`, and add the day arithmetic after it:

```js
const fromDay = day => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function addDays(day, n) {
  const d = fromDay(day);
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}

const isWeekend = day => [0, 6].includes(fromDay(day).getDay());

// The same day n months on, or that month's last day when it's shorter.
function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const last = new Date(y, m + n, 0).getDate();
  return dayKey(new Date(y, m - 1 + n, Math.min(d, last)).getTime());
}

function step(day, repeat) {
  if (repeat === 'daily') return addDays(day, 1);
  if (repeat === 'weekly') return addDays(day, 7);
  if (repeat === 'monthly') return addMonths(day, 1);
  if (repeat === 'yearly') return addMonths(day, 12);
  let next = addDays(day, 1);   // weekdays
  while (isWeekend(next)) next = addDays(next, 1);
  return next;
}

// The date a task that starts repeating today gets: today, or the coming Monday for weekdays.
export function firstDue(repeat, today) {
  let day = today;
  if (repeat === 'weekdays') while (isWeekend(day)) day = addDays(day, 1);
  return day;
}

// A repeating task's next date: one step on from its due date, then on until it's after today.
export function nextDue(day, repeat, today) {
  let next = step(day, repeat);
  while (next <= today) next = step(next, repeat);
  return next;
}
```

Change `archive` so a history entry can carry its own id:

```js
function archive(s, task, now) {
  s.taskHistory.push({ id: task.id, text: task.text, createdAt: task.createdAt, doneAt: task.doneAt, clearedAt: now });
}
```

(unchanged — the repeating tick passes a copy with a fresh id.)

Replace `addTask` and `toggleTask`:

```js
export function addTask(s, text, now, { priority = null, due = null, repeat = null } = {}) {
  const task = {
    id: uid(), text, done: false, createdAt: now, doneAt: null,
    due: isDay(due) ? due : null,
    priority: PRIORITIES.includes(priority) ? priority : null,
    repeat: REPEATS.includes(repeat) ? repeat : null,
    subtasks: [],
  };
  if (task.repeat && !task.due) task.due = firstDue(task.repeat, dayKey(now));
  s.tasks.push(task);
  return task;
}

// A task counts on the day it is ticked; unticking takes that count back. A repeating task
// doesn't stay ticked: a copy goes to the history and the task moves on to its next date.
export function toggleTask(s, id, now) {
  const task = find(s, id);
  if (!task) return;
  if (task.done) {
    if (task.doneAt != null) count(s, task.doneAt, -1);
    task.done = false;
    task.doneAt = null;
  } else if (task.repeat && task.due) {
    count(s, now, 1);
    archive(s, { ...task, id: uid(), doneAt: now }, now);
    task.due = nextDue(task.due, task.repeat, dayKey(now));
    task.subtasks.forEach(st => { st.done = false; });
  } else {
    task.done = true;
    task.doneAt = now;
    count(s, now, 1);
  }
}
```

Move `const find = (s, id) => s.tasks.find(t => t.id === id);` above `addTask` (it is used by `toggleTask` and `deleteTask` too; switch `deleteTask`'s lookup to `find(s, id)`).

Replace `setDue` and add `setRepeat` after `setPriority`:

```js
// day is 'YYYY-MM-DD' or null. A repeat needs a date, so clearing the date ends it.
export function setDue(s, id, day) {
  const task = find(s, id);
  if (!task || !(day === null || isDay(day))) return;
  task.due = day;
  if (!day) task.repeat = null;
}

// Starting a repeat on an undated task dates it.
export function setRepeat(s, id, repeat, now) {
  const task = find(s, id);
  if (!task || !(repeat === null || REPEATS.includes(repeat))) return;
  task.repeat = repeat;
  if (repeat && !task.due) task.due = firstDue(repeat, dayKey(now));
}
```

Add the subtask functions after `editTask`:

```js
const findSub = (s, id, subId) => find(s, id)?.subtasks.find(st => st.id === subId);

export function addSubtask(s, id, text) {
  const task = find(s, id);
  const next = String(text ?? '').trim();
  if (!task || !next) return null;
  const sub = { id: uid(), text: next, done: false };
  task.subtasks.push(sub);
  return sub;
}

export function toggleSubtask(s, id, subId) {
  const sub = findSub(s, id, subId);
  if (sub) sub.done = !sub.done;
}

export function deleteSubtask(s, id, subId) {
  const task = find(s, id);
  if (task) task.subtasks = task.subtasks.filter(st => st.id !== subId);
}

// Emptying a subtask's text deletes it.
export function editSubtask(s, id, subId, text) {
  const next = String(text ?? '').trim();
  if (!next) return deleteSubtask(s, id, subId);
  const sub = findSub(s, id, subId);
  if (sub) sub.text = next;
}
```

Append the views:

```js
// What a view shows: unfinished tasks in display order, and finished ones (All and search only).
// A search looks through every task's text and its subtasks', whatever the view.
export function viewTasks(tasks, view, query, today) {
  const q = query.trim().toLowerCase();
  if (q) {
    const found = tasks.filter(t => [t.text, ...t.subtasks.map(st => st.text)].some(x => x.toLowerCase().includes(q)));
    return { open: found.filter(t => !t.done), finished: found.filter(t => t.done) };
  }
  const open = tasks.filter(t => !t.done);
  if (view === 'today') return { open: open.filter(t => t.due && t.due <= today), finished: [] };
  if (view === 'upcoming') return { open: open.filter(t => t.due && t.due > today).sort((a, b) => a.due.localeCompare(b.due)), finished: [] };
  if (view === 'high') return { open: open.filter(t => t.priority === 'high'), finished: [] };
  return { open, finished: tasks.filter(t => t.done) };
}

// Unfinished tasks due today or earlier, for the Today tab's count.
export function todayCount(tasks, today) {
  const due = tasks.filter(t => !t.done && t.due && t.due <= today);
  return { count: due.length, overdue: due.some(t => t.due < today) };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- test/tasks.test.js`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add js/tasks.js test/tasks.test.js
git commit -m "feat: tasks.js: repeating tasks move on to their next date when ticked, subtasks, and the All / Today / Upcoming / High views with search"
```

---

### Task 2: Quick-add shorthand parser

**Files:**
- Create: `js/task-parse.js`
- Test: `test/task-parse.test.js`

**Interfaces:**
- Consumes: `dayKey`, `isDay`, `addDays` from `js/tasks.js`.
- Produces: `parseTask(text, now)` → `{ text, priority, due, repeat }`. `due` stays `null` for a repeat with no date (`addTask` dates it).

- [ ] **Step 1: Write the failing tests** — create `test/task-parse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTask } from '../js/task-parse.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 16);   // Friday 16 October 2026
const parse = (text, now = NOW) => parseTask(text, now);
const plain = text => ({ text, priority: null, due: null, repeat: null });

test('importance anywhere, any case; the last one wins', () => {
  assert.deepEqual(parse('Call !h the bank !low'), { text: 'Call the bank', priority: 'low', due: null, repeat: null });
  for (const [word, level] of [['!high', 'high'], ['!1', 'high'], ['!MED', 'medium'], ['!m', 'medium'], ['!2', 'medium'], ['!medium', 'medium'], ['!l', 'low'], ['!3', 'low']]) {
    assert.equal(parse(`Task ${word}`).priority, level, word);
  }
  assert.deepEqual(parse('Wow!h nice'), plain('Wow!h nice'));
});

test('dates at the end', () => {
  const due = text => parse(`Call bank ${text}`).due;
  assert.equal(due('today'), '2026-10-16');
  assert.equal(due('TOMORROW'), '2026-10-17');
  assert.equal(due('tmr'), '2026-10-17');
  assert.equal(due('tmrw'), '2026-10-17');
  assert.equal(due('mon'), '2026-10-19');
  assert.equal(due('thurs'), '2026-10-22');
  assert.equal(due('fri'), '2026-10-23');        // today is Friday: a week on
  assert.equal(due('friday'), '2026-10-23');
  assert.equal(due('next week'), '2026-10-19');
  assert.equal(due('in 3 days'), '2026-10-19');
  assert.equal(due('in 1 day'), '2026-10-17');
  assert.equal(due('in 2 weeks'), '2026-10-30');
  assert.equal(due('oct 30'), '2026-10-30');
  assert.equal(due('30 oct'), '2026-10-30');
  assert.equal(due('october 16'), '2026-10-16');  // today counts
  assert.equal(due('oct 15'), '2027-10-15');      // passed: next year
  assert.equal(due('sept 3'), '2027-09-03');
  assert.equal(due('2026-12-01'), '2026-12-01');
  assert.equal(parse('Call bank tomorrow').text, 'Call bank');
});

test('impossible dates and lookalikes are not shorthand', () => {
  assert.deepEqual(parse('Plan feb 30'), plain('Plan feb 30'));
  assert.deepEqual(parse('Plan 2026-02-30'), plain('Plan 2026-02-30'));
  assert.deepEqual(parse('Rest in 0 days'), plain('Rest in 0 days'));
  assert.deepEqual(parse('Read about constructor'), plain('Read about constructor'));
});

test('repeats at the end', () => {
  const rep = text => { const p = parse(`Gym ${text}`); return [p.repeat, p.due]; };
  assert.deepEqual(rep('daily'), ['daily', null]);
  assert.deepEqual(rep('every day'), ['daily', null]);
  assert.deepEqual(rep('weekdays'), ['weekdays', null]);
  assert.deepEqual(rep('every weekday'), ['weekdays', null]);
  assert.deepEqual(rep('weekly'), ['weekly', null]);
  assert.deepEqual(rep('every week'), ['weekly', null]);
  assert.deepEqual(rep('monthly'), ['monthly', null]);
  assert.deepEqual(rep('every month'), ['monthly', null]);
  assert.deepEqual(rep('yearly'), ['yearly', null]);
  assert.deepEqual(rep('every year'), ['yearly', null]);
  assert.deepEqual(rep('every monday'), ['weekly', '2026-10-19']);
  assert.deepEqual(rep('every fri'), ['weekly', '2026-10-23']);
  assert.deepEqual(rep('weekly fri'), ['weekly', '2026-10-23']);
  assert.deepEqual(rep('fri weekly'), ['weekly', '2026-10-23']);
});

test('only the end is read: a word that isn’t shorthand stops it', () => {
  assert.deepEqual(parse('Watch Friday night lights'), plain('Watch Friday night lights'));
  assert.deepEqual(parse('Call mom friday !high'), { text: 'Call mom', priority: 'high', due: '2026-10-23', repeat: null });
  assert.deepEqual(parse('Pay 3 tomorrow'), { text: 'Pay 3', priority: null, due: '2026-10-17', repeat: null });
});

test('a second date or repeat ends the reading and stays in the text', () => {
  assert.deepEqual(parse('Pay today tomorrow'), { text: 'Pay today', priority: null, due: '2026-10-17', repeat: null });
  assert.deepEqual(parse('Gym daily weekly'), { text: 'Gym daily', priority: null, due: null, repeat: 'weekly' });
  assert.deepEqual(parse('Gym every friday tomorrow'), { text: 'Gym every friday', priority: null, due: '2026-10-17', repeat: null });
});

test('when nothing would be left, nothing is read', () => {
  assert.deepEqual(parse('tomorrow'), plain('tomorrow'));
  assert.deepEqual(parse('  !high  '), plain('!high'));
  assert.deepEqual(parse('every day'), plain('every day'));
  assert.deepEqual(parse('   '), plain(''));
});

test('spaces are tidied in the text that is left', () => {
  assert.equal(parse('  Call   the  bank   tomorrow ').text, 'Call the bank');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test -- test/task-parse.test.js`
Expected: FAIL — `Cannot find module '../js/task-parse.js'`.

- [ ] **Step 3: Create `js/task-parse.js`**

```js
// Quick-add shorthand for the Tasks add bar: "Call bank !high tomorrow" → text, importance, due
// date and repeat. Importance words count anywhere; date and repeat phrases only at the end, so
// "Watch Friday night lights" stays as typed. English only. Pure (unit-tested in Node).

import { dayKey, isDay, addDays } from './tasks.js';

const LEVELS = {
  '!high': 'high', '!h': 'high', '!1': 'high',
  '!medium': 'medium', '!med': 'medium', '!m': 'medium', '!2': 'medium',
  '!low': 'low', '!l': 'low', '!3': 'low',
};
const DAYS = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const REPEAT_WORDS = { daily: 'daily', weekdays: 'weekdays', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' };
const EVERY = { day: 'daily', weekday: 'weekdays', week: 'weekly', month: 'monthly', year: 'yearly' };
const TOMORROW = ['tomorrow', 'tmr', 'tmrw'];
const UNITS = { day: 1, days: 1, week: 7, weeks: 7 };

// Own keys only, so words like "constructor" never match.
const get = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);

// A real calendar day, so 2026-02-30 isn't one.
const realDay = word => isDay(word) && dayKey(new Date(word + 'T00:00').getTime()) === word;

export function parseTask(input, now) {
  const today = dayKey(now);
  const weekday = new Date(now).getDay();
  // The coming such weekday; a week on when it's that day today.
  const coming = wd => addDays(today, ((wd - weekday + 6) % 7) + 1);
  // The next time a month and day come round, today included.
  const monthDay = (month, dayWord) => {
    if (!/^\d{1,2}$/.test(dayWord ?? '')) return null;
    const year = new Date(now).getFullYear();
    for (const y of [year, year + 1]) {
      const date = new Date(y, month, Number(dayWord));
      const key = dayKey(date.getTime());
      if (date.getMonth() === month && key >= today) return key;
    }
    return null;
  };

  // The phrase ending the word list: { length, due?, repeat? }, or null.
  function phraseAtEnd(w) {
    const [a, b, c] = w.slice(-3);
    if (w.length >= 3 && a === 'in' && /^\d+$/.test(b) && Number(b) >= 1 && get(UNITS, c)) {
      return { length: 3, due: addDays(today, Number(b) * get(UNITS, c)) };
    }
    if (w.length >= 2) {
      const [x, y] = w.slice(-2);
      if (x === 'next' && y === 'week') return { length: 2, due: coming(1) };
      if (x === 'every' && get(EVERY, y)) return { length: 2, repeat: get(EVERY, y) };
      if (x === 'every' && get(DAYS, y) !== undefined) return { length: 2, repeat: 'weekly', due: coming(get(DAYS, y)) };
      const md = get(MONTHS, x) !== undefined ? monthDay(get(MONTHS, x), y)
        : get(MONTHS, y) !== undefined ? monthDay(get(MONTHS, y), x) : null;
      if (md) return { length: 2, due: md };
    }
    const z = w.at(-1);
    if (z === 'today') return { length: 1, due: today };
    if (TOMORROW.includes(z)) return { length: 1, due: addDays(today, 1) };
    if (get(DAYS, z) !== undefined) return { length: 1, due: coming(get(DAYS, z)) };
    if (get(REPEAT_WORDS, z)) return { length: 1, repeat: get(REPEAT_WORDS, z) };
    if (realDay(z)) return { length: 1, due: z };
    return null;
  }

  const plain = { text: input.trim().split(/\s+/).join(' '), priority: null, due: null, repeat: null };
  let priority = null;
  const words = [];
  for (const word of plain.text.split(' ')) {
    const level = get(LEVELS, word.toLowerCase());
    if (level) priority = level;
    else if (word) words.push(word);
  }

  let end = words.length;
  let due = null;
  let repeat = null;
  while (end > 0) {
    const m = phraseAtEnd(words.slice(0, end).map(w => w.toLowerCase()));
    if (!m || (m.due && due) || (m.repeat && repeat)) break;
    due = m.due ?? due;
    repeat = m.repeat ?? repeat;
    end -= m.length;
  }

  const text = words.slice(0, end).join(' ');
  return text ? { text, priority, due, repeat } : plain;
}
```

Note: `'   '.trim().split(/\s+/)` is `['']`, so `plain.text` is `''`; `words` stays empty and `plain` is returned.

- [ ] **Step 4: Run to see it pass**

Run: `npm test -- test/task-parse.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/task-parse.js test/task-parse.test.js
git commit -m "feat: task-parse.js reads quick-add shorthand: !high anywhere, dates and repeats at the end"
```

---

### Task 3: Saved data and widget settings

**Files:**
- Modify: `js/store.js` (task normalising, around line 127)
- Modify: `js/layout.js:39` (the `tasks` type)
- Test: `test/store.test.js`, `test/layout.test.js`

**Interfaces:**
- Consumes: `REPEATS`, `VIEWS`, `isDay` from `js/tasks.js`.
- Produces: tasks from storage always have `repeat` and `subtasks`; a Tasks layout copy's `settings` is `{ view, showDone }`.

- [ ] **Step 1: Write the failing tests**

In `test/store.test.js`, in `normalizeState keeps task timestamps, history and daily counts, dropping junk`, change the expected tasks to:

```js
  assert.deepEqual(s.tasks, [
    { id: 't', text: 'a', done: true, createdAt: 5, doneAt: 9, due: null, priority: null, repeat: null, subtasks: [] },
    { id: 'u', text: 'old task', done: false, createdAt: null, doneAt: null, due: null, priority: null, repeat: null, subtasks: [] },
  ]);
```

and add after `normalizeState keeps valid due dates and priorities and drops invalid ones`:

```js
test('normalizeState keeps repeats that have a date and cleans subtasks', () => {
  const s = normalizeState({
    tasks: [
      { id: 'a', text: 'a', due: '2026-10-20', repeat: 'weekly', subtasks: [{ id: 's1', text: 'one', done: true }, { text: 'two' }, { text: '  ' }, { text: 3 }, 'junk'] },
      { id: 'b', text: 'b', repeat: 'daily' },
      { id: 'c', text: 'c', due: '2026-10-20', repeat: 'hourly', subtasks: 'nope' },
    ],
  });
  assert.deepEqual(s.tasks.map(t => t.repeat), ['weekly', null, null]);
  assert.deepEqual(s.tasks[0].subtasks.map(st => [st.text, st.done]), [['one', true], ['two', false]]);
  assert.equal(s.tasks[0].subtasks[0].id, 's1');
  assert.equal(typeof s.tasks[0].subtasks[1].id, 'string');
  assert.deepEqual(s.tasks[2].subtasks, []);
});
```

In `test/layout.test.js`, after the `prefsSection says where…` test, add:

```js
test('Tasks: a view and whether Finished is open, cleaned to valid values', () => {
  assert.deepEqual(TYPES.tasks.defaults(), { view: 'all', showDone: false });
  assert.deepEqual(TYPES.tasks.clean({}), { view: 'all', showDone: false });
  assert.deepEqual(TYPES.tasks.clean({ view: 'upcoming', showDone: true }), { view: 'upcoming', showDone: true });
  assert.deepEqual(TYPES.tasks.clean({ view: 'someday', showDone: 'yes' }), { view: 'all', showDone: false });
});
```

(If `TYPES` isn't already imported in `test/layout.test.js`, add it to the import from `../js/layout.js`.)

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- test/store.test.js test/layout.test.js`
Expected: FAIL — tasks lack `repeat`/`subtasks`; Tasks defaults are `{}`.

- [ ] **Step 3: Implement**

`js/store.js` — change the import to `import { isDay, PRIORITIES, REPEATS } from './tasks.js';` and the task mapping to:

```js
    .map(t => ({
      id: str(t.id) || uid(),
      text: t.text,
      done: !!t.done,
      createdAt: time(t.createdAt),
      doneAt: t.done ? time(t.doneAt) : null,
      due: isDay(t.due) ? t.due : null,
      priority: PRIORITIES.includes(t.priority) ? t.priority : null,
      repeat: REPEATS.includes(t.repeat) && isDay(t.due) ? t.repeat : null,
      subtasks: (Array.isArray(t.subtasks) ? t.subtasks : [])
        .filter(st => isObj(st) && typeof st.text === 'string' && st.text.trim())
        .map(st => ({ id: str(st.id) || uid(), text: st.text, done: !!st.done })),
    }));
```

`js/layout.js` — add `import { VIEWS as TASK_VIEWS } from './tasks.js';` with the other imports, and replace the `tasks:` line with:

```js
  tasks: {
    label: 'Tasks', icon: 'check-circle', size: [3, 4], min: [2, 3], max: 1, prefs: null,
    defaults: () => ({ view: 'all', showDone: false }),
    clean: s => ({ view: TASK_VIEWS.includes(s.view) ? s.view : 'all', showDone: bool(s.showDone, false) }),
  },
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, every file.

- [ ] **Step 5: Commit**

```bash
git add js/store.js js/layout.js test/store.test.js test/layout.test.js
git commit -m "feat: saved tasks keep repeats and subtasks; the Tasks widget remembers its view and whether Finished is open"
```

---

### Task 4: The row and its tray (`task-row.js`)

**Files:**
- Create: `js/task-row.js`
- Modify: `js/ui.js` (ICONS: `flag`, `repeat`)

**Interfaces:**
- Consumes: from `js/tasks.js`: `toggleTask`, `deleteTask`, `setDue`, `setPriority`, `setRepeat`, `editTask`, `addSubtask`, `toggleSubtask`, `editSubtask`, `deleteSubtask`, `dueLabel`, `dayKey`, `addDays`, `PRIORITIES`, `REPEATS`; from `js/ui.js`: `el`, `icon`, `showMenu`.
- Produces:
  - `PRIORITY_LABEL` = `{ high: 'High', medium: 'Medium', low: 'Low' }`
  - `priorityMenu(button, current, pick)` — opens the High/Medium/Low/None menu under `button`; `pick(level | null)`.
  - `taskRow(task, ctx)` → `<li class="task …" data-id>`. `ctx = { store, ui, render, now, today, draggable }`; `ui = { editing, draft, openId, rolledId, focus, rendering }` where `editing` is `null`, `'task:<id>'` or `'sub:<id>:<subId>'`, `draft` the text typed so far, `openId` the task whose tray is open, `rolledId` a repeating task just ticked (its due label flashes once), `focus` a `data-focus` key to focus after the next render, `rendering` true while the widget rebuilds the list.
  - Every focusable control has a unique `data-focus` key so the widget can keep focus across renders; the text being edited is `data-focus="edit"`.

- [ ] **Step 1: Add the icons** — in `js/ui.js` `ICONS`, after `circle:` add:

```js
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>',
  repeat: '<path d="M17 2.5 20 5.5l-3 3"/><path d="M4 11.5v-1a5 5 0 0 1 5-5h11"/><path d="m7 21.5-3-3 3-3"/><path d="M20 12.5v1a5 5 0 0 1-5 5H4"/>',
```

- [ ] **Step 2: Create `js/task-row.js`**

```js
// One task row and, when open, its details tray. The widget rebuilds rows on every render;
// what isn't in the store (the text being retyped, the open tray, focus) lives in ctx.ui.

import { el, icon, showMenu } from './ui.js';
import {
  toggleTask, deleteTask, setDue, setPriority, setRepeat, editTask,
  addSubtask, toggleSubtask, editSubtask, deleteSubtask, dueLabel, dayKey, addDays, PRIORITIES, REPEATS,
} from './tasks.js';

export const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };
const REPEAT_LABEL = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const REPEAT_TITLE = { daily: 'Repeats every day', weekdays: 'Repeats every weekday', weekly: 'Repeats every week', monthly: 'Repeats every month', yearly: 'Repeats every year' };

const longDate = day => new Date(day + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = ms => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// The High / Medium / Low / None menu, under the button that opened it.
export function priorityMenu(button, current, pick) {
  const r = button.getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, [
    { heading: 'Importance' },
    ...[...PRIORITIES, null].map(level => ({
      label: level ? PRIORITY_LABEL[level] : 'None',
      icon: level ? 'flag' : 'circle',
      className: level ? `prio-${level}` : '',
      checked: current === level,
      action: () => pick(level),
    })),
  ]);
}

export function taskRow(task, ctx) {
  const { store, ui, render, now, today } = ctx;
  const update = fn => store.update(fn);
  const open = ui.openId === task.id;
  const toggleTray = () => {
    ui.openId = open ? null : task.id;
    ui.focus = `more:${task.id}`;
    render();
  };

  // Text that turns into an input when clicked: Enter or clicking away saves, Esc cancels.
  function editable(key, text, className, save) {
    if (ui.editing !== key) {
      return el('span', {
        class: className,
        dir: 'auto',
        text,
        title: 'Click to edit',
        onclick: () => {
          ui.editing = key;
          ui.draft = text;
          ui.focus = 'edit';
          ui.select = true;
          render();
        },
      });
    }
    const finish = value => {
      if (ui.editing !== key) return;   // Enter already saved; this is the blur that follows
      ui.editing = null;
      ui.draft = '';
      if (value != null) update(s => save(s, value));
      render();
    };
    const input = el('input', {
      class: 'task-edit',
      type: 'text',
      value: ui.draft,
      dir: 'auto',
      maxLength: 300,
      'aria-label': 'Edit text',
      dataset: { focus: 'edit' },
      oninput: () => { ui.draft = input.value; },
      onkeydown: e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      },
      // The widget rebuilding the list also blurs the input; that isn't the user leaving it.
      onblur: () => { if (!ui.rendering) finish(input.value); },
    });
    return input;
  }

  const due = task.due && dueLabel(task.due, now);
  const subsDone = task.subtasks.filter(st => st.done).length;

  const flag = el('button', {
    type: 'button',
    class: 'task-flag' + (task.priority ? ` prio-${task.priority}` : ' unset'),
    title: task.priority ? `${PRIORITY_LABEL[task.priority]} importance` : 'Set importance',
    'aria-label': task.priority ? `${PRIORITY_LABEL[task.priority]} importance` : 'Set importance',
    dataset: { focus: `flag:${task.id}` },
    onclick: () => priorityMenu(flag, task.priority, level => update(s => setPriority(s, task.id, level))),
  }, icon('flag', 14));

  const line = el('div', { class: 'task-line', draggable: ctx.draggable && ui.editing !== `task:${task.id}` },
    el('button', {
      class: 'task-check',
      type: 'button',
      role: 'checkbox',
      'aria-checked': String(task.done),
      'aria-label': task.done ? 'Mark as not done' : 'Mark as done',
      dataset: { focus: `check:${task.id}` },
      onclick: () => {
        ui.rolledId = task.repeat && !task.done ? task.id : null;
        update(s => toggleTask(s, task.id, Date.now()));
      },
    }, task.done && icon('check', 12)),
    editable(`task:${task.id}`, task.text, 'task-text', (s, value) => editTask(s, task.id, value)),
    task.repeat && el('span', { class: 'task-repeat', title: REPEAT_TITLE[task.repeat] }, icon('repeat', 13)),
    task.subtasks.length > 0 && el('button', {
      type: 'button',
      class: 'task-subs',
      title: 'Subtasks',
      dataset: { focus: `subs:${task.id}` },
      onclick: toggleTray,
    }, icon('check', 12), `${subsDone}/${task.subtasks.length}`),
    flag,
    due && el('button', {
      type: 'button',
      class: 'task-due' + (due.overdue && !task.done ? ' overdue' : ''),
      text: due.text,
      title: `Due ${longDate(task.due)}`,
      dataset: { focus: `due:${task.id}` },
      onclick: toggleTray,
    }),
    el('button', {
      type: 'button',
      class: 'task-more icon-btn',
      title: open ? 'Close details' : 'Details',
      'aria-label': open ? 'Close details' : 'Details',
      'aria-expanded': String(open),
      dataset: { focus: `more:${task.id}` },
      onclick: toggleTray,
    }, icon('caret', 16)));

  return el('li', {
    class: 'task' + (task.done ? ' done' : '') + (open ? ' open' : '') + (ui.rolledId === task.id ? ' rolled' : ''),
    dataset: { id: task.id },
    oncontextmenu: e => {
      e.preventDefault();
      if (!open) toggleTray();
    },
  }, line, open && tray(task, ctx, editable, toggleTray));
}

function tray(task, ctx, editable, toggleTray) {
  const { store, ui, render, today } = ctx;
  const update = fn => store.update(fn);
  const row = (label, ...controls) => [el('span', { class: 'tray-label', text: label }), el('div', { class: 'tray-chips' }, ...controls)];
  const chip = (label, pressed, focus, onclick, extra = {}) => el('button', {
    type: 'button', class: 'tray-chip' + (extra.className ? ' ' + extra.className : ''), 'aria-pressed': String(pressed), dataset: { focus }, onclick,
  }, extra.icon, label);

  const tomorrow = addDays(today, 1);
  const date = el('input', {
    type: 'date',
    class: 'tray-date',
    value: task.due ?? '',
    'aria-label': 'Due date',
    dataset: { focus: `date:${task.id}` },
    onchange: () => { if (date.value) update(s => setDue(s, task.id, date.value)); },
  });
  const repeat = el('select', {
    class: 'tray-select',
    'aria-label': 'Repeat',
    dataset: { focus: `repeat:${task.id}` },
    onchange: () => update(s => setRepeat(s, task.id, repeat.value || null, Date.now())),
  }, el('option', { value: '', text: 'Never' }), REPEATS.map(r => el('option', { value: r, text: REPEAT_LABEL[r] })));
  repeat.value = task.repeat ?? '';

  const subAdd = el('input', {
    type: 'text',
    placeholder: 'Add a subtask',
    dir: 'auto',
    maxLength: 300,
    'aria-label': 'Add a subtask',
    dataset: { focus: `sub-add:${task.id}` },
    onkeydown: e => {
      if (e.key !== 'Enter' || !subAdd.value.trim()) return;
      ui.focus = `sub-add:${task.id}`;
      update(s => { addSubtask(s, task.id, subAdd.value); });
    },
  });

  const subs = el('ul', { class: 'sub-list' },
    task.subtasks.map(st => el('li', { class: 'sub' + (st.done ? ' done' : '') },
      el('button', {
        type: 'button',
        class: 'sub-check',
        role: 'checkbox',
        'aria-checked': String(st.done),
        'aria-label': st.done ? 'Mark subtask as not done' : 'Mark subtask as done',
        dataset: { focus: `sub-check:${task.id}:${st.id}` },
        onclick: () => update(s => toggleSubtask(s, task.id, st.id)),
      }, st.done && icon('check', 10)),
      editable(`sub:${task.id}:${st.id}`, st.text, 'sub-text', (s, value) => editSubtask(s, task.id, st.id, value)),
      el('button', {
        type: 'button',
        class: 'sub-del icon-btn',
        title: 'Delete subtask',
        'aria-label': 'Delete subtask',
        dataset: { focus: `sub-del:${task.id}:${st.id}` },
        onclick: () => {
          ui.focus = `sub-add:${task.id}`;
          update(s => deleteSubtask(s, task.id, st.id));
        },
      }, icon('x', 12)))),
    el('li', { class: 'sub-add' }, icon('plus', 12), subAdd));

  return el('div', {
    class: 'task-tray',
    onkeydown: e => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      toggleTray();
    },
  },
    row('Importance', [...PRIORITIES, null].map(level => chip(
      level ? PRIORITY_LABEL[level] : 'None',
      task.priority === level,
      `prio:${task.id}:${level ?? 'none'}`,
      () => update(s => setPriority(s, task.id, level)),
      { className: level ? `prio-${level}` : '', icon: level ? icon('flag', 12) : null },
    ))),
    row('Due',
      chip('Today', task.due === today, `due-today:${task.id}`, () => update(s => setDue(s, task.id, today))),
      chip('Tomorrow', task.due === tomorrow, `due-tomorrow:${task.id}`, () => update(s => setDue(s, task.id, tomorrow))),
      date,
      task.due && el('button', {
        type: 'button',
        class: 'icon-btn tray-clear',
        title: task.repeat ? 'Clear the date (ends the repeat)' : 'Clear the date',
        'aria-label': 'Clear the date',
        dataset: { focus: `due-clear:${task.id}` },
        onclick: () => update(s => setDue(s, task.id, null)),
      }, icon('x', 12))),
    row('Repeat', repeat),
    el('span', { class: 'tray-label tray-label-top', text: 'Subtasks' }),
    subs,
    el('div', { class: 'tray-foot' },
      el('span', { text: task.createdAt ? `Added ${shortDate(task.createdAt)}` : '' }),
      el('button', {
        type: 'button',
        class: 'link-btn tray-delete',
        text: 'Delete',
        dataset: { focus: `delete:${task.id}` },
        onclick: () => {
          ui.openId = null;
          update(s => deleteTask(s, task.id, Date.now()));
        },
      })));
}
```

`dayKey` is imported for symmetry with the widget but unused here — drop it from the import list if your editor flags it. (Final import list: `toggleTask, deleteTask, setDue, setPriority, setRepeat, editTask, addSubtask, toggleSubtask, editSubtask, deleteSubtask, dueLabel, addDays, PRIORITIES, REPEATS`.)

- [ ] **Step 3: Syntax check**

Run: `node --check js/task-row.js && node --check js/ui.js && npm test`
Expected: no output from the checks; the suite passes (nothing imports `task-row.js` yet).

- [ ] **Step 4: Commit**

```bash
git add js/task-row.js js/ui.js
git commit -m "feat: task-row.js: a task row with a flag, retype in place and a details tray for importance, due date, repeat and subtasks"
```

---

### Task 5: The widget frame (`task-widget.js`)

**Files:**
- Modify (rewrite): `js/task-widget.js`

**Interfaces:**
- Consumes: `taskRow`, `priorityMenu`, `PRIORITY_LABEL` from `js/task-row.js`; `parseTask` from `js/task-parse.js`; from `js/tasks.js`: `addTask`, `clearDone`, `pruneHistory`, `moveTask`, `sortTasks`, `viewTasks`, `todayCount`, `dueLabel`, `dayKey`, `addDays`, `isDay`, `firstDue`; `copyById`, `TYPES` from `js/layout.js`; `el`, `icon`, `showMenu`, `openDialog`, `field`, `widgetEmpty` from `js/ui.js`.
- Produces: `mountTasks(root, store, copy)` → `{ destroy() }` (the registry already passes `copy`).

- [ ] **Step 1: Replace `js/task-widget.js`**

```js
// Tasks widget: tabs (All, Today, Upcoming, High), search, rows with a flag and a details tray
// (task-row.js), an add bar that reads quick-add shorthand (task-parse.js), finished tasks folded
// at the bottom of All, and drag to reorder.

import { el, icon, showMenu, openDialog, field, widgetEmpty } from './ui.js';
import { copyById, TYPES } from './layout.js';
import {
  addTask, clearDone, pruneHistory, moveTask, sortTasks, viewTasks, todayCount,
  dueLabel, dayKey, addDays, isDay, firstDue,
} from './tasks.js';
import { parseTask } from './task-parse.js';
import { taskRow, priorityMenu, PRIORITY_LABEL } from './task-row.js';

// Own drag type, so the tile grid and group tabs ignore dragged tasks.
const TASK_MIME = 'application/x-newtab-task';
const TABS = [
  { view: 'all', label: 'All' },
  { view: 'today', label: 'Today' },
  { view: 'upcoming', label: 'Upcoming' },
  { view: 'high', label: 'High', icon: 'flag' },
];
const EMPTY = { today: 'Nothing due today', upcoming: 'Nothing coming up', high: 'No high-importance tasks' };

// What the add bar starts with in each view, so a new task stays in sight.
function preset(view) {
  const today = dayKey(Date.now());
  return {
    priority: view === 'high' ? 'high' : null,
    due: view === 'today' ? today : view === 'upcoming' ? addDays(today, 1) : null,
  };
}

export function mountTasks(root, store, copy) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.tasks.defaults();
  const setSetting = (key, value) => store.update(s => {
    const own = copyById(s, copy.id);
    if (own) own.settings[key] = value;
  });

  const ui = { editing: null, draft: '', openId: null, rolledId: null, focus: null, select: false, rendering: false };
  let searching = false;
  let query = '';
  let shownView = null;
  let shownDay = '';
  let draft = preset('all');   // the add bar's own choices
  let dragId = null;
  let marked = null;   // the row showing a drop line

  // ---- heading: search, tabs, Sort ----

  const searchButton = el('button', {
    type: 'button',
    class: 'icon-btn task-search-btn',
    title: 'Search tasks',
    'aria-label': 'Search tasks',
    onclick: () => openSearch(),
  }, icon('search', 16));
  const counts = new Map();
  const tabButtons = TABS.map(t => {
    const count = el('span', { class: 'task-count', hidden: true });
    counts.set(t.view, count);
    return el('button', {
      type: 'button',
      class: 'task-tab',
      dataset: { view: t.view },
      onclick: () => setSetting('view', t.view),
    }, t.icon && icon(t.icon, 12), t.label, count);
  });
  const sortButton = el('button', {
    type: 'button',
    class: 'link-btn',
    text: 'Sort',
    title: 'Sort by due date, then importance',
    onclick: () => store.update(sortTasks),
  });
  const tabs = el('div', { class: 'task-tabs', role: 'group', 'aria-label': 'Show' }, tabButtons, sortButton);

  const searchInput = el('input', {
    type: 'search',
    placeholder: 'Search tasks',
    'aria-label': 'Search tasks',
    oninput: () => {
      query = searchInput.value;
      render();
    },
    onkeydown: e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      }
    },
  });
  const searchBar = el('div', { class: 'task-search', hidden: true },
    icon('search', 14), searchInput,
    el('button', { type: 'button', class: 'icon-btn', title: 'Close search', 'aria-label': 'Close search', onclick: () => closeSearch() }, icon('x', 12)));

  function openSearch() {
    searching = true;
    render();
    searchInput.focus();
  }
  function closeSearch() {
    searching = false;
    query = '';
    searchInput.value = '';
    render();
    searchButton.focus();
  }

  // ---- list, empty line, Finished fold ----

  const list = el('ul', { class: 'task-list' });
  const empty = widgetEmpty();
  const foldButton = el('button', {
    type: 'button',
    class: 'task-fold',
    onclick: () => setSetting('showDone', !settings().showDone),
  });
  const clearButton = el('button', {
    type: 'button',
    class: 'link-btn',
    text: 'Clear',
    title: 'Remove finished tasks (kept in history for a week)',
    onclick: () => store.update(s => { clearDone(s, Date.now()); }),
  });
  const foldHead = el('div', { class: 'task-fold-head' }, foldButton, clearButton);
  const doneList = el('ul', { class: 'task-list task-done-list' });

  // ---- add bar ----

  const input = el('input', {
    class: 'task-input',
    type: 'text',
    placeholder: 'Add a task',
    dir: 'auto',
    maxLength: 300,
    'aria-label': 'Add a task',
    oninput: () => showDraft(),
    onkeydown: e => {
      if (e.key !== 'Enter') return;
      const next = planned();
      if (!next.text) return;
      input.value = '';
      draft = preset(settings().view);
      showDraft();
      store.update(s => { addTask(s, next.text, Date.now(), next); });
    },
  });
  const flagButton = el('button', {
    type: 'button',
    class: 'task-add-btn',
    onclick: () => priorityMenu(flagButton, planned().priority, level => {
      draft.priority = level;
      showDraft();
      input.focus();
    }),
  });
  const dateButton = el('button', {
    type: 'button',
    class: 'task-add-btn',
    onclick: () => {
      const r = dateButton.getBoundingClientRect();
      const set = day => () => {
        draft.due = day;
        showDraft();
        input.focus();
      };
      const today = dayKey(Date.now());
      showMenu(r.left, r.bottom + 4, [
        { label: 'Today', icon: 'calendar', action: set(today) },
        { label: 'Tomorrow', icon: 'calendar', action: set(addDays(today, 1)) },
        { label: 'Pick a date…', icon: 'calendar', action: pickDate },
        { label: 'No date', icon: 'x', action: set(null) },
      ]);
    },
  });

  async function pickDate() {
    const date = el('input', { type: 'date', value: draft.due ?? dayKey(Date.now()) });
    const ok = await openDialog({
      title: 'Due date',
      body: [field('Date', date)],
      actions: [{ label: 'Cancel', value: false }, { label: 'Set', primary: true, value: true }],
      validate: () => isDay(date.value),
    });
    if (ok) draft.due = date.value;
    showDraft();
    input.focus();
  }

  // What Enter would add: the shorthand typed so far wins over the bar's own choices.
  function planned() {
    const p = parseTask(input.value, Date.now());
    return { text: p.text, priority: p.priority ?? draft.priority, due: p.due ?? draft.due, repeat: p.repeat };
  }

  function showDraft() {
    const { priority, due, repeat } = planned();
    const day = due ?? (repeat ? firstDue(repeat, dayKey(Date.now())) : null);
    flagButton.className = 'task-add-btn' + (priority ? ` prio-${priority}` : '');
    flagButton.title = priority ? `${PRIORITY_LABEL[priority]} importance` : 'Importance';
    flagButton.setAttribute('aria-label', flagButton.title);
    flagButton.replaceChildren(icon('flag', 14));
    dateButton.title = day ? `Due ${dueLabel(day, Date.now()).text}` : 'Due date';
    dateButton.setAttribute('aria-label', dateButton.title);
    dateButton.replaceChildren(icon('calendar', 14), day ? dueLabel(day, Date.now()).text : '', repeat ? icon('repeat', 12) : '');
  }

  const section = el('section', { class: 'widget widget-tasks' },
    el('h2', { class: 'widget-head' }, icon('check-circle', 18), el('span', { text: 'Tasks' }), searchButton),
    tabs,
    searchBar,
    list,
    empty,
    el('label', { class: 'task-add' }, icon('plus', 16), input, flagButton, dateButton),
    foldHead,
    doneList);

  // ---- render ----

  function render() {
    const { tasks } = store.get();
    const { view, showDone } = settings();
    const now = Date.now();
    const today = dayKey(now);
    shownDay = today;
    const active = section.contains(document.activeElement) ? document.activeElement.dataset.focus : null;

    const { open, finished } = viewTasks(tasks, view, searching ? query : '', today);
    const ctx = { store, ui, render, now, today, draggable: !searching && view !== 'upcoming' };
    ui.rendering = true;
    list.replaceChildren(...open.map(t => taskRow(t, ctx)), ...(searching ? finished.map(t => taskRow(t, ctx)) : []));
    doneList.replaceChildren(...(!searching && showDone ? finished.map(t => taskRow(t, { ...ctx, draggable: false })) : []));
    ui.rendering = false;
    ui.rolledId = null;

    // heading
    tabs.hidden = searching;
    searchBar.hidden = !searching;
    searchButton.hidden = searching;
    for (const b of tabButtons) b.setAttribute('aria-pressed', String(b.dataset.view === view));
    const due = todayCount(tasks, today);
    const count = counts.get('today');
    count.hidden = !due.count;
    count.textContent = String(due.count);
    count.classList.toggle('overdue', due.overdue);
    sortButton.hidden = view !== 'all' || open.length < 2;

    // empty line and Finished fold
    const nothing = searching ? !open.length && !finished.length : !open.length && view !== 'all';
    empty.hidden = !nothing;
    empty.textContent = searching ? 'No matches' : (EMPTY[view] ?? '');
    foldHead.hidden = searching || view !== 'all' || !finished.length;
    foldButton.setAttribute('aria-expanded', String(showDone));
    foldButton.replaceChildren(icon('chevron', 12), `Finished (${finished.length})`);

    // focus: a control asked for (ui.focus), else whichever had it before the rebuild
    const want = ui.focus ?? active;
    ui.focus = null;
    if (want) {
      const target = section.querySelector(`[data-focus="${CSS.escape(want)}"]`);
      target?.focus({ preventScroll: true });
      if (ui.select && want === 'edit') target?.select();
    }
    ui.select = false;
  }

  // ---- drag to reorder: the top half of a row drops above it, the bottom half below ----

  const clearMark = () => {
    marked?.classList.remove('drop-before', 'drop-after');
    marked = null;
  };

  list.addEventListener('dragstart', e => {
    const item = e.target.closest?.('.task[data-id]');
    if (!item) return;
    dragId = item.dataset.id;
    e.dataTransfer.setData(TASK_MIME, dragId);
    e.dataTransfer.effectAllowed = 'move';
    item.classList.add('dragging');
  });

  list.addEventListener('dragend', () => {
    dragId = null;
    clearMark();
    list.querySelector('.dragging')?.classList.remove('dragging');
  });

  list.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest?.('.task[data-id]');
    clearMark();
    if (!item || item.dataset.id === dragId) return;
    const r = item.getBoundingClientRect();
    item.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    marked = item;
  });

  list.addEventListener('drop', e => {
    if (!dragId) return;
    e.preventDefault();
    const mark = marked;
    const id = dragId;
    if (!mark) return;
    const beforeId = mark.classList.contains('drop-after') ? (mark.nextElementSibling?.dataset.id ?? null) : mark.dataset.id;
    clearMark();
    store.update(s => moveTask(s, id, beforeId));
  });

  // ---- wiring ----

  // A new view resets the add bar to that view's preset; other prefs changes only redraw when
  // this copy's settings or width changed.
  let conf = null;
  function onPrefs(state) {
    const own = copyById(state, copy.id);
    if (!own) return;
    section.classList.toggle('narrow', own.w < 3);
    const next = JSON.stringify([own.settings.view, own.settings.showDone]);
    if (next === conf) return;
    conf = next;
    if (own.settings.view !== shownView) {
      shownView = own.settings.view;
      draft = preset(shownView);
      showDraft();
    }
    render();
  }

  root.append(section);
  store.update(s => pruneHistory(s, Date.now()));
  const unsubscribe = [store.subscribe(render, ['tasks']), store.subscribe(onPrefs, ['prefs'])];
  onPrefs(store.get());
  // Due labels and the presets are relative to today, so redraw once the date changes.
  const timer = setInterval(() => {
    if (dayKey(Date.now()) === shownDay) return;
    draft = preset(settings().view);
    showDraft();
    render();
  }, 60_000);
  return {
    destroy() {
      clearInterval(timer);
      unsubscribe.forEach(fn => fn());
    },
  };
}
```

- [ ] **Step 2: Syntax check and suite**

Run: `node --check js/task-widget.js && npm test`
Expected: no output from the check; suite passes.

- [ ] **Step 3: Commit**

```bash
git add js/task-widget.js
git commit -m "feat: Tasks widget: All / Today / Upcoming / High tabs, search, a Finished fold, and an add bar with importance and date buttons that follow the shorthand"
```

---

### Task 6: Styles

**Files:**
- Modify: `css/newtab.css` — replace the block from `.task-list { list-style: none; …` through `.task-add { … }` (currently lines ~559–597, ending just before `.task-input, .notes-input`).

- [ ] **Step 1: Replace the Tasks CSS block** with:

```css
/* ---- Tasks ---- */
:root { --prio-high: #e5534b; --prio-medium: #d4a72c; --prio-low: #4c8df6; }
.prio-high { --prio: var(--prio-high); }
.prio-medium { --prio: var(--prio-medium); }
.prio-low { --prio: var(--prio-low); }
.task-flag:is(.prio-high, .prio-medium, .prio-low),
.task-add-btn:is(.prio-high, .prio-medium, .prio-low),
.tray-chip:is(.prio-high, .prio-medium, .prio-low) .icon,
.menu-item:is(.prio-high, .prio-medium, .prio-low) .icon { color: var(--prio); }
/* A set flag is filled; an unset one is an outline. */
:is(.task-flag, .task-add-btn, .tray-chip, .menu-item):is(.prio-high, .prio-medium, .prio-low) .icon path:last-child { fill: currentColor; }

.task-search-btn { width: 26px; height: 26px; margin: -4px -4px -4px auto; }
.task-tabs { display: flex; align-items: center; gap: 2px; margin: -2px 0 6px; }
.task-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 12.5px;
  white-space: nowrap;
}
.task-tab:hover { color: var(--text); background: var(--hover); }
.task-tab[aria-pressed="true"] { color: var(--text); background: var(--accent-soft); }
.task-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.task-tab .icon { color: var(--prio-high); }
.task-count { min-width: 16px; padding: 0 4px; border-radius: 8px; background: var(--hover); font-size: 11px; line-height: 16px; text-align: center; }
.task-count.overdue { background: var(--danger); color: #fff; }
.task-tabs .link-btn { margin-left: auto; font-size: 11.5px; color: var(--muted); }
.task-tabs .link-btn:hover { color: var(--text); }
.widget-tasks.narrow .task-tab { padding: 3px 5px; font-size: 12px; }

.task-search { display: flex; align-items: center; gap: 8px; margin: -2px 0 6px; padding: 2px 4px 2px 8px; border: 1px solid var(--border); border-radius: 8px; color: var(--muted); }
.task-search:focus-within { border-color: var(--accent); }
.task-search input { flex: 1; min-width: 0; padding: 2px 0; border: 0; background: none; color: var(--text); font: inherit; font-size: 13px; outline: none; }
.task-search input::-webkit-search-cancel-button { display: none; }
.task-search .icon-btn { width: 22px; height: 22px; }

.task-list { list-style: none; margin: 0; padding: 0; }
.task-line { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
.task-check {
  flex: none;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1.5px solid var(--muted);
  border-radius: 50%;
  background: none;
  color: #fff;
}
.task-check:hover { border-color: var(--accent); }
.task.done .task-check { background: var(--accent); border-color: var(--accent); }
.task-text { flex: 1; min-width: 0; overflow-wrap: anywhere; cursor: text; }
.task.done .task-text { color: var(--muted); text-decoration: line-through; }
.task-edit { flex: 1; min-width: 0; padding: 0; border: 0; border-bottom: 1px solid var(--accent); background: none; color: var(--text); font: inherit; outline: none; }

.task-repeat { flex: none; display: inline-flex; color: var(--muted); }
.task-subs, .task-due {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 2px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 11.5px;
  white-space: nowrap;
}
.task-subs:hover, .task-due:hover { color: var(--text); }
.task-due.overdue { color: var(--danger); }
.task.rolled .task-due { animation: task-rolled 1.4s ease-out; }
@keyframes task-rolled { from { color: var(--accent); background: var(--accent-soft); } }
.task-flag { flex: none; display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--muted); }
.task-flag:hover { background: var(--hover); }
.task-flag:focus-visible, .task-subs:focus-visible, .task-due:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.task-flag.unset, .task-more { opacity: 0; }
.task-line:hover :is(.task-flag.unset, .task-more),
.task-line:focus-within :is(.task-flag.unset, .task-more),
.task.open .task-more { opacity: 1; }
.task.done :is(.task-flag, .task-due, .task-subs, .task-repeat) { opacity: 0.55; }
.task-more { flex: none; width: 22px; height: 22px; border-radius: 6px; }
.task.open .task-more .icon { transform: rotate(180deg); }
.task.dragging { opacity: 0.4; }
.task.drop-before { box-shadow: inset 0 2px var(--accent); }
.task.drop-after { box-shadow: inset 0 -2px var(--accent); }

/* Details tray under an open row. */
.task-tray {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px 10px;
  margin: 2px 0 8px 26px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--hover);
  font-size: 12.5px;
}
.tray-label { color: var(--muted); font-size: 11.5px; }
.tray-label-top { align-self: start; padding-top: 3px; }
.tray-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.tray-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
}
.tray-chip:hover { color: var(--text); background: var(--hover); }
.tray-chip[aria-pressed="true"] { color: var(--text); border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); background: var(--accent-soft); }
.tray-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.tray-date, .tray-select { padding: 2px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-2); color: var(--text); font: inherit; font-size: 12px; }
.tray-date:focus, .tray-select:focus { outline: none; border-color: var(--accent); }
.tray-clear { width: 20px; height: 20px; }
.sub-list { list-style: none; margin: 0; padding: 0; }
.sub { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.sub-check { flex: none; display: grid; place-items: center; width: 14px; height: 14px; padding: 0; border: 1.5px solid var(--muted); border-radius: 4px; background: none; color: #fff; }
.sub-check:hover { border-color: var(--accent); }
.sub.done .sub-check { background: var(--accent); border-color: var(--accent); }
.sub-text { flex: 1; min-width: 0; overflow-wrap: anywhere; cursor: text; }
.sub.done .sub-text { color: var(--muted); text-decoration: line-through; }
.sub-del { width: 20px; height: 20px; opacity: 0; }
.sub:hover .sub-del, .sub-del:focus-visible { opacity: 1; }
.sub-add { display: flex; align-items: center; gap: 8px; padding: 2px 0; color: var(--muted); }
.sub-add input { flex: 1; min-width: 0; padding: 0; border: 0; background: none; color: var(--text); font: inherit; outline: none; }
.sub-add input::placeholder { color: var(--muted); font-style: italic; }
.tray-foot { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 11.5px; }
.tray-foot .tray-delete { color: var(--danger); font-size: 12px; }

.task-add { display: flex; align-items: center; gap: 8px; padding: 5px 0; color: var(--muted); cursor: text; }
.task-add-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 11.5px;
  white-space: nowrap;
}
.task-add-btn:hover { background: var(--hover); color: var(--text); }
.task-add-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.task-fold-head { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); }
.task-fold { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; }
.task-fold:hover { color: var(--text); }
.task-fold .icon { transition: transform 0.15s; }
.task-fold[aria-expanded="true"] .icon { transform: rotate(90deg); }
.task-fold-head .link-btn { font-size: 11.5px; color: var(--muted); }
.task-fold-head .link-btn:hover { color: var(--text); }
```

Also delete the now-unused rules elsewhere: `.task-del …`, `.task:hover .task-del …`, the old `/* Priority colours the checkbox ring … */` block and `.task-actions` (they are inside the replaced block; confirm with `grep -n "task-del\|task-actions\|prio-high" css/newtab.css` that only the new rules remain).

- [ ] **Step 2: Check**

Run: `grep -n "task-del\|task-actions" css/newtab.css; npm test`
Expected: no grep output; suite passes.

- [ ] **Step 3: Commit**

```bash
git add css/newtab.css
git commit -m "feat: Tasks styles: tabs, flags filled in their colour, the details tray, add-bar buttons and the Finished fold"
```

---

### Task 7: Browser check, README, merge

**Files:**
- Modify: `README.md` (features table line 59, Tasks bullet ~line 364)
- Scratch: a Node CDP driver script in the session scratchpad (not committed)

- [ ] **Step 1: Headless check in the static preview.** Serve the worktree (`python -m http.server <free port>` — check `netstat` first), start Playwright Chromium headless on an unusual CDP port with a session-unique profile dir, seed `newtab:state` in localStorage, disable the cache, then drive it over CDP and screenshot. Check:
  1. The tabs show, Today's count shows; clicking each tab filters as the spec's table says; the add bar's flag/date preset follows the tab.
  2. Typing `Call bank !high tomorrow` turns the add-bar flag red and the date button to *Tomorrow*; Enter adds a task with both; the bar resets.
  3. Clicking a row's flag opens the menu; picking Medium colours it.
  4. Clicking the text turns it into an input; typing and Enter saves; Esc cancels.
  5. ⌄ opens the tray; Importance/Due/Repeat change the task; adding two subtasks keeps focus in the add box; the row shows `0/2`; ticking one shows `1/2`.
  6. Repeat Daily on a task due today, tick it: it stays, due *Tomorrow*, a history entry exists, today's count in `taskStats` went up.
  7. Finished fold: tick a normal task, *Finished (1)* appears closed; open it; Clear empties it.
  8. Search: ⌕, type part of a subtask's text: its task shows; Esc brings the tabs back.
  9. Drag a row in All to a new place.
  10. Resize the copy to 2 cells wide (edit `prefs.layout.widgets[*].w` in the seeded state) and screenshot: the tabs row fits without overflow (`tabs.scrollWidth <= tabs.clientWidth`).
  Stop the browser and the python server (`python3.13.exe` with `http.server <port>` on its command line) afterwards.

- [ ] **Step 2: README** — features table line becomes:

```
| **Tasks and notes** | A to-do list with importance flags, due dates, repeats, subtasks, Today / Upcoming / High views, search, quick-add shorthand and a week of finished-task history, and a notes pad. |
```

and the **Tasks** bullet becomes:

```
- **Tasks:** type in the add bar and press Enter. Shorthand at the end sets the date and repeat
  (`tomorrow`, `fri`, `next week`, `in 3 days`, `oct 30`, `every monday`, `daily`, `weekdays`,
  `weekly`, `monthly`, `yearly`) and `!high` / `!med` / `!low` anywhere sets the importance; the
  add bar's flag and calendar buttons show what will be set, or set it themselves. Click a task's
  text to retype it, its flag to change the importance, and **⌄** (or right-click) for the details
  tray: importance, due date, repeat, subtasks and Delete. A repeating task ticked moves on to its
  next date (an overdue daily one to tomorrow) and counts as finished today. The tabs show All,
  **Today** (due today or overdue, with a count), **Upcoming** (by date) and **High**; ⌕ searches
  every task and subtask. Drag to reorder (not in Upcoming); **Sort** puts them in order once.
  Finished tasks fold under **Finished** at the bottom of All; **Clear** removes them. Finished
  tasks are kept in a history for 7 days, and the number completed per day is kept for good.
```

- [ ] **Step 3: Commit, merge main, re-test, land**

```bash
git add README.md
git commit -m "docs: README: the redesigned Tasks widget"
git merge main            # in the worktree; resolve, then npm test again
```

Then from main's checkout (after ExitWorktree keep): `git merge --ff-only tasks-redesign`, and tell the other sessions which shared files changed (css/newtab.css Tasks block, js/ui.js two icons, js/store.js task normalising, js/layout.js tasks type, README Tasks bullet).
