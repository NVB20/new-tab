// The search bar, a widget of its own: a Google search, or a message that runs in a new chat on
// Claude, ChatGPT or Gemini. prefs.search turns each engine on or off; the icon opens a menu of
// the ones that are on and Tab steps through them. Ctrl+Space puts the cursor in it from anywhere.

import { el, icon, showMenu } from './ui.js';
import { openUrl, askChat } from './chrome-api.js';
import { enginesOn, activeMode, nextMode, googleUrl } from './ask.js';

// Each engine's icon has the engine's id as its name.
const ENGINES = {
  google: { label: 'Google', placeholder: 'Search Google' },
  claude: { label: 'Claude', placeholder: 'Ask Claude' },
  chatgpt: { label: 'ChatGPT', placeholder: 'Ask ChatGPT' },
  gemini: { label: 'Gemini', placeholder: 'Ask Gemini' },
};

// ctx.openPrefs(section) opens Preferences, where the engines are chosen.
export function mountSearch(root, store, copy, ctx) {
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
    el('button', { type: 'button', class: 'link-btn', text: 'Preferences', onclick: () => ctx?.openPrefs('search') }));
  const bar = el('div', { class: 'searchbar widget widget-search', role: 'search' }, modeButton, input, note, shortcut, hint);
  root.append(bar);

  // Ctrl+Space from anywhere on the page (not over a dialog) puts the cursor in the bar.
  const onKey = e => {
    if (e.code !== 'Space' || !e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    if (input.hidden || document.querySelector('dialog[open]')) return;
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

  function render() {
    const mode = activeMode(search());
    const off = !mode;
    note.hidden = !off;
    for (const n of [modeButton, input, shortcut]) n.hidden = off;
    hint.hidden = off || !several();
    bar.classList.toggle('off', off);
    bar.dataset.mode = mode ?? '';
    if (off) return;
    const m = ENGINES[mode];
    modeButton.replaceChildren(...[icon(mode, 18), several() ? icon('caret', 12) : null].filter(Boolean));
    modeButton.disabled = !several();
    modeButton.title = several() ? `${m.label} · click to pick another, or press Tab` : m.label;
    modeButton.setAttribute('aria-label', modeButton.title);
    input.placeholder = m.placeholder;
    input.setAttribute('aria-label', m.placeholder);
  }

  const unsubscribe = store.subscribe(render, ['prefs']);
  render();

  return {
    destroy() {
      removeEventListener('keydown', onKey);
      unsubscribe();
    },
  };
}
