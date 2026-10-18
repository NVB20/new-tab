// The hover card of the Economic calendar and Google Calendar widgets: one per page, beside the
// widget with an arrow at the row it tells about (above or below the row when neither side has
// room). The widget fills it (econ-widget.js, gcal-widget.js); the pointer and the keyboard focus
// open it.

import { el } from './ui.js';

const GAP = 10;     // px between the widget and the card
const EDGE = 12;    // px kept from the window's edges
const ARROW = 16;   // px: the arrow stays this far inside the card's corners

let card = null;
let row = null;     // the row the card is open for

const clamp = (n, min, max) => Math.max(min, Math.min(n, max));

function place(target) {
  const frame = (target.closest('.widget-frame') ?? target).getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const roomRight = innerWidth - frame.right - GAP - EDGE;
  const roomLeft = frame.left - GAP - EDGE;
  let side;
  let x;
  let y;
  if (Math.max(roomRight, roomLeft) >= w) {
    side = roomRight >= w && (roomRight >= roomLeft || roomLeft < w) ? 'right' : 'left';
    x = side === 'right' ? frame.right + GAP : frame.left - GAP - w;
    y = clamp(r.top + r.height / 2 - h / 2, EDGE, innerHeight - EDGE - h);
    card.style.setProperty('--arrow', `${Math.round(clamp(r.top + r.height / 2 - y, ARROW, h - ARROW))}px`);
  } else {
    side = innerHeight - r.bottom - GAP - EDGE >= h || r.top - GAP - EDGE < h ? 'below' : 'above';
    x = clamp(r.left, EDGE, innerWidth - EDGE - w);
    y = side === 'below' ? r.bottom + GAP : r.top - GAP - h;
    card.style.setProperty('--arrow', `${Math.round(clamp(r.left + 48 - x, ARROW, w - ARROW))}px`);
  }
  card.dataset.side = side;
  card.style.left = `${Math.round(x)}px`;
  card.style.top = `${Math.round(y)}px`;
}

// Opens the card for `target` with `content` (nodes), or moves it there.
export function showCard(target, content) {
  card ??= el('div', { class: 'ec-card', id: 'ec-card', role: 'tooltip' });
  const moving = !!row;
  if (row && row !== target) row.removeAttribute('aria-describedby');
  card.replaceChildren(...content);
  card.classList.toggle('moving', moving);
  if (!card.isConnected) document.body.append(card);
  row = target;
  row.setAttribute('aria-describedby', card.id);
  place(target);
}

// Closes the card: any (no argument), or only while it's open for `target`.
export function hideCard(target) {
  if (!card?.isConnected || (target && target !== row)) return;
  row?.removeAttribute('aria-describedby');
  row = null;
  card.remove();
}

// The row the card is open for, or null.
export const cardRow = () => (card?.isConnected ? row : null);
