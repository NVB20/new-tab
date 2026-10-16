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
    const now = Date.now();
    const { priority, due, repeat } = planned();
    const day = due ?? (repeat ? firstDue(repeat, dayKey(now)) : null);
    const label = day && dueLabel(day, now).text;
    flagButton.className = 'task-add-btn' + (priority ? ` prio-${priority}` : '');
    flagButton.title = priority ? `${PRIORITY_LABEL[priority]} importance` : 'Importance';
    flagButton.setAttribute('aria-label', flagButton.title);
    flagButton.replaceChildren(icon('flag', 14));
    dateButton.title = label ? `Due ${label}` : 'Due date';
    dateButton.setAttribute('aria-label', dateButton.title);
    dateButton.replaceChildren(icon('calendar', 14), label || '', repeat ? icon('repeat', 12) : '');
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
  // this copy's settings changed.
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
