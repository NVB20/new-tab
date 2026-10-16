// Search bar among the tiles: a Google search, or a message that runs in a new chat on Claude,
// ChatGPT or Gemini. prefs.search turns each engine on or off; the icon opens a menu of the ones
// that are on and Tab steps through them. The grip at the right moves the bar between tile rows.

import { el, icon, showMenu } from './ui.js';
import { openUrl, askChat } from './chrome-api.js';
import { enginesOn, activeMode, nextMode, googleUrl, rowBands, gapY, nearestSlot, barSlot, slotToRow } from './ask.js';

// Each engine's icon has the engine's id as its name.
const ENGINES = {
  google: { label: 'Google', placeholder: 'Search Google' },
  claude: { label: 'Claude', placeholder: 'Ask Claude' },
  chatgpt: { label: 'ChatGPT', placeholder: 'Ask ChatGPT' },
  gemini: { label: 'Gemini', placeholder: 'Ask Gemini' },
};

// root and grid share one CSS grid (.grid-wrap; #grid is display: contents), so the bar can take a
// row of its own between the tiles.
export function mountSearchBar(root, grid, store) {
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
  const grip = el('button', {
    type: 'button', class: 'sb-grip',
    title: 'Drag to move between rows of tiles (or focus and press ↑ ↓)',
    'aria-label': 'Move the search bar',
    onkeydown: e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const rows = tileRows();
      const slot = barSlot(search().row, rows) + (e.key === 'ArrowUp' ? -1 : 1);
      if (slot >= 0 && slot <= rows) saveSlot(slot, rows);
    },
  }, icon('grip', 16));
  root.append(modeButton, input, shortcut, hint, grip);

  // Ctrl+Space from anywhere on the page (not over a dialog) puts the cursor in the bar.
  addEventListener('keydown', e => {
    if (e.code !== 'Space' || !e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    if (root.hidden || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  function send(ctrl) {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const newTab = ctrl || store.get().prefs.openInNewTab;
    const mode = activeMode(search());
    if (mode === 'google') openUrl(googleUrl(text), { newTab });
    else askChat(mode, text, { newTab });
  }

  // ---- where the bar sits ----

  const bands = () => rowBands([...grid.children].map(n => n.getBoundingClientRect()));
  const tileRows = () => bands().length;
  const saveSlot = (slot, rows) => store.update(s => { s.prefs.search.row = slotToRow(slot, rows); });

  // The bar takes grid row slot + 1 and the tiles flow around it; at the bottom it's placed after them.
  function place() {
    if (root.hidden) return;
    const rows = tileRows();
    const slot = barSlot(search().row, rows);
    const bottom = rows > 0 && slot >= rows;
    root.style.gridRow = bottom ? '' : String(slot + 1);
    root.dataset.at = slot === 0 ? 'top' : bottom ? 'bottom' : 'between';
  }

  // Dragging the grip shows a line at the nearest gap between rows; letting go puts the bar there.
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

  function render() {
    const mode = activeMode(search());
    root.hidden = !mode;
    if (!mode) return;
    const m = ENGINES[mode];
    root.dataset.mode = mode;
    modeButton.replaceChildren(...[icon(mode, 18), several() ? icon('caret', 12) : null].filter(Boolean));
    modeButton.disabled = !several();
    modeButton.title = several() ? `${m.label} · click to pick another, or press Tab` : m.label;
    modeButton.setAttribute('aria-label', modeButton.title);
    hint.hidden = !several();
    input.placeholder = m.placeholder;
    input.setAttribute('aria-label', m.placeholder);
    place();
  }

  // The number of tile rows changes with the tiles and the group on screen.
  new MutationObserver(place).observe(grid, { childList: true });
  store.subscribe(render, ['prefs']);
  render();
}
