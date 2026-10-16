// Search bar above the tiles: a Google search, or a message that runs in a new Claude chat.
// prefs.search turns each mode on or off; with both on, the mode button or Tab switches.

import { el, icon } from './ui.js';
import { openUrl, askClaude } from './chrome-api.js';
import { activeMode, nextMode, googleUrl } from './ask.js';

const MODES = {
  google: { icon: 'google', label: 'Google', placeholder: 'Search Google' },
  claude: { icon: 'claude', label: 'Claude', placeholder: 'Ask Claude' },
};

export function mountSearchBar(root, store) {
  const search = () => store.get().prefs.search;
  const both = () => search().google && search().claude;
  const switchMode = () => store.update(s => { s.prefs.search.mode = nextMode(s.prefs.search); });

  const modeButton = el('button', { type: 'button', class: 'sb-mode', onclick: () => { switchMode(); input.focus(); } });
  const input = el('input', {
    type: 'text', class: 'sb-input', autocomplete: 'off', dir: 'auto', enterkeyhint: 'go',
    onkeydown: e => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && both()) {
        e.preventDefault();
        switchMode();
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        send(e.ctrlKey || e.metaKey);
      }
    },
  });
  const hint = el('kbd', { class: 'sb-hint', text: 'Tab', title: 'Tab switches between Google and Claude' });
  root.append(modeButton, input, hint);

  function send(ctrl) {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const newTab = ctrl || store.get().prefs.openInNewTab;
    if (activeMode(search()) === 'claude') askClaude(text, { newTab });
    else openUrl(googleUrl(text), { newTab });
  }

  function render() {
    const mode = activeMode(search());
    root.hidden = !mode;
    if (!mode) return;
    const m = MODES[mode];
    const other = MODES[nextMode(search())];
    root.dataset.mode = mode;
    modeButton.replaceChildren(icon(m.icon, 18));
    modeButton.disabled = !both();
    modeButton.title = both() ? `${m.label} · click or press Tab for ${other.label}` : m.label;
    modeButton.setAttribute('aria-label', modeButton.title);
    hint.hidden = !both();
    input.placeholder = m.placeholder;
    input.setAttribute('aria-label', m.placeholder);
  }

  store.subscribe(render, ['prefs']);
  render();
}
