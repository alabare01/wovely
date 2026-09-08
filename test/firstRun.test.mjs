// First-run activation guard.
//
// WHY THIS FILE EXISTS
// A stranger who opens Wovely with an empty library must be offered a pattern.
// If they are not, the only path forward is "go find a PDF and upload it",
// which is where brand-new users stop. That has silently broken once already:
// on 2026-04-19 commit 63154ca emptied DEFAULT_STARTERS ("reading as
// AI-generated filler on first impression"), and for the seven weeks until the
// S83 starter landed on 2026-06-10 (3c3f7dc) the app opened on nothing.
//
// Wovely has had TWO starter mechanisms. Only one is live at a time:
//   1. DEFAULT_STARTERS — client-only seed patterns, deliberately emptied in
//      April and NOT to be refilled with filler.
//   2. STARTER (S83) — one real PDF in Supabase Storage. Picking it runs the
//      genuine import pipeline. This is the live one.
//
// So the invariant is NOT "DEFAULT_STARTERS is non-empty" — asserting that
// would fail correct code today. The invariant is "at least one starter
// mechanism is live AND wired into the zero-pattern view". Emptying whichever
// one is current, or unhooking the fork, fails this suite.
//
// These are source-level assertions: App.jsx is JSX and cannot be imported by
// node --test without a transform, so the file is read and checked as text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkFirstRunInvariant, readStarterMechanisms } from '../scripts/first-run-invariant.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const APP = read('../src/App.jsx');
const FORK = read('../src/FirstRunFork.jsx');
const QUEUE = read('../api/cron/process-queue.js');

// Same reader and same rule the vite build gate uses.
const { defaultStartersCount, starterFields, starterIsLive } = readStarterMechanisms(APP);

// ── The load-bearing assertion ───────────────────────────────────────────────

test('first run: at least one starter mechanism is live', () => {
  const { ok, reason } = checkFirstRunInvariant(APP);
  assert.ok(ok, reason ?? '');
});

test('first run: an emptied starter is actually caught (guard self-check)', () => {
  // A guard that cannot fail is decoration. Feed it the exact shape of the
  // 2026-04-19 regression — both mechanisms blank — and require a refusal.
  const emptied = APP
    .replace(/const STARTER\s*=\s*\{[\s\S]*?\n\};/,
      'const STARTER = {\n  title: "",\n  blurb: "",\n  coverUrl: "",\n  storagePath: "",\n};')
    .replace(/const DEFAULT_STARTERS\s*=\s*\[[\s\S]*?\n?\];/, 'const DEFAULT_STARTERS = [];');
  const { ok, reason } = checkFirstRunInvariant(emptied);
  assert.equal(ok, false, 'the invariant passed a source with no starter at all');
  assert.match(reason, /BOTH starter mechanisms are empty/);
});

test('first run: the S83 starter carries every field the import needs', () => {
  if (!starterIsLive) return; // DEFAULT_STARTERS path is carrying first run
  assert.ok(starterFields.title.trim().length > 0, 'STARTER.title is blank');
  assert.ok(starterFields.blurb && starterFields.blurb.trim().length > 0,
    'STARTER.blurb is blank — the gallery card renders with no description');
  assert.match(starterFields.coverUrl, /^https:\/\//,
    'STARTER.coverUrl must be an absolute https URL — the gallery card image reads it directly');
  assert.match(starterFields.storagePath, /^starters\/.+\.pdf$/,
    'STARTER.storagePath must point at a PDF under starters/ in the pattern-files bucket — ' +
    'startStarterImport fetches ${SUPABASE_URL}/storage/v1/object/public/pattern-files/${storagePath}');
});

// ── Wiring: an offered starter nobody can reach is the same as no starter ────

test('first run: the zero-pattern branch renders FirstRunFork', () => {
  assert.match(
    APP,
    /userPatterns\.length===0&&\(patternsFetched\|\|anonymousMode\)\?<FirstRunFork/,
    'The empty-library branch no longer renders FirstRunFork. A new user would ' +
    'land on the ordinary CollectionView empty state instead of the starter fork.'
  );
  // Desktop and mobile shells each render their own copy — both must be wired.
  const forkRenders = (APP.match(/<FirstRunFork\s/g) || []).length;
  assert.equal(forkRenders, 2,
    `Expected FirstRunFork to be rendered in both the desktop and mobile shells, found ${forkRenders}`);
});

test('first run: the fork is wired to the starter, in one click', () => {
  // REWRITTEN 2026-09-08 with the starter itself.
  //
  // The old wiring was: card -> onShowGallery -> a gallery screen holding one
  // card -> onPickStarter -> fetch a PDF -> pdf.js -> import job -> a model ->
  // review modal -> save. This asserted every hop of that. Two of those hops
  // were clicks on the same pattern and the rest was an extraction of a file we
  // wrote ourselves, which is what broke for four months.
  //
  // What must hold now: the card picks the starter directly, the pick goes
  // through gateImport (so a logged-out visitor gets the anonymous session the
  // INSERT needs), and the pattern comes from the committed fixture rather than
  // from an extraction.
  assert.match(APP, /onPickStarter=\{handlePickStarter\}/,
    'FirstRunFork is rendered but onPickStarter is not wired to handlePickStarter — the card would be dead');
  assert.match(APP, /const handlePickStarter\s*=\s*\(\)\s*=>\s*gateImport\("starter_pick",\s*startStarterImport\)/,
    'handlePickStarter must route through gateImport so a logged-out visitor gets the anonymous session ' +
    'that the starter INSERT needs for its Bearer token');
  assert.match(APP, /starter=\{STARTER\}/,
    'FirstRunFork must receive the STARTER constant. Without it the card renders no title.');
  assert.match(FORK, /onClick=\{onPickStarter\}/,
    'The "Start with ours" card no longer calls onPickStarter');
  assert.doesNotMatch(FORK, /onShowGallery/,
    'The one-item gallery is back. Picking our own free pattern must be one click from the card.');
  assert.doesNotMatch(APP, /setFirstRunMode\(/,
    'firstRunMode drove the fork/gallery split and should be gone with the gallery');
});

test('first run: the starter is seeded, not extracted', () => {
  assert.match(APP, /import \{ starterPatternRow \} from "\.\/data\/starterPattern\.js"/,
    'App must take the starter from the committed fixture');
  assert.doesNotMatch(APP, /extractTextFromPDF/,
    'App still runs client-side PDF extraction for the starter. That is the step that was ' +
    'broken for four months, on a pattern we wrote and already have the parse for.');
  assert.doesNotMatch(APP, /file_url: fileUrl, file_type: "pdf"/,
    'App still POSTs an import job for the starter');
  assert.match(APP, /seedStarterIfNewAccount/,
    'A new account must be seeded with the starter. The signup card promises it.');
});

// ── Telemetry: the events that prove first run is working ────────────────────

test('first run: the starter pick is instrumented', () => {
  assert.match(APP, /posthog\.capture\("starter_import_started"/,
    'starter_import_started is the only signal that anyone picked the starter. Without it a ' +
    'silent first-run collapse is invisible in PostHog.');
  assert.match(APP, /posthog\.capture\("guest_import_started"/,
    'guest_import_started is the entry signal for every logged-out import path');
  assert.match(APP, /posthog\.capture\("anonymous_mode_entered"/,
    'anonymous_mode_entered is the "Try Wovely free" conversion signal');
});

test('queue worker sends PostHog an ingestion key, never a personal key', () => {
  // /capture/ only accepts a PROJECT key (phc_). A phx_ personal key is a
  // Bearer credential for the query API and is rejected at ingestion, which is
  // how every import_job_* event was silently dropped before this guard.
  assert.match(QUEUE, /const POSTHOG_PROJECT_KEY = 'phc_/,
    'process-queue.js must define a phc_ project key as its capture credential');
  assert.match(QUEUE, /startsWith\('phc_'\)/,
    'process-queue.js must reject a non-phc_ env override rather than posting it to /capture/');
  assert.doesNotMatch(QUEUE, /process\.env\.VITE_POSTHOG_KEY\b/,
    'VITE_POSTHOG_KEY is not a real environment variable (the deployed name is ' +
    'VITE_POSTHOG_API_KEY). Reading it resolves to undefined.');
});
