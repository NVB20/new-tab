// Easing and pointer paths for the promo, used by the recorder (Node) and by the overlay in the page
// (record.mjs injects this file with its `export`s stripped, so keep to plain top-level
// declarations).

export const clamp01 = v => Math.min(1, Math.max(0, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeOutCubic = k => 1 - (1 - clamp01(k)) ** 3;

export function easeInOutCubic(k) {
  const x = clamp01(k);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
}

// Overshoots past 1 and settles back.
export function easeOutBack(k, s = 1.70158) {
  const x = clamp01(k) - 1;
  return 1 + (s + 1) * x ** 3 + s * x ** 2;
}

// The point at frame f along keys [{ f, x, y }] sorted by f: eased between neighbours, held before
// the first key and after the last.
export function pathAt(keys, f) {
  if (f <= keys[0].f) return { x: keys[0].x, y: keys[0].y };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (f > b.f) continue;
    const k = b.f === a.f ? 1 : easeInOutCubic((f - a.f) / (b.f - a.f));
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
  }
  const last = keys.at(-1);
  return { x: last.x, y: last.y };
}
