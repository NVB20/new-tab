// Task list logic: timestamps, due dates, priorities, ordering, a one-week history of finished
// tasks, and an all-time count of tasks completed per day (taskStats, kept forever for charts).
// Pure; called inside store.update().

import { uid } from './util.js';

export const HISTORY_DAYS = 7;
export const PRIORITIES = ['high', 'medium', 'low'];
export const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const DAY_MS = 24 * 3600 * 1000;

// Local calendar date, e.g. '2026-10-16'.
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function count(s, ms, delta) {
  const key = dayKey(ms);
  const next = (s.taskStats[key] ?? 0) + delta;
  if (next > 0) s.taskStats[key] = next;
  else delete s.taskStats[key];
}

function archive(s, task, now) {
  s.taskHistory.push({ id: task.id, text: task.text, createdAt: task.createdAt, doneAt: task.doneAt, clearedAt: now });
}

export function addTask(s, text, now) {
  const task = { id: uid(), text, done: false, createdAt: now, doneAt: null, due: null, priority: null };
  s.tasks.push(task);
  return task;
}

// A task counts on the day it is ticked; unticking takes that count back.
export function toggleTask(s, id, now) {
  const task = s.tasks.find(t => t.id === id);
  if (!task) return;
  if (task.done) {
    if (task.doneAt != null) count(s, task.doneAt, -1);
    task.done = false;
    task.doneAt = null;
  } else {
    task.done = true;
    task.doneAt = now;
    count(s, now, 1);
  }
}

// A finished task stays counted and goes to the history; an unfinished one just disappears.
export function deleteTask(s, id, now) {
  const task = s.tasks.find(t => t.id === id);
  if (!task) return;
  if (task.done) archive(s, task, now);
  s.tasks = s.tasks.filter(t => t.id !== id);
}

// Moves every finished task to the history. Returns how many were cleared.
export function clearDone(s, now) {
  const done = s.tasks.filter(t => t.done);
  done.forEach(t => archive(s, t, now));
  s.tasks = s.tasks.filter(t => !t.done);
  return done.length;
}

// History older than a week is dropped; the daily counts are kept forever.
export function pruneHistory(s, now) {
  const cutoff = now - HISTORY_DAYS * DAY_MS;
  s.taskHistory = s.taskHistory.filter(t => t.clearedAt >= cutoff);
}

const find = (s, id) => s.tasks.find(t => t.id === id);

// day is 'YYYY-MM-DD' or null.
export function setDue(s, id, day) {
  const task = find(s, id);
  if (task && (day === null || isDay(day))) task.due = day;
}

export function setPriority(s, id, level) {
  const task = find(s, id);
  if (task && (level === null || PRIORITIES.includes(level))) task.priority = level;
}

export function editTask(s, id, text) {
  const task = find(s, id);
  const next = String(text ?? '').trim();
  if (task && next) task.text = next;
}

// Moves a task before beforeId, or to the end when beforeId is null.
export function moveTask(s, id, beforeId) {
  const task = find(s, id);
  if (!task || id === beforeId) return;
  const rest = s.tasks.filter(t => t.id !== id);
  const at = rest.findIndex(t => t.id === beforeId);
  rest.splice(at < 0 ? rest.length : at, 0, task);
  s.tasks = rest;
}

// One-off sort: unfinished first, then by due date (none last), then priority. Stable, so tasks
// that tie keep the order they were dragged into.
export function sortTasks(s) {
  const rank = t => (t.priority ? PRIORITIES.indexOf(t.priority) : PRIORITIES.length);
  s.tasks = [...s.tasks].sort((a, b) =>
    (a.done - b.done)
    || (a.due ? (b.due ? a.due.localeCompare(b.due) : -1) : (b.due ? 1 : 0))
    || (rank(a) - rank(b)));
}

const fromDay = day => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Short label for a due day relative to now: Today, Tomorrow, Yesterday, a weekday within the
// next 6 days, otherwise the date (with the year when it isn't this year).
export function dueLabel(day, now) {
  const date = fromDay(day);
  const today = fromDay(dayKey(now));
  const diff = Math.round((date - today) / DAY_MS);
  const overdue = diff < 0;
  if (diff === 0) return { text: 'Today', overdue };
  if (diff === 1) return { text: 'Tomorrow', overdue };
  if (diff === -1) return { text: 'Yesterday', overdue };
  if (diff > 1 && diff <= 6) return { text: date.toLocaleDateString('en-US', { weekday: 'short' }), overdue };
  const sameYear = date.getFullYear() === today.getFullYear();
  return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }), overdue };
}
