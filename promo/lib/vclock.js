// Injected before the page's own scripts (Page.addScriptToEvaluateOnNewDocument). The page's
// clocks (performance.now, Date, setTimeout/setInterval, requestAnimationFrame) run on a virtual
// time that follows real time until __vclock.hold(); from then on only __vclock.step(ms) moves it.
// Every CSS/Web animation is then paused and set to the virtual time elapsed since it was first
// seen, so a captured frame looks the same however long it took. The recorder writes the
// video's clock (ms since 1970) over the placeholder below: what Date.now() reads at virtual time 0.
(() => {
  const EPOCH = Number('__EPOCH__');
  const native = {
    setTimeout: window.setTimeout.bind(window),
    now: performance.now.bind(performance),
  };
  const OrigDate = Date;
  let vnow = 0;
  let held = false;
  const timers = new Map();   // id → { at, fn, args, every }
  let nextTimer = 1;
  let rafs = new Map();
  let nextRaf = 1;

  function runDue() {
    for (;;) {
      let due = null;
      for (const [id, t] of timers) if (t.at <= vnow && (!due || t.at < due[1].at)) due = [id, t];
      if (!due) return;
      const [id, t] = due;
      if (t.every != null) t.at += Math.max(1, t.every);
      else timers.delete(id);
      try {
        if (typeof t.fn === 'function') t.fn(...t.args);
        else (0, eval)(String(t.fn));
      } catch (e) {
        console.error(e);
      }
    }
  }

  function runRafs() {
    const list = rafs;
    rafs = new Map();
    for (const fn of list.values()) {
      try {
        fn(vnow);
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Display frames fall on every 1/60 s of virtual time; a step runs the timers due on the way
  // and the animation frames it passes.
  const DISPLAY = 1000 / 60;
  function advance(ms) {
    const end = vnow + ms;
    while (vnow < end - 1e-9) {
      const nextFrame = (Math.floor(vnow / DISPLAY + 1e-9) + 1) * DISPLAY;
      vnow = Math.min(end, nextFrame);
      runDue();
      if (Math.abs(vnow - nextFrame) < 1e-9) runRafs();
    }
  }

  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextTimer++;
    timers.set(id, { at: vnow + Math.max(0, Number(ms) || 0), fn, args });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextTimer++;
    const every = Math.max(0, Number(ms) || 0);
    timers.set(id, { at: vnow + every, fn, args, every });
    return id;
  };
  window.clearTimeout = id => { timers.delete(id); };
  window.clearInterval = id => { timers.delete(id); };
  window.requestAnimationFrame = fn => {
    const id = nextRaf++;
    rafs.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = id => { rafs.delete(id); };
  Object.defineProperty(performance, 'now', { value: () => vnow, configurable: true });
  class VDate extends OrigDate {
    constructor(...a) {
      if (a.length === 0) super(EPOCH + vnow);
      else super(...a);
    }
    static now() {
      return Math.floor(EPOCH + vnow);   // whole milliseconds, as a real Date.now()
    }
  }
  window.Date = VDate;

  // Real time drives the clock until hold().
  let last = native.now();
  const pump = () => {
    if (held) return;
    const t = native.now();
    advance(t - last);
    last = t;
    native.setTimeout(pump, 16);
  };
  native.setTimeout(pump, 16);

  const seen = new Map();   // animation → { at: virtual time first seen, base: its time then }
  function syncAnimations() {
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) seen.set(a, { at: vnow, base: a.currentTime ?? 0 });
      const s = seen.get(a);
      a.pause();
      a.currentTime = s.base + (vnow - s.at);
    }
  }

  window.__vclock = {
    hold() {
      held = true;
      syncAnimations();
    },
    step(ms) {
      advance(ms);
      syncAnimations();
      return vnow;
    },
    get now() {
      return vnow;
    },
  };
})();
