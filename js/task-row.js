// One task row and, when open, its details tray. The widget rebuilds rows on every render;
// what isn't in the store (the text being retyped, the open tray, focus) lives in ctx.ui.

import { el, icon, showMenu } from './ui.js';
import {
  toggleTask, deleteTask, setDue, setPriority, setRepeat, editTask,
  addSubtask, toggleSubtask, editSubtask, deleteSubtask, dueLabel, addDays, PRIORITIES, REPEATS,
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

// ctx: { store, ui, render, now, today, draggable }. ui (owned by the widget): editing (null,
// 'task:<id>' or 'sub:<id>:<subId>'), draft (the text typed so far), openId (the task whose tray
// is open), rolledId (a repeating task just ticked), focus (a data-focus key to focus after the
// next render), select (select the edited text then), rendering (true while the list is rebuilt).
export function taskRow(task, ctx) {
  const { store, ui, render, now } = ctx;
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
  const importance = task.priority ? `${PRIORITY_LABEL[task.priority]} importance` : 'Set importance';

  const flag = el('button', {
    type: 'button',
    class: 'task-flag' + (task.priority ? ` prio-${task.priority}` : ' unset'),
    title: importance,
    'aria-label': importance,
    dataset: { focus: `flag:${task.id}` },
    onclick: () => priorityMenu(flag, task.priority, level => {
      ui.focus = `flag:${task.id}`;
      update(s => setPriority(s, task.id, level));
    }),
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
    // Everything after the text, kept together: in a narrow widget it wraps under the text.
    el('span', { class: 'task-meta' },
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
      }, icon('caret', 16))));

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
  const { store, ui, today } = ctx;
  const update = fn => store.update(fn);
  const row = (label, ...controls) => [el('span', { class: 'task-tray-label', text: label }), el('div', { class: 'task-tray-chips' }, ...controls)];
  const chip = (label, pressed, focus, onclick, extra = {}) => el('button', {
    type: 'button',
    class: 'task-tray-chip' + (extra.className ? ' ' + extra.className : ''),
    'aria-pressed': String(pressed),
    dataset: { focus },
    onclick,
  }, extra.icon, label);

  const tomorrow = addDays(today, 1);
  const date = el('input', {
    type: 'date',
    class: 'task-tray-date',
    value: task.due ?? '',
    'aria-label': 'Due date',
    dataset: { focus: `date:${task.id}` },
    onchange: () => { if (date.value) update(s => setDue(s, task.id, date.value)); },
  });
  const repeat = el('select', {
    class: 'task-tray-select',
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

  const subs = el('ul', { class: 'task-sub-list' },
    task.subtasks.map(st => el('li', { class: 'task-sub' + (st.done ? ' done' : '') },
      el('button', {
        type: 'button',
        class: 'task-sub-check',
        role: 'checkbox',
        'aria-checked': String(st.done),
        'aria-label': st.done ? 'Mark subtask as not done' : 'Mark subtask as done',
        dataset: { focus: `sub-check:${task.id}:${st.id}` },
        onclick: () => update(s => toggleSubtask(s, task.id, st.id)),
      }, st.done && icon('check', 10)),
      editable(`sub:${task.id}:${st.id}`, st.text, 'task-sub-text', (s, value) => editSubtask(s, task.id, st.id, value)),
      el('button', {
        type: 'button',
        class: 'task-sub-del icon-btn',
        title: 'Delete subtask',
        'aria-label': 'Delete subtask',
        dataset: { focus: `sub-del:${task.id}:${st.id}` },
        onclick: () => {
          ui.focus = `sub-add:${task.id}`;
          update(s => deleteSubtask(s, task.id, st.id));
        },
      }, icon('x', 12)))),
    el('li', { class: 'task-sub-add' }, icon('plus', 12), subAdd));

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
      el('span', { class: 'task-tray-day' }, date, task.due && el('button', {
        type: 'button',
        class: 'icon-btn task-tray-clear',
        title: task.repeat ? 'Clear the date (ends the repeat)' : 'Clear the date',
        'aria-label': 'Clear the date',
        dataset: { focus: `due-clear:${task.id}` },
        onclick: () => update(s => setDue(s, task.id, null)),
      }, icon('x', 12)))),
    row('Repeat', repeat),
    el('span', { class: 'task-tray-label', text: 'Subtasks' }),
    subs,
    el('div', { class: 'task-tray-foot' },
      el('span', { text: task.createdAt ? `Added ${shortDate(task.createdAt)}` : '' }),
      el('button', {
        type: 'button',
        class: 'link-btn task-tray-delete',
        text: 'Delete',
        dataset: { focus: `delete:${task.id}` },
        onclick: () => {
          ui.openId = null;
          update(s => deleteTask(s, task.id, Date.now()));
        },
      })));
}
