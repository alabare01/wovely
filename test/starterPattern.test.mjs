// The starter pattern fixture.
//
// WHY THIS FILE EXISTS
// The signup card promises "Includes Button the Mushroom, our free original."
// Until 2026-09-08 that promise was kept by making a brand-new account run the
// import pipeline against a PDF in Supabase Storage: pdf.js in the browser, a
// queued job, a model call, a review modal. When extraction broke, the account
// was created holding nothing and the console said "Pattern fetch count: 0".
//
// The parse is a committed fixture now, so the promise cannot depend on a model
// being up. That moves the risk: a fixture can rot silently in a way an
// extraction cannot, because nothing re-reads it. These tests are what re-reads
// it. They check the pattern is intact and, more to the point, that the stitch
// counts still make a mushroom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_PATTERN, buildStarterPattern, starterPatternRow } from '../src/data/starterPattern.js';

const rows = STARTER_PATTERN.rows;

test('starter: the pattern is there and it is the right one', () => {
  assert.equal(STARTER_PATTERN.title, 'Button the Mushroom');
  assert.ok(rows.length >= 20, `only ${rows.length} rows — the short extractions dropped the FINISH and OPTIONAL steps`);
  assert.equal(STARTER_PATTERN.components.length, 2, 'Button is a Cap and a Stem');
  assert.deepEqual(STARTER_PATTERN.components.map(c => c.name), ['The Cap', 'The Stem']);
  assert.ok(STARTER_PATTERN.materials.length >= 4, 'materials list is thin');
  assert.match(STARTER_PATTERN.cover_image_url, /^https:\/\//);
  assert.match(STARTER_PATTERN.source_file_url, /starters\/button-the-mushroom-v1\.pdf$/,
    'source_file_url must still open the real PDF — "View source" reads it');
});

test('starter: it arrives unstitched', () => {
  // Pulled from a real user row, so this is not theoretical: the record it came
  // from had eight rounds ticked off.
  const done = rows.filter(r => r.done);
  assert.equal(done.length, 0, `${done.length} rows arrive already checked off`);
  assert.ok(rows.every(r => !('repeat_done' in r)), 'a repeat_done flag survived the capture');
});

test('starter: the cap increases and decreases to a closed dome', () => {
  const cap = STARTER_PATTERN.components[0].rows
    .map(r => r.stitch_count)
    .filter(n => typeof n === 'number');
  assert.deepEqual(cap, [6, 12, 18, 24, 30, 30, 30, 30, 24, 18],
    'the cap no longer works out. A magic ring of 6 doubles to 12, adds 6 a round to 30, holds, then decreases.');
});

test('starter: the stem holds its round', () => {
  const stem = STARTER_PATTERN.components[1].rows
    .map(r => r.stitch_count)
    .filter(n => typeof n === 'number');
  assert.deepEqual(stem, [6, 12, 18, 18, 18, 18, 18, 18],
    'the stem no longer works out. It opens at 6, doubles, increases once to 18 and stays there.');
});

test('starter: every printed stitch count matches the count on the row', () => {
  // The row text carries the count in parentheses, which is what the user
  // reads. A fixture where the text and the number disagree teaches a beginner
  // the wrong thing, which is worse than no starter at all.
  for (const c of STARTER_PATTERN.components) {
    for (const r of c.rows) {
      if (typeof r.stitch_count !== 'number') continue;
      const row = rows.find(x => x.componentName === c.name && x.text.includes(r.text));
      assert.ok(row, `no library row renders "${r.text}"`);
      assert.match(row.text, new RegExp(`\\(${r.stitch_count}\\)\\s*$`),
        `row "${row.text}" does not end in (${r.stitch_count})`);
    }
  }
});

test('starter: the fixture cannot be mutated by a caller', () => {
  const a = buildStarterPattern();
  a.rows[0].done = true;
  a.title = 'Wrecked';
  const b = buildStarterPattern();
  assert.equal(b.rows[0].done, false, 'a caller checking a row wrote back into the module fixture');
  assert.equal(b.title, 'Button the Mushroom');
  assert.equal(STARTER_PATTERN.rows[0].done, false);
});

test('starter: the row shape is what the patterns table wants', () => {
  const row = starterPatternRow('11111111-2222-3333-4444-555555555555');
  assert.equal(row.user_id, '11111111-2222-3333-4444-555555555555');
  assert.equal(row.is_starter, true,
    'is_starter false would count the free pattern against the 5-pattern cap');
  assert.equal(row.row_count, STARTER_PATTERN.rows.length,
    'row_count must match the rows actually stored — the library card reads it');
  assert.equal(row.is_ai_generated, false);
  assert.equal(row.extracted_by_ai, false,
    'nothing extracted this. Claiming a model did would be a false badge on the pattern.');
  assert.ok(Array.isArray(row.rows) && row.rows.length === row.row_count);
  assert.ok(row.gauge && typeof row.gauge.stitches === 'number');
  // Two callers insert this row and both must get an independent copy.
  const other = starterPatternRow('u2');
  other.rows[0].done = true;
  assert.equal(starterPatternRow('u3').rows[0].done, false);
});

test('starter: no em dashes in anything a person reads', () => {
  // House writing rule. The fixture carries visible copy (row text, notes,
  // materials), so it is subject to it.
  const text = JSON.stringify(STARTER_PATTERN);
  assert.doesNotMatch(text, /—/, 'an em dash reached the starter pattern copy');
});
