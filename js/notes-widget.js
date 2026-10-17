// Notes: a pad saved as you type. Claude: a box that sends a message to a new chat on claude.ai.

import { el, icon, widgetHead } from './ui.js';
import { askChat } from './chrome-api.js';

export function mountNotes(root, store) {
  const notesArea = el('textarea', {
    class: 'notes-input',
    placeholder: 'Write something…',
    dir: 'auto',
    'aria-label': 'Notes',
    oninput: () => {
      const value = notesArea.value;
      store.update(s => { s.notes = value; }, ['notes']);
    },
  });
  root.append(el('section', { class: 'widget widget-notes' }, widgetHead('note', 'Notes'), notesArea));

  // Don't overwrite the textarea while typing in it (it would move the cursor).
  const render = state => {
    if (document.activeElement !== notesArea) notesArea.value = state.notes;
  };
  const unsubscribe = store.subscribe(render, ['notes']);
  render(store.get());
  return { destroy: unsubscribe };
}

// Enter sends to a new chat on claude.ai, Shift+Enter starts a new line, Ctrl+Enter sends in a
// new tab.
export function mountClaude(root, store) {
  const input = el('textarea', {
    class: 'notes-input claude-input',
    placeholder: 'Ask Claude…',
    dir: 'auto',
    rows: 1,
    'aria-label': 'Message for Claude',
    onkeydown: e => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      send(e.ctrlKey || e.metaKey);
    },
  });
  const sendButton = el('button', {
    type: 'button',
    class: 'icon-btn claude-send',
    title: 'Send to Claude (Enter)',
    'aria-label': 'Send to Claude',
    onclick: e => send(e.ctrlKey || e.metaKey),
  }, icon('arrow-up', 16));
  root.append(el('section', { class: 'widget widget-claude' },
    widgetHead('claude', 'Claude'),
    el('div', { class: 'claude-box' }, input, sendButton)));

  function send(ctrl) {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    askChat('claude', text, { newTab: ctrl || store.get().prefs.openInNewTab });
  }

  return { destroy() {} };
}
