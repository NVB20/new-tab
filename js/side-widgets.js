// Second widget column (opposite the clock): live crypto prices plus USD/ILS, and GitHub activity.

import { el, icon } from './ui.js';
import { feed, fetchJson, peek } from './net.js';
import {
  parseTicker, parseKline, parseFxSeries, parseCommits, parsePulls,
  formatPrice, formatRate, formatChange, sparkPoints, timeAgo, parseCoins,
} from './feeds.js';

const PRICE_TTL = 30e3;
const KLINE_TTL = 5 * 60e3;
const FX_TTL = 60 * 60e3;
const GITHUB_TTL = 10 * 60e3;
const REFRESH_MS = 30e3;
const RECONFIGURE_MS = 800;   // wait for typing to stop before refetching after a settings change
const SPARK = { w: 64, h: 18 };
const BYBIT = 'https://api.bybit.com/v5/market';
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const GITHUB = 'https://api.github.com';
const SVG = 'http://www.w3.org/2000/svg';

const heading = (iconName, text) => el('h2', { class: 'widget-head' }, icon(iconName, 18), el('span', { text }));
const sub = text => el('div', { class: 'widget-sub', text });
const empty = text => el('p', { class: 'widget-empty', text });
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const trendOf = change => (change > 0 ? 'up' : change < 0 ? 'down' : 'flat');

function sparkline(values, trend) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SPARK.w} ${SPARK.h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', `mk-spark ${trend}`);
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(SVG, 'polyline');
  line.setAttribute('points', sparkPoints(values, SPARK.w, SPARK.h));
  svg.append(line);
  return svg;
}

export function mountSideWidgets(root, store) {
  const marketList = el('div', { class: 'mk-list' });
  const markets = el('section', { class: 'widget widget-markets' }, heading('trend', 'Markets'), marketList);
  const githubBody = el('div', { class: 'gh-body' });
  const github = el('section', { class: 'widget widget-github' }, heading('branch', 'GitHub'), githubBody);
  root.append(markets, github);

  const prefs = () => store.get().prefs;
  const linkProps = href => (prefs().openInNewTab ? { href, target: '_blank', rel: 'noopener' } : { href });

  // ---- Markets ----

  function marketRow({ label, href, title, value, change, closes }) {
    const trend = trendOf(change);
    return el('a', { class: 'mk-row', title, ...linkProps(href) },
      el('span', { class: 'mk-sym', text: label }),
      closes.length > 1 ? sparkline(closes, trend) : el('span'),
      el('span', { class: 'mk-price', text: value }),
      el('span', { class: `mk-chg ${trend}`, text: change == null ? '' : formatChange(change) }));
  }

  function renderMarkets(rows, fx) {
    if (!rows.length && !fx) {
      marketList.replaceChildren(empty('Add coins in Preferences → Widgets.'));
      return;
    }
    marketList.replaceChildren(
      ...rows.map(r => marketRow({
        label: r.coin,
        href: `https://www.bybit.com/en/trade/spot/${r.coin}/USDT`,
        title: r.ticker ? `${r.coin}/USDT on Bybit · 24h chart` : `No Bybit spot price for ${r.coin}/USDT`,
        value: r.ticker ? formatPrice(r.ticker.price) : '—',
        change: r.ticker?.change ?? null,
        closes: r.closes,
      })),
      fx && marketRow({
        label: 'USD/ILS',
        href: 'https://www.google.com/finance/quote/USD-ILS',
        title: `ECB reference rate for ${fx.date} · last ${fx.series.length} days`,
        value: formatRate(fx.rate),
        change: fx.change,
        closes: fx.series,
      }));
  }

  const marketKeys = coin => ({ ticker: `ticker:${coin}USDT`, kline: `kline:${coin}USDT` });

  function renderCachedMarkets() {
    const m = prefs().widgets.markets;
    const rows = parseCoins(m.coins).map(coin => ({
      coin,
      ticker: peek(marketKeys(coin).ticker)?.data ?? null,
      closes: peek(marketKeys(coin).kline)?.data ?? [],
    }));
    renderMarkets(rows, m.fx ? peek('fx:USD-ILS')?.data ?? null : null);
  }

  let marketSeq = 0;
  async function loadMarkets() {
    const m = prefs().widgets.markets;
    const my = ++marketSeq;
    const rows = await Promise.all(parseCoins(m.coins).map(async coin => {
      const keys = marketKeys(coin);
      const symbol = `${coin}USDT`;
      const [ticker, kline] = await Promise.all([
        feed(keys.ticker, PRICE_TTL, async () => parseTicker(await fetchJson(`${BYBIT}/tickers?category=spot&symbol=${symbol}`))),
        feed(keys.kline, KLINE_TTL, async () => {
          const closes = parseKline(await fetchJson(`${BYBIT}/kline?category=spot&symbol=${symbol}&interval=60&limit=24`));
          return closes.length ? closes : null;
        }),
      ]);
      return { coin, ticker: ticker.data, closes: kline.data ?? [] };
    }));
    let fx = null;
    if (m.fx) {
      const from = isoDay(Date.now() - 12 * 86400e3);
      fx = (await feed('fx:USD-ILS', FX_TTL, async () => parseFxSeries(await fetchJson(`${FRANKFURTER}/${from}..?from=USD&to=ILS`), 'ILS'))).data;
    }
    if (my === marketSeq) renderMarkets(rows, fx);
  }

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

  function renderGithub({ data, error }, user) {
    const parts = [];
    if (error && !data) {
      parts.push(empty(error.rateLimited
        ? 'GitHub’s hourly limit is used up. It resets within the hour; a token in Preferences raises it.'
        : error.status === 401 ? 'GitHub rejected the token. Check it in Preferences → Widgets.'
          : error.status === 404 ? 'GitHub user not found. Check the username in Preferences → Widgets.'
            : 'Couldn’t reach GitHub.'));
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
      parts.push(sub('Recent commits'), ...(data.commits.length
        ? data.commits.map(c => githubRow({
          href: c.url,
          iconName: c.private ? 'lock' : 'commit',
          name: c.message,
          // Repos of other owners (organisations) keep the owner, e.g. "eitan-capital/.github".
          meta: `${c.repo.startsWith(`${user}/`) ? c.repo.slice(user.length + 1) : c.repo} · ${timeAgo(c.at)}`,
          title: `${c.repo} @ ${c.sha}${c.private ? ' (private)' : ''}
${c.message}`,
        }))
        : [empty('No commits found.')]));
    }
    githubBody.replaceChildren(...parts);
  }

  let githubSeq = 0;
  async function loadGithub() {
    const g = prefs().widgets.github;
    const user = g.user.trim();
    const token = g.token.trim();
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
    const result = await feed(`github-activity:${user}:${token ? 'token' : 'public'}`, GITHUB_TTL, async () => {
      // Commit search finds the user's commits in every repo and organisation (default branches);
      // GitHub's events feed returns nothing for this account. A token adds private repos.
      const commitQuery = encodeURIComponent(`author:${user}`);
      const prQuery = encodeURIComponent(`is:pr is:open involves:${user}`);
      const [commits, pulls] = await Promise.all([
        fetchJson(`${GITHUB}/search/commits?q=${commitQuery}&sort=author-date&order=desc&per_page=7`, headers).then(parseCommits),
        fetchJson(`${GITHUB}/search/issues?q=${prQuery}&sort=updated&per_page=4`, headers).then(parsePulls),
      ]);
      return { commits, pulls };
    });
    if (my === githubSeq) renderGithub(result, user);
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

    const nextMarkets = JSON.stringify([w.markets.coins, w.markets.fx, state.prefs.openInNewTab]);
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
    if (w.github.enabled) loadGithub();   // served from cache until it's 10 minutes old
  }

  store.subscribe(onPrefs, ['prefs']);
  onPrefs(store.get());
  setInterval(refresh, REFRESH_MS);
  document.addEventListener('visibilitychange', refresh);
}
