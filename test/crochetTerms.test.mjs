// UK ⇄ US crochet term engine — unit + regression suite.
// Run with: npm test (node --test).
//
// The whole claim of the converter page is "software does this correctly and
// hand-editing with a chart does not." That claim is only worth making if the
// mapping is actually right, so the cases below are the ones a human gets wrong:
// shared abbreviations, digit-glued forms, and the sequential-replacement trap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertPattern, detectDialect, lookupAbbr, annotateRow, countRound,
  STITCH_LADDER, ABBREVIATIONS,
} from '../src/utils/crochetTerms.js';

const to = (text, dir = 'uk-to-us') => convertPattern(text, dir).outputText;

// ── The offset ladder ────────────────────────────────────────────────────────

test('UK→US maps every rung of the stitch ladder', () => {
  assert.equal(to('dc'), 'sc');
  assert.equal(to('htr'), 'hdc');
  assert.equal(to('tr'), 'dc');
  assert.equal(to('dtr'), 'tr');
  assert.equal(to('trtr'), 'dtr');
});

test('US→UK is the exact inverse of UK→US', () => {
  assert.equal(to('sc', 'us-to-uk'), 'dc');
  assert.equal(to('hdc', 'us-to-uk'), 'htr');
  assert.equal(to('dc', 'us-to-uk'), 'tr');
  assert.equal(to('tr', 'us-to-uk'), 'dtr');
  assert.equal(to('dtr', 'us-to-uk'), 'trtr');
});

test('chain and slip stitch survive the trip in both directions', () => {
  assert.equal(to('ch 3'), 'ch 3');
  assert.equal(to('ch 3', 'us-to-uk'), 'ch 3');
  assert.equal(to('sl st', 'us-to-uk'), 'sl st');
});

// ── THE trap: sequential replacement corrupts, simultaneous replacement does not
//
// Doing this by hand with a chart: convert every "dc" to "sc", then reach the
// "tr" and convert it to "dc". The row now contains a "dc" that means single
// crochet and a "dc" that means double crochet, and the pattern is ruined.
// A single simultaneous pass cannot produce that state.

test('a row containing BOTH dc and tr converts without collision', () => {
  assert.equal(to('3 dc, 2 tr, 1 dc'), '3 sc, 2 dc, 1 sc');
});

test('converted output is never re-read (no chain reaction)', () => {
  // UK dc→sc and UK tr→dc. If the pass re-read its own output, the fresh "dc"
  // produced from "tr" would be converted again to "sc" and both stitches would
  // collapse to the same thing.
  const out = to('tr, dc');
  assert.equal(out, 'dc, sc');
  assert.notEqual(out, 'sc, sc');
});

test('round-tripping UK→US→UK restores every stitch on the ladder', () => {
  const original = '2 dc, 1 htr, 3 tr, 1 dtr, ch 2, miss 1';
  const there = convertPattern(original, 'uk-to-us').outputText;
  const back = convertPattern(there, 'us-to-uk').outputText;
  assert.equal(there, '2 sc, 1 hdc, 3 dc, 1 tr, ch 2, skip 1');
  assert.equal(back, original);
});

test('slip stitch normalises to "sl st" and then stays put', () => {
  // Deliberately NOT a symmetric round trip. UK patterns write either "ss" or
  // "sl st"; US patterns only ever write "sl st". So UK→US normalises "ss" to
  // "sl st", and US→UK leaves "sl st" alone because it is already valid UK.
  // Rewriting it back to "ss" would be a change with no reader benefit.
  assert.equal(to('ss to join'), 'sl st to join');
  assert.equal(to('sl st to join', 'us-to-uk'), 'sl st to join');
  // Converting twice must not drift any further.
  assert.equal(to(to('ss to join'), 'us-to-uk'), 'sl st to join');
});

// ── Digit-glued forms: the reason token splitting beats \b word boundaries ────

test('digit-prefixed counts convert ("2dc" is one token to a human, two to a regex)', () => {
  assert.equal(to('2dc in next st'), '2sc in next st');
  assert.equal(to('12tr'), '12dc');
});

test('the "Ntog" family converts without being special-cased', () => {
  assert.equal(to('dc2tog'), 'sc2tog');
  assert.equal(to('tr2tog'), 'dc2tog');
  assert.equal(to('tr3tog'), 'dc3tog');
  assert.equal(to('htr2tog'), 'hdc2tog');
});

test('abbreviations inside longer words are left alone', () => {
  assert.equal(to('the scarf edging'), 'the scarf edging');
  assert.equal(to('subtract'), 'subtract');
});

// ── Phrases and case ─────────────────────────────────────────────────────────

test('written-out stitch names convert, longest phrase winning', () => {
  assert.equal(to('double crochet'), 'single crochet');
  assert.equal(to('treble crochet'), 'double crochet');
  assert.equal(to('half treble crochet'), 'half double crochet');
  assert.equal(to('double treble crochet'), 'treble crochet');
});

test('a phrase is not converted twice by the token pass that follows it', () => {
  // "treble crochet" → "double crochet". If the token pass then re-read that
  // output it would find nothing (the map holds abbreviations, not words) —
  // this test locks that separation in place.
  assert.equal(to('work 1 treble crochet'), 'work 1 double crochet');
});

test('capitalisation of the source is preserved', () => {
  assert.equal(to('DC'), 'SC');
  assert.equal(to('Dc'), 'Sc');
  assert.equal(to('Htr'), 'Hdc');
});

test('non-stitch vocabulary converts too', () => {
  assert.equal(to('miss 2 sts'), 'skip 2 sts');
  assert.equal(to('yrh'), 'yo');
  assert.equal(to('tension: 16 sts'), 'gauge: 16 sts');
  assert.equal(to('skip 2', 'us-to-uk'), 'miss 2');
  assert.equal(to('gauge', 'us-to-uk'), 'tension');
});

test('post stitches ride the same one-rung offset', () => {
  assert.equal(to('fptr'), 'fpdc');
  assert.equal(to('bptr'), 'bpdc');
  assert.equal(to('fpdc', 'us-to-uk'), 'fptr');
});

// ── Structure preservation ───────────────────────────────────────────────────

test('numbers, punctuation, brackets and line breaks are untouched', () => {
  const src = 'Row 4: ch 3, *2 tr in next st, miss 1 st; rep from * to end. (24 sts)';
  assert.equal(
    to(src),
    'Row 4: ch 3, *2 dc in next st, skip 1 st; rep from * to end. (24 sts)'
  );
});

test('multi-line patterns keep their line breaks', () => {
  const src = 'Row 1: 6 dc\nRow 2: 2 tr in ea st';
  assert.equal(to(src), 'Row 1: 6 sc\nRow 2: 2 dc in ea st');
});

test('the change tally counts every substitution', () => {
  const r = convertPattern('dc, dc, tr');
  assert.equal(r.totalChanges, 3);
  const dcChange = r.changes.find((c) => c.from === 'dc');
  assert.equal(dcChange.n, 2);
  assert.equal(dcChange.to, 'sc');
});

test('segments mark exactly what changed, and rebuild the output verbatim', () => {
  const r = convertPattern('2 dc, ch 1');
  assert.equal(r.segments.map((s) => s.text).join(''), r.outputText);
  assert.deepEqual(r.segments.filter((s) => s.changed).map((s) => s.text), ['sc']);
});

test('empty input is a no-op, not a crash', () => {
  const r = convertPattern('');
  assert.equal(r.outputText, '');
  assert.equal(r.totalChanges, 0);
});

// ── Dialect detection ────────────────────────────────────────────────────────

test('unambiguous UK markers identify a UK pattern', () => {
  const d = detectDialect('Row 1: 6 htr, miss 1, tension 16 sts');
  assert.equal(d.dialect, 'uk');
  assert.equal(d.confident, true);
});

test('unambiguous US markers identify a US pattern', () => {
  const d = detectDialect('Rnd 1: 6 sc in magic ring, hdc in next st');
  assert.equal(d.dialect, 'us');
  assert.equal(d.confident, true);
});

test('a pattern of only shared abbreviations is reported as unknown, not guessed', () => {
  // "3 dc, ch 2" is a valid row in BOTH dialects and means different things in
  // each. Guessing here would silently destroy the pattern, so we must not.
  const d = detectDialect('Row 1: 3 dc, ch 2, 3 dc');
  assert.equal(d.confident, false);
  assert.equal(d.ambiguous, true);
});

test('detection never claims confidence when both dialects show markers', () => {
  const d = detectDialect('6 sc and 4 htr');
  assert.equal(d.confident, false);
});

// ── Abbreviation reference ───────────────────────────────────────────────────

test('every abbreviation entry carries a UK column and a plain-English gloss', () => {
  for (const a of ABBREVIATIONS) {
    assert.ok(a.abbr && a.name && a.uk && a.what && a.group, `incomplete entry: ${a.abbr}`);
    assert.ok(a.what.length > 30, `gloss too thin to be useful: ${a.abbr}`);
  }
});

test('the ladder in the reference agrees with the ladder the converter uses', () => {
  for (const rung of STITCH_LADDER) {
    if (rung.same) continue;
    const entry = ABBREVIATIONS.find((a) => a.abbr === rung.us);
    if (!entry) continue;
    assert.ok(entry.uk.startsWith(rung.uk), `${rung.us}: reference says "${entry.uk}", ladder says "${rung.uk}"`);
  }
});

test('lookup resolves listed abbreviations and aliases', () => {
  assert.equal(lookupAbbr('sc').name, 'single crochet');
  assert.equal(lookupAbbr('MR').name, 'magic ring');
  assert.equal(lookupAbbr('magic ring').name, 'magic ring');
  assert.equal(lookupAbbr('ss').abbr, 'sl st');
});

test('lookup generalises the tog family beyond the listed rows', () => {
  const r = lookupAbbr('dc4tog');
  assert.ok(r, 'dc4tog should resolve even though it is not a table row');
  assert.match(r.name, /4 together/);
});

test('lookup returns null for things that are not abbreviations', () => {
  assert.equal(lookupAbbr('banana'), null);
  assert.equal(lookupAbbr(''), null);
});

test('the row annotator finds abbreviations and rebuilds the row verbatim', () => {
  const row = 'ch 3, 2 dc in next st, sk 1 st';
  const parts = annotateRow(row);
  assert.equal(parts.map((p) => p.text).join(''), row);
  const found = parts.filter((p) => p.info).map((p) => p.text);
  assert.ok(found.includes('ch'));
  assert.ok(found.includes('dc'));
  assert.ok(found.includes('sk'));
});

test('the annotator does not flag abbreviations buried inside real words', () => {
  const parts = annotateRow('scarf');
  assert.equal(parts.filter((p) => p.info).length, 0);
});

// ── Stitch counter ───────────────────────────────────────────────────────────

test('counts a standard amigurumi increase round', () => {
  // Round 6 of a sphere: 30 sts in, 36 sts out.
  const r = countRound('(sc 4, inc) x 6');
  assert.equal(r.produces, 36);
  assert.equal(r.consumes, 30);
  assert.equal(r.ok, true);
});

test('counts a decrease round', () => {
  const r = countRound('(sc 4, dec) x 6');
  assert.equal(r.produces, 30);
  assert.equal(r.consumes, 36);
});

test('reads a stated count and checks it against the math', () => {
  const r = countRound('Rnd 6: (sc 4, inc) x 6 (36)');
  assert.equal(r.stated, 36);
  assert.equal(r.matchesStated, true);
});

test('flags a stated count that does not match the math', () => {
  const r = countRound('Rnd 6: (sc 4, inc) x 6 (30)');
  assert.equal(r.matchesStated, false);
});

test('handles bracket and asterisk repeat notation', () => {
  assert.equal(countRound('[2 dc, ch 1] 8 times').produces, 16);
  assert.equal(countRound('*sc, inc; rep from * 6 times').produces, 18);
});

test('chains are counted separately, not as stitches in the round', () => {
  const r = countRound('[2 dc, ch 1] 8 times');
  assert.equal(r.chains, 8);
  assert.equal(r.produces, 16);
});

test('an open-ended repeat is reported as unresolved rather than guessed', () => {
  const r = countRound('*sc, inc; rep from * around');
  assert.equal(r.unresolved, true);
  assert.equal(r.ok, false);
});

test('"in next N sts" counts across N stitches', () => {
  const r = countRound('sc in next 6 sts, inc');
  assert.equal(r.produces, 8);
  assert.equal(r.consumes, 7);
});

test('"N sc in next st" works N stitches into one', () => {
  const r = countRound('3 sc in next st');
  assert.equal(r.produces, 3);
  assert.equal(r.consumes, 1);
});

test('empty input does not crash the counter', () => {
  const r = countRound('');
  assert.equal(r.ok, false);
  assert.equal(r.produces, 0);
});
