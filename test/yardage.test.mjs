// Yardage engine, sourced-expectation suite.
// Run with: npm test (node --test).
//
// The point of this file is not that the arithmetic runs. It is that the number
// the public /tools page prints lands where published yardage charts and real
// published patterns say it should. Every expected band below carries the source
// it came from. Where a band could not be sourced to anything better than a
// content-farm calculator page, it says so and the assertion is loose.
//
// Tolerance: published charts are explicitly estimates ("by no means exact",
// Lion Brand), so chart-derived bands are asserted with 15% either side. The
// 50 x 60 worsted throw is asserted on its stated band with no slack, because
// that is the number the whole fix exists to get right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  estimateYardage, referenceGauge, ydsPerStitch, ydsPerSqIn,
  YARN_WEIGHTS, STITCH_TYPES,
} from '../src/utils/yardage.js';
import { scaleCount } from '../src/utils/gaugeScale.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, '..', 'src', 'Calculators.jsx'), 'utf8');

/** Run a project at the gauge the selectors imply, unless the case overrides it. */
const run = c => {
  const ref = referenceGauge(c.weight, c.stitch);
  return estimateYardage({
    widthIn: c.w, heightIn: c.h, weightId: c.weight, stitchId: c.stitch,
    stsPer4: c.stsPer4 ?? ref.stsPer4,
    rowsPerInch: c.rowsPerInch ?? ref.rowsPerInch,
  });
};

// ── The table ────────────────────────────────────────────────────────────────
//
// LB = Lion Brand, "How Much Yarn Do You Need?"
//      https://www.lionbrand.com/pages/how-much-yarn-do-i-need  (verified 2026-08-08)
// Baby blanket area 33 x 44 in = midpoint of the 30x40-36x48 range in the Handy
//      Little Me blanket size chart (verified 2026-08-08).
// Scarf area 8 x 60 in, the size the LB scarf row is written against.

const CASES = [
  { name: '50x60 worsted throw, single crochet',
    w: 50, h: 60, weight: 'worsted', stitch: 'sc',
    lo: 1500, hi: 2500, slack: 0,
    src: 'Patons Light and Airy Afghan, 50x60 worsted, 2100+ yd' },

  { name: '50x60 worsted throw, half double',
    w: 50, h: 60, weight: 'worsted', stitch: 'hdc',
    lo: 1500, hi: 2500, slack: 0,
    src: 'same anchor; stitch height must not move the total' },

  { name: '50x60 worsted throw, double crochet',
    w: 50, h: 60, weight: 'worsted', stitch: 'dc',
    lo: 1500, hi: 2500, slack: 0,
    src: 'same anchor; stitch height must not move the total' },

  { name: 'Baby blanket 33x44, worsted, single crochet',
    w: 33, h: 44, weight: 'worsted', stitch: 'sc',
    lo: 1000, hi: 1125, src: 'LB baby blanket, Medium 4' },

  { name: 'Baby blanket 33x44, fingering, single crochet',
    w: 33, h: 44, weight: 'fingering', stitch: 'sc',
    lo: 1500, hi: 1625, src: 'LB baby blanket, Super Fine 1' },

  { name: 'Baby blanket 33x44, DK, single crochet',
    w: 33, h: 44, weight: 'dk', stitch: 'sc',
    lo: 1125, hi: 1250, src: 'LB baby blanket, Light 3' },

  { name: 'Baby blanket 33x44, bulky, single crochet',
    w: 33, h: 44, weight: 'bulky', stitch: 'sc',
    lo: 875, hi: 1000, src: 'LB baby blanket, Bulky 5' },

  { name: 'Baby blanket 33x44, super bulky, double crochet',
    w: 33, h: 44, weight: 'superbulky', stitch: 'dc',
    lo: 750, hi: 875, src: 'LB baby blanket, Super Bulky 6' },

  { name: 'Scarf 8x60, worsted, double crochet',
    w: 8, h: 60, weight: 'worsted', stitch: 'dc',
    lo: 275, hi: 375, src: 'LB scarf, Medium 4' },

  { name: 'Scarf 8x60, bulky, double crochet',
    w: 8, h: 60, weight: 'bulky', stitch: 'dc',
    lo: 250, hi: 350, src: 'LB scarf, Bulky 5' },

  { name: 'Scarf 8x60, fingering, single crochet',
    w: 8, h: 60, weight: 'fingering', stitch: 'sc',
    lo: 350, hi: 500, src: 'LB scarf, Super Fine 1' },

  { name: 'DK sweater panel 20x24, single crochet',
    w: 20, h: 24, weight: 'dk', stitch: 'sc',
    lo: 375, hi: 563,
    src: 'LB adult sweater Light 3 is 1500-2250 yd; one of four such panels' },

  // Amigurumi is the weakest row here and it is flagged as such. No reputable
  // published chart gives amigurumi yardage; the only figures found were on
  // auto-generated calculator sites. Band kept deliberately wide.
  { name: 'Amigurumi 8in, worsted sc worked tight (8x16in of surface)',
    w: 8, h: 16, weight: 'worsted', stitch: 'sc', stsPer4: 16, rowsPerInch: 4.5,
    lo: 60, hi: 300, src: 'WEAK: 8-12in toy 150-300 yd, content-farm source only' },
];

// Informational only. The model assumes solid fabric; a lace shawl entered as
// its bounding rectangle is mostly air, so this row is expected to over-predict
// and is reported rather than asserted.
const INFORMATIONAL = [
  { name: 'Fingering shawl 60x28 entered as a solid rectangle',
    w: 60, h: 28, weight: 'fingering', stitch: 'sc',
    lo: 550, hi: 850, src: 'LB shawl, Super Fine 1, open lace, model assumes solid' },
];

test('every project lands inside its sourced band', () => {
  const rows = [];
  for (const c of CASES) {
    const r = run(c);
    const slack = c.slack ?? 0.15;
    const lo = Math.round(c.lo * (1 - slack)), hi = Math.round(c.hi * (1 + slack));
    rows.push(`${pad(c.name, 58)} expect ${pad(`${c.lo}-${c.hi}`, 11)} actual ${pad(String(r.yards), 7)} ${r.ok ? 'ok ' : 'HELD'}  ${c.src}`);
    assert.ok(r.ok, `${c.name}: result was withheld, reason ${r.reason}`);
    assert.ok(r.yards >= lo && r.yards <= hi,
      `${c.name}: ${r.yards} yd is outside ${lo}-${hi} (source: ${c.src})`);
  }
  for (const c of INFORMATIONAL) {
    const r = run(c);
    rows.push(`${pad(c.name, 58)} expect ${pad(`${c.lo}-${c.hi}`, 11)} actual ${pad(String(r.yards), 7)} INFO  ${c.src}`);
  }
  console.log('\n' + rows.join('\n') + '\n');
});

test('the shipped default lands in the 1500-2500 yard band for a 50x60 throw', () => {
  const ref = referenceGauge('worsted', 'sc');
  const r = estimateYardage({
    widthIn: 50, heightIn: 60, weightId: 'worsted', stitchId: 'sc',
    stsPer4: ref.stsPer4, rowsPerInch: ref.rowsPerInch,
  });
  assert.equal(r.ok, true);
  assert.ok(r.yards >= 1500 && r.yards <= 2500, `default printed ${r.yards} yd`);
  assert.ok(r.skeins >= 8 && r.skeins <= 13, `default printed ${r.skeins} skeins`);
});

// ── The bug that shipped ─────────────────────────────────────────────────────

test('the old 0.5 yds-per-stitch default is now withheld, not printed', () => {
  const r = estimateYardage({
    widthIn: 50, heightIn: 60, weightId: 'worsted', stitchId: 'sc',
    stsPer4: 12, rowsPerInch: 6, ydsPerStitchOverride: 0.5,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too-dense');
  assert.equal(r.yards, 27000);            // the number the page used to print
  assert.equal(Math.ceil(r.yards / 200), 135);
});

test('a plausible measured override is accepted', () => {
  const ref = referenceGauge('worsted', 'sc');
  const r = estimateYardage({
    widthIn: 50, heightIn: 60, weightId: 'worsted', stitchId: 'sc',
    stsPer4: ref.stsPer4, rowsPerInch: ref.rowsPerInch, ydsPerStitchOverride: 0.055,
  });
  assert.equal(r.ok, true);
  assert.ok(r.yards > 1500 && r.yards < 2000);
});

test('an absurdly thin result is withheld too', () => {
  const ref = referenceGauge('worsted', 'sc');
  const r = estimateYardage({
    widthIn: 50, heightIn: 60, weightId: 'worsted', stitchId: 'sc',
    stsPer4: ref.stsPer4, rowsPerInch: ref.rowsPerInch, ydsPerStitchOverride: 0.005,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too-thin');
});

test('a size no one crochets is withheld even at the right density', () => {
  const ref = referenceGauge('worsted', 'sc');
  const r = estimateYardage({
    widthIn: 3500, heightIn: 4600, weightId: 'worsted', stitchId: 'sc',
    stsPer4: ref.stsPer4, rowsPerInch: ref.rowsPerInch,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too-big');
});

test('a king blanket in the finest yarn still gets an answer', () => {
  const ref = referenceGauge('lace', 'sc');
  const r = estimateYardage({
    widthIn: 108, heightIn: 100, weightId: 'lace', stitchId: 'sc',
    stsPer4: ref.stsPer4, rowsPerInch: ref.rowsPerInch,
  });
  assert.equal(r.ok, true, `king lace blanket was withheld (${r.yards} yd, reason ${r.reason})`);
});

test('missing inputs withhold rather than print zero', () => {
  assert.equal(estimateYardage({ widthIn: '', heightIn: 60, weightId: 'worsted', stitchId: 'sc', stsPer4: 12, rowsPerInch: 3.4 }).reason, 'no-size');
  assert.equal(estimateYardage({ widthIn: 50, heightIn: 60, weightId: 'worsted', stitchId: 'sc', stsPer4: '', rowsPerInch: 3.4 }).reason, 'no-gauge');
  assert.equal(estimateYardage({ widthIn: 50, heightIn: 60, weightId: 'worsted', stitchId: 'sc', stsPer4: 12, rowsPerInch: 0 }).reason, 'no-gauge');
});

// ── Model shape ──────────────────────────────────────────────────────────────

test('stitch height changes yards per stitch but not yards per square inch', () => {
  for (const w of YARN_WEIGHTS) {
    let last = 0;
    for (const s of STITCH_TYPES) {
      const per = ydsPerStitch(w.id, s.id);
      assert.ok(per > last, `${w.id}/${s.id}: taller stitch should eat more yarn per stitch`);
      last = per;
      const g = referenceGauge(w.id, s.id);
      const r = estimateYardage({
        widthIn: 40, heightIn: 40, weightId: w.id, stitchId: s.id,
        stsPer4: g.stsPer4, rowsPerInch: g.rowsPerInch,
      });
      assert.ok(Math.abs(r.density - ydsPerSqIn(w.id)) < 0.02,
        `${w.id}/${s.id}: density ${r.density} drifted from ${ydsPerSqIn(w.id)}`);
    }
  }
});

test('finer yarn takes more yards to cover the same area', () => {
  const order = ['superbulky', 'bulky', 'worsted', 'dk', 'sport', 'fingering', 'lace'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(ydsPerSqIn(order[i]) > ydsPerSqIn(order[i - 1]),
      `${order[i]} should need more yards per square inch than ${order[i - 1]}`);
  }
});

test('worsted single crochet sits near the published 0.70 yd per square inch', () => {
  assert.ok(Math.abs(ydsPerSqIn('worsted') - 0.70) < 0.001);
});

// ── Scale tab ────────────────────────────────────────────────────────────────

test('row counts scale by the row ratio, not the stitch ratio', () => {
  const scales = { stScale: 1.5, rowScale: 0.8 };
  assert.equal(scaleCount(100, scales, 'st').scaled, 150);
  assert.equal(scaleCount(100, scales, 'row').scaled, 80);
  assert.equal(scaleCount(100, scales).scaled, 150);   // default axis is stitches
});

test('scaleCount still reports its rounding error', () => {
  const r = scaleCount(3, { stScale: 1.1, rowScale: 1 }, 'st');   // 3.3 -> 3
  assert.equal(r.scaled, 3);
  assert.ok(r.flagged);
  assert.ok(Math.abs(r.error - 0.0909) < 0.001);
});

// ── Source-level regressions on the page itself ──────────────────────────────

test('the dead ternary is gone from Calculators.jsx', () => {
  assert.ok(!/stScale\s*:\s*stScale/.test(SRC), 'axis ternary still returns stScale on both branches');
});

test('the yardage tab no longer borrows the gauge tab row count', () => {
  const start = SRC.indexOf('YARDAGE ENGINE INPUTS'), end = SRC.indexOf('SCALING ENGINE');
  assert.ok(start > 0 && end > start, 'yardage block markers missing');
  const strip = s => s.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.ok(!strip(SRC.slice(start, end)).includes('roPerInch'),
    'yardage math still reads roPerInch from the gauge tab');
  assert.ok(!strip(SRC).includes('roPerInch||4'), 'the 4-vs-6 fallback is still there');
});

test('the raw 0.5 yds-per-stitch default is gone', () => {
  assert.ok(!/setYdsPerSt\s*\]\s*=\s*useState\("0\.5"\)/.test(SRC));
  assert.ok(!SRC.includes('yds per stitch" val={ydsPerSt}'));
});

function pad(s, n) { return String(s).length >= n ? String(s) : String(s) + ' '.repeat(n - String(s).length); }
