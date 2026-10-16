// Widget column: clock with greeting, tasks and notes.

import { el, icon } from './ui.js';
import { playClockIntro } from './clock-intro.js';
import { mountTasks } from './task-widget.js';

function partOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

// One UI style lock-screen faces. Stacked faces put the hours above the minutes; the faces with
// a `font` show that face's font on one line. In this order the ✎ strip's four columns line up
// each stacked face with its one-line twin.
export const CLOCK_FACES = [
  { id: 'classic', label: 'Classic' },
  { id: 'stencil', label: 'Stencil', stacked: true },
  { id: 'rounded', label: 'Rounded', stacked: true },
  { id: 'serif', label: 'Serif', stacked: true },
  { id: 'dot', label: 'Dot' },
  { id: 'stencil-line', label: 'Stencil', font: 'stencil' },
  { id: 'rounded-line', label: 'Rounded', font: 'rounded' },
  { id: 'serif-line', label: 'Serif', font: 'serif' },
];
const faceOf = id => CLOCK_FACES.find(f => f.id === id) ?? CLOCK_FACES[0];
const faceClass = f => `face-${f.font ?? f.id}${f.stacked ? ' stacked' : ''}`;

const heading = (iconName, text) => el('h2', { class: 'widget-head' }, icon(iconName, 18), el('span', { text }));

// The time's children for a face: "9:05" (or "905" without the colon) in one line, or "09" over
// "05" (stacked faces always show two-digit hours).
function clockDigits(face, now, { hour24, colon }) {
  const h = now.getHours();
  const hour = hour24 ? h : h % 12 || 12;
  const hh = hour24 || face.stacked ? String(hour).padStart(2, '0') : String(hour);
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ampm = !hour24 && el('span', { class: 'clock-ampm', text: h < 12 ? 'AM' : 'PM' });
  return face.stacked
    ? [el('span', { class: 'clock-h', text: hh }), el('span', { class: 'clock-m' }, mm, ampm)]
    : [`${hh}${colon ? ':' : ''}${mm}`, ampm].filter(Boolean);
}

export function mountWidgets(root, store) {
  const date = el('div', { class: 'clock-date' });
  const time = el('div', { class: 'clock-time' });
  const greeting = el('div', { class: 'clock-greeting', dir: 'auto' });
  const face = el('div', { class: 'clock-face' }, date, time, greeting);
  // ✎ opens a strip of previews, one per face; picking one applies it straight away.
  const faces = el('div', { class: 'clock-faces', role: 'group', 'aria-label': 'Clock style', hidden: true });
  const editButton = el('button', {
    type: 'button',
    class: 'icon-btn widget-edit clock-edit',
    onclick: () => setEditing(faces.hidden),
  });
  const clock = el('section', { class: 'widget widget-clock' }, face, editButton, faces);

  function setEditing(on) {
    faces.hidden = !on;
    clock.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Clock style';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    if (on) renderClock(true);
  }
  setEditing(false);

  const tasks = mountTasks(store);

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
    const current = faceOf(c.face);
    face.className = `clock-face ${faceClass(current)}`;
    // Classic keeps "Friday, Oct 16"; the One UI faces use the short "Fri 16 Oct".
    date.textContent = current.id === 'classic'
      ? now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      : now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    time.replaceChildren(...clockDigits(current, now, c));
    greeting.hidden = !c.greeting;
    greeting.textContent = `Good ${partOfDay(now.getHours())}${c.name.trim() ? ', ' + c.name.trim() : ''}`;
    if (!faces.hidden) {
      faces.replaceChildren(...CLOCK_FACES.map(f => el('button', {
        type: 'button',
        class: `clock-face-btn ${faceClass(f)}`,
        'aria-pressed': String(f.id === current.id),
        onclick: () => store.update(s => { s.prefs.widgets.clock.face = f.id; }),
      }, el('span', { class: 'clock-time', 'aria-hidden': 'true' }, clockDigits(f, now, c)), el('span', { class: 'clock-face-label', text: f.label }))));
    }
  }

  function render(state) {
    const w = state.prefs.widgets;
    root.hidden = !w.enabled || !(w.clock.enabled || w.tasks.enabled || w.notes.enabled);
    clock.hidden = !w.clock.enabled;
    tasks.hidden = !w.tasks.enabled;
    notes.hidden = !w.notes.enabled;
    // Don't overwrite the textarea while typing in it (it would move the cursor).
    if (document.activeElement !== notesArea) notesArea.value = state.notes;
    renderClock(true);
  }

  store.subscribe(render, ['notes', 'prefs']);
  render(store.get());
  // A new tab builds its time out of a single point, then redraws it as plain text.
  playClockIntro(time, [date, greeting]).then(() => renderClock(true));
  setInterval(renderClock, 1000);
}
