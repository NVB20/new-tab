// Content script on claude.ai. To send a message to Claude, the new tab stores it in
// chrome.storage.local and opens claude.ai/new#nt=<id>; this types the message into the box and
// presses send. Any page opened without that fragment is left alone.
// A classic script (content scripts can't be modules); the tests load it into a vm context.

const HANDOFF_KEY = 'claudeHandoffs';   // keep in step with js/ask.js
const HANDOFF_TTL = 2 * 60e3;
const COMPOSER_WAIT = 20e3;
const SEND_WAIT = 10e3;
const COMPOSER = 'div.ProseMirror[contenteditable="true"]';
const SEND = 'button[aria-label*="send" i]';

// '#nt=<id>' → id; anything else → null.
function handoffId(hash) {
  return /^#nt=([\w-]{1,64})$/.exec(hash)?.[1] ?? null;
}

// The stored message with this id if it is recent enough, and the list without it.
function takeHandoff(list, id, now) {
  const all = Array.isArray(list) ? list : [];
  const hit = all.find(h => h?.id === id);
  const fresh = hit && typeof hit.text === 'string' && now >= hit.at && now - hit.at < HANDOFF_TTL;
  return { text: fresh ? hit.text : null, rest: all.filter(h => h !== hit) };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(find, timeout) {
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(200)) {
    const found = find();
    if (found) return found;
  }
  return null;
}

// The enabled send button next to the message box.
function sendButton(composer) {
  const scope = composer.closest('fieldset, form') ?? document;
  return [...scope.querySelectorAll(SEND)].find(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true') ?? null;
}

// Pasting lets the editor turn line breaks into paragraphs (and long text into an attachment, as
// a real paste would). If the editor didn't take the paste, type the text in instead.
function insert(composer, text) {
  composer.focus();
  const data = new DataTransfer();
  data.setData('text/plain', text);
  const unhandled = composer.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  if (unhandled) document.execCommand('insertText', false, text);
}

async function run(id) {
  const stored = (await chrome.storage.local.get(HANDOFF_KEY))[HANDOFF_KEY];
  const { text, rest } = takeHandoff(stored, id, Date.now());
  await chrome.storage.local.set({ [HANDOFF_KEY]: rest });
  if (!text) return;
  const composer = await waitFor(() => document.querySelector(COMPOSER), COMPOSER_WAIT);
  if (!composer) return;   // e.g. signed out
  insert(composer, text);
  // Without a send button the text stays in the box for the user to send.
  (await waitFor(() => sendButton(composer), SEND_WAIT))?.click();
}

const id = globalThis.chrome?.storage ? handoffId(location.hash) : null;
if (id) {
  history.replaceState(history.state, '', location.pathname + location.search);
  run(id);
}
