// Shared DOM helpers: element builder, icons, context menu, dialogs, tile icons.

import { faviconUrl } from './chrome-api.js';
import { hostOf } from './util.js';

export const TILE_MIME = 'application/x-newtab-tile';
export const GROUP_MIME = 'application/x-newtab-group';

// el('a', { class, text, dataset, onclick, ...props/attributes }, ...children)
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (value === false) {
      if (key in node && typeof node[key] === 'boolean') node[key] = false;
      continue;
    }
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (typeof value === 'boolean') key in node ? (node[key] = true) : node.setAttribute(key, '');
    else if (key in node && !key.includes('-')) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.flat(Infinity).filter(c => c != null && c !== false));
  return node;
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  note: '<path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L12 14.6 8 16l1.4-4z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M18 7l-1 13H7L6 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.7-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  tab: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M8 5v4"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.6 0-1.3-1-1.6-1-2.7 0-.9.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-4.6-4-8.3-9-8.3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.2" r="1.2"/><circle cx="15" cy="7.8" r="1.2"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M9 12h12"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9c0 4-4 5-8 6"/>',
  pr: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 16V9a3 3 0 0 0-3-3h-4"/><path d="m13 4-2 2 2 2"/>',
  commit: '<circle cx="12" cy="12" r="3.5"/><path d="M3 12h5.5M15.5 12H21"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};

export function icon(name, size = 18) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  return wrap.firstElementChild;
}

// Image for a tile or link: custom icon → Chrome favicon → letter avatar.
// preferSite tries the favicon first; small (mini) icons always do, since custom tile logos are
// padded and turn into dots at 18px.
export function tileIcon(url, iconUrl, title, { mini = false, preferSite = mini } = {}) {
  const letter = () => el('span', {
    class: 'letter-avatar' + (mini ? ' mini' : ''),
    text: ((title || '').trim()[0] || hostOf(url)[0] || '?').toUpperCase(),
  });
  const favicon = faviconUrl(url, mini ? 32 : 64);
  const candidates = (preferSite ? [favicon, iconUrl] : [iconUrl, favicon]).filter(Boolean);
  if (!candidates.length) return letter();

  const img = el('img', { class: mini ? 'mini-img' : 'tile-img', alt: '', draggable: false, decoding: 'async', referrerpolicy: 'no-referrer' });
  let i = 0;
  img.addEventListener('error', () => {
    i += 1;
    if (i < candidates.length) img.src = candidates[i];
    else img.replaceWith(letter());
  });
  // Wide images get a wide box in the flat layout instead of shrinking into a square one.
  // Speed Dial 2's own logos are 640×265 banners with the symbol in the middle, so those are
  // also cropped to their centre.
  img.addEventListener('load', () => {
    img.classList.toggle('wide', img.naturalWidth / img.naturalHeight > 1.3);
    img.classList.toggle('banner', SD2_BANNER.test(img.currentSrc));
  });
  img.src = candidates[0];
  return img;
}

const SD2_BANNER = /^https:\/\/assets\.speeddial2\.com\/logo\//;

// ---- Context menu ----

let menuEl = null;

export function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}

// items: { label, icon?, action, danger? } | { heading } | { separator: true }
export function showMenu(x, y, items) {
  closeMenu();
  const menu = el('div', { class: 'menu', role: 'menu' }, items.map(item => {
    if (item.separator) return el('div', { class: 'menu-sep', role: 'separator' });
    if (item.heading) return el('div', { class: 'menu-heading', text: item.heading });
    return el('button', {
      class: 'menu-item' + (item.danger ? ' danger' : ''),
      type: 'button',
      role: 'menuitem',
      onclick: () => { closeMenu(); item.action(); },
    }, item.icon && icon(item.icon, 16), el('span', { dir: 'auto', text: item.label }));
  }));
  menu.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...menu.querySelectorAll('.menu-item')];
    const i = buttons.indexOf(document.activeElement);
    buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  });
  // Inside an open modal (e.g. a folder window) the menu must live in that dialog, or the
  // dialog's top layer would cover it.
  ([...document.querySelectorAll('dialog[open]')].at(-1) ?? document.body).append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  menuEl = menu;
  menu.querySelector('.menu-item')?.focus({ preventScroll: true });
}

addEventListener('pointerdown', e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
addEventListener('blur', closeMenu);
addEventListener('resize', closeMenu);

// ---- Dialogs ----

export function field(label, control, hint) {
  return el('label', { class: 'field' }, el('span', { class: 'field-label', text: label }), control, hint);
}

// Resolves with the clicked action's value, or null when dismissed (Esc).
// actions: [{ label, value, primary?, danger? }]; validate() enables/disables the primary button.
export function openDialog({ title, body = [], actions = [], validate, className = '' }) {
  return new Promise(resolve => {
    let result = null;
    const primaryIndex = actions.findIndex(a => a.primary);
    const buttons = actions.map(a => el('button', {
      type: a.primary ? 'submit' : 'button',
      class: 'btn' + (a.primary ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : ''),
      text: a.label,
      onclick: a.primary ? null : () => { result = a.value; dialog.close(); },
    }));
    const check = () => {
      if (validate && primaryIndex >= 0) buttons[primaryIndex].disabled = !validate();
    };
    const form = el('form', {
      class: 'dlg-form',
      onsubmit: e => {
        e.preventDefault();
        if (primaryIndex < 0 || buttons[primaryIndex].disabled) return;
        result = actions[primaryIndex].value;
        dialog.close();
      },
      oninput: check,
    },
      title && el('h2', { class: 'dlg-title', text: title }),
      el('div', { class: 'dlg-body' }, body),
      el('div', { class: 'dlg-actions' }, buttons));
    const dialog = el('dialog', { class: 'dlg ' + className, onclose: () => { dialog.remove(); resolve(result); } }, form);

    document.body.append(dialog);
    check();
    dialog.showModal();
    const input = form.querySelector('input, select, textarea');
    if (input) {
      input.focus();
      input.select?.();
    } else if (primaryIndex >= 0) {
      buttons[primaryIndex].focus();
    }
  });
}

export async function confirmDialog(message, { title = 'Are you sure?', confirmLabel = 'OK', danger = false } = {}) {
  const value = await openDialog({
    title,
    body: [el('p', { class: 'dlg-message', text: message })],
    actions: [{ label: 'Cancel', value: false }, { label: confirmLabel, primary: true, danger, value: true }],
  });
  return value === true;
}

export function alertDialog(message, title = 'Something went wrong') {
  return openDialog({
    title,
    body: [el('p', { class: 'dlg-message', text: message })],
    actions: [{ label: 'OK', primary: true, value: true }],
  });
}

export async function askText({ title, label, value = '', placeholder = '', confirmLabel = 'Save' }) {
  const input = el('input', { type: 'text', value, placeholder, dir: 'auto', maxLength: 100 });
  const ok = await openDialog({
    title,
    body: [field(label, input)],
    actions: [{ label: 'Cancel', value: false }, { label: confirmLabel, primary: true, value: true }],
    validate: () => input.value.trim().length > 0,
  });
  return ok ? input.value.trim() : null;
}

export function askChoice({ title, message, choices }) {
  return openDialog({
    title,
    body: [el('p', { class: 'dlg-message', text: message })],
    actions: [{ label: 'Cancel', value: null }, ...choices],
  });
}
