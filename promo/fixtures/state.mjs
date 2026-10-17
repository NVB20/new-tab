// The demo page's saved state: tiles for well-known sites with an AI folder, and every widget the
// video shows, in the GitHub theme with the blue accent. Home is the page most shots show; Work has
// room to move widgets for the Layout mode shot.
import { normalizeState } from '../../js/store.js';
import { iconUrl } from './icons.mjs';

export const USER = 'alexdev';
export const PLACE = { name: 'Tel Aviv', region: 'Tel Aviv District', country: 'Israel', lat: 32.08, lon: 34.78 };
export const MARKETS = ['#Crypto', 'BTC', 'ETH', 'SOL', '#Stocks', 'SPY', 'QQQ', 'GOLD', 'USD/ILS'];
export const FOLLOW = ['nba:13', 'soccer:20232', 'f1'];
export const HOME = 'g-home';
export const WORK = 'g-work';

const SITES = [
  ['github', 'GitHub', 'https://github.com/'],
  ['youtube', 'YouTube', 'https://www.youtube.com/'],
  ['gmail', 'Gmail', 'https://mail.google.com/'],
  ['notion', 'Notion', 'https://www.notion.so/'],
  ['figma', 'Figma', 'https://www.figma.com/'],
  ['reddit', 'Reddit', 'https://www.reddit.com/'],
  ['spotify', 'Spotify', 'https://open.spotify.com/'],
  ['netflix', 'Netflix', 'https://www.netflix.com/'],
  ['linear', 'Linear', 'https://linear.app/'],
];
const AI = [
  ['claude', 'Claude', 'https://claude.ai/'],
  ['openai', 'ChatGPT', 'https://chatgpt.com/'],
  ['googlegemini', 'Gemini', 'https://gemini.google.com/'],
  ['perplexity', 'Perplexity', 'https://www.perplexity.ai/'],
];

const SETTINGS = {
  clock: { hour24: true, name: 'Alex', greeting: true, face: 'classic', colon: true },
  markets: { items: MARKETS },
  github: { parts: ['stats', 'heatmap', 'pulls', 'commits'] },
  sports: { follow: FOLLOW },
  weather: { place: PLACE, unit: 'c' },
  tiles: { group: null, columns: 5 },
  search: {},
};

const tile = ([slug, title, url], extra = {}) => ({ id: `t-${slug}`, groupId: HOME, title, url, icon: iconUrl(slug), ...extra });
const widget = (id, type, x, y, w, h) => ({ id, type, x, y, w, h, settings: SETTINGS[type] });

// activeGroup: the tab the page opens on.
export function buildState({ activeGroup = HOME } = {}) {
  return normalizeState({
    version: 1,
    groups: [{ id: HOME, title: 'Home' }, { id: WORK, title: 'Work' }],
    tiles: [
      ...SITES.map(site => tile(site)),
      { id: 'f-ai', groupId: HOME, title: 'AI', url: '', icon: '', kind: 'folder' },
      ...AI.map(site => tile(site, { folderId: 'f-ai' })),
    ],
    activeGroupId: activeGroup,
    onboarding: { done: true, step: 'done' },
    prefs: {
      theme: 'github',
      accent: '#2563eb',
      github: { user: USER, token: '' },
      layout: {
        cols: 12, rows: 12, widgets: [
          widget('w-clock', 'clock', 0, 0, 3, 4),
          widget('w-markets', 'markets', 0, 4, 3, 8),
          widget('w-search', 'search', 3, 0, 6, 1),
          widget('w-tiles', 'tiles', 3, 1, 6, 5),
          widget('w-sports', 'sports', 3, 6, 3, 6),
          widget('w-weather', 'weather', 6, 6, 3, 6),
          widget('w-github', 'github', 9, 0, 3, 12),
        ],
      },
      layouts: {
        [WORK]: {
          cols: 12, rows: 12, widgets: [
            widget('w2-search', 'search', 3, 0, 6, 1),
            widget('w2-clock', 'clock', 0, 0, 3, 4),
            widget('w2-weather', 'weather', 3, 2, 3, 4),
            widget('w2-sports', 'sports', 9, 0, 3, 6),
            widget('w2-markets', 'markets', 0, 5, 3, 7),
          ],
        },
      },
    },
  });
}
