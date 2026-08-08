// ─────────────────────────────────────────────────────────────────────────────
// YARDAGE ENGINE
//
// The /tools yardage tab used to ask for "yds per stitch" as a raw number and
// shipped with 0.5 in the box. Half a yard is eighteen inches of yarn for one
// stitch. At the shipped defaults (50 x 60 in, 12 sts per 4 in) that printed
// 27,000 yards and "~135 skeins at 200 yds" for a blanket that really wants
// somewhere near 2,000. Nobody knows their yards per stitch, which is exactly
// why a placeholder survived on a public page for as long as it did. So the
// number is now derived from two things people do know: what yarn they are
// using and what stitch they are working.
//
// Everything below is derived, not invented, and every step names its source.
//
// ── STEP 1. Yards per square inch of fabric, medium/worsted ──────────────────
//
// Anchor: "Light and Airy Afghan" (Patons, published via Yarnspirations).
// Finished size approx 50 x 60 ins, worsted weight, 5.0 mm hook, 2100+ yards.
//   https://www.crochetpatternsgalore.com/light-and-airy-afghan-3664.html
//   verified 2026-08-08
// 2100 yd / (50 x 60 = 3000 sq in) = 0.70 yards per square inch.
//
// Cross-check, independent source: Lion Brand "How Much Yarn Do You Need?"
// puts a medium (4) baby blanket at 1000-1125 yards.
//   https://www.lionbrand.com/pages/how-much-yarn-do-i-need   verified 2026-08-08
// Standard baby blanket runs 30 x 40 to 36 x 48 in (Handy Little Me blanket
// size chart, https://www.handylittleme.com/crochet-blanket-sizes-and-how-much-yarn/,
// verified 2026-08-08), midpoint 33 x 44 = 1452 sq in.
// 0.70 x 1452 = 1016 yards, inside Lion Brand's 1000-1125. The two agree.
//
// ── STEP 2. The other yarn weights ───────────────────────────────────────────
//
// Same Lion Brand chart, baby blanket row, read across the weight columns.
// A blanket is the closest thing on that chart to what this calculator models:
// a plain rectangle of solid fabric. (The scarf row is a worse basis because a
// scarf's yardage is dominated by how narrow and how lacy the designer made it.)
//
//   Super Fine 1  1500-1625  mid 1562.5   ratio to medium 1.471
//   Fine 2        1250-1500  mid 1375     ratio 1.294
//   Light 3       1125-1250  mid 1187.5   ratio 1.118
//   Medium 4      1000-1125  mid 1062.5   ratio 1.000
//   Bulky 5        875-1000  mid  937.5   ratio 0.882
//   Super Bulky 6  750- 875  mid  812.5   ratio 0.765
//
// LACE IS NOT SOURCED. Lion Brand's chart starts at Super Fine 1. The lace
// figure below is that chart's own step size carried one rung further up
// (+187.5 yd, the gap it uses between weights 1 and 2). It is an extrapolation
// and it is labelled as one. Anyone crocheting a solid lace-weight blanket
// should measure rather than trust it.
//
// ── STEP 3. From yards per square inch to yards per stitch ───────────────────
//
// yards per stitch = (yards per square inch) / (stitches per square inch),
// evaluated at a reference gauge for that yarn weight and stitch.
//
// Reference stitches per inch: Craft Yarn Council Standard Yarn Weight System,
// single crochet gauge over 4 inches, midpoint of each published range.
//   https://www.craftyarncouncil.com/standards/yarn-weight-system  verified 2026-08-08
//   Lace 0: 32-42 · Super Fine 1: 21-32 · Fine 2: 16-20 · Light 3: 12-17
//   Medium 4: 11-14 · Bulky 5: 8-11 · Super Bulky 6: 7-9
//   (Note: CYC states the Lace row in double crochets, not single. Another
//   reason the lace column is the soft one.)
//
// Reference rows per inch for single crochet: sc rows run about 7.5% more
// numerous than sc stitches at the same gauge, from two published yarn labels:
//   Red Heart Super Saver, 5 mm hook: 14 sc and 15 rows = 4 in  (15/14 = 1.071)
//   Caron Simply Soft, H-8 hook:      13 sc and 14 rows = 4 in  (14/13 = 1.077)
//   both quoted at https://thecrochetcrowd.com/how-to-crochet-the-study-of-complicated-blanket/
//   verified 2026-08-08. Mean 1.075.
//
// Taller stitches: relative stitch heights, single crochet 1x, half double 1.4x,
// double 1.8x, treble 2.5x.
//   https://www.stitchsums.com/articles/crochet-pattern-math   verified 2026-08-08
// A taller stitch covers more rows per inch and eats proportionally more yarn
// per stitch, so the height ratio multiplies yards per stitch and divides rows
// per inch. Yards per square inch stays put, which is the point.
//
// ── What this model does NOT know ────────────────────────────────────────────
//
// It assumes solid fabric. Lace, filet, open shells and anything with big holes
// in it will come out over-predicted, because the model is counting square
// inches of yarn-filled fabric and lace is mostly air. A triangular shawl
// entered as its bounding rectangle will be over-predicted twice over. The
// plausibility guard below catches the catastrophic version of this, not the
// merely optimistic version.
// ─────────────────────────────────────────────────────────────────────────────

/** Yards of yarn per square inch of solid crochet fabric, by yarn weight.
 *  Medium is the measured anchor. Everything else is Lion Brand's baby-blanket
 *  column scaled onto it. See STEP 1 and STEP 2 above. */
const MEDIUM_YDS_PER_SQ_IN = 0.70;

/** cyc: Craft Yarn Council single-crochet gauge range, stitches per 4 inches.
 *  ratio: Lion Brand baby-blanket yardage relative to medium.
 *  sourced: false means the ratio is extrapolated, not published. */
export const YARN_WEIGHTS = [
  { id: "lace",       label: "Lace (0)",         cyc: [32, 42], ratio: 1.647, sourced: false },
  { id: "fingering",  label: "Fingering (1)",    cyc: [21, 32], ratio: 1.471, sourced: true },
  { id: "sport",      label: "Sport (2)",        cyc: [16, 20], ratio: 1.294, sourced: true },
  { id: "dk",         label: "DK (3)",           cyc: [12, 17], ratio: 1.118, sourced: true },
  { id: "worsted",    label: "Worsted (4)",      cyc: [11, 14], ratio: 1.000, sourced: true },
  { id: "bulky",      label: "Bulky (5)",        cyc: [8, 11],  ratio: 0.882, sourced: true },
  { id: "superbulky", label: "Super bulky (6)",  cyc: [7, 9],   ratio: 0.765, sourced: true },
];

/** Relative stitch heights against single crochet (stitchsums.com, see STEP 3). */
export const STITCH_TYPES = [
  { id: "sc",  label: "Single crochet",      height: 1.0 },
  { id: "hdc", label: "Half double crochet", height: 1.4 },
  { id: "dc",  label: "Double crochet",      height: 1.8 },
  { id: "tr",  label: "Treble crochet",      height: 2.5 },
];

/** sc rows per inch divided by sc stitches per inch, from published yarn labels. */
const SC_ROW_ASPECT = 1.075;

export const DEFAULT_SKEIN_YARDS = 200;

const weightOf = id => YARN_WEIGHTS.find(w => w.id === id) || YARN_WEIGHTS[4];
const stitchOf = id => STITCH_TYPES.find(s => s.id === id) || STITCH_TYPES[0];

/** Yards of yarn per square inch of solid fabric for a yarn weight. */
export const ydsPerSqIn = weightId => round(MEDIUM_YDS_PER_SQ_IN * weightOf(weightId).ratio, 4);

/** The gauge this model assumes when you pick a yarn weight and a stitch, in the
 *  same units the calculator asks for. Used to prefill the gauge boxes so the
 *  selectors and the numbers under them never silently disagree. */
export const referenceGauge = (weightId, stitchId) => {
  const w = weightOf(weightId), s = stitchOf(stitchId);
  const stsPer4 = (w.cyc[0] + w.cyc[1]) / 2;
  const rowsPerInch = (stsPer4 / 4) * SC_ROW_ASPECT / s.height;
  return { stsPer4: round(stsPer4, 1), rowsPerInch: round(rowsPerInch, 2) };
};

/** Yards of yarn one stitch of this weight and type consumes. */
export const ydsPerStitch = (weightId, stitchId) => {
  const g = referenceGauge(weightId, stitchId);
  const stitchesPerSqIn = (g.stsPer4 / 4) * g.rowsPerInch;
  return round(ydsPerSqIn(weightId) / stitchesPerSqIn, 5);
};

// ── Plausibility guard ───────────────────────────────────────────────────────
//
// The old default printed 9.0 yards of yarn per square inch of blanket with a
// completely straight face. Rather than trust that a number is right because
// arithmetic produced it, the result is checked against the density this model
// says that yarn weight makes, and withheld if it is nowhere near.
//
// The band is a third to three times the reference density. Three times covers
// a genuinely dense, tightly worked fabric; a third covers airy lace. Outside
// that, something in the inputs is wrong and a confident number is worse than
// no number, which is the same call the crochet stitch counter page makes.
const DENSITY_FLOOR = 1 / 3;
const DENSITY_CEILING = 3;

// The density band is blind to size: a 3500 x 4600 inch blanket at exactly the
// right density still prints eleven million yards with a straight face. So there
// is a second, cruder ceiling on the total. The largest thing anyone hand
// crochets is roughly a king blanket, 108 x 100 in, and in the finest yarn this
// tool covers that is about 12,500 yards. Twice that is not a crochet project,
// it is a typo in one of the dimensions.
const ABSURD_TOTAL_YARDS = 25000;

/**
 * @param {object} p
 * @param {number} p.widthIn        finished width, inches
 * @param {number} p.heightIn       finished height, inches
 * @param {number} p.stsPer4        stitch gauge, stitches per 4 inches
 * @param {number} p.rowsPerInch    row gauge, rows per inch (this tab's own, not the gauge tab's)
 * @param {string} p.weightId
 * @param {string} p.stitchId
 * @param {number} [p.ydsPerStitchOverride]  measured value, when someone has one
 * @param {number} [p.skeinYards]
 * @returns {{ok:boolean, reason:string|null, yards:number, skeins:number,
 *            totalStitches:number, areaSqIn:number, density:number,
 *            referenceDensity:number, ydsPerSt:number}}
 */
export function estimateYardage({
  widthIn, heightIn, stsPer4, rowsPerInch, weightId, stitchId,
  ydsPerStitchOverride, skeinYards = DEFAULT_SKEIN_YARDS,
}) {
  const w = num(widthIn), h = num(heightIn), g = num(stsPer4), r = num(rowsPerInch);
  const perSt = ydsPerStitchOverride == null || ydsPerStitchOverride === ""
    ? ydsPerStitch(weightId, stitchId)
    : num(ydsPerStitchOverride);
  const referenceDensity = ydsPerSqIn(weightId);
  const areaSqIn = w * h;

  const blank = extra => ({
    ok: false, yards: 0, skeins: 0, totalStitches: 0,
    areaSqIn, density: 0, referenceDensity, ydsPerSt: perSt, ...extra,
  });

  if (!(w > 0) || !(h > 0)) return blank({ reason: "no-size" });
  if (!(g > 0) || !(r > 0)) return blank({ reason: "no-gauge" });
  if (!(perSt > 0)) return blank({ reason: "no-consumption" });

  const totalStitches = Math.round((g / 4) * w * h * r);
  const yards = Math.round(totalStitches * perSt);
  const density = yards / areaSqIn;

  const result = {
    ok: true, reason: null, yards, skeins: Math.ceil(yards / skeinYards),
    totalStitches, areaSqIn, density: round(density, 3), referenceDensity, ydsPerSt: perSt,
  };

  if (density > referenceDensity * DENSITY_CEILING) return { ...result, ok: false, reason: "too-dense" };
  if (density < referenceDensity * DENSITY_FLOOR) return { ...result, ok: false, reason: "too-thin" };
  if (yards > ABSURD_TOTAL_YARDS) return { ...result, ok: false, reason: "too-big" };
  return result;
}

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function round(n, places) { const f = 10 ** places; return Math.round(n * f) / f; }
