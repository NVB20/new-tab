// Task list logic: timestamps, due dates, priorities, repeats, subtasks, ordering, views, a
// one-week history of finished tasks, and an all-time count of tasks completed per day (taskStats,
// kept forever for charts). Pure; called inside store.update().

import { uid } from './util.js';

export const HISTORY_DAYS = 7;
export const PRIORITIES = ['high', 'medium', 'low'];
export const REPEATS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
export const VIEWS = ['all', 'today', 'upcoming', 'high'];
export const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const DAY_MS = 24 * 3600 * 1000;

// Local calendar date, e.g. '2026-10-16'.
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

function count(s, ms, delta) {
  const key = dayKey(ms);
  const next = (s.taskStats[key] ?? 0) + delta;
  if (next > 0) s.taskStats[key] = next;
  else delete s.taskStats[key];
}

function archive(s, task, now) {
  s.taskHistory.push({ id: task.id, text: task.text, createdAt: task.createdAt, doneAt: task.doneAt, clearedAt: now });
}

const find = (s, id) => s.tasks.find(t => t.id === id);

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

// A finished task stays counted and goes to the history; an unfinished one just disappears.
export function deleteTask(s, id, now) {
  const task = find(s, id);
  if (!task) return;
  if (task.done) archive(s, task, now);
  s.tasks = s.tasks.filter(t => t.id !== id);
}

// Moves finished tasks to the history: every one, or only those whose id is in ids. Returns how
// many were cleared.
export function clearDone(s, now, ids = null) {
  const gone = t => t.done && (!ids || ids.includes(t.id));
  const done = s.tasks.filter(gone);
  done.forEach(t => archive(s, t, now));
  s.tasks = s.tasks.filter(t => !gone(t));
  return done.length;
}

// History older than a week is dropped; the daily counts are kept forever.
export function pruneHistory(s, now) {
  const cutoff = now - HISTORY_DAYS * DAY_MS;
  s.taskHistory = s.taskHistory.filter(t => t.clearedAt >= cutoff);
}

// day is 'YYYY-MM-DD' or null. A repeat needs a date, so clearing the date ends it.
export function setDue(s, id, day) {
  const task = find(s, id);
  if (!task || !(day === null || isDay(day))) return;
  task.due = day;
  if (!day) task.repeat = null;
}

export function setPriority(s, id, level) {
  const task = find(s, id);
  if (task && (level === null || PRIORITIES.includes(level))) task.priority = level;
}

// Starting a repeat on an undated task dates it.
export function setRepeat(s, id, repeat, now) {
  const task = find(s, id);
  if (!task || !(repeat === null || REPEATS.includes(repeat))) return;
  task.repeat = repeat;
  if (repeat && !task.due) task.due = firstDue(repeat, dayKey(now));
}

export function editTask(s, id, text) {
  const task = find(s, id);
  const next = String(text ?? '').trim();
  if (task && next) task.text = next;
}

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

// What a view shows, in display order. A ticked task stays where it is, struck through, until
// Clear takes it away. A search looks through every task's text and its subtasks', whatever the view.
export function viewTasks(tasks, view, query, today) {
  const q = query.trim().toLowerCase();
  if (q) return tasks.filter(t => [t.text, ...t.subtasks.map(st => st.text)].some(x => x.toLowerCase().includes(q)));
  if (view === 'today') return tasks.filter(t => t.due && t.due <= today);
  if (view === 'upcoming') return tasks.filter(t => t.due && t.due > today).sort((a, b) => a.due.localeCompare(b.due));
  if (view === 'high') return tasks.filter(t => t.priority === 'high');
  return tasks;
}

// Unfinished tasks due today or earlier, for the Today tab's count.
export function todayCount(tasks, today) {
  const due = tasks.filter(t => !t.done && t.due && t.due <= today);
  return { count: due.length, overdue: due.some(t => t.due < today) };
}

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
