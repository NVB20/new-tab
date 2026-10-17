// Weather widget: a city's conditions now, the next hours and the week (weather.js), from
// Open-Meteo, or MET Norway while it's down, through the request cache, shared by every copy and
// tab showing the same city. ✎ swaps the forecast for a city search and the °C / °F choice.

import { el, icon, widgetHead, widgetSub, widgetEmpty } from './ui.js';
import { feed, fetchJson, peek } from './net.js';
import { timeAgo } from './feeds.js';
import { copyById, allLayouts, copiesOf, TYPES } from './layout.js';
import {
  SOURCES, condition, placeLabel, placeKey, forecastUrl, parseForecast, metnoUrl, parseMetno, guessOffset, nextHours, nextDays,
  degrees, windSpeed, hourLabel, timeLabel, dayLabel, localDate, rangeBars, nextSun,
} from './weather.js';
import { cityField } from './city-search.js';

const TTL = 15 * 60e3;          // Open-Meteo updates its models about hourly; current values every 15 min
const METNO_TTL = 30 * 60e3;    // MET Norway asks not to be asked again before its forecast expires (~30 min)
const REFRESH_MS = 5 * 60e3;    // how often an open tab asks the cache
const KEY = 'weather-v1';
const keyFor = place => `${KEY}:${placeKey(place)}`;
const RAIN_SHOWN = 20;          // % chance from which an hour or a day shows it

const must = (value, source) => {
  if (value == null) throw new Error(`Unexpected ${source} response`);
  return value;
};

// Open-Meteo, then MET Norway, which names no time zone: the place's is taken from the forecast
// saved before, else guessed with this computer's.
const offsetOf = place => peek(keyFor(place))?.data?.offset ?? guessOffset(place.lon, -new Date().getTimezoneOffset() * 60);
const sources = place => [
  { name: 'Open-Meteo', load: async () => must(parseForecast(await fetchJson(forecastUrl(place))), 'Open-Meteo') },
  { name: 'MET Norway', load: async () => must(parseMetno(await fetchJson(metnoUrl(place)), offsetOf(place)), 'MET Norway') },
];

export function mountWeather(root, store, copy) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.weather.defaults();
  // Times follow the Clock's 12/24-hour setting.
  const hour24 = () => allLayouts(store.get()).flatMap(copiesOf).find(c => c.type === 'clock')?.settings.hour24 ?? true;
  const newTab = () => store.get().prefs.openInNewTab;

  const editButton = el('button', { type: 'button', class: 'icon-btn widget-edit', onclick: () => setEditing(!editing) });
  const head = widgetHead('cloud-sun', 'Weather');
  const title = head.querySelector('span');
  head.append(editButton);
  const body = el('div', { class: 'wx-body' });
  const editor = el('div', { class: 'wx-editor', hidden: true });
  const section = el('section', { class: 'widget widget-weather' }, head, body, editor);
  root.append(section);

  let result = null;   // { data: forecast, at, via, error } for the place shown
  let loaded = false;

  // ---- the forecast ----

  const pickLink = text => el('button', { type: 'button', class: 'link-btn', text, onclick: () => setEditing(true) });

  function nowBlock(f, today, unit) {
    const c = condition(f.now.code, f.now.isDay);
    return el('div', { class: 'wx-now' },
      el('span', { class: 'wx-now-icon', title: c.label }, icon(c.icon, 44)),
      el('span', { class: 'wx-temp', text: degrees(f.now.temp, unit) }),
      el('span', { class: 'wx-now-text' },
        el('span', { class: 'wx-cond', text: c.label }),
        today ? el('span', { class: 'wx-hilo', text: `H ${degrees(today.max, unit)}  L ${degrees(today.min, unit)}` }) : null));
  }

  // Feels like, wind, humidity, and the next sunrise or sunset.
  function metaLine(f, unit, now) {
    const sun = nextSun(f, now);
    const item = (cls, text) => el('span', { class: cls, text });
    return el('p', { class: 'wx-meta' },
      item('wx-feels', `Feels ${degrees(f.now.feels, unit)}`),
      item('wx-wind', `Wind ${windSpeed(f.now.wind, unit)}`),
      f.now.humidity != null ? item('wx-humid', `Humidity ${Math.round(f.now.humidity)}%`) : null,
      sun ? item('wx-sun', `${sun.kind} ${timeLabel(sun.at, f.offset, hour24())}`) : null);
  }

  const rain = n => (n != null && n >= RAIN_SHOWN ? el('span', { class: 'wx-rain', text: `${Math.round(n)}%` }) : null);

  function hoursList(f, unit, now) {
    return el('ol', { class: 'wx-hours', 'aria-label': 'Next hours' }, nextHours(f, now).map((h, i) => {
      const c = condition(h.code, h.isDay);
      const at = i === 0 ? 'Now' : hourLabel(h.at, f.offset, hour24());
      return el('li', { class: 'wx-hour', title: `${at}: ${c.label}${h.rain != null ? `, ${Math.round(h.rain)}% chance of rain` : ''}` },
        el('span', { class: 'wx-hour-at', text: at }), icon(c.icon, 20),
        el('span', { class: 'wx-hour-temp', text: degrees(h.temp, unit) }), rain(h.rain));
    }));
  }

  function daysList(f, unit, now) {
    const today = localDate(now, f.offset);
    const days = nextDays(f, now);
    const bars = rangeBars(days);
    return el('ol', { class: 'wx-days', 'aria-label': 'The week' }, days.map((d, i) => {
      const c = condition(d.code, true);
      const bar = el('span', { class: 'wx-bar-fill' });
      bar.style.left = `${bars[i].left}%`;
      bar.style.width = `${bars[i].width}%`;
      return el('li', {
        class: 'wx-day',
        title: `${dayLabel(d.date, today, { long: true })}: ${c.label}, ${degrees(d.min, unit)} to ${degrees(d.max, unit)}${d.rain != null ? `, ${Math.round(d.rain)}% chance of rain` : ''}`,
      },
      el('span', { class: 'wx-day-name', text: dayLabel(d.date, today) }),
      el('span', { class: 'wx-day-icon' }, icon(c.icon, 18), rain(d.rain)),
      el('span', { class: 'wx-lo', text: degrees(d.min, unit) }),
      el('span', { class: 'wx-bar' }, bar),
      el('span', { class: 'wx-hi', text: degrees(d.max, unit) }));
    }));
  }

  function problem() {
    if (!result?.error) return null;
    if (!result.data) return el('p', { class: 'widget-note' }, 'Couldn’t load the forecast. ', el('button', { type: 'button', class: 'link-btn', text: 'Try again', onclick: () => load(true) }));
    const ago = timeAgo(result.at);
    const down = Object.keys(SOURCES).join(' and ');
    return el('p', { class: 'widget-note', text: ago === 'now' ? `${down} unreachable` : `${down} unreachable · from ${ago} ago` });
  }

  // The source the forecast shown came from: Open-Meteo unless it was down.
  const via = () => (result?.data && SOURCES[result.via] ? result.via : 'Open-Meteo');

  // What the body was last drawn from: a refresh that changes nothing shown leaves it alone.
  let drawn = '';

  function render() {
    const s = settings();
    title.textContent = s.place?.name ?? 'Weather';
    head.title = s.place ? `${placeLabel(s.place, { region: true })} · forecast from ${via()}` : '';
    const now = Date.now();
    const f = result?.data;
    // The time matters too: "Now" moves on, and so do Today and the next sunrise or sunset.
    const next = JSON.stringify([s, loaded, f, result?.error ? result.at : null, hour24(), Math.floor(now / 600e3)]);
    if (next === drawn) return;
    drawn = next;
    if (!s.place) {
      body.replaceChildren(widgetEmpty('No city yet. ', pickLink('Choose one')));
      return;
    }
    if (!f) {
      body.replaceChildren(result?.error ? problem() : widgetEmpty(loaded ? 'No forecast' : 'Loading…'));
      return;
    }
    const today = f.days.find(d => d.date === localDate(now, f.offset));
    body.replaceChildren(...[
      nowBlock(f, today, s.unit),
      metaLine(f, s.unit, now),
      hoursList(f, s.unit, now),
      daysList(f, s.unit, now),
      problem(),
    ].filter(Boolean));
  }

  // ---- loading ----

  let seq = 0;
  async function load(force = false) {
    const { place } = settings();
    if (!place) return;
    const my = ++seq;
    const ttl = force ? 0 : peek(keyFor(place))?.via === 'MET Norway' ? METNO_TTL : TTL;
    const r = await feed(keyFor(place), ttl, sources(place));
    if (my !== seq) return;
    result = r;
    loaded = true;
    render();
  }

  // ---- editor: a city search and the unit ----

  let editing = false;

  function update(fn) {
    store.update(s => {
      const own = copyById(s, copy.id);
      if (own) fn(own.settings);
    }, ['prefs']);
  }

  function renderEditor() {
    const s = settings();
    const city = cityField({
      label: 'Search a city',
      onPick: p => {
        update(own => { own.place = p; });
        setEditing(false);
      },
    });
    // The typed city stays when the unit changes: the chips flip in place.
    const units = el('div', { class: 'sp-chips' }, [['c', '°C, km/h'], ['f', '°F, mph']].map(([value, text]) => el('button', {
      type: 'button', class: 'sp-chip', text, 'aria-pressed': String(s.unit === value),
      onclick: e => {
        update(own => { own.unit = value; });
        for (const b of units.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      },
    })));
    const link = el('a', { href: SOURCES[via()], rel: 'noopener', text: via(), ...(newTab() ? { target: '_blank' } : {}) });
    editor.replaceChildren(...[
      widgetSub('City'),
      s.place ? el('p', { class: 'wx-current', text: placeLabel(s.place, { region: true }) }) : null,
      city.root,
      widgetSub('Units'),
      units,
      el('p', { class: 'widget-note' }, 'Forecast: ', link),
    ].filter(Boolean));
    requestAnimationFrame(() => city.input.focus());
  }

  function setEditing(on) {
    editing = on;
    section.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Choose the city';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    body.hidden = on;
    editor.hidden = !on;
    if (on) renderEditor();
    else editor.replaceChildren();
  }

  setEditing(false);

  // ---- wiring ----

  let conf = null;

  function onPrefs(state) {
    const own = copyById(state, copy.id);
    if (!own) return;
    const place = own.settings.place;
    const next = place ? placeKey(place) : '';
    if (next !== conf) {
      conf = next;
      seq++;
      // What's saved shows straight away; a fetch follows when it's old.
      const hit = place ? peek(keyFor(place)) : null;
      result = hit ? { data: hit.data, at: hit.at, via: hit.via } : null;
      loaded = !!hit;
      load();
    }
    render();
  }

  function refresh() {
    if (document.visibilityState === 'visible') load();
  }

  const unsubscribe = store.subscribe(onPrefs, ['prefs']);
  onPrefs(store.get());
  const interval = setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);

  return {
    destroy() {
      seq++;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      unsubscribe();
    },
  };
}
