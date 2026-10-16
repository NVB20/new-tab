// New-tab intro for the clock: a single point appears in the middle of the time, then every
// character grows out of that same point and travels to its place. Skipped when the system asks
// for less motion. Resolves when it's done, so the clock can be redrawn as plain text.

const SEED_MS = 260;    // the point appears and swells before the first digit leaves it
const GROW_MS = 700;
const STAGGER_MS = 70;

export async function playClockIntro(time, others = []) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !time.animate) return;
  const hide = [time, ...others];
  hide.forEach(n => { n.style.opacity = '0'; });
  // Measure with the face's real font, not the fallback shown before it loads.
  const cs = getComputedStyle(time);
  await document.fonts.load(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, time.textContent).catch(() => {});
  await document.fonts.ready;
  hide.forEach(n => { n.style.opacity = ''; });
  if (!time.isConnected || !time.offsetWidth) return;

  const units = splitIntoUnits(time);
  const box = time.getBoundingClientRect();
  const origin = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const seed = document.createElement('span');
  seed.setAttribute('aria-hidden', 'true');
  Object.assign(seed.style, {
    position: 'fixed', left: origin.x + 'px', top: origin.y + 'px', zIndex: '1',
    width: '10px', height: '10px', borderRadius: '50%', pointerEvents: 'none',
    background: getComputedStyle(time).color,
  });
  document.body.append(seed);

  const at = n => n.getBoundingClientRect();
  const animations = units.map((unit, i) => {
    const r = at(unit);
    const dx = origin.x - (r.left + r.width / 2);
    const dy = origin.y - (r.top + r.height / 2);
    return unit.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(0)`, opacity: 0, filter: 'blur(4px)' },
      { opacity: 1, offset: 0.25 },
      { transform: 'none', opacity: 1, filter: 'blur(0)' },
    ], { duration: GROW_MS, delay: SEED_MS + i * STAGGER_MS, easing: 'cubic-bezier(.2, .9, .3, 1.12)', fill: 'backwards' });
  });
  const seedMs = SEED_MS + units.length * STAGGER_MS;
  animations.push(seed.animate([
    { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 1, offset: SEED_MS / seedMs },
    { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0.8, offset: 0.85 },
    { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
  ], { duration: seedMs, easing: 'ease-out' }));
  for (const n of others) {
    animations.push(n.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 450, delay: SEED_MS + units.length * STAGGER_MS, easing: 'ease-out', fill: 'backwards' }));
  }

  await Promise.allSettled(animations.map(a => a.finished));
  seed.remove();
}

// Each character of the time becomes its own inline-block span (transforms don't apply to plain
// text); AM/PM moves as one piece.
function splitIntoUnits(time) {
  const units = [];
  const walker = document.createTreeWalker(time, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const text of texts) {
    const ampm = text.parentElement.closest('.clock-ampm');
    if (ampm) {
      ampm.style.display = 'inline-block';
      units.push(ampm);
      continue;
    }
    const spans = [...text.data].map(ch => {
      const span = document.createElement('span');
      span.style.display = 'inline-block';
      span.textContent = ch;
      return span;
    });
    text.replaceWith(...spans);
    units.push(...spans);
  }
  return units;
}
