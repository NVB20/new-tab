// A city box that lists matching places as you type (Open-Meteo's geocoding, weather.js), for the
// Weather widget's editor, setup's Connect step and Preferences. A combobox: ↓/↑ move through the
// list, Enter picks the highlighted one (the first to start with), Esc closes the list.

import { el } from './ui.js';
import { fetchJson } from './net.js';
import { uid } from './util.js';
import { searchUrl, parsePlaces, matchParts } from './weather.js';

const PAUSE_MS = 120;   // between keystrokes before asking; a query asked before shows at once
const MIN_CHARS = 2;    // Open-Meteo answers nothing for one character
const found = new Map();   // query (lower case) → places, for as long as the page is open

async function lookUp(q) {
  const key = q.toLowerCase();
  if (found.has(key)) return found.get(key);
  const places = parsePlaces(await fetchJson(searchUrl(q), {}, 6000));
  if (places == null) throw new Error('Unexpected Open-Meteo response');
  found.set(key, places);
  return places;
}

const where = p => [p.region !== p.name ? p.region : '', p.country].filter(Boolean).join(', ');

// onPick(place) when one is chosen; the box then shows its name. Returns { root, input }.
export function cityField({ value = '', placeholder = 'Search a city', label = 'City', onPick }) {
  const id = `city-${uid()}`;
  const input = el('input', {
    type: 'text', class: 'pref-input city-input', value, placeholder, 'aria-label': label, dir: 'auto',
    autocomplete: 'off', spellcheck: false, maxLength: 100,
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': id,
  });
  const list = el('ul', { class: 'city-list', id, role: 'listbox', 'aria-label': `${label}: matches`, hidden: true });
  const status = el('p', { class: 'city-status', 'aria-live': 'polite', hidden: true });
  const root = el('div', { class: 'city-field' }, input, list, status);

  let places = [];
  let active = -1;
  let shownFor = null;   // the query the list was drawn for
  let timer = 0;
  let seq = 0;

  function say(text) {
    status.textContent = text;
    status.hidden = !text;
  }

  function show(on) {
    list.hidden = !(on && places.length);
    input.setAttribute('aria-expanded', String(!list.hidden));
    if (list.hidden) input.removeAttribute('aria-activedescendant');
  }

  function highlight(i) {
    active = i;
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    const li = list.children[i];
    if (li) {
      input.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    }
  }

  function draw(q) {
    shownFor = q;
    list.replaceChildren(...places.map((p, i) => el('li', { id: `${id}-${i}`, class: 'city-option', role: 'option', 'aria-selected': 'false', dataset: { i } },
      el('span', { class: 'city-name' }, matchParts(p.name, q).map(part => (part.hit ? el('b', { text: part.text }) : part.text))),
      el('span', { class: 'city-where', text: where(p) }))));
    show(document.activeElement === input);
    highlight(places.length ? 0 : -1);
  }

  async function search() {
    clearTimeout(timer);
    const q = input.value.trim();
    const my = ++seq;
    if (q.length < MIN_CHARS) {
      places = [];
      draw(q);
      say('');
      return;
    }
    // The list of the last query stays up while the next one loads.
    if (!places.length && !found.has(q.toLowerCase())) say('Searching…');
    let result = null;
    try {
      result = await lookUp(q);
    } catch {
      // said below
    }
    if (my !== seq) return;
    if (result == null) {
      places = [];
      draw(q);
      say('Couldn’t search. Check the connection and try again.');
      return;
    }
    places = result;
    draw(q);
    say(places.length ? '' : `Nothing found for “${q}”`);
  }

  function pick(i) {
    const p = places[i];
    if (!p) return;
    seq++;
    clearTimeout(timer);
    input.value = p.name;
    places = [];
    shownFor = null;
    list.replaceChildren();
    show(false);
    say('');
    onPick(p);
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, found.has(input.value.trim().toLowerCase()) ? 0 : PAUSE_MS);
  });

  input.addEventListener('keydown', async e => {
    if (e.isComposing) return;
    const n = places.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      if (list.hidden) show(true);
      else highlight((active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Typed faster than the list came: search now, then take the first match.
      if (shownFor !== input.value.trim()) {
        await search();
        if (places.length) pick(0);
      } else {
        pick(Math.max(active, 0));
      }
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      e.stopPropagation();
      show(false);
    }
  });

  // Pointing at an option highlights it; pressing it picks it without the box losing the cursor.
  const optionAt = e => e.target.closest?.('.city-option');
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('mousemove', e => {
    const li = optionAt(e);
    if (li && Number(li.dataset.i) !== active) highlight(Number(li.dataset.i));
  });
  list.addEventListener('click', e => {
    const li = optionAt(e);
    if (li) pick(Number(li.dataset.i));
  });
  input.addEventListener('focus', () => show(shownFor === input.value.trim()));
  input.addEventListener('blur', () => show(false));

  return { root, input };
}
