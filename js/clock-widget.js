// Clock widget: date, time and greeting in one of the One UI style faces. The face is sized to
// the widget's frame (container query units, see the CSS), so a bigger clock is a bigger clock.

import { el, icon } from './ui.js';
import { copyById, TYPES } from './layout.js';
import { playClockIntro } from './clock-intro.js';

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

export function mountClock(root, store, copy) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.clock.defaults();

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
  const section = el('section', { class: 'widget widget-clock' }, face, editButton, faces);
  root.append(section);

  function setEditing(on) {
    faces.hidden = !on;
    section.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Clock style';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    if (on) renderClock(true);
  }
  setEditing(false);

  const pickFace = id => store.update(s => {
    const own = copyById(s, copy.id);
    if (own) own.settings.face = id;
  });

  let shownMinute = '';
  function renderClock(force = false) {
    const now = new Date();
    const minute = now.toDateString() + now.getHours() + ':' + now.getMinutes();
    if (!force && minute === shownMinute) return;
    shownMinute = minute;

    const c = settings();
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
        onclick: () => pickFace(f.id),
      }, el('span', { class: 'clock-time', 'aria-hidden': 'true' }, clockDigits(f, now, c)), el('span', { class: 'clock-face-label', text: f.label }))));
    }
  }

  const unsubscribe = store.subscribe(() => renderClock(true), ['prefs']);
  renderClock(true);
  // A new tab builds its time out of a single point, then redraws it as plain text.
  playClockIntro(time, [date, greeting]).then(() => renderClock(true));
  const timer = setInterval(renderClock, 1000);
  return {
    destroy() {
      clearInterval(timer);
      unsubscribe();
    },
  };
}
