// Installability and service-worker guards.
//
// WHY THIS FILE EXISTS
//
// A service worker is the only part of a web app that can outlive a bad
// deploy. Get it wrong and returning visitors are pinned to a broken build by
// the very cache that is supposed to make the app fast, and the fix you ship
// is the thing they will not fetch. So the rules the worker is written around
// are asserted here as text, rather than trusted to survive future edits.
//
// It also pins the bug that actually happened while this was being built. The
// Vite plugin substituted its placeholders with String.replace and a string
// pattern, which replaces the FIRST match only, and the first match was a
// mention of the token in the template's own header comment. The real
// assignment shipped as `const PRECACHE_URLS = __PRECACHE__` — an undeclared
// identifier that throws the moment the browser evaluates the worker. The
// build printed "[pwa] wrote sw.js" and exited 0. Nothing failed. The only
// symptom would have been a console warning on a stranger's phone and no
// offline mode, forever.
//
// These are source-level assertions: the worker is not importable under
// node --test (it references `self` and a global fetch event), so it is read
// and checked as text, the same way test/firstRun.test.mjs checks App.jsx.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');

const SW = read('src/service-worker.js');
const MANIFEST_RAW = read('public/manifest.webmanifest');
const INDEX = read('index.html');
const VERCEL = JSON.parse(read('vercel.json'));

// ─── THE SUBSTITUTION BUG ────────────────────────────────────────────────────

test('each build placeholder appears exactly once in the worker template', () => {
  // Exactly once, not merely present. The plugin substitutes them, and a
  // second occurrence anywhere (including in a comment) is what caused the
  // real assignment to be skipped.
  for (const token of ['__BUILD_ID__', '__PRECACHE__']) {
    const count = SW.split(token).length - 1;
    assert.equal(count, 1, `${token} must appear exactly once, found ${count}`);
  }
});

test('the placeholders are used as values, not left dangling', () => {
  assert.match(SW, /const BUILD_ID = "__BUILD_ID__";/);
  assert.match(SW, /const PRECACHE_URLS = __PRECACHE__;/);
});

// ─── THE CACHING RULES THAT KEEP A LIVE SITE SAFE ────────────────────────────

test('the API is never served from cache', () => {
  // Caching /api/ would mean serving a stale import job, a stale entitlement,
  // or a stale checkout session. Correctness bug, not a perf win.
  assert.match(
    SW,
    /if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/,
    'the worker must bail out of anything under /api/'
  );
});

test('cross-origin requests are never intercepted', () => {
  // Supabase auth tokens, Stripe, PostHog. Not ours to cache.
  assert.match(SW, /if \(url\.origin !== self\.location\.origin\) return;/);
});

test('non-GET requests are never intercepted', () => {
  assert.match(SW, /if \(request\.method !== "GET"\) return;/);
});

test('HTML is served network-first, never cache-first', () => {
  // The load-bearing rule. Network-first navigation is what guarantees a new
  // deploy reaches every online user on their next page load, whether or not
  // the worker itself has updated yet.
  assert.match(
    SW,
    /request\.mode === "navigate"[\s\S]{0,120}networkFirstNavigation/,
    'navigations must go through networkFirstNavigation'
  );
  assert.doesNotMatch(
    SW,
    /request\.mode === "navigate"[\s\S]{0,120}cacheFirst/,
    'navigations must never be cache-first'
  );
});

test('cache-first is reserved for content-hashed assets', () => {
  // Safe only because Vite puts the content hash in the filename, so a given
  // URL can never legitimately change its bytes.
  assert.match(SW, /const HASHED_ASSET = \/\^\\\/assets\\\/.+\$\//);
  assert.match(SW, /HASHED_ASSET\.test\(url\.pathname\)[\s\S]{0,80}cacheFirst/);
});

test('the worker does not call skipWaiting on install', () => {
  // A new worker must wait for every tab to close rather than swapping itself
  // under someone who is forty rows into a blanket. The only skipWaiting in
  // the file is the opt-in message handler, which nothing calls today.
  const installBlock = SW.slice(SW.indexOf('addEventListener("install"'), SW.indexOf('addEventListener("activate"'));
  assert.ok(
    !installBlock.includes('skipWaiting'),
    'install must not call skipWaiting'
  );
});

test('stale caches are dropped on activate', () => {
  assert.match(SW, /caches\.delete\(key\)/);
});

// ─── THE MANIFEST ────────────────────────────────────────────────────────────

test('the manifest is valid JSON with the fields an install prompt requires', () => {
  const m = JSON.parse(MANIFEST_RAW);
  assert.equal(m.name, 'Wovely: Crochet Pattern Organizer');
  assert.equal(m.short_name, 'Wovely');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/?utm_source=pwa');
  assert.equal(m.scope, '/');
  // Matches the theme-color meta in index.html and the brand accent in
  // src/index.css (--accent).
  assert.equal(m.theme_color, '#7B6AD4');
  assert.equal(m.background_color, '#EFE9FB');
});

test('the manifest ships both a 512 any icon and a 512 maskable icon', () => {
  const m = JSON.parse(MANIFEST_RAW);
  const has = (size, purpose) =>
    m.icons.some((i) => i.sizes === `${size}x${size}` && i.purpose === purpose);
  // Android will not offer installation without a 192 and a 512.
  assert.ok(has(192, 'any'), 'missing 192 any');
  assert.ok(has(512, 'any'), 'missing 512 any');
  // Without a maskable icon Android shrinks the icon onto a white plate,
  // which looks like a broken third-party app next to real ones.
  assert.ok(has(192, 'maskable'), 'missing 192 maskable');
  assert.ok(has(512, 'maskable'), 'missing 512 maskable');
});

test('every file the manifest names actually exists', () => {
  // A manifest that references a missing icon makes the install prompt never
  // appear, with nothing in the browser UI to say why.
  const m = JSON.parse(MANIFEST_RAW);
  const srcs = [
    ...m.icons.map((i) => i.src),
    ...(m.shortcuts || []).flatMap((s) => (s.icons || []).map((i) => i.src)),
  ];
  for (const src of srcs) {
    const file = path.resolve('public', src.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `manifest names ${src} but public${src} does not exist`);
  }
});

test('manifest shortcuts point at routes that are actually public', () => {
  const m = JSON.parse(MANIFEST_RAW);
  const publicPaths = Object.keys(VERCEL.rewrites.reduce((acc, r) => {
    acc[r.source] = true;
    return acc;
  }, {}));
  for (const s of m.shortcuts || []) {
    const pathname = s.url.split('?')[0];
    assert.ok(
      publicPaths.includes(pathname),
      `shortcut ${s.url} has no rewrite in vercel.json and would open the app shell`
    );
  }
});

// ─── THE HTML HEAD ───────────────────────────────────────────────────────────

test('index.html links the manifest and declares itself app-capable', () => {
  assert.match(INDEX, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  assert.match(INDEX, /<meta name="mobile-web-app-capable" content="yes" \/>/);
  // iOS versions that ignore the manifest's display mode read this one.
  assert.match(INDEX, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
});

test('the viewport does NOT opt into viewport-fit=cover', () => {
  // Deliberate. viewport-fit=cover changes landscape layout on notched
  // iPhones in the ordinary browser, and wovely.app is live. The standalone
  // PWA does not need it (status-bar-style `default` keeps iOS reserving the
  // bar). Only the Capacitor shell does, and it sets it at runtime.
  const viewport = INDEX.match(/<meta name="viewport"[^>]*>/)[0];
  assert.ok(
    !viewport.includes('viewport-fit'),
    'viewport-fit in index.html would change live browser layout on notched iPhones'
  );
});

test('the apple-touch-icon cache-buster was bumped when the file changed', () => {
  // The 180x180 shipped fully transparent, and iOS composites an
  // apple-touch-icon onto BLACK, so every iPhone home screen showed a black
  // tile. Regenerating it without bumping the query would have left that on
  // every device that had already cached it.
  assert.match(INDEX, /apple-touch-icon\.png\?v=3/);
});

// ─── DELIVERY ────────────────────────────────────────────────────────────────

test('sw.js is served must-revalidate', () => {
  // The escape hatch. If a bad worker ever ships, the fix is a new sw.js — and
  // a cached sw.js is a worker that can never be replaced.
  const rule = VERCEL.headers.find((h) => h.source === '/sw.js');
  assert.ok(rule, 'vercel.json has no header rule for /sw.js');
  const cc = rule.headers.find((h) => h.key === 'Cache-Control').value;
  assert.match(cc, /max-age=0/);
  assert.match(cc, /must-revalidate/);
});

test('the catch-all rewrite still cannot swallow the worker or the manifest', () => {
  // Both filenames contain a dot, and the catch-all excludes anything with a
  // dot. If that regex is ever loosened, /sw.js would start returning HTML,
  // which registers as a worker that 404s everything it precaches.
  const catchAll = VERCEL.rewrites.at(-1);
  const re = new RegExp(catchAll.source);
  for (const p of ['/sw.js', '/manifest.webmanifest', '/icons/icon-512.png']) {
    assert.ok(!re.test(p), `${p} is being swallowed by the catch-all rewrite`);
  }
});
