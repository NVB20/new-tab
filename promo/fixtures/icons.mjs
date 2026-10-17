// The tiles' logos: a simple-icons glyph (simple-icons@15.0.0, CC0, in ./icons) in white on the
// brand's colour, as a rounded square like an app icon. Saved under made-up links, so the page
// shows them from its icon store and never fetches them.
import { readFileSync } from 'node:fs';

export const LOGOS = {
  github: '#24292f', youtube: '#ff0000', gmail: '#ea4335', notion: '#191919', figma: '#f24e1e',
  reddit: '#ff4500', spotify: '#1db954', netflix: '#e50914', linear: '#5e6ad2', claude: '#d97757',
  openai: '#10a37f', googlegemini: '#8e75b2', perplexity: '#1f8a99',
};

export const iconUrl = slug => `https://promo.invalid/icons/${slug}.svg`;

export function badge(slug, color) {
  const svg = readFileSync(new URL(`./icons/${slug}.svg`, import.meta.url), 'utf8');
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => `<path d="${m[1]}"/>`).join('');
  const out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    + `<rect width="64" height="64" rx="15" fill="${color}"/>`
    + `<g transform="translate(16 16) scale(1.3333)" fill="#fff">${paths}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(out).toString('base64')}`;
}

export const iconMap = () => Object.fromEntries(Object.entries(LOGOS).map(([slug, color]) => [iconUrl(slug), badge(slug, color)]));
