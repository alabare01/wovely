// What a failed import says to the person looking at it.
//
// WHY THIS FILE EXISTS
// On 2026-09-08 a prospect on wovely.app was shown this in the import pill:
//
//   "Bev got tangled — PDF extraction failed: Gemini and Claude both failed.
//    Last error: Claude API er…"
//
// Two vendors named, our provider fallback described, cut off mid-word, and
// nothing in it a reader could act on. The server side of that was closed the
// same day (bddd78a). This is the render side: the queue worker still writes
// its own text into import_jobs.error_message and the pill and both modals read
// that field, so the guard has to live here too.
//
// The rule these tests hold: whatever the raw string says, what reaches the
// screen is our copy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { friendlyImportError, IMPORT_FAILED_BODY, IMPORT_FAILED_HEADLINE } from '../src/utils/importErrors.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const PILL = read('../src/components/ImportPill.jsx');
const MODAL = read('../src/AddPatternModal.jsx');
const PHOTO = read('../src/ImageImportModal.jsx');

// The exact string a real user was shown.
const THE_REAL_ONE = 'PDF extraction failed: Gemini and Claude both failed. Last error: Claude API error 401 {"type":"error"}';

const LEAKS = [
  /gemini/i, /claude/i, /anthropic/i, /openai/i, /vertex/i,
  /api key/i, /401|403|500|502/, /\bstack\b/i, /undefined/i, /\{|\}/,
];

test('errors: the message that shipped never reaches a reader again', () => {
  const out = friendlyImportError(THE_REAL_ONE);
  for (const leak of LEAKS) {
    assert.doesNotMatch(out, leak, `"${out}" still leaks ${leak}`);
  }
  assert.ok(!out.includes(THE_REAL_ONE));
  assert.equal(out, IMPORT_FAILED_BODY);
});

test('errors: nothing internal survives any raw input', () => {
  const raws = [
    THE_REAL_ONE,
    'Error: connect ECONNREFUSED 127.0.0.1:8080',
    'TypeError: Cannot read properties of undefined (reading "components")',
    'Gemini API error 429: rate limit exceeded for model gemini-2.0-flash',
    'pdf.js: InvalidPDFException at line 4021',
    null,
    undefined,
    '',
    'extraction_failed',
    'We could not read that pattern.',
  ];
  for (const raw of raws) {
    const out = friendlyImportError(raw);
    assert.ok(typeof out === 'string' && out.length > 20, `empty copy for ${JSON.stringify(raw)}`);
    if (raw) assert.ok(!out.includes(String(raw)), `raw text echoed for ${JSON.stringify(raw)}`);
    for (const leak of LEAKS) assert.doesNotMatch(out, leak, `${JSON.stringify(raw)} leaked ${leak}`);
  }
});

test('errors: a cause we can actually name gets a better instruction', () => {
  // Generic copy for everything would be safe and useless. Where the raw
  // string tells us something the reader can act on, say the actionable thing.
  assert.match(friendlyImportError('413 payload too large'), /smaller|split/i);
  assert.match(friendlyImportError('PDFPasswordException: password required'), /locked|password/i);
  assert.match(friendlyImportError('no text layer found in document'), /scan|photo/i);
  assert.match(friendlyImportError('function invocation timed out'), /once more|again/i);
  assert.notEqual(friendlyImportError('413 payload too large'), IMPORT_FAILED_BODY);
});

test('errors: every line tells the reader what to do next', () => {
  const lines = [
    IMPORT_FAILED_BODY,
    friendlyImportError('413 payload too large'),
    friendlyImportError('password required'),
    friendlyImportError('no text layer'),
    friendlyImportError('timed out'),
    friendlyImportError('econnreset'),
    friendlyImportError('rate limit'),
  ];
  for (const l of lines) {
    assert.match(l, /try|send|photograph|re-save|split|check|wait/i, `no next step in: ${l}`);
  }
});

test('errors: house writing rules hold in the copy', () => {
  const lines = [IMPORT_FAILED_HEADLINE, IMPORT_FAILED_BODY,
    friendlyImportError('413'), friendlyImportError('password'),
    friendlyImportError('no text layer'), friendlyImportError('timed out'),
    friendlyImportError('network'), friendlyImportError('rate limit')];
  for (const l of lines) {
    assert.doesNotMatch(l, /—/, `em dash in: ${l}`);
    assert.doesNotMatch(l, /!/, `exclamation point in: ${l}`);
    assert.doesNotMatch(l, /\bAI\b|artificial intelligence|powered by/i, `AI reference in: ${l}`);
  }
});

// ── The call sites. A guard nothing routes through is decoration ────────────

test('errors: the pill renders our copy, not the job row', () => {
  assert.doesNotMatch(PILL, /sub = errorMessage \?/,
    'ImportPill is rendering import_jobs.error_message again. That field is written by the ' +
    'worker and is the exact route the vendor names took to a prospect.');
  assert.match(PILL, /friendlyImportError\(errorMessage\)/,
    'ImportPill must pass the raw message through friendlyImportError');
  assert.match(PILL, /logImportFailure\("import-pill"/,
    'The raw message must still be logged. Cleaning up the UI must not lose the error.');
});

test('errors: both import modals do the same', () => {
  assert.doesNotMatch(MODAL, /setErrorMsg\(polling\.errorMessage/,
    'AddPatternModal is rendering the worker error verbatim again');
  assert.match(MODAL, /handleImportFailure\("pdf-modal-poll"/);
  assert.doesNotMatch(PHOTO, /setErrorMsg\(polling\.errorMessage/,
    'ImageImportModal is rendering the worker error verbatim again');
  assert.match(PHOTO, /handleImportFailure\("photo-modal-poll"/);
  // The two server-response branches that used to render errBody.error raw.
  assert.doesNotMatch(MODAL, /setErrorMsg\(errBody\.error \|\|/,
    'a raw server error string is being rendered from the queue reserve/finalize branch');
});

test('errors: recovery matches how the reader got here', () => {
  // A starter the reader never supplied a file for was offered "Try a different
  // file" as its only way out. There was nothing for them to swap.
  assert.match(MODAL, /const swapLabel = isStarterImport/,
    'the error screen no longer picks its recovery action from provenance');
  assert.match(MODAL, /"Bring in a pattern of my own"/,
    'a starter failure must not tell the reader to try a different file');
  assert.match(MODAL, /"Choose a pattern to import"/,
    'a resumed import with no file in this tab has no "different" file to try');
  assert.match(MODAL, /isHiccup&&canRetrySameFile/,
    '"Try again" must only appear when there is actually a file to retry');
});
