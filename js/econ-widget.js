// Economic calendar widget: this week's releases for the copy's markets and importance levels
// (econ.js), from TradingView, or ForexFactory while it's down, through the request cache, shared
// by every copy and tab: copies only filter what they show. ✎ swaps the list for the importance
// and market chips.

import { el, icon, widgetHead, widgetSub, widgetEmpty } from './ui.js';
import { feed, fetchJson, peek } from './net.js';
import { timeAgo } from './feeds.js';
import { copyById, allLayouts, copiesOf, TYPES } from './layout.js';
import { hasChrome, sessionRuleReady, hasHostAccess, reloadExtension } from './chrome-api.js';
import { formatTime, longDay } from './sports.js';
import {
  LEVELS, MARKETS, LEVEL_LABELS, MARKET_LABELS, SOURCES, FF_FEED, TV_HOST, tvUrl, originRule, isOriginRule,
  parseTradingView, parseForexFactory, calendar, untilLabel, econTtl,
} from './econ.js';

const KEY = 'econ-v1';
const REFRESH_MS = 60e3;   // the countdowns move on, and a due number may be out
const DOTS = { high: 3, medium: 2, low: 1 };

const must = (value, source) => {
  if (value == null) throw new Error(`Unexpected ${source} response`);
  return value;
};

// TradingView answers only with its own Origin, which the session rule sets (econ.js originRule);
// without it the 403 hands over to ForexFactory.
const sources = [
  {
    name: 'TradingView',
    load: async () => {
      await sessionRuleReady('econ-origin', isOriginRule, originRule);
      return must(parseTradingView(await fetchJson(tvUrl(Date.now()))), 'TradingView');
    },
  },
  { name: 'ForexFactory', load: async () => must(parseForexFactory(await fetchJson(FF_FEED)), 'ForexFactory') },
];

export function mountEcon(root, store, copy) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.econ.defaults();
  // Times follow the Clock's 12/24-hour setting.
  const hour24 = () => allLayouts(store.get()).flatMap(copiesOf).find(c => c.type === 'clock')?.settings.hour24 ?? true;
  const newTab = () => store.get().prefs.openInNewTab;

  const editButton = el('button', { type: 'button', class: 'icon-btn widget-edit', onclick: () => setEditing(!editing) });
  const head = widgetHead('calendar', TYPES.econ.label);
  head.append(editButton);
  const body = el('div', { class: 'ec-body' });
  const editor = el('div', { class: 'ec-editor', hidden: true });
  const section = el('section', { class: 'widget widget-econ' }, head, body, editor);
  root.append(section);

  let result = null;     // { data: events, at, via, error }
  let loaded = false;
  let version = 0;       // bumped with every new result
  // Chrome grants a manifest's new sites only when the extension is reloaded. Until then a fetch
  // can only fail, and feed() would hold that failure back from the first try after the reload.
  const granted = hasChrome ? hasHostAccess(`https://${TV_HOST}/*`) : Promise.resolve(false);
  let access = true;     // what granted said, once it has

  // ---- the list ----

  // The source the events shown came from: TradingView unless it was down.
  const via = () => (result?.data && SOURCES[result.via] ? result.via : 'TradingView');
  const timeOf = e => (e.allDay ? 'All day' : formatTime(e.at, hour24()));

  function dots(level) {
    return el('span', { class: `ec-dots ${level}`, role: 'img', 'aria-label': `${LEVEL_LABELS[level]} importance` },
      [1, 2, 3].map(i => el('i', { class: i <= DOTS[level] ? 'on' : null })));
  }

  // The hover text: the title and period, market, importance and when, the source, the description.
  function about(e) {
    const when = e.allDay ? longDay(Date.parse(`${e.day}T12:00:00Z`), 'UTC') : `${longDay(e.at)}, ${timeOf(e)}`;
    const what = e.kind === 'holiday' ? 'Holiday' : `${LEVEL_LABELS[e.level]} importance`;
    return [`${e.title}${e.period ? ` · ${e.period}` : ''}`, `${MARKET_LABELS[e.market]} · ${what} · ${when}`, e.source, e.about]
      .filter(Boolean).join('\n');
  }

  // Out: the actual, ▲ or ▼ against the forecast (or the previous); next: the countdown; due: Due.
  function outcome(e, now) {
    if (e.state === 'out') {
      const against = e.forecast ? 'forecast' : 'previous';
      return el('b', { class: 'ec-actual' }, e.actual, e.move ? el('span', {
        class: `ec-move ${e.move}`, text: e.move === 'up' ? '▲' : '▼', title: `${e.move === 'up' ? 'Above' : 'Below'} the ${against}`,
      }) : null);
    }
    if (e.state === 'next') return el('span', { class: 'ec-until', text: untilLabel(e.at, now) });
    if (e.state === 'due') return el('span', { class: 'ec-due', text: 'Due' });
    return null;
  }

  function row(e, now) {
    const holiday = e.kind === 'holiday';
    const right = outcome(e, now);
    const values = [['f', e.forecast, 'Forecast'], ['p', e.previous, 'Previous']].filter(([, v]) => v)
      .map(([k, v, label]) => el('span', { class: `ec-${k}`, title: label }, el('i', { text: k }), v));
    return el('div', { class: `ec-row ${e.state}${holiday ? ' holiday' : ''}`, title: about(e) },
      el('span', { class: 'ec-time', text: timeOf(e) }),
      el('span', { class: 'ec-tag', text: e.market }),
      holiday ? el('span', { class: 'ec-dots' }) : dots(e.level),
      el('span', { class: 'ec-title' }, holiday ? 'Holiday · ' : null, e.title, e.period ? el('span', { class: 'ec-period', text: ` · ${e.period}` }) : null),
      right ? el('span', { class: 'ec-right' }, right) : null,
      values.length ? el('span', { class: 'ec-vals' }, values) : null);
  }

  // Each day under its heading; today's past rows above a line where the ones ahead start.
  function list(days, now) {
    return el('div', { class: 'ec-list' }, days.map(d => {
      const ahead = d.events.findIndex(e => e.state === 'next' || e.state === 'later');
      const line = d.label === 'Today' && ahead > 0 && d.events.slice(0, ahead).some(e => !e.allDay) ? ahead : -1;
      return [
        el('div', { class: 'ec-day', text: d.label }),
        d.events.map((e, i) => [i === line ? el('div', { class: 'ec-now', 'aria-hidden': 'true' }) : null, row(e, now)]),
      ];
    }));
  }

  function problem() {
    if (!access) {
      return el('p', { class: 'widget-note' }, 'Reload the extension to load the calendar. ',
        el('button', { type: 'button', class: 'link-btn', text: 'Reload', onclick: reloadExtension }));
    }
    if (!result?.error) {
      return via() === 'ForexFactory' ? el('p', { class: 'widget-note', text: 'From ForexFactory: USA and Eurozone this week, no actual numbers' }) : null;
    }
    if (!result.data) return el('p', { class: 'widget-note' }, 'Couldn’t load the calendar. ', el('button', { type: 'button', class: 'link-btn', text: 'Try again', onclick: () => load(true) }));
    const ago = timeAgo(result.at);
    const down = Object.keys(SOURCES).join(' and ');
    return el('p', { class: 'widget-note', text: ago === 'now' ? `${down} unreachable` : `${down} unreachable · from ${ago} ago` });
  }

  const shownNow = (events, now) => {
    return calendar(events, { markets: settings().markets, now });
  };

  // What the body was last drawn from: a refresh that changes nothing shown leaves it alone. The
  // minute matters too: the countdowns, and rows going by.
  let drawn = '';

  function render() {
    const s = settings();
    const now = Date.now();
    head.title = `Times in your time zone · from ${via()}`;
    const next = JSON.stringify([s, version, loaded, access, hour24(), Math.floor(now / 60e3)]);
    if (next === drawn) return;
    drawn = next;
    section.classList.toggle('h12', !hour24());
    if (!hasChrome) {
      body.replaceChildren(widgetEmpty('The calendar loads in the extension.'));
      return;
    }
    const events = result?.data;
    if (!events) {
      body.replaceChildren(result?.error || !access ? problem() : widgetEmpty(loaded ? 'Nothing on the calendar' : 'Loading…'));
      return;
    }
    const days = shownNow(events, now);
    body.replaceChildren(...[
      days.length ? list(days, now) : widgetEmpty('Nothing for these filters this week. ',
        el('button', { type: 'button', class: 'link-btn', text: 'Change filters', onclick: () => setEditing(true) })),
      problem(),
    ].filter(Boolean));
  }

  // ---- loading ----

  let seq = 0;
  async function load(force = false) {
    if (!hasChrome) return;
    const my = ++seq;
    access = await granted;
    if (my !== seq) return;
    if (!access) {
      render();
      return;
    }
    const saved = peek(KEY);
    const now = Date.now();
    const ttl = force ? 0 : econTtl(saved?.data ? shownNow(saved.data, now).flatMap(d => d.events) : [], now, saved?.via);
    const r = await feed(KEY, ttl, sources);
    if (my !== seq) return;
    result = r;
    loaded = true;
    version++;
    render();
  }

  // ---- editor: the importance levels each market shows ----

  let editing = false;

  function update(fn) {
    store.update(s => {
      const own = copyById(s, copy.id);
      if (own) fn(own.settings);
    }, ['prefs']);
  }

  const onCount = by => MARKETS.reduce((n, m) => n + by[m].length, 0);

  // A row per market: its name, then High, Medium and Low as toggles. A market with none on isn't
  // shown; the last one on, of all of them, stays on. They flip in place, so the focus stays on
  // the one pressed.
  function levelRows() {
    const rows = el('div', { class: 'ec-levels' });
    const paint = () => {
      const by = settings().markets;
      const lastOne = onCount(by) === 1;
      for (const b of rows.querySelectorAll('.sp-chip')) {
        const pressed = by[b.dataset.market].includes(b.dataset.level);
        b.setAttribute('aria-pressed', String(pressed));
        if (pressed && lastOne) {
          b.setAttribute('aria-disabled', 'true');
          b.title = 'At least one stays on';
        } else {
          b.removeAttribute('aria-disabled');
          b.removeAttribute('title');
        }
      }
      for (const name of rows.querySelectorAll('.ec-market')) name.classList.toggle('off', !by[name.dataset.market].length);
    };
    for (const m of MARKETS) {
      rows.append(
        el('span', { class: 'ec-market', text: MARKET_LABELS[m], dataset: { market: m } }),
        el('div', { class: 'sp-chips', role: 'group', 'aria-label': `${MARKET_LABELS[m]}: importance` }, LEVELS.map(level => el('button', {
          type: 'button', class: 'sp-chip', text: LEVEL_LABELS[level], dataset: { market: m, level },
          onclick: () => {
            const by = settings().markets;
            const on = by[m].includes(level);
            if (on && onCount(by) === 1) return;
            const next = LEVELS.filter(l => (l === level ? !on : by[m].includes(l)));
            update(own => { own.markets = Object.fromEntries(MARKETS.map(x => [x, x === m ? next : [...by[x]]])); });
            paint();
          },
        }))));
    }
    paint();
    return rows;
  }

  function renderEditor() {
    const link = el('a', { href: SOURCES[via()], rel: 'noopener', text: via(), ...(newTab() ? { target: '_blank' } : {}) });
    editor.replaceChildren(
      widgetSub('Importance by market'),
      levelRows(),
      el('p', { class: 'widget-note', text: 'A market with nothing on isn’t shown. Holidays show for every market shown.' }),
      el('p', { class: 'widget-note', text: 'Israel: rate decisions and CPI count as High, GDP and unemployment as Medium.' }),
      el('p', { class: 'widget-note' }, 'Calendar: ', link, '. Times in your time zone.'));
  }

  function setEditing(on) {
    editing = on;
    section.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Choose markets and importance';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    body.hidden = on;
    editor.hidden = !on;
    if (on) renderEditor();
    else editor.replaceChildren();
  }

  setEditing(false);

  // ---- wiring ----

  function refresh() {
    if (document.visibilityState === 'visible') load();
  }

  // A change of filters is drawn from what's saved: every copy shares one fetch of everything.
  const unsubscribe = store.subscribe(state => {
    if (copyById(state, copy.id)) render();
  }, ['prefs']);
  const hit = peek(KEY);
  result = hit ? { data: hit.data, at: hit.at, via: hit.via } : null;
  loaded = !!hit;
  render();
  load();
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
