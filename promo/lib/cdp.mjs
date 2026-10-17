// A small Chrome DevTools Protocol client over Node 22's built-in WebSocket (flat sessions), and
// Playwright's Chromium launched headless with the unpacked extension (branded Chrome ignores
// --load-extension).
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// PROMO_CHROME if set, else the newest Chromium Playwright installed.
export function chromePath() {
  if (process.env.PROMO_CHROME) return process.env.PROMO_CHROME;
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  let dirs = [];
  try {
    dirs = readdirSync(root).filter(d => /^chromium-\d+$/.test(d));
  } catch {
    // no Playwright browsers at all
  }
  dirs.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  if (!dirs.length) throw new Error(`No Playwright Chromium in ${root}: run npx playwright install chromium, or set PROMO_CHROME`);
  return join(root, dirs[0], 'chrome-win64', 'chrome.exe');
}

// Ends Chromium and its child processes (on Windows they'd otherwise keep the profile locked).
export async function stop(proc) {
  if (proc.exitCode != null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(proc.pid)], { stdio: 'ignore' });
  else proc.kill();
  await sleep(300);
}

export async function launch({ ext, profile, port, width, height }) {
  const proc = spawn(chromePath(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--load-extension=${ext}`, `--disable-extensions-except=${ext}`,
    `--window-size=${width},${height}`, '--force-device-scale-factor=1', '--force-color-profile=srgb',
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      return { proc, wsUrl: version.webSocketDebuggerUrl };
    } catch {
      await sleep(100);
    }
  }
  await stop(proc);
  throw new Error(`Chromium didn't open port ${port}`);
}

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let next = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, method } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const on = fn => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const session = sessionId => ({
    id: sessionId,
    send: (method, params) => send(method, params, sessionId),
    on: (method, fn) => on(msg => {
      if (msg.sessionId === sessionId && msg.method === method) fn(msg.params);
    }),
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
  });
  const attach = async targetId => session((await send('Target.attachToTarget', { targetId, flatten: true })).sessionId);
  return { send, on, attach, close: () => ws.close() };
}

// The unpacked extension's id, read from its service worker (Chromium also runs a component
// extension with a background.js of its own, so match the manifest's name).
export async function extensionId(cdp, name) {
  for (let i = 0; i < 50; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    for (const t of targetInfos.filter(x => x.type === 'service_worker' && x.url.endsWith('/background.js'))) {
      const worker = await cdp.attach(t.targetId);
      // A worker may not have its chrome object yet, or not be an extension's at all.
      const id = await worker.eval(`globalThis.chrome?.runtime?.getManifest?.().name === ${JSON.stringify(name)} ? chrome.runtime.id : null`).catch(() => null);
      if (id) return id;
    }
    await sleep(100);
  }
  throw new Error(`The "${name}" extension didn't start`);
}

export async function closePages(cdp) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  for (const t of targetInfos.filter(x => x.type === 'page')) await cdp.send('Target.closeTarget', { targetId: t.targetId });
}
