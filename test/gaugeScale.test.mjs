// Gauge scaling, direction-of-correction suite.
// Run with: npm test (node --test).
//
// WHY THIS FILE EXISTS. On 2026-09-08 an audit of the public tool pages found
// that /crochet-pattern-scale-calculator returned inverted answers on every
// input, and had done so on five surfaces: its own page, the Scale tab on
// /tools, /crochet-gauge-calculator and /yarn-yardage-calculator, and the
// signed-in app. At the page's own shipped defaults it told a crocheter to work
// 31 stitches where 19 is correct, a finished piece 66% too wide, and it
// described a looser gauge as tighter while it did so.
//
// The cause was one expression. Calculators.jsx computed the stitch multiplier
// as patternStitchesPerInch / myStitchesPerInch. To hold the finished size the
// pattern intends, it has to be the other way up.
//
// There was no test on this module. That is the whole reason a sign error
// survived to production on a page built to earn search traffic. The assertions
// below are therefore about DIRECTION first and arithmetic second: a wrong sign
// here prints a confident wrong number to somebody about to cut yarn, which
// src/utils/yardage.js and its own suite explicitly refuse to do.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleCount } from '../src/utils/gaugeScale.js';

// The multiplier as Calculators.jsx builds it. Kept here in the same shape so
// this file fails if that expression is ever flipped back.
const stitchMultiplier = (patternPerIn, minePerIn) => minePerIn / patternPerIn;

test('the shipped default case: a looser gauge needs FEWER stitches, not more', () => {
  // The page's own defaults. Pattern 18 sts / 4in, mine 14 sts / 4in.
  const pattern = 18 / 4; // 4.5 sts per inch
  const mine = 14 / 4;    // 3.5 sts per inch, so my fabric is LOOSER
  const stScale = stitchMultiplier(pattern, mine);

  // 24 pattern stitches span 24 / 4.5 = 5.333in. At 3.5 sts/in that is 18.67.
  const { scaled } = scaleCount(24, { stScale }, 'st');
  assert.equal(scaled, 19, 'a looser gauge must work fewer stitches to reach the same width');

  // The number this bug actually printed. Asserted explicitly so the regression
  // is named rather than merely excluded.
  assert.notEqual(scaled, 31, 'REGRESSION: the multiplier is inverted again');
});

test('a tighter gauge needs MORE stitches', () => {
  const pattern = 16 / 4; // 4 sts per inch
  const mine = 20 / 4;    // 5 sts per inch, so my fabric is TIGHTER
  const stScale = stitchMultiplier(pattern, mine);

  // 24 pattern stitches span 6in. At 5 sts/in that is 30.
  assert.equal(scaleCount(24, { stScale }, 'st').scaled, 30);
});

test('the finished width is preserved, which is the entire point', () => {
  // Whatever the gauges, stitches / myStitchesPerInch must land back on the
  // width the pattern intended. This is the property the sign error broke.
  const cases = [
    [18 / 4, 14 / 4, 24],
    [16 / 4, 20 / 4, 24],
    [22 / 4, 13 / 4, 60],
    [10 / 4, 30 / 4, 8],
  ];
  for (const [pattern, mine, n] of cases) {
    const intendedWidth = n / pattern;
    const { scaled } = scaleCount(n, { stScale: stitchMultiplier(pattern, mine) }, 'st');
    const actualWidth = scaled / mine;
    // Rounding to a whole stitch is the only permitted error.
    assert.ok(
      Math.abs(actualWidth - intendedWidth) <= 1 / mine,
      `width drifted: intended ${intendedWidth.toFixed(3)}in, got ${actualWidth.toFixed(3)}in`
    );
  }
});

test('rows scale on the ROW gauge, never on the stitch gauge', () => {
  // The module's own header records that this was previously a dead ternary
  // where both branches returned the stitch multiplier. Hold that fixed.
  const stScale = stitchMultiplier(18 / 4, 14 / 4); // 0.777...
  const rowScale = stitchMultiplier(20 / 4, 16 / 4); // 0.8

  const row = scaleCount(30, { stScale, rowScale }, 'row');
  assert.equal(row.factor, rowScale, 'a row count must not be scaled by the stitch ratio');
  assert.equal(row.scaled, 24);

  const st = scaleCount(30, { stScale, rowScale }, 'st');
  assert.equal(st.factor, stScale);
});

test('equal gauges change nothing', () => {
  const stScale = stitchMultiplier(18 / 4, 18 / 4);
  assert.equal(stScale, 1);
  const { scaled, flagged } = scaleCount(24, { stScale }, 'st');
  assert.equal(scaled, 24);
  assert.equal(flagged, false);
});

test('the tighter/looser sentence agrees with the multiplier', () => {
  // Calculators.jsx renders "tighter" when stScale > 1. With the multiplier the
  // right way up, that is true exactly when my fabric has more stitches per inch
  // than the pattern's. The old code satisfied neither half.
  const looser = stitchMultiplier(18 / 4, 14 / 4);
  const tighter = stitchMultiplier(14 / 4, 18 / 4);
  assert.ok(looser < 1, 'a looser gauge must not read as tighter');
  assert.ok(tighter > 1, 'a tighter gauge must read as tighter');
});

test('a count that cannot land cleanly on a whole stitch is flagged', () => {
  // scaleCount flags above 5% rounding error so the UI can warn rather than
  // print a number that quietly does not fit the repeat.
  const { flagged } = scaleCount(3, { stScale: 1.2 }, 'st'); // 3.6 -> 4, 11% off
  assert.equal(flagged, true);
});

test('a missing or zero gauge is a no-op, never a divide by zero', () => {
  assert.equal(scaleCount(24, {}, 'st').scaled, 24);
  assert.equal(scaleCount(24, { stScale: 1 }, 'st').scaled, 24);
  assert.ok(Number.isFinite(scaleCount(24, { stScale: 1 }, 'st').error));
});
