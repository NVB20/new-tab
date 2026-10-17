// The Layout mode tray's preview: hovering or focusing a chip opens a card above it with what the
// widget is, what it does, and the real widget as a click would add it, drawn at its true size and
// shrunk to fit. Widgets draw nothing without their copy in a layout, so the preview's widget gets
// a store that shows it its own copy. It's destroyed when the card closes.

import { el, icon } from './ui.js';
import { WIDGETS } from './registry.js';
import { TYPES, COLS, ROWS, activeLayout, countOf, plannedCopy, isStack } from './layout.js';
import { ABOUT } from './widget-about.js';

const PREVIEW_ID = 'preview';
const BOX_W = 400;   // px: the widget is shrunk to fit this box, never enlarged
const BOX_H = 240;
const PAD = 14;      // px: the card's side padding
const MIN_W = 300;   // px: the card's narrowest
const EDGE = 12;     // px kept between the card and the window's edges
const LIFT = 10;     // px between the card and the tray's top edge
const ARROW = 16;    // px: the arrow stays this far inside the card's corners

// The real store, except that what the widget reads has `copy` in a layout of its own, where
// copyById finds it. A fresh shallow copy on every read, as the store changes its state in place.
// Writes go to the real store, where no layout has the copy.
function storeWithCopy(store, copy) {
  const view = s => ({ ...s, prefs: { ...s.prefs, layouts: { ...s.prefs.layouts, [PREVIEW_ID]: { cols: COLS, rows: ROWS, widgets: [copy] } } } });
  return {
    get: () => view(store.get()),
    subscribe: (fn, keys) => store.subscribe((s, changed) => fn(view(s), changed), keys),
    update: (fn, keys) => store.update(fn, keys),
  };
}

const sizeLabel = (copy, t, n) => `${copy.w} × ${copy.h} · ${t.max === 1 ? (n ? 'On the page' : 'Not on the page') : `${n} of ${t.max}`}`;

// Why the chip can't add right now, what makes room for it, or '' when it just fits.
function whyNot(t, n, plan, layout) {
  if (plan?.shrink) {
    const giver = layout.widgets.find(c => c.id === plan.shrink.id);
    const name = isStack(giver) ? 'The stack' : TYPES[giver.type].label;
    return `To make room, ${name} gets ${plan.shrink.h < giver.h ? 'shorter' : 'narrower'}`;
  }
  if (plan) return '';
  if (n >= t.max) return t.max === 1 ? `Only one ${t.label}, and it’s on the page` : `Up to ${t.max} ${t.label} widgets, all on the page`;
  return 'No room: shrink or remove a widget first';
}

// ctx: the canvas's, handed to the widget with preview: true. pitch(): the canvas's cell pitch
// and gaps in px, { x, y, gx, gy }.
export function createPreview(store, ctx, { pitch }) {
  const head = el('div', { class: 'wp-head' });
  const tagline = el('p', { class: 'wp-tagline' });
  const about = el('p', { class: 'wp-about' });
  const box = el('div', { class: 'wp-box' });
  const foot = el('p', { class: 'wp-foot' });
  const card = el('div', { class: 'widget-preview', id: 'widget-preview', role: 'tooltip' }, head, tagline, about, box, foot);
  let shown = null;   // { type, key, handle }

  function unmount() {
    try {
      shown?.handle?.destroy?.();
    } catch (err) {
      console.error(err);
    }
    box.replaceChildren();
  }

  // The widget for `copy`, laid out w × h px and drawn scaled by k. A widget that throws leaves
  // the box empty.
  function mount(copy, w, h, k) {
    const root = el('div', { class: 'widget-root' });
    const frame = el('section', { class: `widget-frame frame-${copy.type} preview-frame`, dataset: { type: copy.type }, inert: true }, root);
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${k})`;
    box.replaceChildren(frame);
    try {
      return WIDGETS[copy.type].mount(root, storeWithCopy(store, copy), { id: PREVIEW_ID, type: copy.type }, { ...ctx, preview: true });
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  function place(chip) {
    const r = chip.getBoundingClientRect();
    const top = chip.closest('.layout-tray')?.getBoundingClientRect().top ?? r.top;
    const w = card.offsetWidth;
    const centre = r.left + r.width / 2;
    const left = Math.min(Math.max(centre - w / 2, EDGE), innerWidth - EDGE - w);
    card.style.left = `${Math.round(left)}px`;
    card.style.bottom = `${Math.round(innerHeight - top + LIFT)}px`;
    card.style.setProperty('--arrow-x', `${Math.round(Math.min(Math.max(centre - left, ARROW), w - ARROW))}px`);
  }

  // Opens, or refreshes, the card for `type` above `chip`. Returns the copy a click would add, or
  // null when the chip can't add.
  function show(chip, type) {
    const t = TYPES[type];
    if (!t) return null;
    const s = store.get();
    const layout = activeLayout(s);
    const n = countOf(layout, type);
    const plan = plannedCopy(layout, type, s.groups, s.activeGroupId);
    const { shrink, ...planned } = plan ?? {};
    const copy = { id: PREVIEW_ID, ...(plan ? planned : { type, x: 0, y: 0, w: t.size[0], h: t.size[1], settings: t.defaults() }) };
    const p = pitch();
    const w = Math.round(copy.w * p.x - p.gx);
    const h = Math.round(copy.h * p.y - p.gy);
    const k = Math.min(1, BOX_W / w, BOX_H / h);

    head.replaceChildren(icon(t.icon, 16), el('b', { text: t.label }), el('span', { class: 'wp-size', text: sizeLabel(copy, t, n) }));
    tagline.textContent = ABOUT[type].tagline;
    about.textContent = ABOUT[type].about;
    foot.textContent = whyNot(t, n, plan, layout);
    foot.hidden = !foot.textContent;
    box.style.width = `${Math.round(w * k)}px`;
    box.style.height = `${Math.round(h * k)}px`;
    card.style.width = `${Math.max(MIN_W, Math.round(w * k) + 2 * PAD)}px`;
    if (!card.isConnected) document.body.append(card);

    // The same widget at the same size stays mounted: a widget that writes to the store as it
    // mounts redraws the tray, which shows the card again.
    const key = JSON.stringify([copy, w, h]);
    if (shown?.key !== key) {
      unmount();
      shown = { type, key, handle: null };
      shown.handle = mount(copy, w, h, k);
    }
    // A redraw while mounting replaces the chips; place the card on the new one.
    place(chip.isConnected ? chip : document.querySelector(`.tray-chip[data-type="${type}"]`) ?? chip);
    return plan;
  }

  function hide() {
    if (!shown) return;
    unmount();
    shown = null;
    card.remove();
  }

  return {
    show,
    hide,
    // The type shown, or null.
    get type() {
      return shown?.type ?? null;
    },
  };
}
