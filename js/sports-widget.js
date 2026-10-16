// Sports widget: the followed NBA and NFL teams' games, Messi's (Inter Miami, Argentina) and the
// chosen F1 sessions in one list by day, with live scores and a day of results. Schedules come
// from ESPN's site API and Jolpica F1 through the request cache, shared by every copy and tab.

import { el, icon, widgetHead, widgetSub, widgetEmpty } from './ui.js';
import { feed, fetchJson, peek, sweep } from './net.js';
import { timeAgo } from './feeds.js';
import { copyById, TYPES } from './layout.js';
import {
  NBA_TEAMS, NFL_TEAMS, SOCCER_TEAMS, F1_SESSIONS, F1_SESSION_LABELS, teamOf, schedulePath, parseSchedule, nextPhases, joinParts,
  parseScoreboard, trimEvents, applyLive, scoreboards, boardTtl, etDay, parseF1Season, parseF1Last, raceAwaitingResult,
  timeline, resultFor, formatTime, isNight, longDay,
} from './sports.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const SCHEDULE_TTL = 6 * HOUR;
const F1_TTL = DAY;
const F1_LAST_TTL = HOUR;
const REFRESH_MS = 30e3;
const RECONFIGURE_MS = 800;   // wait for clicking to stop before refetching after a settings change
const KEY = 'sports-v1';
const F1_SEASON = `${KEY}:f1:season`;
const F1_LAST = `${KEY}:f1:last`;
const liveKey = b => `${KEY}:live:${b.path}:${b.day}`;

// The cache keys a followed id reads: a team's schedule (soccer: upcoming games and results), or F1's season.
function sourceKeys(id) {
  if (id === 'f1') return [F1_SEASON];
  const { sport, id: team } = teamOf(id);
  return sport === 'soccer' ? [`${KEY}:soccer:${team}:next`, `${KEY}:soccer:${team}:last`] : [`${KEY}:team:${sport}:${team}`];
}

const trimmed = events => trimEvents(events, Date.now());

// A parser's null means the response wasn't what we expect: fail, so feed() keeps the last good data.
const must = (value, source) => {
  if (value == null) throw new Error(`Unexpected ${source} response`);
  return value;
};

async function loadSource(id) {
  if (id === 'f1') return feed(F1_SEASON, F1_TTL, async () => must(parseF1Season(await fetchJson(`${JOLPICA}/current.json`)), 'Jolpica'));
  const { sport, id: team } = teamOf(id);
  const [key, lastKey] = sourceKeys(id);
  const url = `${ESPN}/${schedulePath(sport, team)}`;
  const schedule = async from => must(parseSchedule(await fetchJson(from), sport), 'ESPN');
  if (sport === 'soccer') {
    return joinParts(await Promise.all([
      feed(key, SCHEDULE_TTL, async () => trimmed((await schedule(`${url}?fixture=true`)).events)),
      feed(lastKey, SCHEDULE_TTL, async () => trimmed((await schedule(url)).events)),
    ]));
  }
  return feed(key, SCHEDULE_TTL, async () => {
    const first = await schedule(url);
    // The later parts of the season: one that fails or isn't what we expect counts as empty.
    const more = await Promise.all(nextPhases(first, sport, Date.now()).map(
      phase => schedule(`${url}?seasontype=${phase}`).then(x => x.events, () => [])));
    return trimmed([...first.events, ...more.flat()]);
  });
}

const cachedSource = id => joinParts(sourceKeys(id).map(key => peek(key) ?? { data: null, at: 0 }));

// Every scoreboard that matters: its saved copy, refreshed when boardTtl says it's due.
async function loadLive(events) {
  const now = Date.now();
  const boards = await Promise.all(scoreboards(events, now).map(async b => {
    const saved = peek(liveKey(b))?.data ?? [];
    const ttl = boardTtl(b, events, saved, now);
    if (ttl == null) return saved;
    const { data } = await feed(liveKey(b), ttl,
      async () => must(parseScoreboard(await fetchJson(`${ESPN}/${b.path}/scoreboard?dates=${b.day}`), b.sport, b.league), 'ESPN'));
    return data ?? saved;
  }));
  return boards.flat();
}

const cachedLive = events => scoreboards(events, Date.now()).flatMap(b => peek(liveKey(b))?.data ?? []);

// The podium of the race awaiting its result, once Jolpica has it.
async function loadPodium(events, f1Sessions) {
  if (!f1Sessions.includes('race')) return null;
  const race = raceAwaitingResult(events, Date.now());
  if (!race) return null;
  const isRace = r => r?.season === race.season && r.round === race.round;
  const saved = peek(F1_LAST)?.data;
  if (isRace(saved)) return saved;
  const { data } = await feed(F1_LAST, F1_LAST_TTL, async () => must(parseF1Last(await fetchJson(`${JOLPICA}/current/last/results.json`)), 'Jolpica'));
  return isRace(data) ? data : null;
}

export function mountSports(root, store, copy) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.sports.defaults();
  const prefs = () => store.get().prefs;
  const linkProps = href => (prefs().openInNewTab ? { href, target: '_blank', rel: 'noopener' } : { href });
  // Times follow the Clock's 12/24-hour setting.
  const hour24 = () => prefs().layout.widgets.find(c => c.type === 'clock')?.settings.hour24 ?? true;

  const list = el('div', { class: 'sp-list' });
  const notes = el('div', { class: 'sp-notes' });
  const editor = el('div', { class: 'sp-editor', hidden: true });
  const editButton = el('button', { type: 'button', class: 'icon-btn widget-edit', onclick: () => setEditing(!editing) });
  const head = widgetHead('trophy', 'Sports');
  head.append(editButton);
  const section = el('section', { class: 'widget widget-sports' }, head, list, notes, editor);
  root.append(section);

  let sources = new Map();   // followed id → { data: events, at, error }
  let live = [];             // scoreboard games
  let podium = null;         // { season, round, podium } of the race awaiting its result
  let loaded = false;

  const events = () => [...sources.values()].flatMap(r => r.data ?? []);

  // ---- rows ----

  const logo = team => (team.logo
    ? el('img', { class: 'sp-logo', src: team.logo, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', onerror: e => e.target.remove() })
    : null);
  const abbr = (team, mine) => el(mine ? 'b' : 'span', { text: team.abbr });
  const scored = e => e.sport !== 'f1' && (e.status === 'live' || e.status === 'final') && e.home.score != null && e.away.score != null;
  const podiumOf = e => (podium?.season === e.season && podium.round === e.round ? podium.podium.join(' · ') : 'Results soon');

  function matchup(e) {
    if (e.sport === 'f1') return el('span', { class: 'sp-match' }, icon('racecar', 18), el('span', { class: 'sp-title', text: e.title }));
    const mine = where => e.side === where || e.side === 'both';
    return el('span', { class: 'sp-match' },
      logo(e.away), abbr(e.away, mine('away')),
      scored(e) ? el('span', { class: 'sp-score', text: `${e.away.score} – ${e.home.score}` }) : el('span', { class: 'sp-at', text: '@' }),
      abbr(e.home, mine('home')), logo(e.home));
  }

  function when(e) {
    const tv = e.tv ? el('span', { class: 'sp-tv', text: e.tv }) : null;
    const wrap = (...children) => el('span', { class: 'sp-when' }, ...children);
    switch (e.status) {
      case 'off':
        return wrap(el('span', { text: e.off }));
      case 'live':
        return wrap(el('span', { class: 'sp-dot', 'aria-hidden': 'true' }), el('span', { text: e.state === 'in' && e.detail ? e.detail : 'LIVE' }), tv);
      case 'final': {
        if (e.sport === 'f1') return wrap(el('span', { text: podiumOf(e) }));
        const result = resultFor(e, e.side);
        return wrap(result ? el('span', { class: `sp-res ${result}`, text: result }) : null,
          el('span', { text: e.state === 'post' && e.detail ? e.detail : 'Final' }));
      }
      default:
        return wrap(e.timeValid && isNight(e.start) ? icon('moon', 13) : null,
          el('span', { text: e.timeValid ? formatTime(e.start, hour24()) : 'TBD' }), tv);
    }
  }

  function label(e) {
    const parts = [
      e.sport === 'f1' ? `Formula 1, ${e.title}` : `${e.away.name} at ${e.home.name}`,
      `${longDay(e.start)}, ${e.timeValid ? formatTime(e.start, hour24()) : 'time to be decided'}`,
    ];
    if (e.status === 'off') parts.push(e.off);
    if (e.status === 'live') parts.push('live');
    if (e.status === 'final') parts.push(e.sport === 'f1' ? podiumOf(e) : 'final');
    if (scored(e)) parts.push(`${e.away.abbr} ${e.away.score}, ${e.home.abbr} ${e.home.score}`);
    if (e.tv) parts.push(e.tv);
    return parts.join(', ');
  }

  const row = e => el('a', { class: `sp-row ${e.status}`, 'aria-label': label(e), ...linkProps(e.url || 'https://www.espn.com/') },
    el('span', { class: 'sp-tag', text: e.tag }), matchup(e), when(e));

  // ---- list ----

  const what = id => (id === 'f1' ? 'the F1 calendar' : `the schedule for ${teamOf(id).name}`);

  // A line per source that failed: how old the data shown is, or what couldn't load.
  function problems(follow) {
    const lines = [];
    for (const [host, ids] of [['ESPN', follow.filter(id => id !== 'f1')], ['Jolpica', follow.filter(id => id === 'f1')]]) {
      const failed = ids.filter(id => sources.get(id)?.error);
      const stale = failed.filter(id => sources.get(id).data);
      if (stale.length) {
        const ago = timeAgo(Math.min(...stale.map(id => sources.get(id).at)));
        lines.push(ago === 'now' ? `${host} unreachable` : `${host} unreachable · data from ${ago} ago`);
      }
      for (const id of failed.filter(id => !sources.get(id).data)) lines.push(`Couldn't load ${what(id)}`);
    }
    return lines.map(text => el('p', { class: 'widget-note', text }));
  }

  const pickLink = text => el('button', { type: 'button', class: 'link-btn', text, onclick: () => setEditing(true) });

  // Every followed source failed with nothing saved: the notes say so, "no games" would be a guess.
  const nothingLoaded = follow => follow.every(id => sources.get(id)?.error && !sources.get(id).data);

  // What the list was last drawn from: a refresh (every 30 s, and on every return to the tab)
  // that changes nothing shown leaves the rows, and their logo images, alone.
  let drawn = '';

  function render() {
    const s = settings();
    if (!s.follow.length) {
      drawn = '';
      list.replaceChildren(widgetEmpty('Nothing chosen. ', pickLink('Choose teams')));
      notes.replaceChildren();
      return;
    }
    const days = timeline(applyLive(events(), live), { follow: s.follow, f1Sessions: s.f1Sessions, now: Date.now() });
    const empty = loaded && nothingLoaded(s.follow);
    const hint = !s.edited && !s.follow.some(id => /^(nba|nfl):/.test(id));
    const lines = problems(s.follow);
    const next = JSON.stringify([days, loaded, empty, hint, lines.map(p => p.textContent), podium, hour24(), prefs().openInNewTab]);
    if (next === drawn) return;
    drawn = next;
    list.replaceChildren(...(days.length
      ? days.flatMap(d => [el('div', { class: 'sp-day', text: d.label }), ...d.events.map(row)])
      : empty ? [] : [widgetEmpty(loaded ? 'No games scheduled yet' : 'Loading…')]));
    notes.replaceChildren(...lines,
      ...(hint ? [el('p', { class: 'widget-note' }, pickLink('Pick your NBA and NFL teams'))] : []));
  }

  // ---- editor: ✎ swaps the list for team buttons; changes apply as they're made ----

  let editing = false;

  function update(fn) {
    store.update(s => {
      const own = copyById(s, copy.id);
      if (own) fn(own.settings);
    });
  }
  const toggled = (ids, id, on) => [...ids.filter(x => x !== id), ...(on ? [id] : [])];

  // A button that stays pressed while its item is chosen.
  function chip(text, title, pressed, onToggle) {
    const button = el('button', {
      type: 'button', class: 'sp-chip', text, title, 'aria-pressed': String(pressed),
      onclick: () => {
        const on = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(on));
        onToggle(on);
      },
    });
    return button;
  }

  function renderEditor() {
    const s = settings();
    const teamChip = (sport, t) => {
      const id = `${sport}:${t.id}`;
      return chip(t.abbr, t.name, s.follow.includes(id), on => update(own => { own.follow = toggled(own.follow, id, on); }));
    };
    const check = (id, text) => {
      const input = el('input', {
        type: 'checkbox', checked: s.follow.includes(id),
        onchange: () => update(own => { own.follow = toggled(own.follow, id, input.checked); }),
      });
      return el('label', { class: 'mk-check' }, input, el('span', { text }));
    };
    const sessionChip = x => chip(F1_SESSION_LABELS[x], null, s.f1Sessions.includes(x),
      on => update(own => { own.f1Sessions = F1_SESSIONS.filter(y => (y === x ? on : own.f1Sessions.includes(y))); }));
    editor.replaceChildren(
      widgetSub('NBA'), el('div', { class: 'sp-chips' }, NBA_TEAMS.map(t => teamChip('nba', t))),
      widgetSub('NFL'), el('div', { class: 'sp-chips' }, NFL_TEAMS.map(t => teamChip('nfl', t))),
      widgetSub('Messi'), el('div', { class: 'mk-checks' }, SOCCER_TEAMS.map(t => check(`soccer:${t.id}`, t.name))),
      widgetSub('Formula 1'), el('div', { class: 'mk-checks' }, check('f1', 'Follow F1')),
      el('div', { class: 'sp-chips' }, F1_SESSIONS.map(sessionChip)));
  }

  function setEditing(on) {
    editing = on;
    section.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Choose teams';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    list.hidden = on;
    notes.hidden = on;
    editor.hidden = !on;
    if (on) {
      if (!settings().edited) update(own => { own.edited = true; });
      renderEditor();
    }
  }

  setEditing(false);

  // ---- wiring ----

  let seq = 0;
  async function load() {
    const my = ++seq;
    try {
      const { follow, f1Sessions } = settings();
      const entries = await Promise.all(follow.map(async id => [id, await loadSource(id)]));
      if (my !== seq) return;
      sources = new Map(entries);
      const [games, result] = await Promise.all([loadLive(events()), loadPodium(events(), f1Sessions)]);
      if (my !== seq) return;
      live = games;
      podium = result;
    } catch (error) {
      // feed() reports its own failures; this is anything else going wrong. Draw what we have.
      console.error('Sports widget', error);
    }
    if (my !== seq) return;
    loaded = true;
    render();
  }

  function renderCached() {
    sources = new Map(settings().follow.map(id => [id, cachedSource(id)]));
    live = cachedLive(events());
    podium = peek(F1_LAST)?.data ?? null;
    render();
  }

  let conf = null;
  let timer = 0;

  function onPrefs(state) {
    const own = copyById(state, copy.id);
    if (!own) return;
    // Under 3 cells wide there is no room for logos and channels.
    section.classList.toggle('narrow', own.w < 3);
    const s = own.settings;
    const next = JSON.stringify([s.follow, s.f1Sessions, s.edited, state.prefs.openInNewTab, hour24()]);
    if (next === conf) return;
    const first = conf === null;
    conf = next;
    renderCached();
    clearTimeout(timer);
    timer = setTimeout(load, first ? 0 : RECONFIGURE_MS);
  }

  function refresh() {
    if (document.visibilityState === 'visible') load();
  }

  // Scoreboards are saved per league and day: drop those more than 3 days old.
  sweep(`${KEY}:live:`, key => key.slice(-8) >= etDay(Date.now() - 3 * DAY));
  const unsubscribe = store.subscribe(onPrefs, ['prefs']);
  onPrefs(store.get());
  const interval = setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);

  return {
    destroy() {
      seq++;   // a load still running draws nothing
      clearInterval(interval);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      unsubscribe();
    },
  };
}
