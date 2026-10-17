// Layout mode: drag, resize, add, duplicate and remove the widget copies on the canvas. Every
// change goes through the store with layout.js's helpers, and nothing is written while the
// pointer is down. Loaded on first use.

import { el, icon, confirmDialog, alertDialog } from './ui.js';
import {
  TYPES, COLS, ROWS, copyById, copyTitle, countOf, fits, firstFree, addCopy, duplicateCopy, removeCopy, moveCopy, resetLayout, prefsSection,
  swapPlan, swapCopy, activeLayout, ownLayout, plannedCopy,
} from './layout.js';
import { gridArea } from './canvas.js';
import { createPreview } from './widget-preview.js';

const MIN_WIDTH = 900;   // px; under this the page stacks and there is nothing to lay out
const DIRS = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
const OPEN_MS = 300;    // hover before a chip's preview opens
const CLOSE_MS = 150;   // after leaving the chips before it closes, so cutting across doesn't flicker

// The canvas's cell pitch (a cell plus a gap) and gaps in px, from its size, padding and gaps.
function cellPitch(root) {
  const cs = getComputedStyle(root);
  const r = root.getBoundingClientRect();
  const gx = parseFloat(cs.columnGap);
  const gy = parseFloat(cs.rowGap);
  return {
    x: (r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + gx) / COLS,
    y: (r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) + gy) / ROWS,
    gx,
    gy,
  };
}

export function setupEditMode(store, canvas, ctx) {
  const root = canvas.root;
  const button = document.getElementById('btn-layout');
  let active = false;
  let snapshot = null;   // { scope, layout } on entering, for Cancel
  const layout = () => activeLayout(store.get());
  // Which layout is shown: the active tab's id when it has its own, else 'main'.
  const scopeOf = s => (ownLayout(s, s.activeGroupId) ? s.activeGroupId : 'main');

  // The cell outlines, the outline of where a drag or resize will land, and during a swap the
  // dashed outline of where the other widget goes.
  const overlay = el('div', { class: 'canvas-cells', 'aria-hidden': 'true' },
    Array.from({ length: COLS * ROWS }, () => el('div', { class: 'canvas-cell' })));
  const ghost = el('div', { class: 'canvas-ghost', 'aria-hidden': 'true', hidden: true });
  const other = el('div', { class: 'canvas-ghost other', 'aria-hidden': 'true', hidden: true });
  const chips = el('div', { class: 'tray-chips' });
  const full = el('span', { class: 'tray-note', hidden: true, text: 'Page full: shrink or remove a widget to add one.' });
  const scope = el('span', { class: 'tray-scope', hidden: true });
  const tray = el('div', { class: 'layout-tray', role: 'toolbar', 'aria-label': 'Layout mode' },
    scope,
    el('span', { class: 'tray-label', text: 'Add' }),
    chips,
    full,
    el('div', { class: 'tray-right' },
      el('button', { type: 'button', class: 'btn', text: 'Reset layout', title: 'Back to the default places', onclick: reset }),
      el('button', { type: 'button', class: 'btn', text: 'Cancel', title: 'Undo everything since you entered Layout mode', onclick: () => exit({ restore: true }) }),
      el('button', { type: 'button', class: 'btn btn-primary', text: 'Done', title: 'Keep this layout (Esc)', onclick: () => exit() })));
  const preview = createPreview(store, ctx, { pitch: () => cellPitch(root) });

  // ---- frames: a label, a toolbar and eight handles while editing ----

  function decorate(frame) {
    if (frame.querySelector(':scope > .frame-tools')) return;
    const id = frame.dataset.id;
    // Settings: the copy's group (under Layout, or GitHub for a GitHub copy), or the section every
    // copy shares; none for a type with nothing to set. A section without the copy's group just
    // opens at the top.
    const section = prefsSection(copyById(store.get(), id)?.type);
    frame.tabIndex = 0;
    frame.append(
      el('div', { class: 'frame-label' }),
      el('div', { class: 'frame-tools' },
        section && el('button', { type: 'button', class: 'icon-btn', title: 'Settings', 'aria-label': 'Settings', onclick: () => ctx.openPrefs(section, id) }, icon('settings', 15)),
        el('button', { type: 'button', class: 'icon-btn frame-dup', 'aria-label': 'Duplicate', onclick: () => duplicate(id) }, icon('copy', 15)),
        el('button', { type: 'button', class: 'icon-btn frame-remove', title: 'Remove (Delete)', 'aria-label': 'Remove', onclick: () => remove(id) }, icon('x', 15))),
      ...DIRS.map(dir => el('div', { class: `frame-handle ${dir}`, dataset: { dir }, 'aria-hidden': 'true' })));
    refreshFrame(frame);
  }

  function strip(frame) {
    frame.tabIndex = -1;
    frame.removeAttribute('tabindex');
    for (const n of frame.querySelectorAll(':scope > .frame-label, :scope > .frame-tools, :scope > .frame-handle')) n.remove();
  }

  const limitTitle = t => (t.max === 1 ? `Only one ${t.label}` : `Up to ${t.max} ${t.label} widgets`);

  function refreshFrame(frame) {
    const state = store.get();
    const copy = copyById(state, frame.dataset.id);
    if (!copy) return;
    const title = copyTitle(copy, state.groups);
    const label = frame.querySelector(':scope > .frame-label');
    if (label) label.textContent = title;
    const t = TYPES[copy.type];
    const dup = frame.querySelector('.frame-dup');
    if (dup) {
      const full = countOf(activeLayout(state), copy.type) >= t.max;
      dup.disabled = full;
      dup.title = full ? limitTitle(t) : 'Duplicate (D)';
    }
    frame.setAttribute('aria-label', `${title}, ${copy.w} by ${copy.h} cells at column ${copy.x + 1}, row ${copy.y + 1}`);
  }

  function refresh() {
    for (const frame of canvas.frames().values()) refreshFrame(frame);
    renderTray();
  }

  // ---- the tray: one chip per type ----

  function renderTray() {
    const l = layout();
    // A tab with its own layout is named, so it's clear the main page isn't the one changing.
    const s = store.get();
    const own = scopeOf(s) !== 'main' && s.groups.find(g => g.id === s.activeGroupId);
    scope.hidden = !own;
    scope.textContent = own ? `${own.title}’s own layout` : '';
    let roomless = 0;
    chips.replaceChildren(...Object.entries(TYPES).map(([type, t]) => {
      const n = countOf(l, type);
      const room = firstFree(l, ...t.size) ?? firstFree(l, ...t.min);
      const chip = el('button', { type: 'button', class: 'tray-chip', dataset: { type }, 'aria-describedby': 'widget-preview', onclick: e => add(type, e.detail > 0) },
        icon('plus', 13), el('span', { text: t.label }), el('b', { text: t.max === 1 ? (n ? 'on' : 'off') : `${n}/${t.max}` }));
      // Greyed out, but still hoverable and focusable so its preview can say why.
      chip.setAttribute('aria-disabled', String(n >= t.max || !room));
      if (n < t.max && !room) roomless++;
      return chip;
    }));
    // Said in words on the tray too: a new page fills every cell, so nothing can be added yet.
    full.hidden = !roomless || [...chips.children].some(c => c.getAttribute('aria-disabled') !== 'true');
    document.body.style.setProperty('--tray-h', `${tray.offsetHeight || 64}px`);
    // A redraw while the card is open: it follows its type to the new chip.
    const open = preview.type && chips.querySelector(`.tray-chip[data-type="${preview.type}"]`);
    if (open) showPreview(open);
  }

  // ---- changes ----

  const focusFrame = id => canvas.frames().get(id)?.focus({ preventScroll: true });
  const noRoom = () => alertDialog('No room for another widget. Shrink or remove one first.', 'No room');

  // byPointer: clicked rather than pressed with Enter or Space (a keyboard click has detail 0).
  function add(type, byPointer = false) {
    const s = store.get();
    if (!plannedCopy(activeLayout(s), type, s.groups, s.activeGroupId)) return;   // a greyed-out chip
    if (byPointer) quiet = type;
    hidePreview();
    let copy = null;
    store.update(st => { copy = addCopy(activeLayout(st), type, undefined, st.groups, st.activeGroupId); });
    if (copy) focusFrame(copy.id);
  }

  function duplicate(id) {
    const own = copyById(store.get(), id);
    if (!own || countOf(layout(), own.type) >= TYPES[own.type].max) return;
    let copy = null;
    store.update(s => { copy = duplicateCopy(activeLayout(s), id, s.groups, s.activeGroupId); });
    if (copy) focusFrame(copy.id);
    else noRoom();
  }

  function remove(id) {
    store.update(s => { removeCopy(activeLayout(s), id); });
    canvas.frames().values().next().value?.focus({ preventScroll: true });
  }

  async function reset() {
    const s = store.get();
    const names = resetLayout(structuredClone(activeLayout(s))).map(c => copyTitle(c, s.groups)).join(', ');
    const ok = await confirmDialog(
      names ? `Put every widget back in its default place? ${names} will be removed.` : 'Put every widget back in its default place?',
      { title: 'Reset layout', confirmLabel: 'Reset' },
    );
    if (ok) store.update(st => { resetLayout(activeLayout(st)); });
  }

  // ---- the preview: hovering or focusing a chip shows its widget and where it would go ----
  // Delegated on the chips' container, which keeps its listeners when renderTray replaces the
  // chips. The card opens after a short hover, switches at once between chips while open, and
  // closes a moment after the pointer leaves them.

  let openTimer = 0;
  let closeTimer = 0;
  // The type of a chip just clicked: it stays closed until the pointer leaves it. The redraw
  // after the add puts a new chip under the pointer, which gets a pointerover of its own.
  let quiet = null;

  function showPreview(chip) {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    const plan = preview.show(chip, chip.dataset.type);
    ghost.classList.remove('bad');
    ghost.hidden = !plan;
    if (plan) ghost.style.gridArea = gridArea(plan);
  }

  function hidePreview() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    if (preview.type === null) return;
    preview.hide();
    ghost.hidden = true;
  }

  chips.addEventListener('pointerover', e => {
    const chip = e.target.closest('.tray-chip');
    if (!chip || chip.dataset.type === quiet) return;
    clearTimeout(closeTimer);
    if (preview.type === chip.dataset.type) return;
    clearTimeout(openTimer);
    if (preview.type !== null) showPreview(chip);
    else openTimer = setTimeout(() => showPreview(chip), OPEN_MS);
  });
  chips.addEventListener('pointerout', e => {
    const chip = e.target.closest('.tray-chip');
    if (!chip || chip.contains(e.relatedTarget)) return;
    quiet = null;
    clearTimeout(openTimer);
    closeTimer = setTimeout(hidePreview, CLOSE_MS);
  });
  // Keyboard focus only: the focus a click leaves on a chip doesn't open it.
  chips.addEventListener('focusin', e => {
    const chip = e.target.closest('.tray-chip');
    if (chip?.matches(':focus-visible')) showPreview(chip);
  });
  chips.addEventListener('focusout', hidePreview);

  // ---- drag and resize ----
  // The frame follows the pointer (a move) or shows its new size (a resize) while the ghost shows
  // the cells it will snap to, red when they are taken or off the canvas. Letting go there puts
  // the frame back. A move onto one other widget that can trade places swaps the two (swapPlan):
  // the ghost shows where this one lands and a dashed one where the other goes.

  root.addEventListener('pointerdown', e => {
    if (!active || e.button !== 0) return;
    hidePreview();   // before the drag takes the ghost over
    const frame = e.target.closest('.widget-frame');
    if (!frame || e.target.closest('.frame-tools')) return;
    const copy = copyById(store.get(), frame.dataset.id);
    if (!copy) return;
    e.preventDefault();
    frame.focus({ preventScroll: true });
    const dir = e.target.closest('.frame-handle')?.dataset.dir ?? 'move';
    const min = TYPES[copy.type].min;
    const { x: pitchX, y: pitchY } = cellPitch(root);
    const start = { px: e.clientX, py: e.clientY, x: copy.x, y: copy.y, w: copy.w, h: copy.h };
    let target = { x: copy.x, y: copy.y, w: copy.w, h: copy.h };
    let valid = true;
    let plan = null;
    frame.setPointerCapture(e.pointerId);
    frame.classList.add('lifted');
    ghost.hidden = false;
    ghost.classList.remove('bad');
    ghost.style.gridArea = gridArea(target);

    const move = ev => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      const dc = Math.round(dx / pitchX);
      const dr = Math.round(dy / pitchY);
      if (dir === 'move') {
        target = { x: start.x + dc, y: start.y + dr, w: start.w, h: start.h };
        frame.style.transform = `translate(${dx}px, ${dy}px)`;
      } else {
        let { x, y, w, h } = start;
        if (dir.includes('e')) w = Math.min(Math.max(start.w + dc, min[0]), COLS - start.x);
        if (dir.includes('s')) h = Math.min(Math.max(start.h + dr, min[1]), ROWS - start.y);
        if (dir.includes('w')) {
          x = Math.min(Math.max(start.x + dc, 0), start.x + start.w - min[0]);
          w = start.x + start.w - x;
        }
        if (dir.includes('n')) {
          y = Math.min(Math.max(start.y + dr, 0), start.y + start.h - min[1]);
          h = start.y + start.h - y;
        }
        target = { x, y, w, h };
        frame.style.gridArea = gridArea(target);
      }
      valid = fits(layout(), target, copy.id);
      plan = !valid && dir === 'move' ? swapPlan(layout(), copy.id, target) : null;
      ghost.style.gridArea = gridArea(plan ? plan.a : target);
      ghost.classList.toggle('bad', !valid && !plan);
      other.hidden = !plan;
      if (plan) other.style.gridArea = gridArea(plan.b);
      frame.classList.toggle('bad', !valid && !plan);   // the frame may sit right over the ghost
    };
    const up = () => {
      frame.removeEventListener('pointermove', move);
      frame.classList.remove('lifted', 'bad');
      frame.style.transform = '';
      ghost.hidden = true;
      other.hidden = true;
      const changed = ['x', 'y', 'w', 'h'].some(k => target[k] !== start[k]);
      let moved = false;
      if (valid && changed) store.update(s => { moved = moveCopy(activeLayout(s), copy.id, target); });
      else if (plan) store.update(s => { moved = swapCopy(activeLayout(s), copy.id, target); });
      if (!moved) frame.style.gridArea = gridArea(copyById(store.get(), copy.id) ?? start);
      focusFrame(copy.id);
    };
    frame.addEventListener('pointermove', move);
    frame.addEventListener('lostpointercapture', up, { once: true });
  });

  // ---- keyboard: arrows move, Shift+arrows resize, D duplicates, Delete removes ----

  root.addEventListener('keydown', e => {
    if (!active) return;
    const frame = e.target.closest?.('.widget-frame');
    if (!frame || e.target !== frame) return;
    const copy = copyById(store.get(), frame.dataset.id);
    if (!copy) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d) {
      e.preventDefault();
      const target = e.shiftKey
        ? { x: copy.x, y: copy.y, w: copy.w + d[0], h: copy.h + d[1] }
        : { x: copy.x + d[0], y: copy.y + d[1], w: copy.w, h: copy.h };
      store.update(s => { moveCopy(activeLayout(s), copy.id, target); });
      focusFrame(copy.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(copy.id);
    } else if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      duplicate(copy.id);
    }
  });

  // ---- entering and leaving ----

  function enter() {
    if (active) return;
    if (innerWidth < MIN_WIDTH) {
      alertDialog('Layout mode needs a window at least 900px wide. The page stacks its widgets in one column below that.', 'Layout mode');
      return;
    }
    active = true;
    snapshot = { scope: scopeOf(store.get()), layout: structuredClone(layout()) };
    document.body.classList.add('layout-editing');
    button?.setAttribute('aria-pressed', 'true');
    root.append(overlay, ghost, other);
    document.body.append(tray);
    for (const frame of canvas.frames().values()) decorate(frame);
    refresh();
    canvas.frames().values().next().value?.focus({ preventScroll: true });
  }

  function exit({ restore = false } = {}) {
    if (!active) return;
    active = false;
    if (restore) {
      const { scope: was, layout: back } = snapshot;
      store.update(s => {
        if (was === 'main') s.prefs.layout = structuredClone(back);
        else if (ownLayout(s, was)) s.prefs.layouts[was] = structuredClone(back);
      });
    }
    snapshot = null;
    document.body.classList.remove('layout-editing');
    document.body.style.removeProperty('--tray-h');
    button?.setAttribute('aria-pressed', 'false');
    for (const frame of canvas.frames().values()) strip(frame);
    hidePreview();
    overlay.remove();
    ghost.remove();
    other.remove();
    tray.remove();
    button?.focus({ preventScroll: true });
  }

  canvas.onFrame(frame => { if (active) decorate(frame); });
  store.subscribe(state => {
    if (!active) return;
    // Another tab showing another layout: Layout mode ends, keeping the changes made so far
    // (Cancel would put one tab's layout back into another).
    if (scopeOf(state) !== snapshot.scope) {
      exit();
      return;
    }
    refresh();
    root.append(overlay, ghost, other);   // after the frames the canvas may have re-added
  }, ['prefs', 'groups', 'activeGroupId']);
  addEventListener('keydown', e => {
    if (!active || e.key !== 'Escape') return;
    if (document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    exit();
  });
  addEventListener('resize', () => {
    if (!active) return;
    if (innerWidth < MIN_WIDTH) exit();
    else renderTray();
  });

  return {
    enter,
    exit,
    toggle: () => (active ? exit() : enter()),
    get active() {
      return active;
    },
  };
}
