// Marvel: the MCU in the order the story happens (marvel.js), what to watch next, and what's been
// watched. The ticks are the page's (state.marvel): removing the widget and adding it back keeps them.

import { el, icon, widgetHead, showMenu } from './ui.js';
import { copyById, TYPES } from './layout.js';
import { SOURCE, KINDS, shownEntries, nextUp, creditsAfter, watchedUpTo, unwatchedFrom, numberOf, cleanWatched } from './marvel.js';

// "A", "A and B", "A, B and C".
const words = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? '');

// "Season 1 · episodes 1–7" or "Film"; the year is apart, so a narrow widget can drop it.
const what = e => e.part || KINDS[e.kind];

export function mountMarvel(root, store, copy) {
  const settings = () => copyById(store.get(), copy.id)?.settings ?? TYPES.marvel.defaults();
  const watched = () => store.get().marvel.watched;
  const setWatched = list => store.update(s => { s.marvel.watched = cleanWatched(list); }, ['marvel']);
  const tick = (id, on) => setWatched(on ? [...watched(), id] : watched().filter(w => w !== id));

  const count = el('span', { class: 'widget-head-status' });
  const head = widgetHead('shield', 'Marvel');
  head.append(count);
  const fill = el('span', { class: 'mv-fill' });
  const bar = el('div', { class: 'mv-bar', role: 'progressbar', 'aria-label': 'Watched', 'aria-valuemin': '0' }, fill);
  const next = el('div', { class: 'mv-next' });
  const list = el('ol', { class: 'mv-list', 'aria-label': 'Watch order' });
  const link = el('a', { href: SOURCE.url, rel: 'noopener', text: `${SOURCE.name}, ${SOURCE.updated}` });
  const scroller = el('div', { class: 'mv-scroll' }, list, el('p', { class: 'widget-note mv-source' }, 'Order: ', link));
  const section = el('section', { class: 'widget widget-marvel' }, head, bar, next, scroller);
  root.append(section);

  // ---- up next ----

  function renderNext(e, w) {
    if (!e) {
      next.replaceChildren(el('p', { class: 'mv-all' }, icon('check-circle', 18), el('span', { text: 'All caught up' })));
      return;
    }
    const credits = creditsAfter(e.id, w).map(c => c.title);
    // el() drops null children; replaceChildren would write them out as "null".
    next.replaceChildren(...[
      el('div', { class: 'mv-next-label', text: `Up next · ${numberOf(e.id)}` }),
      el('div', { class: 'mv-next-row' },
        el('div', { class: 'mv-next-text' },
          el('b', { class: 'mv-next-title', text: e.title }),
          el('span', { class: 'mv-meta' }, what(e), el('span', { class: 'mv-year', text: ` · ${e.year}` }))),
        el('button', {
          type: 'button', class: 'btn mv-watched', title: 'Mark it watched', 'aria-label': `Mark ${e.title} watched`,
          onclick: () => {
            reveal = true;
            tick(e.id, true);
            // The card was redrawn: Enter again ticks the one after.
            next.querySelector('.mv-watched')?.focus({ preventScroll: true });
          },
        }, icon('check', 15), el('span', { text: 'Watched' }))),
      e.note ? el('p', { class: 'mv-note', text: e.note }) : null,
      credits.length ? el('p', { class: 'mv-note mv-credits', text: `Then the credits scene${credits.length > 1 ? 's' : ''} of ${words(credits)}` }) : null,
    ].filter(Boolean));
  }

  // ---- the order ----

  function row(e, done, isNext) {
    const box = el('input', {
      type: 'checkbox', class: 'mv-check', checked: done,
      'aria-label': `${e.title}${e.part ? `, ${e.part}` : ''}, watched`,
      onchange: () => tick(e.id, box.checked),
    });
    return el('li', { class: `mv-item${done ? ' done' : ''}${isNext ? ' next' : ''}`, dataset: { id: e.id } },
      el('label', { class: 'mv-row', title: e.note || null },
        el('span', { class: 'mv-num', text: numberOf(e.id) }),
        box,
        el('span', { class: 'mv-text' },
          el('span', { class: 'mv-title', text: e.title }),
          el('span', { class: 'mv-meta' }, what(e), el('span', { class: 'mv-year', text: ` · ${e.year}` })))));
  }

  // The next entry near the top of the list, with the one before it still in view.
  function scrollToNext() {
    const item = list.querySelector('.mv-item.next');
    scroller.scrollTop = item ? Math.max(0, item.offsetTop - (item.previousElementSibling?.offsetHeight ?? 0)) : 0;
  }

  // The list scrolls to the next entry when it's first drawn, when what it shows changes, and
  // after Watched; a tick in the list leaves it where it is.
  let reveal = true;
  let drawn = '';
  let showing = '';

  function render(state) {
    const own = copyById(state, copy.id);
    if (!own) return;
    const s = own.settings;
    const w = state.marvel.watched;
    const narrow = own.w < 3;
    const sig = JSON.stringify([s, w, narrow, state.prefs.openInNewTab]);
    if (sig === drawn) return;
    drawn = sig;
    if (JSON.stringify(s) !== showing) {
      showing = JSON.stringify(s);
      reveal = true;
    }

    section.classList.toggle('narrow', narrow);
    link.target = state.prefs.openInNewTab ? '_blank' : '';
    const shown = shownEntries(s.show);
    const seen = new Set(w);
    const done = shown.filter(e => seen.has(e.id)).length;
    const up = nextUp(shown, w);
    count.textContent = `${done} / ${shown.length}`;
    fill.style.width = `${(done / shown.length) * 100}%`;
    bar.setAttribute('aria-valuemax', String(shown.length));
    bar.setAttribute('aria-valuenow', String(done));
    bar.setAttribute('aria-valuetext', `${done} of ${shown.length} watched`);
    renderNext(up, w);

    const top = scroller.scrollTop;
    // A row ticked from the keyboard keeps the focus once the rows are redrawn.
    const focused = list.contains(document.activeElement) ? document.activeElement.closest('.mv-item')?.dataset.id : null;
    list.replaceChildren(...(s.hideWatched ? shown.filter(e => !seen.has(e.id)) : shown).map(e => row(e, seen.has(e.id), e === up)));
    if (focused) list.querySelector(`.mv-item[data-id="${focused}"] .mv-check`)?.focus({ preventScroll: true });
    if (reveal) {
      reveal = false;
      requestAnimationFrame(scrollToNext);
    } else {
      scroller.scrollTop = top;
    }
  }

  // Right-click (or the menu key) on an entry: tick or untick a run of them, for starting midway.
  list.addEventListener('contextmenu', e => {
    const item = e.target.closest('.mv-item');
    if (!item) return;
    e.preventDefault();
    const id = item.dataset.id;
    const shown = shownEntries(settings().show);
    const r = item.getBoundingClientRect();
    const at = e.clientX || e.clientY ? [e.clientX, e.clientY] : [r.left + 24, r.bottom];
    showMenu(...at, [
      { label: 'Watched everything up to here', icon: 'check', action: () => setWatched(watchedUpTo(watched(), shown, id)) },
      { label: 'Not watched from here on', icon: 'undo', action: () => setWatched(unwatchedFrom(watched(), shown, id)) },
    ]);
  });

  const unsubscribe = store.subscribe(render, ['marvel', 'prefs']);
  render(store.get());
  return { destroy: unsubscribe };
}
