// The canvas: one frame per widget copy in the layout shown (the active tab's own, else the main
// one), placed on the 12 × 12 grid with grid-area. Copies are mounted when they appear and
// destroyed when they go, including when a tab switch shows another layout; a move or resize
// only changes the frame's place, so widgets keep their timers and feeds while Layout mode drags
// them. Frames are kept in reading order in the DOM, so Tab and the narrow-window stack follow it.

import { WIDGETS } from './registry.js';
import { stackOrder, activeLayout } from './layout.js';
import { el } from './ui.js';

export const gridArea = c => `${c.y + 1} / ${c.x + 1} / span ${c.h} / span ${c.w}`;

// ctx: { openPrefs(section, anchor) }, handed to every widget.
export function mountCanvas(root, store, ctx) {
  const mounted = new Map();   // id → { frame, handle }
  const listeners = new Set();

  function sync() {
    const { widgets } = activeLayout(store.get());
    const live = new Set(widgets.map(c => c.id));
    for (const [id, m] of mounted) {
      if (live.has(id)) continue;
      m.handle?.destroy?.();
      m.frame.remove();
      mounted.delete(id);
    }
    const order = stackOrder(widgets);
    for (const copy of widgets) {
      let m = mounted.get(copy.id);
      if (!m) {
        const inner = el('div', { class: 'widget-root' });
        const frame = el('section', {
          class: `widget-frame frame-${copy.type}`,
          dataset: { id: copy.id, type: copy.type },
          'aria-label': WIDGETS[copy.type].label,
        }, inner);
        root.append(frame);
        m = { frame, handle: WIDGETS[copy.type].mount(inner, store, { id: copy.id, type: copy.type }, ctx) };
        mounted.set(copy.id, m);
        for (const fn of listeners) fn(frame, copy);
      }
      m.frame.style.gridArea = gridArea(copy);
      m.frame.style.order = String(order.indexOf(copy.id));
    }
    // Only when the order changed: moving a frame in the DOM would blur anything focused in it.
    const current = [...root.querySelectorAll(':scope > .widget-frame')].map(f => f.dataset.id);
    if (current.join() !== order.join()) for (const id of order) root.append(mounted.get(id).frame);
  }

  store.subscribe(sync, ['prefs', 'activeGroupId']);
  sync();

  return {
    root,
    frames: () => new Map([...mounted].map(([id, m]) => [id, m.frame])),
    // fn(frame, copy) is called for every frame mounted from now on.
    onFrame: fn => listeners.add(fn),
  };
}
