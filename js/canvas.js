// The canvas: one frame per entry in the layout shown (the active tab's own, else the main one),
// placed on the 12 × 12 grid with grid-area. An entry is a widget copy, or a stack of 2–3 copies:
// every copy in a stack is mounted, in the same cell, and only the one in front shows (the others
// keep running and keep their size, hidden and inert); stack-bar.js switches between them.
// Copies are mounted when they appear and destroyed when they go, including when a tab switch shows
// another layout or a copy joins or leaves a stack; a move or resize only changes the frame's
// place, so widgets keep their timers and feeds while Layout mode drags them. Frames are kept in
// reading order in the DOM, so Tab and the narrow-window stack follow it.

import { WIDGETS } from './registry.js';
import { COLS, stackOrder, activeLayout, isStack, copyTitle } from './layout.js';
import { mountStackBar } from './stack-bar.js';
import { el } from './ui.js';

export const gridArea = c => `${c.y + 1} / ${c.x + 1} / span ${c.h} / span ${c.w}`;

// ctx: { openPrefs(section, anchor) }, handed to every widget.
export function mountCanvas(root, store, ctx) {
  const mounted = new Map();   // entry id → { frame, kids: Map(copy id → { inner, handle }), bar }
  const listeners = new Set();

  function mountKid(m, copy) {
    const inner = el('div', { class: 'widget-root', dataset: { copy: copy.id } });
    m.frame.insertBefore(inner, m.bar?.el ?? null);
    m.kids.set(copy.id, { inner, handle: WIDGETS[copy.type].mount(inner, store, { id: copy.id, type: copy.type }, ctx) });
  }

  function unmountKid(m, id) {
    const kid = m.kids.get(id);
    kid.handle?.destroy?.();
    kid.inner.remove();
    m.kids.delete(id);
  }

  function sync() {
    const state = store.get();
    const { widgets } = activeLayout(state);
    const live = new Set(widgets.map(c => c.id));
    for (const [id, m] of mounted) {
      if (live.has(id)) continue;
      for (const kid of [...m.kids.keys()]) unmountKid(m, kid);
      m.bar?.destroy();
      m.frame.remove();
      mounted.delete(id);
    }
    const order = stackOrder(widgets);
    for (const entry of widgets) {
      const stack = isStack(entry);
      let m = mounted.get(entry.id);
      const fresh = !m;
      if (fresh) {
        const frame = el('section', {
          class: `widget-frame frame-${entry.type}`,
          dataset: { id: entry.id, type: entry.type },
          'aria-label': stack ? copyTitle(entry, state.groups) : WIDGETS[entry.type].label,
        });
        root.append(frame);
        m = { frame, kids: new Map(), bar: stack ? mountStackBar(frame, store, entry.id) : null };
        mounted.set(entry.id, m);
      }
      const copies = stack ? entry.items : [entry];
      for (const id of [...m.kids.keys()]) if (!copies.some(c => c.id === id)) unmountKid(m, id);
      for (const copy of copies) if (!m.kids.has(copy.id)) mountKid(m, copy);
      if (stack) {
        m.bar.render(entry);
        if (!fresh) m.frame.setAttribute('aria-label', copyTitle(entry, state.groups));
        for (const [id, kid] of m.kids) {
          const front = id === entry.front;
          kid.inner.classList.toggle('front', front);
          kid.inner.inert = !front;
        }
      }
      if (fresh) for (const fn of listeners) fn(m.frame, entry);
      m.frame.style.gridArea = gridArea(entry);
      // A frame on the left half of the page has its scrollbar on its left edge.
      m.frame.classList.toggle('scroll-left', 2 * entry.x + entry.w < COLS);
      m.frame.style.order = String(order.indexOf(entry.id));
    }
    // Only when the order changed: moving a frame in the DOM would blur anything focused in it.
    const current = [...root.querySelectorAll(':scope > .widget-frame')].map(f => f.dataset.id);
    if (current.join() !== order.join()) for (const id of order) root.append(mounted.get(id).frame);
  }

  // groups: a stack's switcher names a tiles block by its group.
  store.subscribe(sync, ['prefs', 'activeGroupId', 'groups']);
  sync();

  return {
    root,
    frames: () => new Map([...mounted].map(([id, m]) => [id, m.frame])),
    // fn(frame, entry) is called for every frame mounted from now on.
    onFrame: fn => listeners.add(fn),
  };
}
