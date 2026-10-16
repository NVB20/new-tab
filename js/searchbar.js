// Search bar: a Google search, or a message that runs in a new chat on Claude, ChatGPT or Gemini.
// prefs.search turns each engine on or off (shared by every bar); the icon opens a menu of the
// ones that are on and Tab steps through them. Docked in a tiles block (given its grid) the bar
// has a grip that moves it between the rows of tiles; on its own it is a plain bar.

import { el, icon, showMenu } from './ui.js';
import { openUrl, askChat } from './chrome-api.js';
import { enginesOn, activeMode, nextMode, googleUrl, rowBands, gapY, nearestSlot, barSlot, slotToRow } from './ask.js';
import { copyById } from './layout.js';

// Each engine's icon has the engine's id as its name.
const ENGINES = {
  google: { label: 'Google', placeholder: 'Search Google' },
  claude: { label: 'Claude', placeholder: 'Ask Claude' },
  chatgpt: { label: 'ChatGPT', placeholder: 'Ask ChatGPT' },
  gemini: { label: 'Gemini', placeholder: 'Ask Gemini' },
};

// grid: the tiles block's grid when the bar is docked in it (root and grid share one CSS grid,
// .grid-wrap, so the bar can take a row of its own between the tiles); copy: that block's layout
// copy, whose settings.bar is the row. ctx.openPrefs opens Preferences.
export function mountSearchBar(root, store, { grid = null, copy = null, ctx = null } = {}) {
  const docked = !!grid;
  const search = () => store.get().prefs.search;
  const several = () => enginesOn(search()).length > 1;
  const setMode = mode => store.update(s => { s.prefs.search.mode = mode; });

  const modeButton = el('button', {
    type: 'button', class: 'sb-mode', 'aria-haspopup': 'menu',
    onclick: () => {
      const r = modeButton.getBoundingClientRect();
      const mode = activeMode(search());
      showMenu(r.left, r.bottom + 6, enginesOn(search()).map(id => ({
        label: ENGINES[id].label,
        icon: id,
        checked: id === mode,
        action: () => {
          setMode(id);
          input.focus();
        },
      })));
    },
  });
  const input = el('input', {
    type: 'text', class: 'sb-input', autocomplete: 'off', dir: 'auto', enterkeyhint: 'go',
    onkeydown: e => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && several()) {
        e.preventDefault();
        setMode(nextMode(search()));
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        send(e.ctrlKey || e.metaKey);
      }
    },
  });
  const hint = el('kbd', { class: 'sb-hint', text: 'Tab', title: 'Tab switches to the next engine' });
  const shortcut = el('kbd', { class: 'sb-key', text: 'Ctrl Space', title: 'Ctrl+Space puts the cursor here from anywhere on the page' });
  // With every engine off the bar says so instead of disappearing.
  const note = el('span', { class: 'sb-note', hidden: true }, 'No search engine is on. ',
    el('button', { type: 'button', class: 'link-btn', text: 'Preferences', onclick: () => ctx?.openPrefs('page') }));
  const grip = docked && el('button', {
    type: 'button', class: 'sb-grip',
    title: 'Drag to move between rows of tiles (or focus and press ↑ ↓)',
    'aria-label': 'Move the search bar',
    onkeydown: e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const rows = tileRows();
      const slot = barSlot(rowPref(), rows) + (e.key === 'ArrowUp' ? -1 : 1);
      if (slot >= 0 && slot <= rows) saveSlot(slot, rows);
    },
  }, icon('grip', 16));
  root.append(modeButton, input, note, shortcut, hint, grip);

  // Ctrl+Space from anywhere on the page (not over a dialog) puts the cursor in the first bar.
  const onKey = e => {
    if (e.code !== 'Space' || !e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (document.querySelector('.searchbar:not([hidden]) .sb-input:not([hidden])') !== input) return;
    e.preventDefault();
    input.focus();
    input.select();
  };
  addEventListener('keydown', onKey);

  function send(ctrl) {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const newTab = ctrl || store.get().prefs.openInNewTab;
    const mode = activeMode(search());
    if (!mode) return;
    if (mode === 'google') openUrl(googleUrl(text), { newTab });
    else askChat(mode, text, { newTab });
  }

  // ---- where a docked bar sits ----

  const rowPref = () => copyById(store.get(), copy.id)?.settings.bar ?? 0;
  const bands = () => rowBands([...grid.children].map(n => n.getBoundingClientRect()));
  const tileRows = () => bands().length;
  const saveSlot = (slot, rows) => store.update(s => {
    const own = copyById(s, copy.id);
    if (own) own.settings.bar = slotToRow(slot, rows);
  });

  // The bar takes grid row slot + 1 and the tiles flow around it; at the bottom it's placed after them.
  function place() {
    if (!docked || root.hidden) return;
    const rows = tileRows();
    const slot = barSlot(rowPref(), rows);
    const bottom = rows > 0 && slot >= rows;
    root.style.gridRow = bottom ? '' : String(slot + 1);
    root.dataset.at = slot === 0 ? 'top' : bottom ? 'bottom' : 'between';
  }

  // Dragging the grip shows a line at the nearest gap between rows; letting go puts the bar there.
  if (docked) {
    grip.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.focus();
      grip.setPointerCapture(e.pointerId);
      const rows = bands();
      const wrap = root.parentElement.getBoundingClientRect();
      const line = el('div', { class: 'sb-drop' });
      line.style.left = wrap.left + 'px';
      line.style.width = wrap.width + 'px';
      document.body.append(line);
      root.classList.add('moving');
      let slot = 0;
      let cancelled = false;
      const show = y => {
        slot = nearestSlot(y, rows);
        line.style.top = gapY(rows, slot) + 'px';
      };
      const move = ev => show(ev.clientY);
      const cancel = ev => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        ev.stopPropagation();
        cancelled = true;
        grip.releasePointerCapture(e.pointerId);
      };
      show(e.clientY);
      grip.addEventListener('pointermove', move);
      addEventListener('keydown', cancel, true);
      grip.addEventListener('lostpointercapture', () => {
        grip.removeEventListener('pointermove', move);
        removeEventListener('keydown', cancel, true);
        line.remove();
        root.classList.remove('moving');
        if (!cancelled) saveSlot(slot, rows.length);
      }, { once: true });
    });
  }

  function render() {
    const mode = activeMode(search());
    const off = !mode;
    note.hidden = !off;
    for (const n of [modeButton, input, shortcut]) n.hidden = off;
    hint.hidden = off || !several();
    if (grip) grip.hidden = off;
    root.classList.toggle('off', off);
    root.dataset.mode = mode ?? '';
    if (!off) {
      const m = ENGINES[mode];
      modeButton.replaceChildren(...[icon(mode, 18), several() ? icon('caret', 12) : null].filter(Boolean));
      modeButton.disabled = !several();
      modeButton.title = several() ? `${m.label} · click to pick another, or press Tab` : m.label;
      modeButton.setAttribute('aria-label', modeButton.title);
      input.placeholder = m.placeholder;
      input.setAttribute('aria-label', m.placeholder);
    }
    place();
  }

  // The number of tile rows changes with the tiles and the group on screen.
  const observer = docked ? new MutationObserver(place) : null;
  observer?.observe(grid, { childList: true });
  const unsubscribe = store.subscribe(render, ['prefs']);
  render();

  return {
    place,
    destroy() {
      removeEventListener('keydown', onKey);
      observer?.disconnect();
      unsubscribe();
    },
  };
}

// A bar on its own, as a widget copy.
export function mountSearch(root, store, copy, ctx) {
  const bar = el('div', { class: 'searchbar widget widget-search', role: 'search' });
  root.append(bar);
  return mountSearchBar(bar, store, { ctx });
}
