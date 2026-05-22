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
  unlimitedPatterns: [TIER_PRO, TIER_CRAFT],
  bevCheck:          [TIER_PRO, TIER_CRAFT],
  chunkedImport:     [TIER_PRO, TIER_CRAFT],
  collections:       [TIER_CRAFT],
  bevsRead:          [TIER_CRAFT], // future — not exposed in UI yet
};

export const canAccess = (feature, tier) => {
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
export const canAccessCollections = (tier) => canAccess('collections', tier);
export const canAccessBevCheck = (tier) => canAccess('bevCheck', tier);
export const canAccessChunkedImport = (tier) => canAccess('chunkedImport', tier);
export const canAccessUnlimitedPatterns = (tier) => canAccess('unlimitedPatterns', tier);
