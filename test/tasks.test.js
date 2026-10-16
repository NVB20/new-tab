import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, addTask, toggleTask, deleteTask, clearDone, pruneHistory, HISTORY_DAYS,
  setDue, setPriority, editTask, moveTask, sortTasks, dueLabel,
} from '../js/tasks.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const empty = () => ({ tasks: [], taskHistory: [], taskStats: {} });

test('dayKey uses the local calendar date', () => {
  assert.equal(dayKey(at(2026, 10, 16, 23)), '2026-10-16');
  assert.equal(dayKey(at(2026, 1, 5, 0)), '2026-01-05');
});

test('addTask stamps the creation time', () => {
  const s = empty();
  const t = addTask(s, 'Write tests', at(2026, 10, 16));
  assert.deepEqual(s.tasks, [{ id: t.id, text: 'Write tests', done: false, createdAt: at(2026, 10, 16), doneAt: null, due: null, priority: null }]);
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
