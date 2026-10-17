import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, addTask, toggleTask, deleteTask, clearDone, pruneHistory, HISTORY_DAYS,
  setDue, setPriority, editTask, moveTask, sortTasks, dueLabel,
  REPEATS, VIEWS, addDays, firstDue, nextDue, setRepeat,
  addSubtask, toggleSubtask, editSubtask, deleteSubtask, viewTasks, todayCount,
} from '../js/tasks.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const empty = () => ({ tasks: [], taskHistory: [], taskStats: {} });

test('dayKey uses the local calendar date', () => {
  assert.equal(dayKey(at(2026, 10, 16, 23)), '2026-10-16');
  assert.equal(dayKey(at(2026, 1, 5, 0)), '2026-01-05');
});

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

test('ticking counts the task on the day it was ticked; unticking takes it back', () => {
  const s = empty();
  const t = addTask(s, 'a', at(2026, 10, 14));
  toggleTask(s, t.id, at(2026, 10, 16, 9));
  assert.equal(s.tasks[0].done, true);
  assert.equal(s.tasks[0].doneAt, at(2026, 10, 16, 9));
  assert.deepEqual(s.taskStats, { '2026-10-16': 1 });
  toggleTask(s, t.id, at(2026, 10, 17));
  assert.equal(s.tasks[0].done, false);
  assert.equal(s.tasks[0].doneAt, null);
  assert.deepEqual(s.taskStats, {});
});

test('counts add up per day', () => {
  const s = empty();
  for (const text of ['a', 'b', 'c']) addTask(s, text, at(2026, 10, 15));
  toggleTask(s, s.tasks[0].id, at(2026, 10, 15));
  toggleTask(s, s.tasks[1].id, at(2026, 10, 16));
  toggleTask(s, s.tasks[2].id, at(2026, 10, 16, 20));
  assert.deepEqual(s.taskStats, { '2026-10-15': 1, '2026-10-16': 2 });
});

test('clearDone moves finished tasks to the history and keeps the counts', () => {
  const s = empty();
  const a = addTask(s, 'a', at(2026, 10, 15));
  addTask(s, 'b', at(2026, 10, 15));
  toggleTask(s, a.id, at(2026, 10, 15));
  assert.equal(clearDone(s, at(2026, 10, 16)), 1);
  assert.deepEqual(s.tasks.map(t => t.text), ['b']);
  assert.equal(s.taskHistory.length, 1);
  assert.equal(s.taskHistory[0].text, 'a');
  assert.equal(s.taskHistory[0].clearedAt, at(2026, 10, 16));
  assert.deepEqual(s.taskStats, { '2026-10-15': 1 });
});

test('clearDone given ids clears only those finished tasks', () => {
  const s = withTasks('a', 'b', 'c');
  const [a, b, c] = s.tasks.map(t => t.id);
  toggleTask(s, a, at(2026, 10, 16));
  toggleTask(s, b, at(2026, 10, 16));
  assert.equal(clearDone(s, at(2026, 10, 16), [b, c]), 1);   // c isn't finished, so it stays
  assert.deepEqual(texts(s), ['a', 'c']);
  assert.deepEqual(s.taskHistory.map(t => t.text), ['b']);
});

test('deleting a finished task keeps it counted and in the history; an unfinished one leaves no trace', () => {
  const s = empty();
  const a = addTask(s, 'done one', at(2026, 10, 15));
  const b = addTask(s, 'never done', at(2026, 10, 15));
  toggleTask(s, a.id, at(2026, 10, 15));
  deleteTask(s, a.id, at(2026, 10, 16));
  deleteTask(s, b.id, at(2026, 10, 16));
  assert.deepEqual(s.tasks, []);
  assert.deepEqual(s.taskHistory.map(t => t.text), ['done one']);
  assert.deepEqual(s.taskStats, { '2026-10-15': 1 });
});

test('pruneHistory drops history older than a week but never the daily counts', () => {
  const s = empty();
  s.taskHistory = [
    { id: 'old', text: 'old', createdAt: 0, doneAt: 0, clearedAt: at(2026, 10, 1) },
    { id: 'new', text: 'new', createdAt: 0, doneAt: 0, clearedAt: at(2026, 10, 14) },
  ];
  s.taskStats = { '2026-10-01': 3 };
  pruneHistory(s, at(2026, 10, 16));
  assert.deepEqual(s.taskHistory.map(t => t.id), ['new']);
  assert.deepEqual(s.taskStats, { '2026-10-01': 3 });
  assert.equal(HISTORY_DAYS, 7);
});

const withTasks = (...texts) => {
  const s = empty();
  texts.forEach(text => addTask(s, text, at(2026, 10, 16)));
  return s;
};
const texts = s => s.tasks.map(t => t.text);

test('setDue takes a calendar day or null and ignores anything else', () => {
  const s = withTasks('a');
  const id = s.tasks[0].id;
  setDue(s, id, '2026-10-20');
  assert.equal(s.tasks[0].due, '2026-10-20');
  setDue(s, id, 'next friday');
  assert.equal(s.tasks[0].due, '2026-10-20');
  setDue(s, id, null);
  assert.equal(s.tasks[0].due, null);
});

test('setPriority takes high, medium, low or null', () => {
  const s = withTasks('a');
  const id = s.tasks[0].id;
  setPriority(s, id, 'high');
  assert.equal(s.tasks[0].priority, 'high');
  setPriority(s, id, 'urgent');
  assert.equal(s.tasks[0].priority, 'high');
  setPriority(s, id, null);
  assert.equal(s.tasks[0].priority, null);
});

test('editTask trims the text and ignores an empty one', () => {
  const s = withTasks('a');
  const id = s.tasks[0].id;
  editTask(s, id, '  Call the bank  ');
  assert.equal(s.tasks[0].text, 'Call the bank');
  editTask(s, id, '   ');
  assert.equal(s.tasks[0].text, 'Call the bank');
});

test('moveTask moves a task before another, or to the end', () => {
  const s = withTasks('a', 'b', 'c');
  const [a, b, c] = s.tasks.map(t => t.id);
  moveTask(s, c, a);
  assert.deepEqual(texts(s), ['c', 'a', 'b']);
  moveTask(s, c, null);
  assert.deepEqual(texts(s), ['a', 'b', 'c']);
  moveTask(s, a, c);
  assert.deepEqual(texts(s), ['b', 'a', 'c']);
  moveTask(s, b, b);
  assert.deepEqual(texts(s), ['b', 'a', 'c']);
  moveTask(s, 'missing', a);
  assert.deepEqual(texts(s), ['b', 'a', 'c']);
});

test('sortTasks: unfinished first, then due date (none last), then priority, ties keep their order', () => {
  const s = withTasks('done', 'no date low', 'no date', 'later high', 'soon', 'soon high', 'no date high');
  const byText = Object.fromEntries(s.tasks.map(t => [t.text, t.id]));
  toggleTask(s, byText.done, at(2026, 10, 16));
  setDue(s, byText.done, '2026-10-01');
  setPriority(s, byText['no date low'], 'low');
  setDue(s, byText['later high'], '2026-10-30');
  setPriority(s, byText['later high'], 'high');
  setDue(s, byText.soon, '2026-10-17');
  setDue(s, byText['soon high'], '2026-10-17');
  setPriority(s, byText['soon high'], 'high');
  setPriority(s, byText['no date high'], 'high');
  sortTasks(s);
  assert.deepEqual(texts(s), ['soon high', 'soon', 'later high', 'no date high', 'no date low', 'no date', 'done']);
});

test('dueLabel names nearby days and flags overdue ones', () => {
  const now = at(2026, 10, 16);   // a Friday
  assert.deepEqual(dueLabel('2026-10-16', now), { text: 'Today', overdue: false });
  assert.deepEqual(dueLabel('2026-10-17', now), { text: 'Tomorrow', overdue: false });
  assert.deepEqual(dueLabel('2026-10-15', now), { text: 'Yesterday', overdue: true });
  assert.deepEqual(dueLabel('2026-10-20', now), { text: 'Tue', overdue: false });
  assert.deepEqual(dueLabel('2026-10-22', now), { text: 'Thu', overdue: false });
  assert.deepEqual(dueLabel('2026-10-23', now), { text: 'Oct 23', overdue: false });
  assert.deepEqual(dueLabel('2026-10-02', now), { text: 'Oct 2', overdue: true });
  assert.deepEqual(dueLabel('2027-01-05', now), { text: 'Jan 5, 2027', overdue: false });
});

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

test('viewTasks: each view with ticked tasks left in place, and search across tasks and subtasks', () => {
  const s = withTasks('overdue', 'done today', 'today high', 'later', 'sooner', 'no date', 'done high');
  const byText = Object.fromEntries(s.tasks.map(t => [t.text, t.id]));
  setDue(s, byText.overdue, '2026-10-10');
  setDue(s, byText['done today'], '2026-10-16');
  setDue(s, byText['today high'], '2026-10-16');
  setPriority(s, byText['today high'], 'high');
  setDue(s, byText.later, '2026-10-30');
  setDue(s, byText.sooner, '2026-10-20');
  setDue(s, byText['done high'], '2026-10-25');
  setPriority(s, byText['done high'], 'high');
  addSubtask(s, byText['no date'], 'Call the Bank');
  toggleTask(s, byText['done today'], at(2026, 10, 16));
  toggleTask(s, byText['done high'], at(2026, 10, 16));
  const today = '2026-10-16';
  const show = (view, query = '') => viewTasks(s.tasks, view, query, today).map(t => t.text);
  assert.deepEqual(show('all'), ['overdue', 'done today', 'today high', 'later', 'sooner', 'no date', 'done high']);
  assert.deepEqual(show('today'), ['overdue', 'done today', 'today high']);
  assert.deepEqual(show('upcoming'), ['sooner', 'done high', 'later']);
  assert.deepEqual(show('high'), ['today high', 'done high']);
  assert.deepEqual(show('today', 'bank'), ['no date']);   // search ignores the view
  assert.deepEqual(show('all', '  DON '), ['done today', 'done high']);
  assert.deepEqual(show('all', 'zzz'), []);
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
