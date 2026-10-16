// Tasks widget: add and tick tasks, right-click for due date, priority, edit and delete, drag to
// reorder, and Sort / Clear done in the heading.

import { el, icon, showMenu, openDialog, field } from './ui.js';
import {
  addTask, toggleTask, deleteTask, clearDone, pruneHistory,
  setDue, setPriority, editTask, moveTask, sortTasks, dueLabel, dayKey, isDay, PRIORITIES,
} from './tasks.js';

// Own drag type, so the tile grid and group tabs ignore dragged tasks.
const TASK_MIME = 'application/x-newtab-task';
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

function dayFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dayKey(d.getTime());
}

const longDate = day => new Date(day + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export function mountTasks(store) {
  let editingId = null;
  let dragId = null;
  let marked = null;   // the row showing a drop line
  let shownDay = '';

  const input = el('input', {
    class: 'task-input',
    type: 'text',
    placeholder: 'Add a task',
    dir: 'auto',
    maxLength: 300,
    'aria-label': 'Add a task',
    onkeydown: e => {
      const text = input.value.trim();
      if (e.key !== 'Enter' || !text) return;
      input.value = '';
      store.update(s => { addTask(s, text, Date.now()); });
    },
  });
  const list = el('ul', { class: 'task-list' });
  const sortButton = el('button', {
    type: 'button',
    class: 'link-btn',
    text: 'Sort',
    title: 'Sort by due date, then priority (finished tasks last)',
    onclick: () => store.update(sortTasks),
  });
  // Finished tasks move to a one-week history; the per-day completion counts stay.
  const clearButton = el('button', {
    type: 'button',
    class: 'link-btn',
    title: 'Remove finished tasks (kept in history for a week)',
    onclick: () => store.update(s => { clearDone(s, Date.now()); }),
  });
  const section = el('section', { class: 'widget widget-tasks' },
    el('h2', { class: 'widget-head' }, icon('check-circle', 18), el('span', { text: 'Tasks' }),
      el('span', { class: 'widget-head-status task-actions' }, sortButton, clearButton)),
    list,
    el('label', { class: 'task-add' }, icon('plus', 16), input));

  async function pickDate(task) {
    const date = el('input', { type: 'date', value: task.due ?? dayKey(Date.now()) });
    const ok = await openDialog({
      title: 'Due date',
      body: [field('Date', date)],
      actions: [{ label: 'Cancel', value: false }, { label: 'Set', primary: true, value: true }],
      validate: () => isDay(date.value),
    });
    if (ok) store.update(s => setDue(s, task.id, date.value));
  }

  function taskMenu(e, task) {
    const due = day => () => store.update(s => setDue(s, task.id, day));
    showMenu(e.clientX, e.clientY, [
      { label: 'Due today', icon: 'calendar', action: due(dayFromNow(0)) },
      { label: 'Due tomorrow', icon: 'calendar', action: due(dayFromNow(1)) },
      { label: 'Pick a date…', icon: 'calendar', action: () => pickDate(task) },
      ...(task.due ? [{ label: 'Clear due date', icon: 'x', action: due(null) }] : []),
      { separator: true },
      { heading: 'Priority' },
      ...[...PRIORITIES, null].map(level => ({
        label: level ? PRIORITY_LABEL[level] : 'None',
        icon: level ? 'dot' : 'circle',
        className: level ? `prio-${level}` : '',
        checked: task.priority === level,
        action: () => store.update(s => setPriority(s, task.id, level)),
      })),
      { separator: true },
      { label: 'Edit text', icon: 'edit', action: () => startEdit(task.id) },
      { label: 'Delete', icon: 'trash', danger: true, action: () => store.update(s => deleteTask(s, task.id, Date.now())) },
    ]);
  }

  function startEdit(id) {
    editingId = id;
    render();
    const box = list.querySelector('.task-edit');
    box?.focus();
    box?.select();
  }

  function finishEdit(id, text) {
    if (editingId !== id) return;   // Enter already saved; this is the blur that follows
    editingId = null;
    if (text != null) store.update(s => editTask(s, id, text));
    render();
  }

  function textNode(task) {
    if (task.id !== editingId) return el('span', { class: 'task-text', dir: 'auto', text: task.text });
    const edit = el('input', {
      class: 'task-edit',
      type: 'text',
      value: task.text,
      dir: 'auto',
      maxLength: 300,
      'aria-label': 'Task text',
      onkeydown: e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishEdit(task.id, edit.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finishEdit(task.id, null);
        }
      },
      onblur: () => finishEdit(task.id, edit.value),
    });
    return edit;
  }

  function row(task, now) {
    const due = task.due && dueLabel(task.due, now);
    return el('li', {
      class: 'task' + (task.done ? ' done' : '') + (task.priority ? ` prio-${task.priority}` : ''),
      dataset: { id: task.id },
      draggable: task.id !== editingId,
      oncontextmenu: e => {
        e.preventDefault();
        taskMenu(e, task);
      },
    },
      el('button', {
        class: 'task-check',
        type: 'button',
        role: 'checkbox',
        'aria-checked': String(task.done),
        'aria-label': task.done ? 'Mark as not done' : 'Mark as done',
        title: task.priority ? `${PRIORITY_LABEL[task.priority]} priority` : null,
        onclick: () => store.update(s => toggleTask(s, task.id, Date.now())),
      }, task.done && icon('check', 12)),
      textNode(task),
      due && el('span', {
        class: 'task-due' + (due.overdue && !task.done ? ' overdue' : ''),
        text: due.text,
        title: `Due ${longDate(task.due)}`,
      }),
      el('button', {
        class: 'task-del icon-btn',
        type: 'button',
        title: 'Delete task',
        'aria-label': 'Delete task',
        onclick: () => store.update(s => deleteTask(s, task.id, Date.now())),
      }, icon('x', 14)));
  }

  function render() {
    const { tasks } = store.get();
    const now = Date.now();
    shownDay = dayKey(now);
    list.replaceChildren(...tasks.map(t => row(t, now)));
    const done = tasks.filter(t => t.done).length;
    sortButton.hidden = tasks.length < 2;
    clearButton.hidden = !done;
    clearButton.textContent = `Clear done (${done})`;
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

  store.update(s => pruneHistory(s, Date.now()));
  store.subscribe(render, ['tasks']);
  // Due labels are relative to today, so redraw once the date changes.
  setInterval(() => { if (dayKey(Date.now()) !== shownDay) render(); }, 60_000);
  render();
  return section;
}
