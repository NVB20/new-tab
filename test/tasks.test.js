import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, addTask, toggleTask, deleteTask, clearDone, pruneHistory, HISTORY_DAYS } from '../js/tasks.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const empty = () => ({ tasks: [], taskHistory: [], taskStats: {} });

test('dayKey uses the local calendar date', () => {
  assert.equal(dayKey(at(2026, 10, 16, 23)), '2026-10-16');
  assert.equal(dayKey(at(2026, 1, 5, 0)), '2026-01-05');
});

test('addTask stamps the creation time', () => {
  const s = empty();
  const t = addTask(s, 'Write tests', at(2026, 10, 16));
  assert.deepEqual(s.tasks, [{ id: t.id, text: 'Write tests', done: false, createdAt: at(2026, 10, 16), doneAt: null }]);
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
