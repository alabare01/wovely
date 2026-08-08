// Guest-demo guard.
//
// WHY THIS FILE EXISTS
// Between 2026-07-17 and 2026-08-06 Wovely took zero signups and zero pattern
// uploads while autocapture showed people clicking "Try Wovely free" and then
// leaving. That click only switches screens, and the screen it lands on used to
// offer two cards that both asked the visitor to commit to something: go find a
// PDF, or start crocheting a mushroom. Nothing on the screen was "show me what
// this does", and nothing on the screen was instrumented, so the collapse was
// invisible.
//
// The demo is the fix. Two properties make it work, and both are the kind of
// thing that gets quietly undone by a later refactor:
//
//   1. It costs the visitor NOTHING. No account, no anonymous sign-in, no
//      import job, no library pattern, and therefore nothing spent against the
//      five-pattern free cap. That is not a promise in copy, it is the absence
//      of any code in GuestDemo.jsx that could do it. This suite asserts that
//      absence, because "the demo quietly signs you in now" is exactly the sort
//      of change that would look harmless in a diff.
//
//   2. It is not a dead end. Both real entry points still run through
//      tryFork(), which writes wovely_first_run_intent for App.jsx to pick up.
//
// Plus the telemetry, without which the next three-week collapse is as
// invisible as the last one.
//
// Source-level assertions: these are JSX files and node --test cannot import
// them without a transform, so they are read and checked as text. Same approach
// as test/firstRun.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const AUTH = read('../src/Auth.jsx');
const DEMO = read('../src/GuestDemo.jsx');
const APP = read('../src/App.jsx');

// Comments explain what the code deliberately does NOT do, so they name the
// very things the "costs nothing" check forbids. Strip them, then assert
// against the code that actually runs.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const DEMO_CODE = stripComments(DEMO);

// ── The demo has to stay free ────────────────────────────────────────────────

const FORBIDDEN = [
  [/signInAnonymously/, 'the demo must never create a session, anonymous or otherwise'],
  [/supabase/i, 'the demo must not touch Supabase, it renders from a constant in this file'],
  [/\bfetch\s*\(/, 'the demo must not make network calls; a stranger on a bad connection still gets the product'],
  [/sessionStorage/, 'the demo must not persist anything; progress lives in React state and then it is gone'],
  [/localStorage/, 'the demo must not persist anything; progress lives in React state and then it is gone'],
  [/import-job|import_job/, 'the demo must not enqueue an import; that is what "Start this one for real" is for'],
];

/** @returns {string|null} the reason the source costs the visitor something, or null */
const costsSomething = (code) => {
  for (const [re, why] of FORBIDDEN) if (re.test(code)) return why;
  return null;
};

test('demo: costs the visitor nothing: no auth, no network, no persistence', () => {
  assert.equal(costsSomething(DEMO_CODE), null, 'GuestDemo.jsx: ' + costsSomething(DEMO_CODE));
});

test('demo: the "costs nothing" guard is actually capable of failing', () => {
  // A guard that cannot fail is decoration. Feed it the exact change it exists
  // to catch, the demo quietly signing the visitor in, and require a refusal.
  const sneaked = DEMO_CODE.replace('const started = doneCount > 0;',
    'const started = doneCount > 0; supabaseAuth.signInAnonymously();');
  assert.notEqual(sneaked, DEMO_CODE, 'the fixture did not apply; update it to match GuestDemo.jsx');
  assert.ok(costsSomething(sneaked), 'the guard accepted a demo that signs the visitor in');
});

test('demo: cannot create a library pattern, so it cannot spend a free slot', () => {
  // The five-pattern cap is counted by countActivePatterns(userPatterns) in
  // App.jsx. userPatterns is only ever fed by the import pipeline. The demo is
  // rendered by Auth.jsx, which is the signed-out tree and has no access to
  // that state at all, so assert the demo never even names it.
  assert.doesNotMatch(DEMO, /userPatterns|setUserPatterns|countActivePatterns/,
    'GuestDemo.jsx reaches into library state. The demo must not be able to add a pattern.');
  assert.doesNotMatch(DEMO, /handleAddPattern|startAndOpenPattern/,
    'GuestDemo.jsx calls into the real pattern pipeline. The demo must stay a demo.');
});

// ── The demo has to be reachable, and has to lead somewhere ──────────────────

test('demo: the fork screen offers it', () => {
  assert.match(AUTH, /<GuestForkRow onDemo=\{onDemo\}/,
    'The try screen no longer passes onDemo to the fork row; the zero-commitment path is gone');
  assert.match(AUTH, /className="fork" onClick=\{onDemo\}/,
    'No card on the fork row is wired to the demo');
  assert.match(AUTH, /screen === "demo" && \(\s*<GuestDemo/,
    'Auth.jsx no longer renders GuestDemo for the "demo" screen');
});

test('demo: both ways out run the existing guest-mode fork, not a new one', () => {
  assert.match(AUTH, /onStartReal=\{\(\) => tryFork\("starter"\)\}/,
    'The demo\'s primary CTA must go through tryFork("starter"), the real starter import');
  assert.match(AUTH, /onImportOwn=\{\(\) => tryFork\("import"\)\}/,
    'The demo\'s secondary CTA must go through tryFork("import")');
  assert.match(DEMO, /onStartReal/, 'GuestDemo dropped its start-for-real path and is now a dead end');
  assert.match(DEMO, /onImportOwn/, 'GuestDemo dropped its import path');
});

// ── Do not break what works: the first-run intent contract ───────────────────

test('first-run intent: tryFork still writes it and App still reads it', () => {
  assert.match(AUTH, /sessionStorage\.setItem\("wovely_first_run_intent", intent\)/,
    'tryFork no longer stashes wovely_first_run_intent; App.jsx would open the wrong first-run UI');
  assert.match(APP, /sessionStorage\.getItem\("wovely_first_run_intent"\)/,
    'App.jsx no longer reads wovely_first_run_intent');
  assert.match(APP, /intent === "starter"/, 'App.jsx no longer honors the "starter" intent');
  assert.match(APP, /intent === "import"/, 'App.jsx no longer honors the "import" intent');
});

// ── Telemetry: the screen where the funnel died must never go dark again ─────

test('guest fork: the screen being seen is instrumented', () => {
  assert.match(AUTH, /posthog\.capture\("guest_fork_shown"\)/,
    'Without guest_fork_shown there is no denominator: no way to tell "nobody saw it" from ' +
    '"everybody saw it and left".');
});

test('guest fork: each path taken is instrumented and distinguishable', () => {
  assert.match(AUTH, /posthog\.capture\("guest_fork_path_chosen", \{ path: "demo" \}\)/,
    'The demo path must report itself');
  assert.match(AUTH, /posthog\.capture\("guest_fork_path_chosen", \{ path: intent \}\)/,
    'tryFork must report which path was taken; the `path` property is what separates ' +
    'import from starter in PostHog');
});

test('demo: being seen, being used, and converting are all instrumented', () => {
  assert.match(DEMO, /posthog\.capture\("demo_shown"/,
    'demo_shown is the demo\'s own denominator');
  assert.match(DEMO, /posthog\.capture\("demo_row_tapped"/,
    'demo_row_tapped is the only signal that anyone actually touched the product');
  assert.match(DEMO, /first: true/,
    'The first row tap must be distinguishable from the rest, it is the activation moment');
  assert.match(DEMO, /posthog\.capture\("demo_converted"/,
    'demo_converted is the whole point: it proves the demo feeds the funnel rather than absorbing it');
});

test('telemetry: no parallel naming convention was invented', () => {
  // Every event this work adds must read like the ones already in the codebase:
  // lowercase snake_case, <noun>_<verb-past>. A camelCase or dotted name here
  // means someone started a second scheme alongside anonymous_mode_entered.
  const names = [...AUTH.matchAll(/posthog\.capture\("([^"]+)"/g), ...DEMO.matchAll(/posthog\.capture\("([^"]+)"/g)]
    .map(m => m[1]);
  assert.ok(names.length > 0, 'no capture calls found at all');
  for (const n of names) {
    assert.match(n, /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/,
      `"${n}" does not match the existing snake_case scheme (anonymous_mode_entered, ` +
      'guest_import_started, starter_import_started, pattern_activated)');
  }
});

// ── The rows are the real pattern, not filler ───────────────────────────────

test('demo: the rounds are the real starter pattern and the counts add up', () => {
  // Extracted from starters/button-the-mushroom-v1.pdf, the same file the live
  // starter import fetches. If someone rewrites these into invented rounds the
  // demo starts lying about the product, so pin the stitch-count spine.
  const counts = [...DEMO.matchAll(/count:\s*(\d+)/g)].map(m => Number(m[1]));
  assert.deepEqual(counts, [6, 12, 18, 24, 30, 30, 24, 18],
    'The Cap of Button the Mushroom runs 6, 12, 18, 24, 30, 30, 24, 18. These are the counts ' +
    'printed in the starter PDF, and the demo claims on screen that every round adds up.');
  assert.match(DEMO, /\(1 sc, inc\) 6 times/, 'Rnd 2 no longer matches the starter PDF');
  assert.match(DEMO, /\(2 sc, dec\) 6 times/, 'Rnd 9 no longer matches the starter PDF');
});
