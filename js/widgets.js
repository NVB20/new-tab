// Widget column: clock with greeting, tasks and notes.

import { el, icon } from './ui.js';
import { addTask, toggleTask, deleteTask, clearDone, pruneHistory } from './tasks.js';

function partOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

const heading = (iconName, text) => el('h2', { class: 'widget-head' }, icon(iconName, 18), el('span', { text }));

export function mountWidgets(root, store) {
  const date = el('div', { class: 'clock-date' });
  const time = el('div', { class: 'clock-time' });
  const greeting = el('div', { class: 'clock-greeting', dir: 'auto' });
  const clock = el('section', { class: 'widget widget-clock' }, date, time, greeting);

  const taskInput = el('input', {
    class: 'task-input',
    type: 'text',
    placeholder: 'Add a task',
    dir: 'auto',
    maxLength: 300,
    'aria-label': 'Add a task',
    onkeydown: e => {
      const text = taskInput.value.trim();
      if (e.key !== 'Enter' || !text) return;
      taskInput.value = '';
      store.update(s => { addTask(s, text, Date.now()); });
    },
  });
  const taskList = el('ul', { class: 'task-list' });
  // Finished tasks move to a one-week history; the per-day completion counts stay.
  const clearButton = el('button', {
    type: 'button',
    class: 'widget-head-status link-btn',
    onclick: () => store.update(s => { clearDone(s, Date.now()); }),
  });
  const tasksHead = heading('check-circle', 'Tasks');
  tasksHead.append(clearButton);
  const tasks = el('section', { class: 'widget widget-tasks' },
    tasksHead,
    taskList,
    el('label', { class: 'task-add' }, icon('plus', 16), taskInput));

  const notesArea = el('textarea', {
    class: 'notes-input',
    placeholder: 'Write something…',
    dir: 'auto',
    'aria-label': 'Notes',
    oninput: () => {
      const value = notesArea.value;
      store.update(s => { s.notes = value; });
    },
  });
  const notes = el('section', { class: 'widget widget-notes' }, heading('note', 'Notes'), notesArea);

  root.append(clock, tasks, notes);

  let shownMinute = '';
  function renderClock(force = false) {
    const now = new Date();
    const minute = now.toDateString() + now.getHours() + ':' + now.getMinutes();
    if (!force && minute === shownMinute) return;
    shownMinute = minute;

    const c = store.get().prefs.widgets.clock;
    const h = now.getHours();
    const mm = String(now.getMinutes()).padStart(2, '0');
    date.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (c.hour24) {
      time.replaceChildren(`${String(h).padStart(2, '0')}:${mm}`);
    } else {
      time.replaceChildren(`${h % 12 || 12}:${mm}`, el('span', { class: 'clock-ampm', text: h < 12 ? 'AM' : 'PM' }));
    }
    greeting.hidden = !c.greeting;
    greeting.textContent = `Good ${partOfDay(h)}${c.name.trim() ? ', ' + c.name.trim() : ''}`;
  }

  function renderTasks(list) {
    taskList.replaceChildren(...list.map(t => el('li', { class: 'task' + (t.done ? ' done' : '') },
      el('button', {
        class: 'task-check',
        type: 'button',
        role: 'checkbox',
        'aria-checked': String(t.done),
        'aria-label': t.done ? 'Mark as not done' : 'Mark as done',
        onclick: () => store.update(s => toggleTask(s, t.id, Date.now())),
      }, t.done && icon('check', 12)),
      el('span', { class: 'task-text', dir: 'auto', text: t.text }),
      el('button', {
        class: 'task-del icon-btn',
        type: 'button',
        title: 'Delete task',
        'aria-label': 'Delete task',
        onclick: () => store.update(s => deleteTask(s, t.id, Date.now())),
      }, icon('x', 14)))));
  }

  function render(state) {
    const w = state.prefs.widgets;
    root.hidden = !w.enabled || !(w.clock.enabled || w.tasks.enabled || w.notes.enabled);
    clock.hidden = !w.clock.enabled;
    tasks.hidden = !w.tasks.enabled;
    notes.hidden = !w.notes.enabled;
    renderTasks(state.tasks);
    const done = state.tasks.filter(t => t.done).length;
    clearButton.hidden = !done;
    clearButton.textContent = `Clear done (${done})`;
    clearButton.title = 'Remove finished tasks (kept in history for a week)';
    // Don't overwrite the textarea while typing in it (it would move the cursor).
    if (document.activeElement !== notesArea) notesArea.value = state.notes;
    renderClock(true);
  }

  store.update(s => pruneHistory(s, Date.now()));
  store.subscribe(render, ['tasks', 'notes', 'prefs']);
  render(store.get());
  setInterval(renderClock, 1000);
}
