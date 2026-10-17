// The switcher along the bottom of a stack: one dot per widget, the long one the widget showing.
// Pointing at the stack, focusing something in it or touching it turns the dots into the widgets'
// icons (always icons in Layout mode). A click, the wheel over the row, a sideways swipe over the
// stack (trackpad or finger) or ←/→ on a focused button brings another widget to the front. The
// stack's `front` is saved with the layout, so a new tab opens on the same widget.

import { el, icon } from './ui.js';
import { TYPES, copyTitle, activeLayout, setFront } from './layout.js';

const GESTURE_GAP_MS = 250;   // a wheel or trackpad gesture fires many events: one switch each
const SWIPE_PX = 50;
const REVEAL_MS = 4000;       // after a touch, the icons stay this long

// Whether something from `node` up to `stop` scrolls sideways (a sideways swipe there is its own).
function scrollsSideways(node, stop) {
  for (let n = node; n && n !== stop; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
}

// Returns { el, render(stack), destroy() }; the canvas calls render whenever the layout changes.
export function mountStackBar(frame, store, stackId) {
  const bar = el('div', { class: 'stack-bar', role: 'group', 'aria-label': 'Widgets in this stack' });
  frame.append(bar);
  let stack = null;
  let drawn = '';   // the copies and titles the buttons were drawn for

  const show = (id, focus = false) => {
    store.update(s => { setFront(activeLayout(s), stackId, id); }, ['prefs']);
    if (focus) [...bar.children].find(b => b.dataset.id === id)?.focus();
  };
  const step = (d, focus = false) => {
    const i = stack.items.findIndex(it => it.id === stack.front);
    show(stack.items[(i + d + stack.items.length) % stack.items.length].id, focus);
  };

  function render(next) {
    stack = next;
    const { groups } = store.get();
    const key = stack.items.map(it => `${it.id}:${copyTitle(it, groups)}`).join('|');
    if (key !== drawn) {
      drawn = key;
      bar.replaceChildren(...stack.items.map(it => {
        const title = copyTitle(it, groups);
        return el('button', { type: 'button', class: 'stack-btn', dataset: { id: it.id }, title, 'aria-label': `Show ${title}`, onclick: () => show(it.id) },
          icon(TYPES[it.type].icon, 15));
      }));
    }
    for (const b of bar.children) b.setAttribute('aria-current', String(b.dataset.id === stack.front));
  }

  bar.addEventListener('keydown', e => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    step(d, true);
  });

  // The first event of a gesture switches; the rest of it (until a pause) doesn't.
  let lastWheel = 0;
  const gesture = d => {
    const now = performance.now();
    const fresh = now - lastWheel > GESTURE_GAP_MS;
    lastWheel = now;
    if (fresh && d) step(d);
  };
  bar.addEventListener('wheel', e => {
    e.preventDefault();
    gesture(Math.sign(e.deltaY || e.deltaX));
  }, { passive: false });
  // Passive, so it never holds up scrolling the lists inside.
  const onWheel = e => {
    if (bar.contains(e.target) || Math.abs(e.deltaX) < 4 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    if (scrollsSideways(e.target, frame)) return;
    gesture(Math.sign(e.deltaX));
  };
  frame.addEventListener('wheel', onWheel, { passive: true });

  // Touch: the icons show for a while, and a sideways swipe switches (the stack scrolls up and
  // down itself: touch-action pan-y).
  let touch = null;
  let revealTimer = 0;
  const onDown = e => {
    if (e.pointerType === 'mouse' || document.body.classList.contains('layout-editing')) return;
    frame.classList.add('reveal');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => frame.classList.remove('reveal'), REVEAL_MS);
    touch = bar.contains(e.target) ? null : { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onUp = e => {
    if (!touch || e.pointerId !== touch.id) return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
  };
  const onCancel = () => { touch = null; };
  frame.addEventListener('pointerdown', onDown);
  frame.addEventListener('pointerup', onUp);
  frame.addEventListener('pointercancel', onCancel);

  return {
    el: bar,
    render,
    destroy() {
      clearTimeout(revealTimer);
      frame.removeEventListener('wheel', onWheel);
      frame.removeEventListener('pointerdown', onDown);
      frame.removeEventListener('pointerup', onUp);
      frame.removeEventListener('pointercancel', onCancel);
      bar.remove();
    },
  };
}
