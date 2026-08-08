// Gauge scaling for the /tools Scale tab.
//
// This lived inline in Calculators.jsx and carried a dead ternary:
//
//   const factor = axis === "row" ? stScale : stScale;
//
// Both branches were the stitch multiplier, so a row count asked to scale came
// back scaled by the stitch ratio. That is only right when stitch gauge and row
// gauge happen to differ by the same amount, which is the uncommon case, not the
// common one. It lives here now so the row branch is something a test can hold.

/**
 * @param {number} n      the count the pattern states
 * @param {{stScale:number, rowScale:number}} scales
 * @param {"st"|"row"} axis  which gauge governs this count
 */
export function scaleCount(n, { stScale = 1, rowScale = 1 } = {}, axis = "st") {
  const factor = axis === "row" ? rowScale : stScale;
  const target = n * factor;
  const scaled = Math.round(target);
  const error = Math.abs(scaled - target) / (target || 1);
  return { scaled, factor, error, flagged: error > 0.05 };
}
