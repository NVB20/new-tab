// Claude Code PreToolUse hook (Bash, PowerShell) for `git commit` in this repo. When the change
// looks like a new user-facing feature that first-run setup doesn't know about, it stops the
// commit once and has Claude ask the user whether to add it to setup. See docs/onboarding.md,
// "The commit check". It only reads (git diff, git status, git show); if anything goes wrong it
// lets the commit through.
//
// stdin: the hook input ({ tool_input: { command }, cwd }). stdout: nothing (go ahead) or a
// PreToolUse decision that denies the call with the reason Claude acts on.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const SETUP_FILES = ['js/onboarding.js', 'docs/onboarding.md'];
const COMMIT = /\bgit(?:\s+-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+))*\s+commit(?:\s|$)/;
const ANSWERED = /Onboarding:\s*(not needed|added)/i;
const STOPWORDS = new Set(['and', 'the', 'with', 'your', 'for', 'from', 'widget', 'widgets']);

const unquote = s => s.replace(/^(["'])(.*)\1$/, '$2');
// Git Bash spells C:\ as /c/.
const nativePath = p => (process.platform === 'win32' ? p.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:') : p);
const words = s => s.split(/[^A-Za-z0-9]+/).filter(w => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()));

// Shell-ish argument split: whitespace outside quotes.
function args(text) {
  return [...text.matchAll(/"[^"]*"|'[^']*'|\S+/g)].map(m => unquote(m[0]));
}

// The repo the commit runs in: `git -C <dir> commit`, a leading `cd <dir> &&` (or `;`), else the
// session's directory; then its top level.
function repoRoot(command, cwd) {
  const viaC = command.match(/\bgit\s+-C\s+("[^"]*"|'[^']*'|\S+)[^\n]*?\scommit\b/);
  const viaCd = command.match(/^\s*(?:cd|Set-Location)\s+("[^"]*"|'[^']*'|[^\s;&]+)\s*(?:&&|;)/);
  let dir = nativePath(cwd || process.cwd());
  if (!existsSync(dir)) dir = process.cwd();   // e.g. an MSYS-only path such as /tmp/…
  const picked = viaC?.[1] ?? viaCd?.[1];
  if (picked) {
    const p = nativePath(unquote(picked));
    dir = isAbsolute(p) ? p : resolve(dir, p);
  }
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// What the commit will hold: what's staged, plus what the same command stages first
// (`git add … && git commit`) or commits straight from the working tree (`-a`, `-- paths`).
function change(root, command) {
  // Line endings as LF: a Windows checkout may have CRLF files.
  const lf = s => s.replace(/\r\n/g, '\n');
  const git = (...a) => lf(execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
  const readText = path => lf(readFileSync(join(root, path), 'utf8'));
  const files = new Map();   // path → { status, fromTree }
  for (const line of git('diff', '--cached', '--name-status', '--no-renames').split('\n').filter(Boolean)) {
    const [status, path] = line.split('\t');
    files.set(path, { status: status[0], fromTree: false });
  }
  const specs = [];
  let everything = false;
  for (const m of command.matchAll(/\bgit\s+add\s+([^&;|\n]+)/g)) {
    for (const a of args(m[1])) {
      if (a === '-A' || a === '--all' || a === '.') everything = true;
      else if (!a.startsWith('-')) specs.push(a);
    }
  }
  const commitPart = command.slice(command.search(COMMIT));
  const tail = commitPart.match(/\s--\s+([^&;|\n]+)/);
  if (tail) specs.push(...args(tail[1]));
  const trackedOnly = /\scommit\b[^&;|\n]*\s(?:-[b-zA-Z]*a[a-zA-Z]*|--all)(?=\s|$)/.test(commitPart);
  if (everything || specs.length || trackedOnly) {
    const listed = everything || trackedOnly ? [] : ['--', ...specs];
    const lines = git('status', '--porcelain=v1', '--untracked-files=all', ...listed).split('\n').filter(Boolean);
    for (const line of lines) {
      const xy = line.slice(0, 2);
      const path = line.slice(3).replace(/^"|"$/g, '');
      if (xy === '??' && trackedOnly && !everything && !specs.length) continue;
      const status = xy === '??' ? 'A' : (xy.trim()[0] || 'M');
      files.set(path, { status, fromTree: true });
    }
  }
  const added = path => {
    const f = files.get(path);
    if (!f || f.status === 'D') return [];
    let text;
    try {
      text = f.fromTree ? git('diff', 'HEAD', '-U0', '--', path) : git('diff', '--cached', '-U0', '--', path);
      if (!text && f.status === 'A') return readText(path).split('\n');
    } catch {
      return f.status === 'A' && existsSync(join(root, path)) ? readText(path).split('\n') : [];
    }
    return text.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1));
  };
  const current = path => {
    const f = files.get(path);
    try {
      return f?.fromTree ? readText(path) : git('show', `:${path}`);
    } catch {
      return '';
    }
  };
  const atHead = path => {
    try {
      return git('show', `HEAD:${path}`);
    } catch {
      return '';
    }
  };
  return { files, added, current, atHead, message: commitPart };
}

// The keys of an object literal `const NAME = { … };` in a source file.
function keysOf(source, name) {
  const start = source.indexOf(`const ${name} = {`);
  if (start < 0) return null;
  const end = source.indexOf('\n};', start);
  const block = source.slice(start, end < 0 ? undefined : end);
  return new Set([...block.matchAll(/(?:^|[{\s,])([a-z][A-Za-z0-9]*):/g)].map(m => m[1]));
}

function signals(c) {
  const reasons = [];
  const has = path => c.files.has(path);
  const doc = (c.current('docs/onboarding.md') || c.atHead('docs/onboarding.md')).toLowerCase();
  const mentioned = name => words(name).some(w => doc.includes(w.toLowerCase()));

  // A new widget type that setup's Widgets step doesn't offer.
  if (has('js/layout.js')) {
    const offered = keysOf(c.current('js/onboarding.js'), 'WIDGETS') ?? new Set();
    const before = c.atHead('js/layout.js');
    for (const line of c.added('js/layout.js')) {
      const type = line.match(/^ {2}([a-z][A-Za-z0-9]*): \{/)?.[1];
      if (!type || type === 'tiles' || offered.has(type)) continue;
      if (before.includes(`\n  ${type}: {`)) continue;
      reasons.push(`a new widget type "${type}" in js/layout.js that setup's Widgets step doesn't offer (WIDGETS in js/onboarding.js)`);
    }
  }

  // A new row in the README's "What's on the page" table.
  if (has('README.md')) {
    const before = c.atHead('README.md');
    for (const line of c.added('README.md')) {
      const name = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/)?.[1];
      if (!name || before.includes(`| **${name}** |`) || mentioned(name)) continue;
      reasons.push(`a new feature row "${name}" in the README's "What's on the page" table that docs/onboarding.md doesn't mention`);
    }
  }

  // A new Preferences section.
  if (has('js/prefs.js')) {
    const before = c.atHead('js/prefs.js');
    for (const line of c.added('js/prefs.js')) {
      const m = line.match(/\{\s*id:\s*'([a-z-]+)',\s*label:\s*'([^']+)'/);
      if (!m || before.includes(`id: '${m[1]}', label:`) || mentioned(m[2])) continue;
      reasons.push(`a new Preferences section "${m[2]}" in js/prefs.js`);
    }
  }

  // A new module in a feat commit.
  if (/\bfeat(?:\([^)]*\))?!?:/.test(c.message)) {
    for (const [path, f] of c.files) {
      if (f.status !== 'A' || !/^js\/[^/]+\.js$/.test(path) || /^js\/(onboarding|suggest)/.test(path)) continue;
      reasons.push(`a new module ${path} in a feat commit`);
    }
  }
  return reasons;
}

export function check(input) {
  const command = String(input?.tool_input?.command ?? '');
  if (!COMMIT.test(command) || ANSWERED.test(command)) return null;
  const root = repoRoot(command, input?.cwd);
  if (!root || !existsSync(join(root, 'js', 'onboarding.js'))) return null;
  const c = change(root, command);
  if (!c.files.size || SETUP_FILES.some(f => c.files.has(f))) return null;
  const reasons = signals(c);
  if (!reasons.length) return null;
  const list = reasons.map(r => `- ${r}`).join('\n');
  return {
    systemMessage: 'Onboarding check: this commit looks like a new feature. Asking whether it belongs in first-run setup.',
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: [
        'Onboarding check (docs/onboarding.md, "The commit check"): this commit looks like a new user-facing feature that first-run setup doesn\'t cover yet:',
        list,
        'Before committing, ask the user with AskUserQuestion whether to add it to first-run setup, saying in one line where it would go (Widgets, Connect, Moves or a new step). Recommend one answer. Don\'t decide for them.',
        '- If they say add it: add it as docs/onboarding.md "Adding a feature to setup" describes (js/onboarding.js, docs/onboarding.md, README First run), then commit it with the feature. Touching js/onboarding.js or docs/onboarding.md lets the commit through.',
        '- If they say no: commit again with the line "Onboarding: not needed" in the commit message. If it\'s a lasting decision, also add it under "Left out on purpose" in docs/onboarding.md.',
      ].join('\n'),
    },
  };
}

// Run as the hook (not when imported for a test).
if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', d => { raw += d; });
  process.stdin.on('end', () => {
    try {
      const out = check(JSON.parse(raw || '{}'));
      if (out) process.stdout.write(JSON.stringify(out));
    } catch {
      // never block a commit on the check's own failure
    }
    process.exit(0);
  });
}
