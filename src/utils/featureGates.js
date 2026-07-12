// Feature gate definitions. Each key maps to the list of tiers that can
// access the feature. canAccess(feature, tier) is the only check call
// sites should use — keeps the gating logic in one place so adding or
// moving a feature between tiers is a single-line change here.
//
// Convention: list tiers in ascending order (cheapest first). requiredTier
// returns the cheapest tier in the allowlist so the upgrade prompt can
// recommend the right plan.

import { TIER_FREE, TIER_PRO, TIER_CRAFT } from './tierUtils.js';

export const FEATURE_GATES = {
  // Craft is a 100-pattern fair-use tier, NOT truly unlimited. The real cap is
  // enforced via TIER_CONFIG.craft.patternCap (100) + FairUseWall. Keep this
  // empty so no tier is ever flagged "unlimited" and a future edit can't
  // silently uncap Craft by wiring canAccessUnlimitedPatterns to enforcement.
  unlimitedPatterns: [],
  bevCheck:          [TIER_CRAFT],
  chunkedImport:     [TIER_CRAFT],
  collections:       [TIER_CRAFT],
  chartImages:       [TIER_CRAFT], // server-side classification always runs; this gates display in PatternDetail
  bevsRead:          [TIER_CRAFT], // future — not exposed in UI yet
};

// Anonymous (guest) users are below Free — they cannot use any gated
// feature, AND they get a stricter pattern cap (handled outside this map
// via ANON_PATTERN_CAP). Every gate call site that has the anonymous flag
// available should short-circuit on it before consulting the tier map.
export const ANON_PATTERN_CAP = 1;
export const ANON_PREVIEW_FRACTION = 0.25;

export const canAccess = (feature, tier, isAnonymous = false) => {
  if (isAnonymous) return false;
  const allowed = FEATURE_GATES[feature];
  // Unknown features default open — better than silently locking a typo.
  return allowed ? allowed.includes(tier) : true;
};

export const requiredTier = (feature) => {
  const allowed = FEATURE_GATES[feature];
  if (!allowed || allowed.length === 0) return TIER_FREE;
  if (allowed.includes(TIER_PRO)) return TIER_PRO;
  return TIER_CRAFT;
};

// Convenience helpers for the gates that get checked most often. Kept as
// thin wrappers so call sites read naturally at the point of use.
export const canAccessCollections = (tier, isAnonymous=false) => canAccess('collections', tier, isAnonymous);
export const canAccessBevCheck = (tier, isAnonymous=false) => canAccess('bevCheck', tier, isAnonymous);
export const canAccessChunkedImport = (tier, isAnonymous=false) => canAccess('chunkedImport', tier, isAnonymous);
export const canAccessUnlimitedPatterns = (tier, isAnonymous=false) => canAccess('unlimitedPatterns', tier, isAnonymous);
export const canAccessChartImages = (tier, isAnonymous=false) => canAccess('chartImages', tier, isAnonymous);
