// Google Calendar widget: today's events and the next two weeks' from the page's calendars
// (gcal.js), merged, each in its colour. Each calendar is fetched from its secret iCal link
// (gcal-links.js) through the request cache, shared by every copy and tab; a copy's chips only
// hide calendars. Add a calendar opens a window that walks through finding its link (gcal-add.js);
// ✎ swaps the list for the calendars: rename, recolour, remove, add.

import { el, icon, widgetHead, widgetSub, widgetEmpty, confirmDialog } from './ui.js';
import { feed, peek, sweep } from './net.js';
import { timeAgo } from './feeds.js';
import { copyById, allLayouts, copiesOf, TYPES } from './layout.js';
import { hasChrome, hasSiteAccess, requestSiteAccess, onSiteAccessChange } from './chrome-api.js';
import { siteDomain, sitePattern } from './website.js';
import { formatTime, longDay, dayKey, dayLabel } from './sports.js';
import { untilLabel } from './econ.js';
import { showCard, hideCard, cardRow } from './econ-card.js';
import { linkOf, dropLink, releaseLinkSite, onLinksChange, calendarKey, fetchCalendar } from './gcal-links.js';
import { openAddCalendar } from './gcal-add.js';
import { MAX_CALENDARS, TTL_MS, googleCalendarId, agenda, joinState, failureOf, colorAfter } from './gcal.js';

const REFRESH_MS = 60e3;   // now and next move on; the cache answers until TTL_MS has passed

// Who a meeting link is with: 'Google Meet', 'Zoom', 'Microsoft Teams', 'Webex', else its site.
function meetingName(url) {
  const host = siteDomain(url);
  if (host === 'meet.google.com') return 'Google Meet';
  if (/(^|\.)zoom\.us$/.test(host)) return 'Zoom';
  if (/^teams\.(microsoft|live)\.com$/.test(host)) return 'Microsoft Teams';
  if (/(^|\.)webex\.com$/.test(host)) return 'Webex';
  return host;
}

export function mountGcal(root, store, copy) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.gcal.defaults();
  const calendars = () => store.get().prefs.gcal.calendars;
  const calById = id => calendars().find(c => c.id === id);
  // Times follow the Clock's 12/24-hour setting.
  const hour24 = () => allLayouts(store.get()).flatMap(copiesOf).find(c => c.type === 'clock')?.settings.hour24 ?? true;
  const newTab = () => store.get().prefs.openInNewTab;
  const target = () => (newTab() ? '_blank' : null);
  const time = ms => formatTime(ms, hour24());

  const editButton = el('button', { type: 'button', class: 'icon-btn widget-edit', onclick: () => setEditing(!editing) });
  const head = widgetHead('agenda', TYPES.gcal.label);
  head.title = 'Times in your time zone';
  head.append(editButton);
  const chips = el('div', { class: 'sp-chips gc-chips', role: 'group', 'aria-label': 'Calendars shown' });
  const body = el('div', { class: 'gc-body' });
  const editor = el('div', { class: 'gc-editor', hidden: true });
  const section = el('section', { class: 'widget widget-gcal' }, head, chips, body, editor);
  root.append(section);

  // By calendar id: { data: { name, events }, at, error }, or { missing } (no link on this
  // computer) or { noAccess, url } (Chrome's access to its site was taken back).
  let results = new Map();
  let loaded = false;
  let version = 0;   // bumped with every new set of results

  // ---- what each calendar is up to ----

  // What's wrong with a calendar, or null: { short (for its chip), long (for the note), fix }.
  function problemOf(c) {
    const r = results.get(c.id);
    if (!r) return null;
    if (r.missing) return { short: 'No link on this computer', long: `${c.name}: no link on this computer. In ✎, remove it and add it again.` };
    if (r.noAccess) {
      const site = siteDomain(r.url);
      return {
        short: `No access to ${site}`, long: `${c.name}: Chrome’s access to ${site} was taken back. `,
        fix: el('button', { type: 'button', class: 'link-btn', text: 'Allow access', onclick: () => requestSiteAccess(sitePattern(r.url)).then(() => load()) }),
      };
    }
    if (!r.error) return null;
    if (failureOf(r.error) === 'gone') {
      const who = googleCalendarId(linkOf(c.id)) ? 'Google doesn’t answer' : 'Nothing answers';
      return { short: 'The link no longer works', long: `${c.name}: ${who} this link any more (reset or deleted). In ✎, remove it and add the calendar’s new secret address.` };
    }
    if (!r.data) {
      return { short: 'Couldn’t load', long: `${c.name}: couldn’t load. `, fix: el('button', { type: 'button', class: 'link-btn', text: 'Try again', onclick: () => load(true) }) };
    }
    const ago = timeAgo(r.at);
    return { short: 'Unreachable', long: ago === 'now' ? `${c.name}: unreachable` : `${c.name}: unreachable · from ${ago} ago` };
  }

  const shownCalendars = () => calendars().filter(c => !settings().hidden.includes(c.id));

  function eventsShown() {
    return shownCalendars().flatMap(c => (results.get(c.id)?.data?.events ?? []).map(e => ({ ...e, cal: c.id })));
  }

  // ---- chips: one per calendar, pressed while it shows here ----

  function drawChips() {
    const list = calendars();
    chips.hidden = list.length < 2 || editing;
    if (chips.hidden) {
      chips.replaceChildren();
      return;
    }
    const hidden = settings().hidden;
    const shown = list.filter(c => !hidden.includes(c.id));
    chips.replaceChildren(...list.map(c => {
      const on = !hidden.includes(c.id);
      const problem = problemOf(c);
      const last = on && shown.length === 1;
      return el('button', {
        type: 'button', class: 'sp-chip gc-chip', style: `--c: ${c.color}`, dataset: { id: c.id },
        'aria-pressed': String(on), 'aria-disabled': last ? 'true' : null,
        title: [problem?.short, last ? 'At least one stays on' : on ? 'Hide here' : 'Show here'].filter(Boolean).join(' · '),
        onclick: () => toggle(c.id),
      }, el('i', { class: 'gc-dot' }), c.name, problem ? icon('alert', 13) : null);
    }));
  }

  function toggle(id) {
    const hidden = settings().hidden;
    const on = !hidden.includes(id);
    if (on && shownCalendars().length === 1) return;
    update(own => { own.hidden = on ? [...hidden, id] : hidden.filter(x => x !== id); });
    chips.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }

  // ---- the list ----

  const rowKey = e => `${e.cal}|${e.id}|${e.day}`;
  let shown = new Map();   // the rows drawn, by rowKey → the event

  function timeText(e) {
    if (e.state === 'allday') return 'All day';
    return e.part === 'end' ? `–${time(e.end)}` : time(e.start);
  }

  // Until when the one going on runs (its time says it already on its last day), or how long
  // until the next.
  function rightOf(e, now) {
    if (e.state === 'now') return e.part === 'end' ? null : el('span', { class: 'gc-until', text: `until ${time(e.end)}` });
    if (e.state === 'next') return el('span', { class: 'gc-next', text: untilLabel(e.start, now) });
    return null;
  }

  // The meeting's Join: a filled button from shortly before until the end, an icon before that.
  function joinOf(e, now) {
    const state = joinState(e, now);
    if (!state) return null;
    return el('a', {
      class: `gc-join ${state}`, href: e.meet, rel: 'noopener', target: target(),
      title: `Join on ${meetingName(e.meet)}`, 'aria-label': `Join ${e.title} on ${meetingName(e.meet)}`,
    }, icon('video', 14), state === 'soon' ? el('span', { text: 'Join' }) : null);
  }

  function row(e, now) {
    const c = calById(e.cal);
    const key = rowKey(e);
    shown.set(key, e);
    // The title's link covers the row; a row with no link takes the focus itself, for its card.
    const title = e.link
      ? el('a', { class: 'gc-title', href: e.link, rel: 'noopener', target: target(), text: e.title })
      : el('span', { class: 'gc-title', text: e.title });
    return el('div', { class: `gc-row ${e.state}`, style: `--c: ${c?.color ?? 'var(--muted)'}`, tabindex: e.link ? null : '0', dataset: { key } },
      el('span', { class: 'gc-time', text: timeText(e) }),
      el('span', { class: 'gc-bar' }),
      title,
      rightOf(e, now),
      joinOf(e, now));
  }

  // Each day under its heading. Today's rows that ended sit above a line where the rest start;
  // today with nothing left says so.
  function list(days, now) {
    return el('div', { class: 'gc-list' }, days.map((d, i) => {
      const today = i === 0;
      const ahead = d.events.findIndex(e => e.state === 'now' || e.state === 'next' || e.state === 'later');
      const past = d.events.some(e => e.state === 'past');
      const line = today && past ? (ahead < 0 ? d.events.length : ahead) : -1;
      const none = !today ? null
        : !d.events.length ? 'Nothing today'
          : ahead < 0 && past ? 'Nothing else today' : null;
      return [
        el('div', { class: 'gc-day', text: d.label }),
        d.events.map((e, j) => [j === line ? el('div', { class: 'gc-now', 'aria-hidden': 'true' }) : null, row(e, now)]),
        line === d.events.length ? el('div', { class: 'gc-now', 'aria-hidden': 'true' }) : null,
        none ? el('p', { class: 'gc-none', text: none }) : null,
      ];
    }));
  }

  // The notes under the list: a calendar shown here that has a problem, one line each.
  function notes() {
    return shownCalendars().map(problemOf).filter(Boolean).map(p => el('p', { class: 'widget-note' }, p.long, p.fix ?? null));
  }

  // What the body was last drawn from: a refresh that changes nothing shown leaves it alone. The
  // minute matters too: now and next, and rows going by.
  let drawn = '';

  const rowFor = key => body.querySelector(`.gc-row[data-key="${CSS.escape(key)}"]`);

  function render() {
    const now = Date.now();
    const next = JSON.stringify([calendars(), settings(), version, loaded, hour24(), newTab(), Math.floor(now / 60e3)]);
    if (next === drawn) return;
    drawn = next;
    // The rows are drawn anew: the card and the focus move to the same event's new row.
    const open = ownCard();
    const focused = body.contains(document.activeElement) ? document.activeElement.closest('.gc-row')?.dataset.key : null;
    drawChips();
    draw(now);
    const again = open ? rowFor(open.dataset.key) : null;
    if (again) openCard(again);
    else if (open) hideCard(open);
    if (focused) {
      const r = rowFor(focused);
      (r?.querySelector('.gc-title[href]') ?? r)?.focus({ preventScroll: true });
    }
  }

  function draw(now) {
    section.classList.toggle('h12', !hour24());
    shown = new Map();
    if (!hasChrome) {
      body.replaceChildren(widgetEmpty('The calendar loads in the extension.'));
      return;
    }
    if (!calendars().length) {
      body.replaceChildren(
        widgetEmpty('Your Google Calendar agenda shows here. '),
        el('button', { type: 'button', class: 'btn', onclick: addCalendar }, icon('plus', 15), 'Add a calendar'));
      return;
    }
    const any = shownCalendars().some(c => results.get(c.id)?.data);
    if (!any) {
      const waiting = !loaded || shownCalendars().some(c => !results.has(c.id));
      const problems = notes();
      body.replaceChildren(...(waiting ? [widgetEmpty('Loading…')] : problems.length ? problems : [widgetEmpty('Nothing to show')]));
      return;
    }
    body.replaceChildren(list(agenda(eventsShown(), { now }), now), ...notes());
  }

  // ---- the hover card (econ-card.js) ----

  // The calendar, the title, when (with how long until or since), the place, the call and the
  // description.
  function cardContent(e, now) {
    const c = calById(e.cal);
    const today = dayKey(now);
    let when;
    if (e.allDay) {
      const last = new Date(Date.parse(`${e.to}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
      when = el('p', { class: 'ec-card-when' }, last === e.from
        ? longDay(Date.parse(`${e.from}T12:00:00Z`), 'UTC')
        : `${dayLabel(e.from, today)} – ${dayLabel(last, today)}`, el('span', { class: 'ec-card-rel', text: ' · All day' }));
    } else {
      const [from, to] = [dayKey(e.start), dayKey(Math.max(e.start, e.end - 1))];
      const relative = e.state === 'now' ? `ends ${untilLabel(e.end, now)}`
        : e.start > now ? untilLabel(e.start, now)
          : `ended ${timeAgo(e.end, now) === 'now' ? 'just now' : `${timeAgo(e.end, now)} ago`}`;
      const range = e.end === e.start ? time(e.start) : from === to ? `${time(e.start)} – ${time(e.end)}` : `${time(e.start)} ${dayLabel(from, today)} – ${time(e.end)} ${dayLabel(to, today)}`;
      when = el('p', { class: 'ec-card-when' }, el('b', { text: range }), from === to ? ` · ${longDay(e.start)}` : null,
        el('span', { class: 'ec-card-rel', text: ` · ${relative}` }));
    }
    const where = e.where && e.where !== e.meet ? el('p', { class: 'gc-card-line' }, icon('pin', 14), el('span', { text: e.where })) : null;
    const call = e.meet ? el('p', { class: 'gc-card-line' }, icon('video', 14), el('span', { text: `${meetingName(e.meet)} · ${e.meet.replace(/^https:\/\//, '')}` })) : null;
    const opens = e.link ? (googleCalendarId(linkOf(e.cal)) ? 'Click to open it in Google Calendar' : 'Click to open the event') : '';
    return [
      el('div', { class: 'ec-card-pills' }, el('span', { class: 'ec-pill gc-pill', style: `--c: ${c?.color ?? 'var(--muted)'}` }, el('i', { class: 'gc-dot' }), c?.name ?? 'Calendar')),
      el('p', { class: 'ec-card-title', text: e.title }),
      when,
      where,
      call,
      e.about ? el('p', { class: 'ec-card-about gc-card-about', text: e.about }) : null,
      opens ? el('p', { class: 'ec-card-from', text: opens }) : null,
    ].filter(Boolean);
  }

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
    const e = shown.get(target.dataset.key);
    if (e) showCard(target, cardContent(e, Date.now()));
  }

  function closeCard() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    const open = ownCard();
    if (open) hideCard(open);
  }

  const rowOf = ev => ev.target.closest?.('.gc-row') ?? null;

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
    hideTimer = setTimeout(() => { if (!target.matches(':focus-visible, :has(:focus-visible)')) hideCard(target); }, LEAVE_MS);
  });
  // The keyboard: Tab to a row (its link, or the row) opens its card, Esc closes it.
  body.addEventListener('focusin', ev => {
    const target = rowOf(ev);
    if (target && ev.target.matches(':focus-visible') && !ev.target.matches('.gc-join')) {
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
  // It points at a row, so it goes when the rows move or a link is followed.
  section.addEventListener('scroll', closeCard, { passive: true });
  body.addEventListener('click', closeCard);
  addEventListener('resize', closeCard);

  // ---- loading ----

  let seq = 0;
  async function load(force = false) {
    if (!hasChrome) return;
    const my = ++seq;
    const got = await Promise.all(calendars().map(async c => {
      const url = linkOf(c.id);
      if (!url) return [c.id, { missing: true }];
      if (!await hasSiteAccess(sitePattern(url))) return [c.id, { noAccess: true, url }];
      return [c.id, await feed(calendarKey(c.id), force ? 0 : TTL_MS, () => fetchCalendar(url))];
    }));
    if (my !== seq) return;
    results = new Map(got);
    loaded = true;
    version++;
    render();
    if (editing) paintStatuses();
  }

  // What's saved, at once: the cache answers before anything is fetched.
  function fromCache() {
    results = new Map(calendars().flatMap(c => {
      const hit = peek(calendarKey(c.id));
      return hit ? [[c.id, { data: hit.data, at: hit.at }]] : [];
    }));
    loaded = calendars().every(c => results.has(c.id));
  }

  // ---- editor: the page's calendars ----

  let editing = false;

  function update(fn) {
    store.update(s => {
      const own = copyById(s, copy.id);
      if (own) fn(own.settings);
    }, ['prefs']);
  }

  function setCalendar(id, changes) {
    store.update(s => {
      const c = s.prefs.gcal.calendars.find(x => x.id === id);
      if (c) Object.assign(c, changes);
    }, ['prefs']);
  }

  // Every widget loses the calendar: its link, its saved events, and (when nothing else uses its
  // site) Chrome's access.
  async function remove(c) {
    const message = `Its link is deleted from this computer, and it leaves every Google Calendar widget. To bring it back, paste its secret address again.`;
    if (!await confirmDialog(message, { title: `Remove ${c.name}?`, confirmLabel: 'Remove', danger: true })) return;
    const url = linkOf(c.id);
    store.update(s => {
      s.prefs.gcal.calendars = s.prefs.gcal.calendars.filter(x => x.id !== c.id);
      for (const other of allLayouts(s).flatMap(copiesOf)) {
        if (other.type === 'gcal') other.settings.hidden = other.settings.hidden.filter(id => id !== c.id);
      }
    }, ['prefs']);
    dropLink(c.id);
    sweep(calendarKey(c.id), key => key !== calendarKey(c.id));
    if (url) await releaseLinkSite(url, store.get());
    renderEditor();
  }

  const statusOf = c => problemOf(c)?.short ?? '';

  function calendarRow(c) {
    const swatch = el('button', {
      type: 'button', class: 'gc-swatch', style: `--c: ${c.color}`, title: 'Change colour', 'aria-label': `Change the colour of ${c.name}`,
      onclick: () => {
        const color = colorAfter(calById(c.id)?.color ?? c.color);
        swatch.style.setProperty('--c', color);
        setCalendar(c.id, { color });
      },
    });
    const name = el('input', {
      type: 'text', class: 'pref-input gc-name', value: c.name, maxLength: 60, spellcheck: false, 'aria-label': 'Calendar name',
      oninput: () => setCalendar(c.id, { name: name.value.trim() ? name.value : c.name }),
      onchange: () => { if (!name.value.trim()) name.value = calById(c.id)?.name ?? c.name; },
    });
    return el('div', { class: 'gc-cal', dataset: { id: c.id } },
      swatch,
      name,
      el('span', { class: 'gc-cal-status', text: statusOf(c) }),
      el('button', { type: 'button', class: 'icon-btn', title: 'Remove', 'aria-label': `Remove ${c.name}`, onclick: () => remove(calById(c.id) ?? c) }, icon('trash', 15)));
  }

  // The statuses change as loads finish; the rest of the editor stays as it is (a name being typed).
  function paintStatuses() {
    for (const node of editor.querySelectorAll('.gc-cal')) {
      const c = calById(node.dataset.id);
      if (c) node.querySelector('.gc-cal-status').textContent = statusOf(c);
    }
  }

  // The window that walks through adding one; the editor then lists it.
  async function addCalendar() {
    await openAddCalendar(store);
    if (editing) renderEditor();
  }

  function renderEditor() {
    const list = calendars();
    editor.replaceChildren(...[
      widgetSub('Calendars'),
      list.length ? el('div', { class: 'gc-cals' }, list.map(calendarRow)) : widgetEmpty('None yet.'),
      list.length > 1 ? el('p', { class: 'widget-note', text: 'The chips on the widget hide or show a calendar in that widget only.' }) : null,
      !hasChrome ? widgetEmpty('Calendars are added in the extension.')
        : list.length >= MAX_CALENDARS ? widgetEmpty(`That’s ${MAX_CALENDARS}, the most there can be.`)
          : el('button', { type: 'button', class: 'btn gc-add-btn', onclick: addCalendar }, icon('plus', 15), 'Add a calendar'),
      el('p', { class: 'widget-note', text: 'Anyone with a secret address can see that calendar. It stays on this computer: not in backups, not synced.' }),
    ].flat().filter(Boolean));
  }

  function setEditing(on) {
    editing = on;
    closeCard();
    section.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Add and manage calendars';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    body.hidden = on;
    drawChips();
    editor.hidden = !on;
    if (on) renderEditor();
    else editor.replaceChildren();
  }

  setEditing(false);

  // ---- wiring ----

  function refresh() {
    if (document.visibilityState === 'visible') load();
  }

  // A calendar added or removed (here, in another copy or tab) is loaded; anything else is drawn
  // from what's loaded.
  let ids = '';
  const unsubscribe = store.subscribe(state => {
    if (!copyById(state, copy.id)) return;
    const next = state.prefs.gcal.calendars.map(c => c.id).join();
    if (next !== ids) {
      ids = next;
      load();
    }
    render();
  }, ['prefs']);
  ids = calendars().map(c => c.id).join();
  fromCache();
  render();
  load();
  const interval = setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);
  const stopAccess = onSiteAccessChange(() => load());
  const stopLinks = onLinksChange(() => load());

  return {
    destroy() {
      seq++;
      closeCard();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      removeEventListener('resize', closeCard);
      stopAccess();
      stopLinks();
      unsubscribe();
    },
  };
}
