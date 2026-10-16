// Second widget column (opposite the clock): live crypto prices and exchange rates, and GitHub
// activity (contribution heatmap, open PRs, latest commits).

import { el, icon } from './ui.js';
import { feed, fetchJson, fetchText, peek } from './net.js';
import {
  parseTicker, parseKline, parseFxPair, fxCurrencies, isPair, parseCommits, latestCommits, parsePulls,
  formatPrice, formatRate, formatChange, sparkPoints, timeAgo, parseCoins,
  parseContributions, heatmapLayout, MONTHS,
} from './feeds.js';

const PRICE_TTL = 30e3;
const KLINE_TTL = 5 * 60e3;
const FX_TTL = 60 * 60e3;
const GITHUB_TTL = 60 * 60e3;   // GitHub is fetched at most once an hour
const COMMITS = 6;              // latest commits shown
const REFRESH_MS = 30e3;
const RECONFIGURE_MS = 800;   // wait for typing to stop before refetching after a settings change
const SPARK = { w: 64, h: 18 };
const BYBIT = 'https://api.bybit.com/v5/market';
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const GITHUB = 'https://api.github.com';
const SVG = 'http://www.w3.org/2000/svg';
// Products offered by the Markets editor (any other coin can be typed in). Coins are Bybit spot
// pairs against USDT; currency pairs use the ECB's daily reference rates.
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK', 'DOT', 'LTC', 'SUI', 'HYPE'];
const PAIRS = ['USD/ILS', 'EUR/ILS', 'GBP/ILS', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF'];
// Heatmap geometry in SVG units: cell pitch, cell size, and the month label row on top.
const HM = { pitch: 10, cell: 8, top: 20 };

const heading = (iconName, text) => el('h2', { class: 'widget-head' }, icon(iconName, 18), el('span', { text }));
const sub = text => el('div', { class: 'widget-sub', text });
const empty = text => el('p', { class: 'widget-empty', text });
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const trendOf = change => (change > 0 ? 'up' : change < 0 ? 'down' : 'flat');

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text != null) node.textContent = text;
  return node;
}

function sparkline(values, trend) {
  const svg = svgEl('svg', { viewBox: `0 0 ${SPARK.w} ${SPARK.h}`, preserveAspectRatio: 'none', class: `mk-spark ${trend}`, 'aria-hidden': 'true' });
  svg.append(svgEl('polyline', { points: sparkPoints(values, SPARK.w, SPARK.h) }));
  return svg;
}

function dayLabel({ date, count }) {
  const [, month, day] = date.split('-').map(Number);
  return `${count ? count.toLocaleString('en-US') : 'No'} contribution${count === 1 ? '' : 's'} on ${MONTHS[month - 1]} ${day}`;
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

export function mountSideWidgets(root, store) {
  const marketList = el('div', { class: 'mk-list' });
  const marketEditor = el('div', { class: 'mk-editor', hidden: true });
  const editButton = el('button', { type: 'button', class: 'icon-btn widget-edit', onclick: () => setEditing(!editing) });
  const marketsHead = heading('trend', 'Markets');
  marketsHead.append(editButton);
  const markets = el('section', { class: 'widget widget-markets' }, marketsHead, marketList, marketEditor);
  const githubBody = el('div', { class: 'gh-body' });
  // The heading opens the user's GitHub profile.
  const githubLink = el('a', { class: 'widget-head-link', title: 'Open your GitHub profile' },
    icon('branch', 18), el('span', { text: 'GitHub' }), icon('external', 13));
  const githubStatus = el('span', { class: 'widget-head-status', title: 'Checked at most once an hour' });
  const githubHead = el('h2', { class: 'widget-head' }, githubLink, githubStatus);
  const github = el('section', { class: 'widget widget-github' }, githubHead, githubBody);
  root.append(markets, github);

  const prefs = () => store.get().prefs;
  const linkProps = href => (prefs().openInNewTab ? { href, target: '_blank', rel: 'noopener' } : { href });

  // ---- Markets ----

  // The symbol's link stretches over the whole row; chart is an optional link in the last column.
  function marketRow({ label, href, title, value, change, closes, chart }) {
    const trend = trendOf(change);
    return el('div', { class: 'mk-row' },
      el('a', { class: 'mk-sym', title, text: label, ...linkProps(href) }),
      closes.length > 1 ? sparkline(closes, trend) : el('span'),
      el('span', { class: 'mk-price', text: value }),
      el('span', { class: `mk-chg ${trend}`, text: change == null ? '' : formatChange(change) }),
      chart ? el('a', { class: 'mk-tv', title: chart.title, 'aria-label': chart.title, ...linkProps(chart.href) }, icon('candles', 15)) : el('span'));
  }

  const coinRow = ({ id, ticker, closes }) => marketRow({
    label: id,
    href: `https://www.bybit.com/en/trade/spot/${id}/USDT`,
    title: ticker ? `${id}/USDT on Bybit · 24h chart` : `No Bybit spot price for ${id}/USDT`,
    value: ticker ? formatPrice(ticker.price) : '—',
    change: ticker?.change ?? null,
    closes,
    chart: { href: `https://www.tradingview.com/chart/?symbol=BYBIT:${id}USDT`, title: `${id}/USDT chart on TradingView` },
  });

  const pairRow = ({ id, fx }) => marketRow({
    label: id,
    href: `https://www.google.com/finance/quote/${id.replace('/', '-')}`,
    title: fx ? `ECB reference rate for ${fx.date} · last ${fx.series.length} days` : `No ECB rate for ${id} yet`,
    value: fx ? formatRate(fx.rate) : '—',
    change: fx?.change ?? null,
    closes: fx?.series ?? [],
  });

  function renderMarkets(rows) {
    if (!rows.length) {
      marketList.replaceChildren(el('p', { class: 'widget-empty' }, 'Nothing chosen. ',
        el('button', { type: 'button', class: 'link-btn', text: 'Choose products', onclick: () => setEditing(true) })));
      return;
    }
    marketList.replaceChildren(...rows.map(r => (isPair(r.id) ? pairRow(r) : coinRow(r))));
  }

  const items = () => prefs().widgets.markets.items;
  const marketKeys = coin => ({ ticker: `ticker:${coin}USDT`, kline: `kline:${coin}USDT` });
  // All pairs come from one request: the ECB's EUR rates for every currency they use.
  const fxKey = currencies => `fx:EUR:${currencies.join(',')}`;

  // Rows in the chosen order; coin(id) gives a coin's { ticker, closes }.
  const marketRows = (list, coin, fxTable) => list.map(id => (isPair(id)
    ? { id, fx: fxTable ? parseFxPair(fxTable, id) : null }
    : { id, ...coin(id) }));

  function renderCachedMarkets() {
    const list = items();
    const currencies = fxCurrencies(list);
    const fxTable = currencies.length ? peek(fxKey(currencies))?.data ?? null : null;
    renderMarkets(marketRows(list, id => ({
      ticker: peek(marketKeys(id).ticker)?.data ?? null,
      closes: peek(marketKeys(id).kline)?.data ?? [],
    }), fxTable));
  }

  async function loadCoin(coin) {
    const keys = marketKeys(coin);
    const symbol = `${coin}USDT`;
    const [ticker, kline] = await Promise.all([
      feed(keys.ticker, PRICE_TTL, async () => parseTicker(await fetchJson(`${BYBIT}/tickers?category=spot&symbol=${symbol}`))),
      feed(keys.kline, KLINE_TTL, async () => {
        const closes = parseKline(await fetchJson(`${BYBIT}/kline?category=spot&symbol=${symbol}&interval=60&limit=24`));
        return closes.length ? closes : null;
      }),
    ]);
    return [coin, { ticker: ticker.data, closes: kline.data ?? [] }];
  }

  async function loadFx(currencies) {
    if (!currencies.length) return null;
    const from = isoDay(Date.now() - 12 * 86400e3);
    const result = await feed(fxKey(currencies), FX_TTL, async () => {
      const json = await fetchJson(`${FRANKFURTER}/${from}..?from=EUR&to=${currencies.join(',')}`);
      return json?.rates ? { base: json.base, rates: json.rates } : null;
    });
    return result.data;
  }

  let marketSeq = 0;
  async function loadMarkets() {
    const list = items();
    const my = ++marketSeq;
    const [coins, fxTable] = await Promise.all([
      Promise.all(list.filter(id => !isPair(id)).map(loadCoin)).then(entries => new Map(entries)),
      loadFx(fxCurrencies(list)),
    ]);
    if (my === marketSeq) renderMarkets(marketRows(list, id => coins.get(id), fxTable));
  }

  // ---- Markets editor: ✎ swaps the rows for checkboxes; changes apply as they're made ----

  let editing = false;
  let customShown = [];   // typed-in coins stay listed while the editor is open, even unticked

  function setEditing(on) {
    editing = on;
    markets.classList.toggle('editing', on);
    editButton.replaceChildren(icon(on ? 'check' : 'edit', 15));
    editButton.title = on ? 'Done' : 'Choose products';
    editButton.setAttribute('aria-label', editButton.title);
    editButton.setAttribute('aria-pressed', String(on));
    marketList.hidden = on;
    marketEditor.hidden = !on;
    if (on) {
      customShown = items().filter(id => !isPair(id) && !COINS.includes(id));
      renderEditor();
    }
  }

  function setItem(id, on) {
    store.update(s => {
      const list = s.prefs.widgets.markets.items.filter(i => i !== id);
      if (on) list.push(id);
      s.prefs.widgets.markets.items = list;
    });
  }

  function checkbox(id) {
    const input = el('input', { type: 'checkbox', checked: items().includes(id), onchange: () => setItem(id, input.checked) });
    return el('label', { class: 'mk-check' }, input, el('span', { text: id }));
  }

  function renderEditor() {
    const input = el('input', {
      type: 'text', class: 'pref-input', placeholder: 'Other coin, e.g. PEPE', maxLength: 10,
      spellcheck: false, autocomplete: 'off', 'aria-label': 'Add a coin by its ticker',
    });
    const addForm = el('form', {
      class: 'mk-add',
      onsubmit: e => {
        e.preventDefault();
        const [coin] = parseCoins(input.value);
        if (!coin) return;
        if (!COINS.includes(coin) && !customShown.includes(coin)) customShown.push(coin);
        if (!items().includes(coin)) setItem(coin, true);
        renderEditor();
        marketEditor.querySelector('.mk-add input').focus();
      },
    }, input, el('button', { type: 'submit', class: 'btn', text: 'Add' }));
    marketEditor.replaceChildren(
      sub('Crypto · Bybit, in USDT'),
      el('div', { class: 'mk-checks' }, [...COINS, ...customShown].map(checkbox)),
      addForm,
      sub('Currencies · ECB daily rate'),
      el('div', { class: 'mk-checks' }, PAIRS.map(checkbox)));
  }

  setEditing(false);

  // ---- GitHub ----

  function githubRow({ href, iconName, name, meta, title }) {
    return el('a', { class: 'gh-row', title, ...linkProps(href) },
      icon(iconName, 14),
      el('span', { class: 'gh-name', dir: 'auto', text: name }),
      el('span', { class: 'gh-meta', text: meta }));
  }

  function renderGithubSetup() {
    const input = el('input', { type: 'text', class: 'pref-input gh-input', placeholder: 'GitHub username', spellcheck: false, autocomplete: 'off', 'aria-label': 'GitHub username' });
    const form = el('form', {
      class: 'gh-setup',
      onsubmit: e => {
        e.preventDefault();
        const user = input.value.trim();
        if (user) store.update(s => { s.prefs.widgets.github.user = user; });
      },
    }, input, el('button', { class: 'btn', type: 'submit', text: 'Show' }));
    githubBody.replaceChildren(form, empty('Shows your latest commits in any repo, and your open pull requests.'));
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

  function renderGithub({ data, at, error }, user, calendar) {
    const parts = [heatmap(calendar, user)];
    if (error && !data) {
      parts.push(empty(error.rateLimited
        ? 'GitHub’s hourly limit is used up. The widget tries again in an hour (or press Refresh later).'
        : error.status === 401 ? 'GitHub rejected the token. Check it in Preferences → Widgets.'
          : error.status === 404 ? 'GitHub user not found. Check the username in Preferences → Widgets.'
            : 'Couldn’t reach GitHub.'));
    } else if (!data) {
      parts.push(empty('Loading…'));
    }
    if (data) {
      if (data.pulls.length) {
        parts.push(sub('Open pull requests'), ...data.pulls.map(pr => githubRow({
          href: pr.url,
          iconName: 'pr',
          name: pr.title,
          meta: `#${pr.number} · ${timeAgo(pr.updatedAt)}`,
          title: `${pr.repo} #${pr.number}${pr.draft ? ' (draft)' : ''}\n${pr.title}`,
        })));
      }
      parts.push(sub('Latest commits'), ...(data.commits.length
        ? data.commits.map(c => githubRow({
          href: c.url,
          iconName: c.private ? 'lock' : 'commit',
          name: c.message,
          // Repos of other owners (organisations) keep the owner, e.g. "eitan-capital/.github".
          meta: `${c.repo.startsWith(`${user}/`) ? c.repo.slice(user.length + 1) : c.repo} · ${timeAgo(c.at)}`,
          title: `${c.repo} @ ${c.sha}${c.private ? ' (private)' : ''}\n${c.message}`,
        }))
        : [empty('No commits found.')]));
      // Only speak up about the token when it isn't working.
      const t = data.tokenInfo;
      if (t && (!t.privateRepos || t.unreadable)) {
        parts.push(el('p', {
          class: 'widget-note',
          text: !t.privateRepos
            ? `Token works but sees no private repos in ${t.owners.join(', ')}. It needs Contents: read-only, and an organisation may still have to approve it.`
            : `Token sees ${t.privateRepos} private repos but can’t read commits in ${t.unreadable}. Give it Contents: read-only.`,
        }));
      }
    }
    githubBody.replaceChildren(...parts.filter(Boolean));
    // GitHub is checked at most once an hour; Refresh skips the wait (e.g. after changing the token).
    githubStatus.replaceChildren(
      at ? `${timeAgo(at) === 'now' ? 'just now' : `${timeAgo(at)} ago`} · ` : '',
      el('button', { type: 'button', class: 'link-btn', text: 'Refresh', title: 'Fetch from GitHub now', onclick: () => loadGithub(true) }));
  }

  let githubSeq = 0;
  async function loadGithub(force = false) {
    const g = prefs().widgets.github;
    const user = g.user.trim();
    const token = g.token.trim();
    const profile = linkProps(`https://github.com/${encodeURIComponent(user)}`);
    githubLink.href = user ? profile.href : 'https://github.com/';
    if (profile.target) githubLink.target = profile.target;
    else githubLink.removeAttribute('target');
    if (!user) {
      renderGithubSetup();
      return;
    }
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const my = ++githubSeq;
    const ttl = force ? 0 : GITHUB_TTL;
    // The contribution calendar is the HTML one on the profile (no API gives it without a token);
    // the extension's github.com host permission lets it be read across origins.
    const calendar = feed(`github-cal:${user}`, ttl, async () => parseContributions(
      await fetchText(`https://github.com/users/${encodeURIComponent(user)}/contributions`)));
    const activity = feed(`github-v5:${user}:${token ? 'token' : 'public'}`, ttl, async () => {
      // Commit search finds the user's commits in every repo and organisation (default branches);
      // GitHub's events feed returns nothing for this account. The 100 newest also tell which
      // organisations to ask for private repos.
      const commitQuery = encodeURIComponent(`author:${user}`);
      const prQuery = encodeURIComponent(`is:pr is:open involves:${user}`);
      const asList = list => (Array.isArray(list) ? list : []);
      const [searched, pulls, ownPrivate] = await Promise.all([
        fetchJson(`${GITHUB}/search/commits?q=${commitQuery}&sort=author-date&order=desc&per_page=100`, headers).then(parseCommits),
        fetchJson(`${GITHUB}/search/issues?q=${prQuery}&sort=updated&per_page=4`, headers).then(parsePulls),
        token
          ? fetchJson(`${GITHUB}/user/repos?visibility=private&sort=pushed&per_page=30`, headers).then(asList).catch(() => [])
          : [],
      ]);
      // A fine-grained token made for an organisation may not show its repos under /user/repos,
      // so each organisation found in the commit history is also asked for its private repos.
      const orgs = [...new Set(searched.map(c => c.repo.split('/')[0]))].filter(o => o.toLowerCase() !== user.toLowerCase());
      const orgPrivate = token
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
        `${GITHUB}/repos/${r.full_name}/commits?author=${encodeURIComponent(user)}&per_page=${COMMITS}`, headers,
      )
        .then(list => parseCommits({ items: (Array.isArray(list) ? list : []).map(i => ({ ...i, repository: { full_name: r.full_name, private: true } })) }))
        .catch(err => {
          if (err.status !== 409) unreadable++;
          return [];
        })));
      const tokenInfo = token
        ? { privateRepos: tokenRepos.length, unreadable, withCommits: privateCommits.filter(c => c.length).length, owners: [user, ...orgs] }
        : null;
      return { commits: latestCommits([...searched, ...privateCommits.flat()], COMMITS), pulls, tokenInfo };
    });
    const [result, cal] = await Promise.all([activity, calendar]);
    if (my === githubSeq) renderGithub(result, user, cal);
  }

  // ---- wiring ----

  let marketsConf = null;
  let githubConf = null;
  let marketsTimer = 0;
  let githubTimer = 0;

  function onPrefs(state) {
    const w = state.prefs.widgets;
    root.hidden = !w.enabled || !(w.markets.enabled || w.github.enabled);
    markets.hidden = !w.markets.enabled;
    github.hidden = !w.github.enabled;

    const nextMarkets = JSON.stringify([w.markets.items, state.prefs.openInNewTab]);
    if (w.markets.enabled && nextMarkets !== marketsConf) {
      const first = marketsConf === null;
      marketsConf = nextMarkets;
      renderCachedMarkets();
      clearTimeout(marketsTimer);
      marketsTimer = setTimeout(loadMarkets, first ? 0 : RECONFIGURE_MS);
    }
    const nextGithub = JSON.stringify([w.github.user, w.github.token, state.prefs.openInNewTab]);
    if (w.github.enabled && nextGithub !== githubConf) {
      const first = githubConf === null;
      githubConf = nextGithub;
      clearTimeout(githubTimer);
      githubTimer = setTimeout(loadGithub, first ? 0 : RECONFIGURE_MS);
    }
  }

  function refresh() {
    if (document.visibilityState !== 'visible') return;
    const w = prefs().widgets;
    if (!w.enabled) return;
    if (w.markets.enabled) loadMarkets();
    if (w.github.enabled) loadGithub();   // served from the saved copy until it's an hour old
  }

  store.subscribe(onPrefs, ['prefs']);
  onPrefs(store.get());
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);
}
