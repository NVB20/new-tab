// Clock widget: date, time and greeting in one of the One UI style faces. The time fills what the
// date and greeting leave of the widget's frame, so a bigger clock is a bigger clock.

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
  // A hidden copy of the time, measured at trial sizes to find the one that fills the frame.
  const probe = el('div', { class: 'clock-time clock-probe', 'aria-hidden': 'true' });
  const face = el('div', { class: 'clock-face' }, date, time, greeting, probe);
  // ✎ opens a strip of previews, one per face; picking one applies it straight away.
  const faces = el('div', { class: 'clock-faces', role: 'group', 'aria-label': 'Clock style', hidden: true });
  const editButton = el('button', {
    type: 'button',
    class: 'icon-btn widget-edit clock-edit',
    onclick: () => setEditing(faces.hidden),
  });
  const section = el('section', { class: 'widget widget-clock' }, face, editButton, faces);
  root.append(section);

  // The biggest font size at which the time fits width × height (0 if none).
  function sizeFor(width, height) {
    if (width <= 0 || height <= 0) return 0;
    let size = 100;
    for (let i = 0; i < 2; i++) {   // twice, as AM/PM keeps its own size while the digits scale
      probe.style.fontSize = `${size}px`;
      const box = probe.getBoundingClientRect();
      size *= Math.min(width / box.width, height / box.height);
    }
    return size;
  }
  const textWidth = node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().width;
  };

  // The time's size in a face `height` tall, with the date and greeting under it or beside it:
  // beside when that makes the time clearly bigger (hours over minutes in a wide frame), or when
  // the frame is too short for them under the time and beside keeps it nearly as big.
  function arrange(height) {
    const width = face.clientWidth;
    // Beside, the date and greeting keep their own width, up to 40% of the frame. The time is out
    // of the way while they're measured, so they don't wrap.
    time.style.fontSize = '0';
    face.classList.add('beside');
    const side = Math.min(width * 0.4, Math.max(textWidth(date), textWidth(greeting)));
    const beside = side ? sizeFor(width - side - parseFloat(getComputedStyle(face).columnGap), height) : 0;
    face.classList.remove('beside');
    const under = sizeFor(width, height - (face.offsetHeight - time.offsetHeight));
    return beside > under * (date.offsetHeight ? 1.15 : 0.9) ? { size: beside, beside: true } : { size: under, beside: false };
  }

  // Sizes the time to the room left in the frame, both ways. Small screens stack the frames at
  // their content's height, so there the CSS sizes stand.
  const small = matchMedia('(max-width: 900px)');
  function fit() {
    if (small.matches || !section.clientHeight || !probe.firstChild) {
      face.classList.remove('beside');
      time.style.fontSize = '';
      return;
    }
    const pad = getComputedStyle(section);
    const room = section.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
    const strip = faces.hidden ? 0 : faces.offsetHeight + parseFloat(getComputedStyle(faces).marginTop);
    let best = arrange(room - strip);
    // No room for a readable time above the open ✎ strip: it keeps its size and the frame scrolls.
    if (strip && best.size < 48) best = arrange(room);
    face.classList.toggle('beside', best.beside);
    time.style.fontSize = `${Math.max(24, Math.floor(best.size))}px`;
  }
  // fit() measures the page several times over: after a redraw it waits for the next frame, so a
  // new tab measures once, with every widget on the page, rather than while they're still mounting.
  let fitFrame = 0;
  const fitSoon = () => {
    fitFrame ||= requestAnimationFrame(() => {
      fitFrame = 0;
      fit();
    });
  };

  function setEditing(on) {
    faces.hidden = !on;
    section.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Clock style';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    if (on) renderClock(true);
    else fitSoon();
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
    // The time as shown, so it fills the frame: in Stencil and Serif, whose 1s are narrow, it
    // grows or shrinks a little when the digits change.
    probe.replaceChildren(...clockDigits(current, now, c));
    fitSoon();
  }

  // Only this copy's own settings change what it shows (its size and fonts refit it below), so
  // other settings, e.g. a slider dragged in Preferences, don't redraw and refit it.
  let shownSettings = JSON.stringify(settings());
  const unsubscribe = store.subscribe(() => {
    const next = JSON.stringify(settings());
    if (next === shownSettings) return;
    shownSettings = next;
    renderClock(true);
  }, ['prefs']);
  renderClock(true);
  // A new tab builds its time out of a single point, then redraws it as plain text.
  playClockIntro(time, [date, greeting]).then(() => renderClock(true));
  // The time shows minutes: one wake a minute, just after it turns, and none while the tab is
  // hidden (it catches up when shown).
  let timer = 0;
  function tick() {
    clearTimeout(timer);
    if (document.hidden) return;
    timer = setTimeout(() => {
      renderClock();
      tick();
    }, 60000 - (Date.now() % 60000) + 50);
  }
  const onVisibility = () => {
    if (!document.hidden) renderClock();
    tick();
  };
  document.addEventListener('visibilitychange', onVisibility);
  tick();
  // Refit when the frame is resized and when a face's font arrives (its digits measure differently).
  const resized = new ResizeObserver(() => fit());
  resized.observe(section);
  document.fonts.addEventListener('loadingdone', fit);
  return {
    destroy() {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
      resized.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    },
  };
}
