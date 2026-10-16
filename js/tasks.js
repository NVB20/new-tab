// Task list logic: timestamps, a one-week history of finished tasks, and an all-time count of
// tasks completed per day (taskStats, kept forever for charts). Pure; called inside store.update().

import { uid } from './util.js';

export const HISTORY_DAYS = 7;
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
  const task = { id: uid(), text, done: false, createdAt: now, doneAt: null };
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
