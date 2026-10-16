// GitHub widget: any of the contribution heatmap, open pull requests, open issues and latest
// commits, in that order, as the copy's `parts` say. Every copy shares one fetch an hour through
// the request cache and one token (prefs.github.token).

import { el, icon, svgEl, widgetSub, widgetEmpty } from './ui.js';
import { feed, peek, fetchJson, fetchText } from './net.js';
import { parseCommits, latestCommits, parseIssues, timeAgo, parseContributions, heatmapLayout, MONTHS } from './feeds.js';
import { copyById, TYPES } from './layout.js';

const GITHUB_TTL = 60 * 60e3;   // GitHub is fetched at most once an hour
const COMMITS = 6;              // latest commits always shown; a taller frame fits more
const MAX_COMMITS = 30;         // latest commits fetched, for frames with room for more
const ISSUES = 5;               // open issues shown
const REFRESH_MS = 30e3;
const RECONFIGURE_MS = 800;     // wait for typing to stop before refetching after a settings change
const GITHUB = 'https://api.github.com';
// Heatmap geometry in SVG units: cell pitch, cell size, and the month label row on top.
const HM = { pitch: 10, cell: 8, top: 20 };

// One formatter for the map's 371 day labels (toLocaleString builds a new one per call).
const COUNT = new Intl.NumberFormat('en-US');

function dayLabel({ date, count }) {
  const [, month, day] = date.split('-').map(Number);
  return `${count ? COUNT.format(count) : 'No'} contribution${count === 1 ? '' : 's'} on ${MONTHS[month - 1]} ${day}`;
}

// The contribution calendar: weeks as columns, Sunday on top, darker = more activity.
function heatmapSvg(days, total) {
  const { cols, cells, months } = heatmapLayout(days);
  const gap = HM.pitch - HM.cell;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${cols * HM.pitch - gap} ${HM.top + 7 * HM.pitch - gap}`,
    class: 'gh-heatmap-grid',
    role: 'img',
    'aria-label': `${total.toLocaleString('en-US')} contributions in the last year`,
  });
  for (const m of months) svg.append(svgEl('text', { x: m.col * HM.pitch, y: 14, class: 'gh-hm-month' }, m.label));
  for (const c of cells) {
    const rect = svgEl('rect', { x: c.col * HM.pitch, y: HM.top + c.row * HM.pitch, width: HM.cell, height: HM.cell, rx: 2, class: `gh-hm-${c.level}` });
    rect.append(svgEl('title', {}, dayLabel(c)));
    svg.append(rect);
  }
  return svg;
}

// ctx.openPrefs(section, anchor) opens Preferences there: the copy's parts are its own group under
// Layout, the username every copy shares is under GitHub.
export function mountGithub(root, store, copy, ctx) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.github.defaults();
  const prefs = () => store.get().prefs;
  const token = () => prefs().github.token.trim();
  const linkProps = href => (prefs().openInNewTab ? { href, target: '_blank', rel: 'noopener' } : { href });
  const openSettings = () => ctx.openPrefs('layout', copy.id);
  const openAccount = () => ctx.openPrefs('github', 'account');

  const body = el('div', { class: 'gh-body' });
  // The heading opens the user's GitHub profile.
  const link = el('a', { class: 'widget-head-link', title: 'Open your GitHub profile' },
    icon('branch', 18), el('span', { text: 'GitHub' }), icon('external', 13));
  const status = el('span', { class: 'widget-head-status', title: 'Checked at most once an hour' });
  const edit = el('button', {
    type: 'button', class: 'icon-btn widget-edit', title: 'GitHub settings', 'aria-label': 'GitHub settings', onclick: openSettings,
  }, icon('edit', 15));
  const section = el('section', { class: 'widget widget-github' }, el('h2', { class: 'widget-head' }, link, status, edit), body);
  root.append(section);

  // The commit rows drawn last. Six always show (a short frame scrolls them); a taller frame shows
  // as many more as fit, so the list runs to its bottom. Stacked on a narrow window a frame grows
  // with its content, so it keeps six.
  let commitRows = [];
  function fitCommits() {
    const rows = commitRows;
    let n = Math.min(rows.length, COMMITS);
    if (rows.length > COMMITS && getComputedStyle(section).overflowY !== 'visible') {
      for (const r of rows) r.hidden = false;
      const excess = section.scrollHeight - section.clientHeight;
      const bottom = i => rows[i].getBoundingClientRect().bottom;
      n = rows.length;
      while (n > COMMITS && bottom(rows.length - 1) - bottom(n - 1) < excess) n--;
    }
    rows.forEach((r, i) => { r.hidden = i >= n; });
  }
  const sizes = new ResizeObserver(fitCommits);
  sizes.observe(section);
  // After a redraw: in the next frame, once every widget is on the page, rather than forcing a
  // layout of the half-built page.
  let fitFrame = 0;
  const fitSoon = () => {
    fitFrame ||= requestAnimationFrame(() => {
      fitFrame = 0;
      fitCommits();
    });
  };

  function githubRow({ href, iconName, name, meta, title }) {
    return el('a', { class: 'gh-row', title, ...linkProps(href) },
      icon(iconName, 14),
      el('span', { class: 'gh-name', dir: 'auto', text: name }),
      el('span', { class: 'gh-meta', text: meta }));
  }

  // A search result row: an open pull request or issue.
  const searchRow = (item, iconName) => githubRow({
    href: item.url,
    iconName,
    name: item.title,
    meta: `#${item.number} · ${timeAgo(item.updatedAt)}`,
    title: `${item.repo} #${item.number}${item.draft ? ' (draft)' : ''}\n${item.title}`,
  });

  function renderSetup() {
    commitRows = [];
    body.replaceChildren(
      widgetEmpty('Shows a year of your activity, your open pull requests, and your open issues and latest commits.'),
      el('div', { class: 'gh-setup' }, el('button', { type: 'button', class: 'btn', text: 'Set up GitHub', onclick: openAccount })));
    status.replaceChildren();
  }

  function heatmap(calendar, user) {
    if (calendar.data) {
      return el('a', { class: 'gh-heatmap', ...linkProps(`https://github.com/${encodeURIComponent(user)}`) },
        heatmapSvg(calendar.data.days, calendar.data.total),
        el('div', { class: 'gh-heatmap-total', text: `${calendar.data.total.toLocaleString('en-US')} contributions in the last year` }));
    }
    return calendar.error
      ? el('p', { class: 'widget-note gh-heatmap-note', text: 'Couldn’t load the activity map. If you just updated, reload the extension on chrome://extensions, then press Refresh.' })
      : null;
  }

  const commitRow = (c, user) => githubRow({
    href: c.url,
    iconName: c.private ? 'lock' : 'commit',
    name: c.message,
    // Repos of other owners (organisations) keep the owner, e.g. "eitan-capital/.github".
    meta: `${c.repo.startsWith(`${user}/`) ? c.repo.slice(user.length + 1) : c.repo} · ${timeAgo(c.at)}`,
    title: `${c.repo} @ ${c.sha}${c.private ? ' (private)' : ''}\n${c.message}`,
  });

  function renderGithub({ data, at, error }, user, calendar) {
    const parts = settings().parts;
    commitRows = [];
    if (!parts.length) {
      body.replaceChildren(widgetEmpty('Nothing chosen. ',
        el('button', { type: 'button', class: 'link-btn', text: 'Choose what to show', onclick: openSettings })));
      status.replaceChildren();
      return;
    }
    const lists = parts.some(p => p !== 'heatmap');
    const out = [];
    if (parts.includes('heatmap')) out.push(heatmap(calendar, user));
    if (lists && error && !data) {
      out.push(widgetEmpty(error.rateLimited
        ? 'GitHub’s hourly limit is used up. The widget tries again in an hour (or press Refresh later).'
        : error.status === 401 ? 'GitHub rejected the token (it may have expired). Check it in Preferences → GitHub.'
          : error.status === 404 ? 'GitHub user not found. Check the username in Preferences → GitHub.'
            : 'Couldn’t reach GitHub.'));
    } else if (lists && !data) {
      out.push(widgetEmpty('Loading…'));
    }
    if (data && parts.includes('pulls')) {
      out.push(widgetSub('Open pull requests'), ...(data.pulls.length ? data.pulls.map(pr => searchRow(pr, 'pr')) : [widgetEmpty('No open pull requests.')]));
    }
    if (data && parts.includes('issues')) {
      out.push(widgetSub('Open issues'), ...(data.issues.length ? data.issues.map(issue => searchRow(issue, 'issue')) : [widgetEmpty('No open issues.')]));
    }
    if (data && parts.includes('commits')) {
      commitRows = data.commits.map(c => commitRow(c, user));
      out.push(widgetSub('Latest commits'), ...(commitRows.length ? commitRows : [widgetEmpty('No commits found.')]));
      // Only speak up about the token when it isn't working.
      const t = data.tokenInfo;
      if (t && (!t.privateRepos || t.unreadable)) {
        out.push(el('p', {
          class: 'widget-note',
          text: !t.privateRepos
            ? `Token works but sees no private repos in ${t.owners.join(', ')}. It needs Contents: read-only, and an organisation may still have to approve it.`
            : `Token sees ${t.privateRepos} private repos but can’t read commits in ${t.unreadable}. Give it Contents: read-only.`,
        }));
      }
    }
    body.replaceChildren(...out.filter(Boolean));
    fitSoon();
    renderStatus(lists ? at : calendar.at);
  }

  // GitHub is checked at most once an hour; Refresh skips the wait (e.g. after changing the token).
  function renderStatus(when) {
    status.replaceChildren(
      when ? `${timeAgo(when) === 'now' ? 'just now' : `${timeAgo(when)} ago`} · ` : '',
      el('button', { type: 'button', class: 'link-btn', text: 'Refresh', title: 'Fetch from GitHub now', onclick: () => load(true) }));
  }

  let seq = 0;
  let shown = null;   // what was last drawn: the settings, each feed's time and error, the minute
  // cachedOnly draws the saved copies, however old, without fetching: a new tab shows them at once.
  async function load(force = false, cachedOnly = false) {
    const { parts } = settings();
    const user = prefs().github.user.trim();
    const tok = token();
    const profile = linkProps(`https://github.com/${encodeURIComponent(user)}`);
    link.href = user ? profile.href : 'https://github.com/';
    if (profile.target) link.target = profile.target;
    else link.removeAttribute('target');
    if (!user) {
      shown = null;
      renderSetup();
      return;
    }
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    };
    const my = ++seq;
    const ttl = force ? 0 : GITHUB_TTL;
    const get = (key, loader) => (cachedOnly ? Promise.resolve(peek(key) ?? { data: null, at: 0 }) : feed(key, ttl, loader));
    // The contribution calendar is the HTML one on the profile (no API gives it without a token);
    // the extension's github.com host permission lets it be read across origins.
    const calendar = parts.includes('heatmap')
      ? get(`github-cal:${user}`, async () => parseContributions(await fetchText(`https://github.com/users/${encodeURIComponent(user)}/contributions`)))
      : Promise.resolve({ data: null, at: 0 });
    // Pull requests, issues and commits come from one fetch whichever of them are shown, so
    // switching parts never waits.
    const activity = parts.some(p => p !== 'heatmap')
      ? get(`github-v7:${user}:${tok ? 'token' : 'public'}`, () => fetchActivity(user, tok, headers))
      : Promise.resolve({ data: null, at: 0 });
    const [result, cal] = await Promise.all([activity, calendar]);
    if (my !== seq) return;
    // The 30 s refresh mostly gets back what's drawn already: then only the "x ago" moves on (the
    // rows' own times once a minute).
    const drawn = JSON.stringify([conf, result.at, result.error?.message, cal.at, cal.error?.message, Math.floor(Date.now() / 60e3)]);
    if (drawn === shown) {
      renderStatus(parts.some(p => p !== 'heatmap') ? result.at : cal.at);
      return;
    }
    shown = drawn;
    renderGithub(result, user, cal);
  }

  async function fetchActivity(user, tok, headers) {
    // Commit search finds the user's commits in every repo and organisation (default branches);
    // GitHub's events feed returns nothing for this account. The 100 newest also tell which
    // organisations to ask for private repos.
    const commitQuery = encodeURIComponent(`author:${user}`);
    const prQuery = encodeURIComponent(`is:pr is:open involves:${user}`);
    // Issues the user opened, is assigned to, is mentioned in or commented on.
    const issueQuery = encodeURIComponent(`is:issue is:open involves:${user} archived:false`);
    const asList = list => (Array.isArray(list) ? list : []);
    const [searched, pulls, issues, ownPrivate] = await Promise.all([
      fetchJson(`${GITHUB}/search/commits?q=${commitQuery}&sort=author-date&order=desc&per_page=100`, headers).then(parseCommits),
      fetchJson(`${GITHUB}/search/issues?q=${prQuery}&sort=updated&per_page=4`, headers).then(parseIssues),
      fetchJson(`${GITHUB}/search/issues?q=${issueQuery}&sort=updated&per_page=${ISSUES}`, headers).then(parseIssues),
      tok
        ? fetchJson(`${GITHUB}/user/repos?visibility=private&sort=pushed&per_page=30`, headers).then(asList).catch(() => [])
        : [],
    ]);
    // A fine-grained token made for an organisation may not show its repos under /user/repos,
    // so each organisation found in the commit history is also asked for its private repos.
    const orgs = [...new Set(searched.map(c => c.repo.split('/')[0]))].filter(o => o.toLowerCase() !== user.toLowerCase());
    const orgPrivate = tok
      ? await Promise.all(orgs.map(o => fetchJson(`${GITHUB}/orgs/${encodeURIComponent(o)}/repos?type=private&sort=pushed&per_page=30`, headers)
        .then(asList)
        .catch(() => [])))
      : [];
    const byName = new Map([...ownPrivate, ...orgPrivate.flat()].filter(r => r.private).map(r => [r.full_name, r]));
    const tokenRepos = [...byName.values()];
    // Private repos the token can see are asked directly, since search may leave them out.
    // 409 means an empty repo; other failures (usually missing Contents access) are counted.
    let unreadable = 0;
    const privateCommits = await Promise.all(tokenRepos.map(r => fetchJson(
      `${GITHUB}/repos/${r.full_name}/commits?author=${encodeURIComponent(user)}&per_page=${MAX_COMMITS}`, headers,
    )
      .then(list => parseCommits({ items: (Array.isArray(list) ? list : []).map(i => ({ ...i, repository: { full_name: r.full_name, private: true } })) }))
      .catch(err => {
        if (err.status !== 409) unreadable++;
        return [];
      })));
    const tokenInfo = tok
      ? { privateRepos: tokenRepos.length, unreadable, withCommits: privateCommits.filter(c => c.length).length, owners: [user, ...orgs] }
      : null;
    return { commits: latestCommits([...searched, ...privateCommits.flat()], MAX_COMMITS), pulls, issues, tokenInfo };
  }

  // ---- wiring ----

  let conf = null;
  let timer = 0;

  function onPrefs(state) {
    const own = copyById(state, copy.id);
    if (!own) return;
    const next = JSON.stringify([state.prefs.github.user, state.prefs.github.token, own.settings.parts, state.prefs.openInNewTab]);
    if (next === conf) return;
    const first = conf === null;
    conf = next;
    clearTimeout(timer);
    // The saved copy now, so the widget isn't empty while GitHub is asked (once an hour); then
    // the cache or GitHub.
    load(false, true);
    timer = setTimeout(load, first ? 0 : RECONFIGURE_MS);
  }

  function refresh() {
    if (document.visibilityState === 'visible') load();   // served from the saved copy until it's an hour old
  }

  const unsubscribe = store.subscribe(onPrefs, ['prefs']);
  onPrefs(store.get());
  const interval = setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);

  return {
    destroy() {
      seq++;
      clearInterval(interval);
      clearTimeout(timer);
      cancelAnimationFrame(fitFrame);
      sizes.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      unsubscribe();
    },
  };
}
