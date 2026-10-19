// Timers widget (type `countdown`): one of the page's countdowns (countdown.js) drawn big, the days
// to go until a date, or a timer or a stopwatch with its controls. ✎ lists every one, to pick the
// one this copy shows or add, edit and delete them. At zero: confetti (once per finish) and
// Dismiss; the background script sends the notification.

import { el, icon, widgetHead, widgetEmpty, showMenu, openDialog, field } from './ui.js';
import { copyById, allLayouts, copiesOf, TYPES } from './layout.js';
import {
  KINDS, KIND_LABELS, KIND_ICONS, PRESETS, MAX_DURATION, MAX_COUNTDOWNS, cleanCountdowns, newTimer, newStopwatch, newDate,
  nameOf, isDay, endOf, statusOf, leftOf, tickFrom, shownCountdown, nextUp, shouldCelebrate, startTimer, pauseTimer,
  resetTimer, addMinute, dismiss, display, dateLabel, shortLeft,
} from './countdown.js';
import { confettiFrom } from './confetti.js';

const SLOW_MS = 30e3;   // how often a widget showing days (or a paused timer) looks again
const TITLE = 'Timers';
// A new countdown (ready, for a timer or a stopwatch) from what the dialog asked.
const fresh = (v, now) => (v.kind === 'timer' ? newTimer(v) : v.kind === 'stopwatch' ? newStopwatch(v) : newDate(v, now));
// Under 900px the frames stack, each as tall as its content: the count has a fixed size there.
const STACKED = matchMedia('(max-width: 900px)');

// ctx.preview: drawn in the Layout mode tray's preview: no confetti, and nothing marked as seen.
export function mountCountdown(root, store, copy, ctx = {}) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.countdown.defaults();
  const countdowns = () => store.get().countdowns;
  // Times follow the Clock's 12/24-hour setting.
  const hour24 = () => allLayouts(store.get()).flatMap(copiesOf).find(c => c.type === 'clock')?.settings.hour24 ?? true;
  const timeOf = ms => new Date(ms).toLocaleTimeString(hour24() ? 'en-GB' : 'en-US', { hour: hour24() ? '2-digit' : 'numeric', minute: '2-digit' });

  const setList = fn => store.update(s => { s.countdowns = cleanCountdowns(fn(s.countdowns)); }, ['countdowns']);
  const change = (id, fn) => setList(list => list.map(c => (c.id === id ? fn(c) : c)));
  const setShow = show => store.update(s => {
    const own = copyById(s, copy.id);
    if (own) own.settings.show = show;
  }, ['prefs']);

  const editButton = el('button', { type: 'button', class: 'icon-btn widget-edit', onclick: () => setEditing(!editing) });
  const head = widgetHead('hourglass', TITLE);
  const title = head.querySelector('span');
  head.append(editButton);
  const big = el('span', { class: 'cd-big' });
  const unit = el('span', { class: 'cd-unit' });
  const count = el('div', { class: 'cd-count', role: 'timer' }, big, unit);
  const when = el('div', { class: 'cd-when' });
  const fill = el('span', { class: 'cd-fill' });
  const bar = el('div', { class: 'cd-bar', hidden: true }, fill);
  const controls = el('div', { class: 'cd-controls' });
  const face = el('div', { class: 'cd-face' }, count, when, bar, controls);
  const body = el('div', { class: 'cd-body' }, face);
  const picker = el('div', { class: 'cd-picker', hidden: true });
  const section = el('section', { class: 'widget widget-countdown' }, head, body, picker);
  root.append(section);

  const shown = now => shownCountdown(countdowns(), settings().show, now);

  // ---- the countdown shown ----

  const button = (iconName, label, onclick, cls = '') => el('button', {
    type: 'button', class: `icon-btn cd-ctl ${cls}`, title: label, 'aria-label': label, onclick,
  }, icon(iconName, 18));
  const textButton = (text, onclick, { primary = false, label } = {}) => el('button', {
    type: 'button', class: `btn cd-btn${primary ? ' btn-primary' : ''}`, text, title: label, onclick,
  });
  const act = (id, fn) => () => change(id, c => fn(c, Date.now()));

  // The buttons for a countdown in a state; drawn again only when that changes, so the focus stays.
  function controlsFor(c, status) {
    const minute = textButton('+1 min', act(c.id, addMinute), { label: status === 'done' ? 'Run for another minute' : 'Add a minute' });
    const dismissButton = textButton('Dismiss', () => setList(list => dismiss(list, c.id)), {
      primary: true,
      label: c.kind === 'timer' ? 'Set it back to its start' : c.yearly ? 'Count to next year' : 'Take it off the list',
    });
    if (status === 'done') return c.kind === 'timer' ? [dismissButton, minute] : [dismissButton];
    if (c.kind === 'date') return [];
    const reset = button('undo', 'Reset', act(c.id, resetTimer));
    const more = c.kind === 'timer' ? [minute] : [];
    if (status === 'running') return [button('pause', 'Pause', act(c.id, pauseTimer), 'cd-main'), reset, ...more];
    return [button('play', status === 'paused' ? 'Resume' : 'Start', act(c.id, startTimer), 'cd-main'), ...(status === 'paused' ? [reset] : []), ...more];
  }

  // The line under the count: the date, when the timer ends, or when the stopwatch (re)started.
  function whenText(c, status, now) {
    if (c.kind === 'date') return dateLabel(c, now, hour24()) + (c.yearly ? ' · every year' : '');
    if (c.kind === 'stopwatch' && status === 'running') return `${c.elapsed ? 'Resumed' : 'Started'} ${timeOf(c.startedAt)}`;
    if (status === 'running') return `Ends ${timeOf(c.endsAt)}`;
    if (status === 'done') return `Ended ${timeOf(c.endsAt)}`;
    if (status === 'paused') return 'Paused';
    return 'Ready';
  }

  let drawnFace = '';
  let drawnControls = '';

  function render() {
    const now = Date.now();
    const own = copyById(store.get(), copy.id);
    section.classList.toggle('narrow', (own?.w ?? 3) < 3);
    if (editing) refreshPicker(now);
    const c = shown(now);
    if (!c) {
      if (drawnFace === 'empty') return;
      drawnFace = 'empty';
      drawnControls = '';
      title.textContent = TITLE;
      if (head.dataset.kind) {
        delete head.dataset.kind;
        head.firstElementChild.replaceWith(icon('hourglass', 18));
      }
      section.classList.remove('done', 'live', 'can-run');
      body.replaceChildren(widgetEmpty('No timers yet. ', el('button', { type: 'button', class: 'link-btn', text: 'Add one', onclick: create })));
      return;
    }
    if (drawnFace === 'empty') body.replaceChildren(face);
    const status = statusOf(c, now);
    const d = display(c, now);
    const sig = JSON.stringify([c, d, status, hour24()]);
    if (sig !== drawnFace) {
      drawnFace = sig;
      title.textContent = nameOf(c);
      if (head.dataset.kind !== c.kind) {
        head.dataset.kind = c.kind;
        head.firstElementChild.replaceWith(icon(KIND_ICONS[c.kind], 18));
      }
      big.textContent = d.big;
      unit.textContent = d.unit;
      unit.hidden = !d.unit;
      count.setAttribute('aria-label', `${nameOf(c)}: ${d.unit ? `${d.big} ${d.unit}` : d.big}`);
      when.textContent = whenText(c, status, now);
      section.classList.toggle('done', status === 'done');
      section.classList.toggle('live', d.live);
      section.classList.toggle('can-run', c.kind !== 'date');
      const running = c.kind === 'timer' && (status === 'running' || status === 'paused');
      bar.hidden = !running;
      if (running) fill.style.width = `${Math.min(100, (1 - leftOf(c, now) / c.duration) * 100)}%`;
    }
    const controlsSig = JSON.stringify([c.id, status]);
    if (controlsSig !== drawnControls) {
      drawnControls = controlsSig;
      const focused = controls.contains(document.activeElement) ? [...controls.children].indexOf(document.activeElement) : -1;
      controls.replaceChildren(...controlsFor(c, status));
      controls.hidden = !controls.children.length;
      if (focused >= 0) (controls.children[focused] ?? controls.firstElementChild)?.focus({ preventScroll: true });
    }
    fit();
    if (!ctx.preview && shouldCelebrate(c, now)) queueMicrotask(() => celebrate(c.id));
  }

  // The count fills what the line under it and a timer's buttons leave of the widget, as the
  // clock's time does. A short widget drops a timer's line and has smaller buttons. Measured
  // again only when the count's length or the widget's size changes. Offset sizes are layout
  // pixels, so the fit holds when the widget is drawn scaled.
  // The first fit waits for the observer's first call, which comes before the first paint, once
  // every widget is on the page, rather than forcing a layout of the half-built page.
  let fitted = '';
  let observed = false;
  function fit() {
    if (!observed || body.hidden || !body.clientHeight) return;
    const stacked = STACKED.matches;
    section.classList.toggle('short', !stacked && body.clientHeight < 150);
    const key = [stacked, big.textContent.length, unit.textContent, body.clientWidth, body.clientHeight, section.className].join('|');
    if (key === fitted) return;
    fitted = key;
    if (stacked) {
      count.style.fontSize = '';
      return;
    }
    const gap = parseFloat(getComputedStyle(face).rowGap) || 0;
    const others = [when, bar, controls].filter(n => n.offsetHeight).reduce((h, n) => h + n.offsetHeight + gap, 0);
    count.style.fontSize = '100px';
    // A margin for the glyphs' overhang; "Time’s up" and "Today" a little smaller than digits.
    const wide = section.classList.contains('done') ? 0.8 : 0.94;
    const size = Math.min(100 * wide * body.clientWidth / count.scrollWidth, 100 * (body.clientHeight - others - 4) / count.offsetHeight);
    count.style.fontSize = `${Math.round(Math.max(18, Math.min(150, size)))}px`;
  }
  const resized = new ResizeObserver(() => {
    observed = true;
    fit();
  });
  resized.observe(body);

  // Confetti from the widget, once per finish: the finish is marked as seen for every tab.
  function celebrate(id) {
    const now = Date.now();
    const c = countdowns().find(x => x.id === id);
    if (!c || !shouldCelebrate(c, now) || document.visibilityState !== 'visible') return;
    const r = section.getBoundingClientRect();
    if (!r.width || !r.height) return;   // hidden behind another widget in a stack: a shown copy plays it
    const accent = getComputedStyle(section).getPropertyValue('--accent').trim() || undefined;
    confettiFrom(r.left + r.width / 2, r.top + Math.min(r.height / 2, 80), { accent });
    change(id, x => ({ ...x, seen: endOf(x) }));
  }

  // ---- ✎: every countdown, to pick from ----

  let editing = false;

  function renderPicker() {
    const now = Date.now();
    const list = countdowns();
    const show = list.some(c => c.id === settings().show) ? settings().show : 'next';
    const next = nextUp(list, now);
    const pick = (id, iconName, name, left) => el('button', {
      type: 'button', class: 'cd-pick', 'aria-pressed': String(show === id),
      onclick: () => {
        setShow(id);
        setEditing(false);
      },
    }, icon(iconName, 16), el('span', { class: 'cd-name', dir: 'auto', text: name }), el('span', { class: 'cd-left', dataset: { left: id }, text: left }));
    const rows = list.map(c => el('li', { class: 'cd-row', dataset: { id: c.id } },
      pick(c.id, KIND_ICONS[c.kind], nameOf(c), shortLeft(c, now)),
      el('button', {
        type: 'button', class: 'icon-btn cd-more', title: 'More', 'aria-label': `More for ${nameOf(c)}`,
        onclick: e => {
          const r = e.currentTarget.getBoundingClientRect();
          showMenu(r.left, r.bottom + 4, [
            { label: 'Edit…', icon: 'edit', action: () => edit(c.id) },
            { label: 'Delete', icon: 'trash', danger: true, action: () => setList(l => l.filter(x => x.id !== c.id)) },
          ]);
        },
      }, icon('more', 16))));
    const full = list.length >= MAX_COUNTDOWNS;
    picker.replaceChildren(
      list.length
        ? el('ul', { class: 'cd-rows', 'aria-label': TITLE },
          el('li', { class: 'cd-row' }, pick('next', 'hourglass', 'Next up', next ? nameOf(next) : ''), el('span', { class: 'cd-more-gap' })),
          rows)
        : widgetEmpty('No timers yet.'),
      el('button', {
        type: 'button', class: 'btn cd-new', disabled: full, title: full ? `Up to ${MAX_COUNTDOWNS}` : 'A timer, a stopwatch or a date', onclick: create,
      }, icon('plus', 16), 'New'));
  }

  // The times left change every second; the rows themselves only when the list does.
  function refreshPicker(now) {
    const list = countdowns();
    const next = nextUp(list, now);
    for (const span of picker.querySelectorAll('[data-left]')) {
      const id = span.dataset.left;
      const c = list.find(x => x.id === id);
      span.textContent = id === 'next' ? (next ? nameOf(next) : '') : c ? shortLeft(c, now) : '';
    }
  }

  function setEditing(on) {
    editing = on;
    section.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Your timers';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    body.hidden = on;
    picker.hidden = !on;
    if (on) renderPicker();
    else picker.replaceChildren();
    schedule();
  }

  // ---- adding and editing ----

  async function create() {
    const v = await askCountdown(null);
    if (!v) return;
    const now = Date.now();
    const c = startTimer(fresh(v, now), now);
    setList(list => [...list, c]);
    setShow(c.id);
    if (editing) setEditing(false);
  }

  async function edit(id) {
    const old = countdowns().find(c => c.id === id);
    if (!old) return;
    const v = await askCountdown(old);
    if (!v) return;
    change(id, c => {
      if (v.kind !== c.kind) return { ...fresh(v, Date.now()), id };
      if (c.kind === 'stopwatch') return { ...c, name: v.name };
      if (c.kind === 'timer') return c.duration === v.duration ? { ...c, name: v.name } : { ...resetTimer(c), name: v.name, duration: v.duration };
      const same = c.date === v.date && c.time === v.time && c.yearly === v.yearly;
      return same ? { ...c, name: v.name } : { ...newDate(v, Date.now()), id };
    });
  }

  // The dialog for a new countdown (old: null) or a change to one: Timer, Stopwatch or Date first,
  // then a name, then a timer's duration or a date's day. Resolves with { kind, name, duration,
  // date, time, yearly }.
  async function askCountdown(old) {
    let kind = old?.kind ?? 'timer';
    const name = el('input', { type: 'text', value: old?.name ?? '', maxLength: 60, dir: 'auto', autocomplete: 'off' });

    const total = old?.kind === 'timer' ? old.duration : 10 * 60e3;
    const number = (value, max, label) => el('input', {
      type: 'number', class: 'cd-num', min: 0, max, step: 1, value: String(value), 'aria-label': label, inputMode: 'numeric',
    });
    const hh = number(Math.floor(total / 3600e3), 99, 'Hours');
    const mm = number(Math.floor((total % 3600e3) / 60e3), 59, 'Minutes');
    const ss = number(Math.floor((total % 60e3) / 1000), 59, 'Seconds');
    const unitLabel = text => el('span', { class: 'cd-num-unit', text });
    const duration = () => ((Number(hh.value) || 0) * 3600 + (Number(mm.value) || 0) * 60 + (Number(ss.value) || 0)) * 1000;
    const presets = el('div', { class: 'sp-chips cd-presets' }, PRESETS.map(m => el('button', {
      type: 'button', class: 'sp-chip', text: m === 60 ? '1 hour' : `${m} min`, dataset: { ms: String(m * 60e3) },
      onclick: () => {
        hh.value = String(Math.floor(m / 60));
        mm.value = String(m % 60);
        ss.value = '0';
        changed();
      },
    })));
    const timerPart = el('div', { class: 'cd-part' },
      field('Duration', el('span', { class: 'cd-duration' }, hh, unitLabel('h'), mm, unitLabel('m'), ss, unitLabel('s'))),
      presets);

    const dateInput = el('input', { type: 'date', value: old?.kind === 'date' ? old.date : '' });
    const timeInput = el('input', { type: 'time', value: old?.kind === 'date' ? old.time : '' });
    const yearly = el('input', { type: 'checkbox', checked: old?.kind === 'date' && old.yearly });
    const dateHint = el('span', { class: 'field-hint' });
    const datePart = el('div', { class: 'cd-part' },
      el('div', { class: 'cd-date-row' },
        field('Date', dateInput, dateHint),
        field('Time (optional)', timeInput)),
      el('label', { class: 'cd-check' }, yearly, 'Every year, like a birthday'));

    const kindButtons = KINDS.map(k => el('button', {
      type: 'button', class: 'cd-kind', role: 'radio', dataset: { kind: k },
      onclick: () => {
        kind = k;
        changed();
        ({ timer: hh, date: dateInput }[k] ?? name).focus();
      },
    }, icon(KIND_ICONS[k], 16), KIND_LABELS[k]));
    const kinds = el('div', { class: 'cd-kinds', role: 'radiogroup', 'aria-label': 'Kind' }, kindButtons);

    const label = () => (old ? 'Save' : kind === 'date' ? 'Add' : 'Start');
    // A new one's title follows its kind: "New timer", "New stopwatch", "New countdown".
    const titleText = () => (old ? `Edit ${nameOf(old)}` : `New ${kind === 'date' ? 'countdown' : KIND_LABELS[kind].toLowerCase()}`);
    let primary = null;
    let heading = null;
    function changed() {
      for (const b of kindButtons) b.setAttribute('aria-checked', String(b.dataset.kind === kind));
      timerPart.hidden = kind !== 'timer';
      datePart.hidden = kind !== 'date';
      name.placeholder = { timer: 'Pasta', stopwatch: 'Workout', date: 'Trip to Japan' }[kind];
      const ms = duration();
      for (const chip of presets.children) chip.setAttribute('aria-pressed', String(Number(chip.dataset.ms) === ms));
      if (primary) primary.textContent = label();
      if (heading) heading.textContent = titleText();
      // The dialog checks what it holds on input; a click on a chip is one too.
      name.form?.dispatchEvent(new Event('input'));
    }

    function validate() {
      if (kind === 'stopwatch') return true;
      if (kind === 'timer') {
        const ms = duration();
        for (const chip of presets.children) chip.setAttribute('aria-pressed', String(Number(chip.dataset.ms) === ms));
        return ms >= 1000 && ms <= MAX_DURATION;
      }
      if (!isDay(dateInput.value)) {
        dateHint.textContent = '';
        return false;
      }
      const past = !yearly.checked && endOf({ kind: 'date', date: dateInput.value, time: timeInput.value, yearly: false }) <= Date.now();
      dateHint.textContent = past ? 'That’s already passed. Pick a later day, or tick Every year.' : '';
      return !past;
    }

    const asked = openDialog({
      title: titleText(),
      body: [kinds, field('Name', name), timerPart, datePart],
      actions: [{ label: 'Cancel', value: false }, { label: label(), primary: true, value: true }],
      validate,
      className: 'cd-dialog',
    });
    primary = name.form?.querySelector('.btn-primary') ?? null;
    heading = name.form?.querySelector('.dlg-title') ?? null;
    changed();
    name.focus();
    if (!await asked) return null;
    return { kind, name: name.value.trim(), duration: duration(), date: dateInput.value, time: timeInput.value, yearly: yearly.checked };
  }

  // ---- ticking ----

  // Every second while a count is live (just after the second it shows ticks over), else every
  // half minute: days change at midnight, and a date goes live a day before it ends.
  let tick = 0;
  function schedule() {
    clearTimeout(tick);
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    const live = [shown(now), ...(editing ? countdowns() : [])].filter(Boolean).find(c => display(c, now).live);
    const delay = live ? 1000 - ((((now - tickFrom(live)) % 1000) + 1000) % 1000) + 15 : SLOW_MS;
    tick = setTimeout(() => {
      render();
      schedule();
    }, delay);
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') render();
    schedule();
  }

  function onChange() {
    if (editing) renderPicker();
    render();
    schedule();
  }

  setEditing(false);
  const unsubscribe = store.subscribe(onChange, ['countdowns', 'prefs']);
  render();
  schedule();
  document.addEventListener('visibilitychange', onVisibility);

  return {
    destroy() {
      clearTimeout(tick);
      resized.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
    },
  };
}
