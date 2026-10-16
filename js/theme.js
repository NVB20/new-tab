// Applies prefs to CSS custom properties, body classes and the wallpaper layer.

import { backgroundImage } from './util.js';

const cssUrl = url => `url("${url.replace(/["\\\n\r]/g, encodeURIComponent)}")`;

// Read by boot.js before first paint.
function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // only used to avoid a flash on the next load
  }
}

export function mountTheme(store) {
  const root = document.documentElement;
  const bg = document.getElementById('bg');
  const media = matchMedia('(prefers-color-scheme: dark)');
  let shownMode = null;
  let shownImage = null;
  let shownPlain = null;

  function apply() {
    const p = store.get().prefs;
    const mode = p.theme === 'auto' ? (media.matches ? 'dark' : 'light') : p.theme;
    if (mode !== shownMode) {
      shownMode = mode;
      root.dataset.theme = mode;
      remember('newtab:mode', mode);
    }

    const image = backgroundImage(p.background, store.wallpaper);
    // The plain background's own colour, when one is picked; the theme's background otherwise.
    const plain = !image && p.background.pattern === 'none' ? p.background.color[mode === 'light' ? 'light' : 'dark'] : '';
    if (plain !== shownPlain) {
      shownPlain = plain;
      if (plain) root.style.setProperty('--plain-bg', plain);
      else root.style.removeProperty('--plain-bg');
      remember('newtab:plain-bg', plain);
    }
    const vars = {
      '--accent': p.accent,
      '--gap': p.spacing + 'px',
      '--tile-radius': p.tiles.radius + 'px',
      '--tile-bg': p.tiles.color,
      '--tile-text': p.tiles.textColor,
      // Blur and dim are for photos; they would only muddy the plain and ASCII backgrounds.
      '--bg-blur': (image ? p.background.blur : 0) + 'px',
      '--bg-dim': image ? p.background.dim / 100 : 0,
    };
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, String(value));

    // An uploaded wallpaper is a data URL of up to a few MB: only set it when it changes.
    if (image !== shownImage) {
      shownImage = image;
      bg.style.backgroundImage = image ? cssUrl(image) : '';
    }

    const cl = document.body.classList;
    cl.toggle('has-wallpaper', !!image);
    cl.toggle('compact', p.compact);
    cl.toggle('no-titles', !p.tiles.showTitle);
    cl.toggle('tiles-card', p.tiles.style === 'card');
    cl.toggle('site-icons', p.tiles.icons === 'site');
    cl.toggle('no-sidebar', !p.sidebar.enabled);
  }

  media.addEventListener('change', apply);
  store.subscribe(apply, ['prefs', 'wallpaper']);
  apply();
}
