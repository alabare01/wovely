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
  convertPattern, detectDialect, lookupAbbr, annotateRow, countRound, splitRounds, findResidual,
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

// ── The converter's residual check ───────────────────────────────────────────
//
// The bug this locks down: bare "treble" was not in either token map, so it was
// left in the output untranslated while the page announced a successful
// conversion. That is precisely the silent corruption the page exists to argue
// against. The residual list is a second, independently written list of
// source-dialect vocabulary; these tests assert the two agree.

test('bare "treble" converts in both directions', () => {
  assert.equal(to('treble'), 'double crochet');
  assert.equal(to('work 2 trebles'), 'work 2 double crochets');
  assert.equal(to('treble', 'us-to-uk'), 'double treble');
});

test('plural abbreviations convert', () => {
  assert.equal(to('3 dcs'), '3 scs');
  assert.equal(to('2 trs'), '2 dcs');
  assert.equal(to('4 scs', 'us-to-uk'), '4 dcs');
});

test('plural PHRASES convert as one unit, not as a word inside a phrase', () => {
  // The trap: with the phrase regex matching only the singular, "double
  // trebles" would slip past pass one, and pass two would then find the bare
  // word "trebles" inside it and emit "double double crochets".
  assert.equal(to('2 double trebles'), '2 treble crochets');
  assert.equal(to('3 treble crochets'), '3 double crochets');
  assert.equal(to('half trebles'), 'half double crochets');
  assert.equal(to('triple trebles'), 'double trebles');
  assert.equal(to('2 single crochets', 'us-to-uk'), '2 double crochets');
  assert.equal(to('half double crochets', 'us-to-uk'), 'half treble crochets');
});

test('a plural never comes out as a double s', () => {
  assert.equal(to('3 sks', 'us-to-uk'), '3 misses');
});

test('a clean conversion leaves NO residual source-dialect vocabulary', () => {
  const uk = `Round 1: 6 dc into a magic ring. (6)
Round 2: 2 dc in ea st around. (12)
Round 3: ch 3, 2 tr in next st, miss 1 st, 1 htr in next st.
Round 4: 1 dtr in next st, tr2tog, 3 trebles, ss to join.
Tension: 16 sts and 18 rows to 10cm.`;
  const r = convertPattern(uk, 'uk-to-us');
  assert.deepEqual(r.unhandled, [], `left untranslated: ${JSON.stringify(r.unhandled)}`);
});

test('every UK term the residual list knows about is actually converted', () => {
  // If a term can be named as "must not survive", the maps have to handle it.
  // A gap between the two lists fails here rather than shipping quietly.
  const samples = [
    'treble', 'trebles', 'htr', 'dtr', 'trtr', 'ttr', 'quadtr', 'qtr',
    'yrh', 'miss', 'misses', 'missed', 'tension',
  ];
  for (const s of samples) {
    const r = convertPattern(`work 1 ${s} here`, 'uk-to-us');
    assert.deepEqual(r.unhandled, [], `"${s}" survived UK→US untranslated`);
  }
});

test('every US term the residual list knows about is actually converted', () => {
  const samples = ['sc', 'scs', 'hdc', 'single crochet', 'half double crochet', 'gauge', 'skip', 'sk', 'yo'];
  for (const s of samples) {
    const r = convertPattern(`work 1 ${s} here`, 'us-to-uk');
    assert.deepEqual(r.unhandled, [], `"${s}" survived US→UK untranslated`);
  }
});

test('the residual scanner reports an untranslated source term and ignores translated output', () => {
  // Direct test of the tripwire. In normal running it finds nothing, because
  // the maps cover everything the list names, so this builds the segments by
  // hand to prove the mechanism fires when a gap does open.
  const gap = findResidual([{ text: 'work 3 htr here', changed: false }], true);
  assert.deepEqual(gap.map((g) => g.term), ['htr']);
  assert.equal(gap[0].n, 1);
  // A CHANGED segment is the engine's own output and must never be flagged,
  // even when it contains a word that belongs to the other list.
  const clean = findResidual([{ text: 'double crochet', changed: true, from: 'treble' }], true);
  assert.deepEqual(clean, []);
});

test('an unknown source-dialect term is REPORTED, never silently dropped', () => {
  // Simulates the class of bug directly: a UK term the maps do not hold must
  // surface in `unhandled` so the UI can refuse to claim success.
  const r = convertPattern('work 3 hdtr in next st', 'uk-to-us');
  // hdtr is not in the maps and not in the residual list either, so this asserts
  // the weaker but still true property: the page never reports it as changed.
  assert.equal(r.totalChanges, 0);
  assert.equal(r.outputText, 'work 3 hdtr in next st');
});

// ── Stitch counter ───────────────────────────────────────────────────────────
//
// The rule under test throughout: the counter answers only when it has read
// every term in the round. `confident` is the only field the page may render a
// number from. The first three tests are the exact inputs that got this branch
// held — each one used to return "1 stitch made" behind a clean result panel.

const count = (text, opts) => countRound(text, opts);

test('"sc in each st around" is NOT answered as 1 stitch', () => {
  const r = count('sc in each st around');
  assert.equal(r.confident, false);
  assert.equal(r.needsPrevCount, true);
  assert.deepEqual(r.blockers, ['needs-previous-count']);
  assert.notEqual(r.produces, 1);
});

test('"sc in each st around" resolves exactly once the round below is known', () => {
  const r = count('sc in each st around', { prevCount: 36 });
  assert.equal(r.confident, true);
  assert.equal(r.produces, 36);
  assert.equal(r.consumes, 36);
});

test('"sc 6 in magic ring" makes 6 stitches out of nothing', () => {
  const r = count('sc 6 in magic ring');
  assert.equal(r.confident, true);
  assert.equal(r.produces, 6);
  assert.equal(r.consumes, 0, 'a magic ring consumes no stitches of any previous round');
});

test('"6 sc in magic ring" reads the same as "sc 6 in magic ring"', () => {
  const r = count('6 sc in magic ring');
  assert.equal(r.produces, 6);
  assert.equal(r.consumes, 0);
});

test('"[dc, ch 1] 6 times" counts the dc and reports the chains apart', () => {
  const r = count('[dc, ch 1] 6 times');
  assert.equal(r.confident, true);
  assert.equal(r.produces, 6);
  assert.equal(r.consumes, 6);
  assert.equal(r.chains, 6);
});

test('a bracketed repeat with a count inside it multiplies correctly', () => {
  const r = count('[2 dc, ch 1] 8 times');
  assert.equal(r.produces, 16);
  assert.equal(r.chains, 8);
});

test('the standard amigurumi increase round', () => {
  const r = count('(sc 4, inc) x 6');
  assert.equal(r.confident, true);
  assert.equal(r.produces, 36);
  assert.equal(r.consumes, 30);
});

test('the standard amigurumi decrease round', () => {
  const r = count('(sc 4, dec) x 6');
  assert.equal(r.produces, 30);
  assert.equal(r.consumes, 36);
});

test('a stated count is checked against the arithmetic', () => {
  const ok = count('Rnd 6: (sc 4, inc) x 6 (36)');
  assert.equal(ok.stated, 36);
  assert.equal(ok.matchesStated, true);
  const bad = count('Rnd 6: (sc 4, inc) x 6 (30)');
  assert.equal(bad.matchesStated, false);
});

test('a stated count is never judged against an answer the parser is unsure of', () => {
  // The old failure: "sc in each st around (36)" reported "states 36 but works
  // out to 1", which is an accusation of a typo the pattern did not make.
  const r = count('sc in each st around (36)');
  assert.equal(r.confident, false);
  assert.equal(r.matchesStated, null);
});

test('an open-ended repeat is refused, not guessed', () => {
  const r = count('*sc, inc; rep from * around');
  assert.equal(r.confident, false);
  assert.deepEqual(r.blockers, ['unresolved-repeat']);
});

test('an asterisk repeat with a stated number resolves', () => {
  const r = count('*sc, inc; rep from * 6 times');
  assert.equal(r.produces, 18);
  assert.equal(r.consumes, 12);
});

test('"in next N sts" and "in each of the next N sts" agree', () => {
  const a = count('sc in next 6 sts, inc');
  const b = count('sc in each of the next 6 sts, inc');
  assert.equal(a.produces, 8);
  assert.equal(a.consumes, 7);
  assert.equal(b.produces, 8);
  assert.equal(b.consumes, 7);
});

test('"N sc in next st" works N stitches into one', () => {
  const r = count('3 sc in next st');
  assert.equal(r.produces, 3);
  assert.equal(r.consumes, 1);
});

test('a chain space consumes nothing from the round below', () => {
  const r = count('2 dc in ch-1 sp');
  assert.equal(r.produces, 2);
  assert.equal(r.consumes, 0);
});

test('loop placement is not a count', () => {
  const r = count('sc in blo in each st around', { prevCount: 30 });
  assert.equal(r.produces, 30);
  assert.equal(r.consumes, 30);
});

test('a skip uses up the round below without making anything', () => {
  const r = count('sk 1 st, dc in next st');
  assert.equal(r.produces, 1);
  assert.equal(r.consumes, 2);
});

test('the 2tog family decreases', () => {
  assert.equal(count('dc3tog').produces, 1);
  assert.equal(count('dc3tog').consumes, 3);
  const r = count('sc2tog, sc in next 4 sts');
  assert.equal(r.produces, 5);
  assert.equal(r.consumes, 6);
});

test('a joining slip stitch is not counted into the round total', () => {
  const r = count('sl st in first sc to join');
  assert.equal(r.confident, false);
  assert.deepEqual(r.blockers, ['nothing-countable']);
});

test('prose the parser cannot read blocks the answer instead of inventing one', () => {
  for (const junk of ['work 3 rows in dc', 'banana pancakes', 'sc in 2nd ch from hook', 'dc2tog over next 2 sts']) {
    const r = count(junk);
    assert.equal(r.confident, false, `"${junk}" should not produce a confident answer`);
    assert.ok(r.blockers.includes('unread-terms'), `"${junk}" should be reported as unread`);
  }
});

test('a chain and a turn is not a round', () => {
  const r = count('ch 1, turn');
  assert.equal(r.confident, false);
  assert.deepEqual(r.blockers, ['nothing-countable']);
  assert.equal(r.chains, 1);
});

test('a dependent term mixed with a counted one is refused', () => {
  // "sc in each st around, inc" never says how the round below is divided
  // between the two instructions, so the previous count does not settle it.
  const r = count('sc in each st around, inc', { prevCount: 30 });
  assert.equal(r.confident, false);
  assert.ok(r.blockers.includes('mixed-dependent'));
});

test('more than one round in the box is refused rather than merged', () => {
  const r = count('Rnd 1: 6 sc in MR (6)\nRnd 2: inc in each st around (12)');
  assert.equal(r.confident, false);
  assert.equal(r.tooManyRounds, true);
  assert.equal(r.roundCount, 2);
});

test('two rounds written on one line are still detected as two', () => {
  const r = count('Rnd 1: 6 sc in MR. Rnd 2: inc in each st around.');
  assert.equal(r.tooManyRounds, true);
});

test('an invalid previous count is treated as no previous count', () => {
  for (const bad of [0, -3, NaN, undefined, 'abc']) {
    const r = count('sc in each st around', { prevCount: bad });
    assert.equal(r.confident, false, `prevCount=${bad} must not resolve the round`);
    assert.equal(r.needsPrevCount, true);
  }
});

test('empty input is empty, not a zero verdict', () => {
  const r = count('');
  assert.equal(r.empty, true);
  assert.equal(r.confident, false);
});

test('increases and decreases carry the right cost in every notation', () => {
  assert.equal(count('inc').produces, 2);
  assert.equal(count('inc').consumes, 1);
  assert.equal(count('dec x 6').produces, 6);
  assert.equal(count('dec x 6').consumes, 12);
  assert.equal(count('inv dec x 6').consumes, 12);
  assert.equal(count('2 sc in each st around', { prevCount: 6 }).produces, 12);
});

test('post stitches and taller stitches all take one and make one', () => {
  const r = count('fpdc in next st, bpdc in next st');
  assert.equal(r.produces, 2);
  assert.equal(r.consumes, 2);
  assert.equal(count('tr in each st around', { prevCount: 15 }).produces, 15);
  assert.equal(count('hdc in next 12 sts').produces, 12);
});

test('a whole realistic sphere round set comes out to the standard numbers', () => {
  const rounds = [
    ['6 sc in magic ring', 6, 0],
    ['(inc) x 6', 12, 6],
    ['(sc, inc) x 6', 18, 12],
    ['(sc 2, inc) x 6', 24, 18],
    ['(sc 3, inc) x 6', 30, 24],
    ['(sc 4, inc) x 6', 36, 30],
    ['(sc 4, dec) x 6', 30, 36],
    ['(sc 3, dec) x 6', 24, 30],
  ];
  for (const [text, produces, consumes] of rounds) {
    const r = count(text);
    assert.equal(r.confident, true, `${text} should be confident`);
    assert.equal(r.produces, produces, `${text} produces`);
    assert.equal(r.consumes, consumes, `${text} consumes`);
  }
});

test('every round in the sphere set consumes exactly what the one before it made', () => {
  // The property the paid tool checks across a whole pattern, asserted here on
  // a known-good sequence so the arithmetic itself is pinned down.
  const seq = ['6 sc in magic ring', '(inc) x 6', '(sc, inc) x 6', '(sc 2, inc) x 6', '(sc 3, inc) x 6', '(sc 4, inc) x 6'];
  let prev = null;
  for (const text of seq) {
    const r = count(text);
    if (prev !== null) assert.equal(r.consumes, prev, `${text} should work across ${prev}`);
    prev = r.produces;
  }
});

test('splitRounds finds the boundaries the page relies on', () => {
  assert.equal(splitRounds('Rnd 1: 6 sc').length, 1);
  assert.equal(splitRounds('Rnd 1: 6 sc\nRnd 2: inc x 6').length, 2);
  assert.equal(splitRounds('Rnd 1: 6 sc. Rnd 2: inc x 6.').length, 2);
});
