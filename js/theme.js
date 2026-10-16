// Applies prefs to CSS custom properties, body classes and the wallpaper layer.

import { backgroundImage } from './util.js';

const cssUrl = url => `url("${url.replace(/["\\\n\r]/g, encodeURIComponent)}")`;

export function mountTheme(store) {
  const root = document.documentElement;
  const bg = document.getElementById('bg');
  const media = matchMedia('(prefers-color-scheme: dark)');
  let shownMode = null;
  let shownImage = null;

  function apply() {
    const p = store.get().prefs;
    const mode = p.theme === 'auto' ? (media.matches ? 'dark' : 'light') : p.theme;
    if (mode !== shownMode) {
      shownMode = mode;
      root.dataset.theme = mode;
      try {
        localStorage.setItem('newtab:mode', mode);
      } catch {
        // only used to avoid a flash on the next load
      }
    }

    const image = backgroundImage(p.background, store.wallpaper);
    const vars = {
      '--accent': p.accent,
      '--cols': p.columns,
      '--gap': p.spacing + 'px',
      '--width': p.width + 'px',
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
    cl.toggle('center-v', p.centerVertically);
    cl.toggle('no-titles', !p.tiles.showTitle);
    cl.toggle('tiles-card', p.tiles.style === 'card');
    cl.toggle('site-icons', p.tiles.icons === 'site');
    cl.toggle('widgets-right', p.widgets.position === 'right');
    cl.toggle('widgets-off', !Object.values(p.widgets).some(w => w?.enabled === true));
    cl.toggle('no-sidebar', !p.sidebar.enabled);
  }

  media.addEventListener('change', apply);
  store.subscribe(apply, ['prefs', 'wallpaper']);
  apply();
}
