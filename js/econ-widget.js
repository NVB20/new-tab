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
import { showCard, hideCard, cardRow } from './econ-card.js';
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

  const arrow = move => (move ? el('span', { class: `ec-move ${move}`, text: move === 'up' ? '▲' : '▼' }) : null);

  // The hover card (econ-card.js): the market and importance, the release and when (with how long
  // until or since), the actual, forecast and previous with how the actual compares, what the
  // indicator measures, and who publishes it.
  function cardContent(e, now) {
    const holiday = e.kind === 'holiday';
    const pills = el('div', { class: 'ec-card-pills' },
      el('span', { class: 'ec-pill' }, el('b', { text: e.market }), MARKET_LABELS[e.market]),
      holiday ? el('span', { class: 'ec-pill', text: 'Holiday' })
        : el('span', { class: `ec-pill ${e.level}` }, dots(e.level), `${LEVEL_LABELS[e.level]} importance`));
    const date = e.allDay ? longDay(Date.parse(`${e.day}T12:00:00Z`), 'UTC') : longDay(e.at);
    const ago = timeAgo(e.at, now);
    const relative = e.allDay ? 'All day' : e.at > now ? untilLabel(e.at, now) : ago === 'now' ? 'just now' : `${ago} ago`;
    const when = el('p', { class: 'ec-card-when' },
      e.allDay ? null : el('b', { text: timeOf(e) }), e.allDay ? null : ' · ', date, el('span', { class: 'ec-card-rel', text: ` · ${relative}` }));
    const numbers = !holiday && (e.actual || e.forecast || e.previous || e.state === 'due');
    const cell = (label, value, cls = '') => el('div', { class: `ec-num ${cls}` },
      el('span', { class: 'ec-num-label', text: label }), el('span', { class: 'ec-num-value' }, value || '—'));
    const actual = e.actual ? [e.actual, arrow(e.move)] : e.state === 'due' ? 'Due' : '';
    const against = e.forecast ? 'forecast' : 'previous';
    const compare = !e.actual ? '' : e.move ? `${e.move === 'up' ? 'Above' : 'Below'} the ${against}` : e.forecast || e.previous ? `In line with the ${against}` : '';
    const from = [e.source, `via ${via()}`].filter(Boolean).join(' · ');
    return [
      pills,
      el('p', { class: 'ec-card-title' }, e.title, e.period ? el('span', { class: 'ec-card-period', text: ` · ${e.period}` }) : null),
      when,
      numbers ? el('div', { class: 'ec-nums' },
        cell('Actual', actual, `actual${e.state === 'due' ? ' due' : ''}`), cell('Forecast', e.forecast), cell('Previous', e.previous)) : null,
      compare ? el('p', { class: 'ec-card-compare', text: compare }) : null,
      e.about ? el('p', { class: 'ec-card-about', text: e.about }) : null,
      el('p', { class: 'ec-card-from', text: from }),
    ].filter(Boolean);
  }

  // Out: the actual, ▲ or ▼ against the forecast (or the previous); next: the countdown; due: Due.
  function outcome(e, now) {
    if (e.state === 'out') return el('b', { class: 'ec-actual' }, e.actual, arrow(e.move));
    if (e.state === 'next') return el('span', { class: 'ec-until', text: untilLabel(e.at, now) });
    if (e.state === 'due') return el('span', { class: 'ec-due', text: 'Due' });
    return null;
  }

  let shown = new Map();   // the rows drawn, by event id → the event

  function row(e, now) {
    const holiday = e.kind === 'holiday';
    const right = outcome(e, now);
    const values = [['f', e.forecast], ['p', e.previous]].filter(([, v]) => v)
      .map(([k, v]) => el('span', { class: `ec-${k}` }, el('i', { text: k }), v));
    shown.set(e.id, e);
    return el('div', { class: `ec-row ${e.state}${holiday ? ' holiday' : ''}`, tabindex: '0', dataset: { id: e.id } },
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

  const rowFor = id => body.querySelector(`.ec-row[data-id="${CSS.escape(id)}"]`);

  function render() {
    const s = settings();
    const now = Date.now();
    head.title = `Times in your time zone · from ${via()}`;
    const next = JSON.stringify([s, version, loaded, access, hour24(), Math.floor(now / 60e3)]);
    if (next === drawn) return;
    drawn = next;
    // The rows are drawn anew: the card and the focus move to the same release's new row.
    const open = ownCard();
    const focused = body.contains(document.activeElement) ? document.activeElement.dataset?.id : null;
    draw(now);
    const again = open ? rowFor(open.dataset.id) : null;
    if (again) openCard(again);
    else if (open) hideCard(open);
    if (focused) rowFor(focused)?.focus({ preventScroll: true });
  }

  function draw(now) {
    section.classList.toggle('h12', !hour24());
    shown = new Map();
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

  // ---- the hover card ----

  const HOVER_MS = 300;   // the pointer rests this long on a row before its card opens
  const LEAVE_MS = 80;    // time to reach the next row, where the card moves at once
  let showTimer = 0;
  let hideTimer = 0;

  // The row of this widget the card is open for, or null.
  function ownCard() {
    const open = cardRow();
    return open && body.contains(open) ? open : null;
  }

  function openCard(target) {
    const e = shown.get(target.dataset.id);
    if (e) showCard(target, cardContent(e, Date.now()));
  }

  function closeCard() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    const open = ownCard();
    if (open) hideCard(open);
  }

  const rowOf = ev => ev.target.closest?.('.ec-row') ?? null;

  body.addEventListener('pointerover', ev => {
    const target = rowOf(ev);
    if (!target || ev.pointerType === 'touch') return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    if (ownCard() === target) return;
    if (ownCard()) openCard(target);
    else showTimer = setTimeout(() => { if (target.isConnected) openCard(target); }, HOVER_MS);
  });
  body.addEventListener('pointerout', ev => {
    const target = rowOf(ev);
    if (!target || target.contains(ev.relatedTarget)) return;
    clearTimeout(showTimer);
    hideTimer = setTimeout(() => { if (!target.matches(':focus-visible')) hideCard(target); }, LEAVE_MS);
  });
  // The keyboard: Tab to a row opens its card, Esc closes it.
  body.addEventListener('focusin', ev => {
    const target = rowOf(ev);
    if (target?.matches(':focus-visible')) {
      clearTimeout(hideTimer);
      openCard(target);
    }
  });
  body.addEventListener('focusout', ev => {
    const target = rowOf(ev);
    if (target && !target.contains(ev.relatedTarget)) hideCard(target);
  });
  body.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && ownCard()) {
      closeCard();
      ev.stopPropagation();
    }
  });
  // It points at a row, so it goes when the rows move.
  section.addEventListener('scroll', closeCard, { passive: true });
  addEventListener('resize', closeCard);

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
    // The saved copy coming back (a new tab's first load, a refresh within the TTL) draws the
    // same, so the list isn't built again.
    const stamp = x => JSON.stringify([x?.at, x?.via, !!x?.data, !!x?.error]);
    if (stamp(r) !== stamp(result)) version++;
    result = r;
    loaded = true;
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
    closeCard();
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
      closeCard();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      removeEventListener('resize', closeCard);
      unsubscribe();
    },
  };
}
