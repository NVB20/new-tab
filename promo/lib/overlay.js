// The film's own layer over the new tab page, in the style of a SaaS launch film: a glowing stage,
// thin words that blur in (or type out), the page itself scaled and tilted in 3D with depth blur,
// widgets lifted off the page to float, corner brackets, the logo with its pill, and an arrow
// cursor. record.mjs injects it after lib/motion.mjs (clamp01, lerp, easeOutCubic, easeInOutCubic)
// as a top-layer popover. Everything is drawn from the shot and the frame number alone (fractional
// for the motion-blur sub-frames).
(() => {
  const FPS = 30;
  const W = innerWidth;
  const H = innerHeight;
  const ms = f => (f * 1000) / FPS;
  const WORD_MS = 420;       // a word's blur-in
  const STAGGER_MS = 67;     // from one word to the next
  const LEAVE_MS = 200;
  const LOGO_MS = 500;
  const FLOAT_FRAMES = 14;   // a floating widget's rise
  const PERSPECTIVE = 1800;
  // The hook's tiles around the edges: x, y (centre), scale, blur px, opacity.
  const CLOUD = [
    [210, 250, 1.9, 7, 0.45], [560, 140, 1.4, 9, 0.35], [1400, 170, 1.7, 6, 0.5], [1730, 340, 2.1, 8, 0.4],
    [160, 790, 2.2, 5, 0.45], [520, 930, 1.5, 9, 0.35], [1460, 900, 1.9, 6, 0.45], [1770, 720, 1.5, 9, 0.35],
    [960, 960, 1.3, 10, 0.3],
  ];
  const CURVES = [
    'M -100 900 C 500 650, 1400 1150, 2020 760',
    'M -100 260 C 600 520, 1300 -40, 2020 330',
    'M 300 -50 C 700 400, 1250 700, 1650 1130',
  ];

  const STYLE = `
    #promo { position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none;
      margin: 0; padding: 0; border: 0; background: transparent; overflow: hidden; pointer-events: none;
      color: #fff; font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
      --em-a: #3b82f6; --em-b: #93c5fd; }
    #promo.light { color: #0d1117; --em-a: #1d4ed8; --em-b: #3b82f6; }
    #promo > * { position: absolute; }
    #promo .stage { inset: 0; background:
      radial-gradient(ellipse 70% 55% at 50% 118%, rgb(37 99 235 / 0.6), transparent 70%),
      radial-gradient(ellipse 45% 40% at 12% -12%, rgb(37 99 235 / 0.2), transparent 70%), #0d1117; }
    #promo.light .stage { background:
      radial-gradient(ellipse 70% 55% at 50% 118%, rgb(59 130 246 / 0.28), transparent 70%),
      radial-gradient(ellipse 45% 40% at 90% -10%, rgb(147 197 253 / 0.3), transparent 70%), #f6f8fa; }
    #promo .glow { inset: 0; background: radial-gradient(ellipse 65% 42% at 50% 120%, rgb(37 99 235 / 0.65), transparent 70%); }
    #promo .depth { inset: 0; backdrop-filter: blur(7px); }
    #promo .layer { inset: 0; }
    #promo .clone { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important;
      transform-origin: 50% 50%; border-radius: 14px; background: var(--surface, #161b22);
      box-shadow: 0 40px 90px rgb(1 4 9 / 0.65), 0 0 0 1px rgb(240 246 252 / 0.1); overflow: hidden; }
    #promo .cloud .clone { background: none; box-shadow: none; }
    #promo .text { font-size: 92px; font-weight: 300; line-height: 1.1; letter-spacing: -0.015em; white-space: pre-wrap; }
    #promo .text.top { left: 50%; top: 96px; width: 86vw; transform: translateX(-50%); text-align: center; }
    #promo .text.center { left: 50%; top: 50%; width: 90vw; transform: translate(-50%, -50%); text-align: center; }
    #promo .text.left { left: 150px; top: 50%; width: 38vw; transform: translateY(-50%); text-align: left; }
    #promo .text.xl { font-size: 150px; }
    #promo .text.typed { font-size: 80px; }
    #promo .w { display: inline-block; opacity: 0; }
    #promo .w.em, #promo .typed em { font-style: normal; font-weight: 400;
      background: linear-gradient(90deg, var(--em-a), var(--em-b)); -webkit-background-clip: text;
      background-clip: text; color: transparent; }
    #promo .typed-line { white-space: pre; }
    #promo .caret { display: inline-block; width: 3px; height: 0.95em; margin-left: 6px; vertical-align: -0.14em;
      background: currentColor; }
    #promo .logo { left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column;
      align-items: center; gap: 40px; }
    #promo .mark { display: flex; align-items: center; gap: 30px; font-size: 124px; font-weight: 600;
      letter-spacing: -0.02em; opacity: 0; }
    #promo .mark img { width: 132px; height: 132px; }
    #promo .pill { font-size: 32px; font-weight: 400; padding: 14px 32px; border-radius: 999px; opacity: 0;
      background: rgb(255 255 255 / 0.06); box-shadow: inset 0 0 0 1.5px rgb(147 197 253 / 0.45), 0 0 50px rgb(37 99 235 / 0.35); }
    #promo .pill.dark { background: #0d1117; color: #fff; box-shadow: 0 14px 34px rgb(13 17 23 / 0.25); }
    #promo .bracket { width: 36px; height: 36px; border: 0 solid #93c5fd; opacity: 0; }
    #promo .bracket.tl { border-top-width: 3px; border-left-width: 3px; border-top-left-radius: 12px; }
    #promo .bracket.tr { border-top-width: 3px; border-right-width: 3px; border-top-right-radius: 12px; }
    #promo .bracket.bl { border-bottom-width: 3px; border-left-width: 3px; border-bottom-left-radius: 12px; }
    #promo .bracket.br { border-bottom-width: 3px; border-right-width: 3px; border-bottom-right-radius: 12px; }
    #promo .curves { inset: 0; width: 100%; height: 100%; }
    #promo .curves path { fill: none; stroke: rgb(37 99 235 / 0.3); stroke-width: 1.6; }
    #promo .cursor { left: 0; top: 0; width: 34px; height: 34px; filter: drop-shadow(0 4px 8px rgb(1 4 9 / 0.5)); }
  `;

  let scene = null;
  let root = null;
  let camera = null;
  let depth = null;
  let floats = [];
  let cloud = [];
  let cues = [];
  let logo = null;
  let brackets = null;
  let curves = [];
  let cursor = null;
  let sparks = [];
  let cells = [];

  const node = (tag, cls, parent = root) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    parent.append(n);
    return n;
  };
  const svgNode = (tag, attrs, parent) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent.append(n);
    return n;
  };
  const need = sel => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Shot "${scene.name}": nothing on the page matches ${sel}`);
    return el;
  };
  const centre = el => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  };

  // "Your *GitHub*, at a glance" → a span per word (the starred ones in the gradient) with the
  // spaces between them kept as text, so punctuation stays against its word. Returns the spans.
  function wordsInto(el, text) {
    const spans = [];
    for (const part of text.split(/(\*[^*]+\*)/).filter(Boolean)) {
      const em = part.startsWith('*');
      for (const piece of (em ? part.slice(1, -1) : part).split(/(\s+)/).filter(Boolean)) {
        if (/^\s+$/.test(piece)) {
          el.append(' ');
          continue;
        }
        const span = node('span', `w${em ? ' em' : ''}`, el);
        span.textContent = piece;
        spans.push(span);
      }
    }
    return spans;
  }

  // The text with its first n characters shown, starred stretches in <em>.
  function typedInto(el, text, n) {
    el.replaceChildren();
    let shown = 0;
    for (const part of text.split(/(\*[^*]+\*)/).filter(Boolean)) {
      const em = part.startsWith('*');
      const body = em ? part.slice(1, -1) : part;
      const piece = body.slice(0, Math.max(0, n - shown));
      shown += body.length;
      if (!piece) break;
      if (em) node('em', '', el).textContent = piece;
      else el.append(piece);
    }
  }

  // A copy of a live page element, as wide as it is on the page and as tall as its content (a
  // widget's frame is often taller than what it shows), to move around the stage.
  function lift(original, parent) {
    const b = original.getBoundingClientRect();
    let bottom = b.top;
    for (const el of original.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.height && r.width && getComputedStyle(el).visibility !== 'hidden') bottom = Math.max(bottom, r.bottom);
    }
    const h = Math.min(b.height, bottom - b.top + 18);
    const copy = original.cloneNode(true);
    copy.classList.add('clone');
    copy.removeAttribute('id');
    copy.style.width = `${b.width}px`;
    copy.style.height = `${h}px`;
    parent.append(copy);
    return { el: copy, w: b.width, h };
  }

  function setup(s) {
    scene = s;
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
    root = document.createElement('div');
    root.id = 'promo';
    root.popover = 'manual';
    if (s.stage === 'light') root.classList.add('light');
    if (s.stage) node('div', 'stage');
    for (const sel of s.hide ?? []) for (const el of document.querySelectorAll(sel)) el.style.opacity = '0';

    if (s.cloud) {
      const layer = node('div', 'layer cloud');
      const tiles = [...document.querySelectorAll(s.cloud)];
      if (!tiles.length) need(s.cloud);
      cloud = CLOUD.map(([x, y, scale, blur, opacity], i) => ({ ...lift(tiles[i % tiles.length], layer), x, y, scale, blur, opacity }));
    }
    if (s.float) {
      const layer = node('div', 'layer floats');
      floats = s.float.map(f => ({ ...f, ...lift(need(f.sel), layer) }));
    }
    if (s.glow) node('div', 'glow');
    if (s.camera) {
      const movers = [...document.querySelectorAll('header.topbar, main#canvas')].map(el => ({ el, box: el.getBoundingClientRect() }));
      const keys = s.camera.map(k => ({
        f: k.f,
        C: centre(need(k.focus)),
        P: k.at === 'center' || !k.at ? { x: W / 2, y: H / 2 } : { x: k.at[0], y: k.at[1] },
        zoom: k.zoom ?? 1, rx: k.rx ?? 0, ry: k.ry ?? 0,
      }));
      camera = { keys, movers };
    }
    if (s.depth) depth = node('div', 'depth');
    if (s.curves) {
      const svg = svgNode('svg', { class: 'curves', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }, root);
      curves = CURVES.map(d => svgNode('path', { d, pathLength: '1', 'stroke-dasharray': '1' }, svg));
    }
    if (s.brackets) brackets = ['tl', 'tr', 'bl', 'br'].map(c => node('div', `bracket ${c}`));

    const blocks = {};
    cues = (s.words ?? []).map(w => {
      const at = w.at ?? 'center';
      blocks[at] ??= node('div', `text ${at}`);
      const block = blocks[at];
      if (w.size) block.classList.add(w.size);
      if (block.childNodes.length) block.append(' ');
      const cue = node('span', 'cue', block);
      if (w.type) {
        block.classList.add('typed');
        const line = node('span', 'w typed-line', cue);
        const caret = node('span', 'caret', cue);
        return { ...w, line, caret, chars: w.text.replaceAll('*', '').length };
      }
      return { ...w, words: wordsInto(cue, w.text) };
    });

    if (s.logo) {
      const box = node('div', 'logo');
      const mark = node('div', 'mark', box);
      const img = node('img', '', mark);
      img.src = chrome.runtime.getURL('icons/icon-128.png');
      img.alt = '';
      node('span', '', mark).textContent = 'New Tab';
      const pill = node('div', `pill${s.logo.dark ? ' dark' : ''}`, box);
      pill.textContent = s.logo.pill;
      logo = { ...s.logo, mark, pill };
    }

    cursor = node('div', 'cursor');
    cursor.innerHTML = '<svg viewBox="0 0 28 28" width="34" height="34"><path d="M5 3 L5 23 L10.2 18.2 L13.6 25.6 L17 24 L13.7 16.8 L20.6 16.6 Z" fill="#fff" stroke="#0d1117" stroke-width="1.6" stroke-linejoin="round"/></svg>';

    if (s.fx === 'sparklines') {
      sparks = [...root.querySelectorAll('.clone .mk-spark polyline')];
      if (!sparks.length) need('.clone .mk-spark polyline');
      for (const p of sparks) {
        p.setAttribute('pathLength', '1');
        p.style.strokeDasharray = '1';
      }
    }
    if (s.fx === 'heatmap') {
      const rects = [...document.querySelectorAll('.frame-github .gh-heatmap-grid rect')];
      if (!rects.length) need('.frame-github .gh-heatmap-grid rect');
      const xs = [...new Set(rects.map(r => Number(r.getAttribute('x'))))].sort((a, b) => a - b);
      cells = rects.map(r => ({ r, col: xs.indexOf(Number(r.getAttribute('x'))) }));
    }

    document.body.append(root);
    root.showPopover();
  }

  function cameraAt(f) {
    const { keys } = camera;
    if (f <= keys[0].f) return keys[0];
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1];
      const b = keys[i];
      if (f > b.f) continue;
      const k = easeInOutCubic((f - a.f) / (b.f - a.f));
      return {
        C: { x: lerp(a.C.x, b.C.x, k), y: lerp(a.C.y, b.C.y, k) },
        P: { x: lerp(a.P.x, b.P.x, k), y: lerp(a.P.y, b.P.y, k) },
        zoom: lerp(a.zoom, b.zoom, k), rx: lerp(a.rx, b.rx, k), ry: lerp(a.ry, b.ry, k),
      };
    }
    return keys.at(-1);
  }

  // Each element's origin is the subject C (in its own box), so scaling and tilting keep C still
  // and the translation then carries it to P.
  function moveCamera(f) {
    const c = cameraAt(f);
    for (const { el, box } of camera.movers) {
      el.style.transformOrigin = `${c.C.x - box.left}px ${c.C.y - box.top}px`;
      el.style.transform = `translate(${c.P.x - c.C.x}px, ${c.P.y - c.C.y}px) perspective(${PERSPECTIVE}px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) scale(${c.zoom})`;
    }
    if (depth) {
      const mask = `radial-gradient(ellipse 62% 56% at ${c.P.x}px ${c.P.y}px, transparent 55%, #000 100%)`;
      depth.style.maskImage = mask;
      depth.style.webkitMaskImage = mask;
    }
  }

  function drawWords(f) {
    const t = ms(f);
    for (const cue of cues) {
      const leave = cue.to == null ? 0 : clamp01((t - ms(cue.to)) / LEAVE_MS);
      if (cue.line) {
        const n = Math.floor((f - cue.f) / cue.type) + 1;
        typedInto(cue.line, cue.text, Math.max(0, Math.min(cue.chars, n)));
        cue.line.style.opacity = f >= cue.f ? '1' : '0';
        const done = cue.f + cue.chars * cue.type;
        cue.caret.style.opacity = f < cue.f - 2 ? '0' : f < done ? '1' : Math.floor((f - done) / 8) % 2 ? '0' : '1';
        continue;
      }
      cue.words.forEach((w, i) => {
        const e = easeOutCubic((t - ms(cue.f) - i * STAGGER_MS) / WORD_MS);
        const shown = t >= ms(cue.f) + i * STAGGER_MS;
        w.style.opacity = shown ? String(e * (1 - leave)) : '0';
        w.style.filter = `blur(${14 * (1 - e) + 14 * leave}px)`;
        w.style.transform = `translateY(${18 * (1 - e) - 10 * leave}px)`;
      });
    }
  }

  function drawFloats(f) {
    const t = ms(f);
    floats.forEach((fl, i) => {
      const k = easeOutCubic((f - fl.f) / FLOAT_FRAMES);
      const drift = Math.sin((t / 2600) * 2 * Math.PI + i * 1.7) * 7;
      const x = fl.x - fl.w / 2;
      const y = fl.y - fl.h / 2 + (1 - k) * 70 + drift;
      fl.el.style.opacity = f < fl.f ? '0' : String(k);
      fl.el.style.filter = `blur(${14 * (1 - k)}px)`;
      fl.el.style.transform = `translate(${x}px, ${y}px) perspective(${PERSPECTIVE}px) rotateX(${(fl.rx ?? 4) + drift * 0.15}deg) rotateY(${fl.ry ?? 0}deg) scale(${fl.scale * (0.92 + 0.08 * k)})`;
    });
    cloud.forEach((c, i) => {
      const fade = easeOutCubic(f / 10);
      const y = c.y - t * 0.014 + Math.sin(t / 1400 + i) * 6;
      c.el.style.opacity = String(c.opacity * fade);
      c.el.style.filter = `blur(${c.blur}px)`;
      c.el.style.transform = `translate(${c.x - c.w / 2}px, ${y - c.h / 2}px) scale(${c.scale})`;
    });
  }

  function drawBrackets(f) {
    if (!brackets || !floats.length) return;
    const k = easeOutCubic((f - scene.brackets.f) / 10);
    const b = floats[0].el.getBoundingClientRect();
    const pad = 22 + 46 * (1 - k);
    const spots = { tl: [b.left - pad, b.top - pad], tr: [b.right + pad - 36, b.top - pad], bl: [b.left - pad, b.bottom + pad - 36], br: [b.right + pad - 36, b.bottom + pad - 36] };
    brackets.forEach(el => {
      const [x, y] = spots[el.classList[1]];
      el.style.opacity = f < scene.brackets.f ? '0' : String(k);
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  function drawLogo(f) {
    if (!logo) return;
    const t = ms(f);
    const k = easeOutCubic((t - ms(logo.f)) / LOGO_MS);
    logo.mark.style.opacity = f < logo.f ? '0' : String(k);
    logo.mark.style.filter = `blur(${16 * (1 - k)}px)`;
    logo.mark.style.transform = `scale(${0.9 + 0.1 * k})`;
    const p = easeOutCubic((t - ms(logo.pillF)) / LOGO_MS);
    logo.pill.style.opacity = f < logo.pillF ? '0' : String(p);
    logo.pill.style.filter = `blur(${10 * (1 - p)}px)`;
    logo.pill.style.transform = `translateY(${24 * (1 - p)}px)`;
  }

  function render(f, pointer) {
    if (camera) moveCamera(f);
    drawFloats(f);
    drawBrackets(f);
    drawWords(f);
    drawLogo(f);
    curves.forEach((p, i) => {
      p.style.strokeDashoffset = scene.curves === 'drawn' ? '0' : String(1 - easeOutCubic((f - 5 * i) / 45));
    });
    sparks.forEach((p, i) => {
      p.style.strokeDashoffset = String(1 - easeOutCubic((f - 4 - 2 * i) / 18));
    });
    for (const { r, col } of cells) r.style.opacity = String(clamp01((f - col * 0.5) / 5));
    cursor.style.display = pointer ? '' : 'none';
    if (pointer) cursor.style.transform = `translate(${pointer.x - 6}px, ${pointer.y - 4}px) scale(${pointer.down ? 0.9 : 1})`;
  }

  window.__promo = { setup, render };
})();
