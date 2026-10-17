import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankSites, siteName, barItems } from '../js/suggest.js';

const visit = (url, title, visitCount = 1) => ({ url, title, visitCount });

test('rankSites groups pages by site and ranks the sites by visits', () => {
  const sites = rankSites([
    visit('https://mail.google.com/mail/u/0/#inbox', 'Inbox (3) - me@gmail.com - Gmail', 40),
    visit('https://mail.google.com/mail/u/0/#sent', 'Sent Mail - me@gmail.com - Gmail', 5),
    visit('https://www.youtube.com/', 'YouTube', 30),
    visit('https://www.youtube.com/watch?v=1', 'A video - YouTube', 20),
    visit('https://github.com/', 'GitHub', 3),
  ]);
  assert.deepEqual(sites.map(s => [s.host, s.visits]), [['youtube.com', 50], ['mail.google.com', 45], ['github.com', 3]]);
  assert.deepEqual(sites.map(s => s.title), ['YouTube', 'Gmail', 'GitHub']);
  assert.deepEqual(sites.map(s => s.url), ['https://www.youtube.com/', 'https://mail.google.com/', 'https://github.com/']);
});

test('rankSites leaves out non-web pages, local servers, search results and sign-in pages', () => {
  const sites = rankSites([
    visit('chrome://settings/', 'Settings', 50),
    visit('file:///C:/notes.txt', 'notes', 50),
    visit('http://localhost:5500/newtab.html', 'New Tab', 50),
    visit('http://127.0.0.1:8080/', 'Dev', 50),
    visit('https://www.google.com/search?q=cats', 'cats - Google Search', 50),
    visit('https://www.bing.com/search?q=dogs', 'dogs - Search', 50),
    visit('https://duckduckgo.com/?q=x', 'x at DuckDuckGo', 50),
    visit('https://accounts.google.com/signin/v2', 'Sign in - Google Accounts', 50),
    visit('https://example.com/login', 'Log in', 50),
    visit('https://example.com/', 'Example Domain', 2),
  ]);
  assert.deepEqual(sites.map(s => [s.host, s.visits]), [['example.com', 2]]);
});

test('rankSites leaves out sites already on a tile and keeps the top ones', () => {
  const items = Array.from({ length: 20 }, (_, i) => visit(`https://site${i}.com/`, `Site ${i}`, 100 - i));
  const sites = rankSites(items, { exclude: ['https://www.site0.com/page', 'https://site1.com'], limit: 5 });
  assert.deepEqual(sites.map(s => s.host), ['site2.com', 'site3.com', 'site4.com', 'site5.com', 'site6.com']);
});

test('siteName finds the site’s own name in its pages’ titles', () => {
  assert.equal(siteName('calendar.google.com', [{ title: 'Google Calendar - Week of 12 October 2026', visits: 3 }]), 'Google Calendar');
  assert.equal(siteName('linkedin.com', [{ title: '(5) Feed | LinkedIn', visits: 9 }]), 'LinkedIn');
  assert.equal(siteName('github.com', [{ title: 'NVB20/new-tab: A new tab page', visits: 9 }, { title: 'Pull requests · GitHub', visits: 2 }]), 'GitHub');
  assert.equal(siteName('web.whatsapp.com', [{ title: '(12) WhatsApp', visits: 4 }]), 'WhatsApp');
  assert.equal(siteName('news.ycombinator.com', [{ title: 'Hacker News', visits: 4 }]), 'Hacker News');
  assert.equal(siteName('mail.google.com', [{ title: 'Inbox (3) - me@gmail.com - Gmail', visits: 4 }]), 'Gmail');
});

test('siteName falls back to the site’s own label, or its host', () => {
  assert.equal(siteName('example.co.il', [{ title: 'Welcome', visits: 1 }]), 'Example');
  assert.equal(siteName('x.com', [{ title: '', visits: 1 }]), 'x.com');
});

test('barItems reads the bookmarks bar: links, and folders with their links one level down', () => {
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Bookmarks bar', children: [
      { id: '10', title: 'Drive', url: 'https://drive.google.com/' },
      { id: '11', title: '', url: 'https://developer.mozilla.org/en-US/' },
      { id: '12', title: 'Reading', children: [
        { id: '20', title: 'A', url: 'https://a.com/' },
        { id: '21', title: 'Deeper', children: [{ id: '30', title: 'B', url: 'https://b.com/' }] },
      ] },
      { id: '13', title: 'Empty', children: [] },
      { id: '14', title: 'Script', url: 'javascript:void(0)' },
    ] },
    { id: '2', title: 'Other bookmarks', children: [] },
  ] }];
  assert.deepEqual(barItems(tree), [
    { id: '10', title: 'Drive', url: 'https://drive.google.com/' },
    { id: '11', title: 'developer.mozilla.org', url: 'https://developer.mozilla.org/en-US/' },
    { id: '12', title: 'Reading', links: [{ id: '20', title: 'A', url: 'https://a.com/' }] },
  ]);
  assert.deepEqual(barItems([]), []);
});
