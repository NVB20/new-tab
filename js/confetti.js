// Confetti: a burst from a point on the page, for a countdown reaching zero. One canvas over the
// page for the burst's length, then it's gone. Nothing when the system asks for less motion.

const COLORS = ['#2563eb', '#10a37f', '#8b5cf6', '#e5484d', '#f5a524'];   // setup's accents
const GRAVITY = 1500;   // px/s²
const DRAG = 3;         // share of the speed lost per second, so the bits flutter down
const MS = 3000;
const FADE_MS = 700;

export const motionAllowed = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

// accent: the page's accent colour, which takes a third of the bits.
export function confettiFrom(x, y, { accent = '#d97757', count = 160 } = {}) {
  if (!motionAllowed()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const [w, h] = [innerWidth, innerHeight];
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  document.body.append(canvas);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  const colors = [accent, accent, accent, ...COLORS];
  const bits = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;   // a fan, upwards
    const speed = 500 + Math.random() * 900;
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      round: Math.random() < 0.2,
      turn: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 12,
      flip: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  });

  const start = performance.now();
  let last = start;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const age = t - start;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = Math.min(1, Math.max(0, (MS - age) / FADE_MS));
    let shown = 0;
    for (const b of bits) {
      b.vx -= b.vx * DRAG * dt;
      b.vy += (GRAVITY - b.vy * DRAG) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.turn += b.spin * dt;
      b.flip += 7 * dt;
      if (b.y > h + 20) continue;
      shown++;
      g.save();
      g.translate(b.x + Math.sin(b.flip) * 5, b.y);
      g.rotate(b.turn);
      g.scale(1, Math.cos(b.flip));   // turning over as it falls
      g.fillStyle = b.color;
      if (b.round) {
        g.beginPath();
        g.arc(0, 0, b.h * 0.75, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      }
      g.restore();
    }
    if (age < MS && shown) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
