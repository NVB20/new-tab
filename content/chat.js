// Content script on claude.ai, chatgpt.com and gemini.google.com. To send a message from the search
// bar, the new tab stores it in chrome.storage.local and opens the site's new chat with #nt=<id>;
// this types the message into the box and presses send. Pages opened any other way are left alone.
// A classic script (content scripts can't be modules); the tests load it into a vm context.

const HANDOFF_KEY = 'chatHandoffs';   // keep in step with js/ask.js
const HANDOFF_TTL = 2 * 60e3;
const COMPOSER_WAIT = 20e3;
const SEND_WAIT = 10e3;

// Each site's message box and send button. The first selector that matches wins.
const SITES = {
  'claude.ai': {
    engine: 'claude',
    composer: 'div.ProseMirror[contenteditable="true"]',
    send: 'button[aria-label*="send" i]',
  },
  'chatgpt.com': {
    engine: 'chatgpt',
    composer: '#prompt-textarea, div.ProseMirror[contenteditable="true"]',
    send: '#composer-submit-button, button[data-testid="send-button"], button[aria-label*="send" i]',
  },
  'gemini.google.com': {
    engine: 'gemini',
    composer: 'rich-textarea .ql-editor[contenteditable="true"], .ql-editor[contenteditable="true"]',
    send: 'button.send-button, button[aria-label*="send" i]',
  },
};

function siteFor(hostname) {
  return Object.hasOwn(SITES, hostname) ? SITES[hostname] : null;
}

// '#nt=<id>' → id; anything else → null.
function handoffId(hash) {
  return /^#nt=([\w-]{1,64})$/.exec(hash)?.[1] ?? null;
}

// The stored message with this id if it is for this site and recent enough, and the list without
// it or any message too old to be picked up (one whose chat never opened).
function takeHandoff(list, id, engine, now) {
  const all = Array.isArray(list) ? list : [];
  const hit = all.find(h => h?.id === id);
  const fresh = hit && hit.engine === engine && typeof hit.text === 'string' && now >= hit.at && now - hit.at < HANDOFF_TTL;
  return { text: fresh ? hit.text : null, rest: all.filter(h => h !== hit && now - h?.at < HANDOFF_TTL) };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(find, timeout) {
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(200)) {
    const found = find();
    if (found) return found;
  }
  return null;
}

// The enabled send button: next to the message box first, then anywhere on the page.
function sendButton(composer, selector) {
  const near = composer.closest('form, fieldset');
  const buttons = [...(near ? near.querySelectorAll(selector) : []), ...document.querySelectorAll(selector)];
  return buttons.find(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true') ?? null;
}

// A <textarea> takes the value through its native setter, so the page's framework sees the change.
// A rich editor gets a paste, which turns line breaks into paragraphs (and long text into an
// attachment, as a real paste would); if the editor didn't take it, the text is typed in instead.
function insert(composer, text) {
  composer.focus();
  if (composer instanceof HTMLTextAreaElement) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(composer, text);
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const data = new DataTransfer();
  data.setData('text/plain', text);
  const unhandled = composer.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  if (unhandled) document.execCommand('insertText', false, text);
}

async function run(site, id) {
  const stored = (await chrome.storage.local.get(HANDOFF_KEY))[HANDOFF_KEY];
  const { text, rest } = takeHandoff(stored, id, site.engine, Date.now());
  await chrome.storage.local.set({ [HANDOFF_KEY]: rest });
  if (!text) return;
  const composer = await waitFor(() => document.querySelector(site.composer), COMPOSER_WAIT);
  if (!composer) return;   // e.g. signed out
  insert(composer, text);
  // Without a send button the text stays in the box for the user to send.
  (await waitFor(() => sendButton(composer, site.send), SEND_WAIT))?.click();
}

const site = globalThis.chrome?.storage ? siteFor(location.hostname) : null;
const id = site && handoffId(location.hash);
if (id) {
  history.replaceState(history.state, '', location.pathname + location.search);
  run(site, id);
}
