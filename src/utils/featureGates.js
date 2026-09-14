// Feature gate definitions. Each key maps to the list of tiers that can
// access the feature. canAccess(feature, tier) is the only check call
// sites should use — keeps the gating logic in one place so adding or
// moving a feature between tiers is a single-line change here.
//
// Convention: list tiers in ascending order (cheapest first). requiredTier
// returns the cheapest tier in the allowlist so the upgrade prompt can
// recommend the right plan.

import { TIER_FREE, TIER_CRAFT } from './tierUtils.js';

export const FEATURE_GATES = {
  // Craft is a 100-pattern fair-use tier, NOT truly unlimited. The real cap is
  // enforced via TIER_CONFIG.craft.patternCap (100) + FairUseWall. Keep this
  // empty so no tier is ever flagged "unlimited" and a future edit can't
  // silently uncap Craft by wiring canAccessUnlimitedPatterns to enforcement.
  unlimitedPatterns: [],
  // BevCheck is marketed on the Free card ("BevCheck on every import"), so
  // Free holds the gate. It used to read [TIER_CRAFT], which contradicted the
  // pricing page outright — the only reason no free user was ever locked out
  // is that nothing called canAccessBevCheck. A gate nobody reads is not a
  // gate, it is a trap primed for whoever wires it up next.
  //
  // The wedge did not disappear, it moved to scope. Free gets the four core
  // checks (sequence, stitch math, duplicate rounds, cross-references) on
  // every import. Craft gets full verification: the advisory checks
  // (translation artifacts, component structure) on top. That is the same
  // boundary /crochet-stitch-counter already ships publicly — one round free,
  // the whole pattern paid — so the two surfaces now tell one story.
  bevCheck:          [TIER_FREE, TIER_CRAFT],
  bevCheckAdvisory:  [TIER_CRAFT],
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
// Retired 2026-09-14 (apr-20260911-3k73jsa7): a guest sees and ticks every
// row of the one pattern they started. Kept at 1 so any stale import reads as
// "show everything" rather than throwing.
export const ANON_PREVIEW_FRACTION = 1;

export const canAccess = (feature, tier, isAnonymous = false) => {
  if (isAnonymous) return false;
  const allowed = FEATURE_GATES[feature];
  // Unknown features default open — better than silently locking a typo.
  return allowed ? allowed.includes(tier) : true;
};

// The cheapest tier that unlocks a feature, used to pick which plan the
// upgrade prompt recommends. It must never answer TIER_PRO: Pro is a legacy
// entitlement that some old user_profiles rows still carry, but nobody can buy
// it (api/stripe-checkout.js sells craft and nothing else). Recommending it
// would send a customer looking for a plan that does not exist, which is
// exactly the dead end the import-job gate used to create.
export const requiredTier = (feature) => {
  const allowed = FEATURE_GATES[feature];
  if (!allowed || allowed.length === 0) return TIER_FREE;
  // A gate that admits Free costs nothing to satisfy. Answering Craft here
  // would put an upgrade prompt in front of a feature the customer already
  // has, which is the fastest way to lose the ones who trusted the free card.
  if (allowed.includes(TIER_FREE)) return TIER_FREE;
  return TIER_CRAFT;
};

// Convenience helpers for the gates that get checked most often. Kept as
// thin wrappers so call sites read naturally at the point of use.
export const canAccessCollections = (tier, isAnonymous=false) => canAccess('collections', tier, isAnonymous);
export const canAccessBevCheck = (tier, isAnonymous=false) => canAccess('bevCheck', tier, isAnonymous);
export const canAccessChunkedImport = (tier, isAnonymous=false) => canAccess('chunkedImport', tier, isAnonymous);
export const canAccessUnlimitedPatterns = (tier, isAnonymous=false) => canAccess('unlimitedPatterns', tier, isAnonymous);
export const canAccessChartImages = (tier, isAnonymous=false) => canAccess('chartImages', tier, isAnonymous);
export const canAccessBevCheckAdvisory = (tier, isAnonymous=false) => canAccess('bevCheckAdvisory', tier, isAnonymous);

// ── BevCheck scope ──────────────────────────────────────────────────────────
// Every BevCheck report comes back with all six checks, each tagged
// tier: "core" | "advisory" by api/extract-pattern.js. Who sees which is an
// entitlement decision, and it belongs here rather than duplicated across the
// three components that render a report (StitchCheck, AddPatternModal,
// ImageImportModal).
export const BEVCHECK_SCOPE_FULL = 'full';
export const BEVCHECK_SCOPE_CORE = 'core';

// Guests resolve to 'core', not "nothing": a guest gets one import and the
// Free card promises BevCheck on every import, so the core checks have to
// come with it. canAccess short-circuits anonymous to false, which is exactly
// the answer we want for the ADVISORY half.
export const bevCheckScope = (tier, isAnonymous = false) =>
  canAccessBevCheckAdvisory(tier, isAnonymous) ? BEVCHECK_SCOPE_FULL : BEVCHECK_SCOPE_CORE;

// A check with no explicit tier is treated as core. Defaulting the other way
// would let a provider that omits the field quietly hide checks a free user
// is entitled to see.
export const isAdvisoryCheck = (c) => c?.tier === 'advisory';

// The checks a given scope may render. Core scope drops advisory checks
// entirely — this is the enforcement, not a styling choice, so it runs on the
// data before any component gets to lay it out.
export const visibleBevCheckChecks = (checks, scope) => {
  const all = Array.isArray(checks) ? checks : [];
  return scope === BEVCHECK_SCOPE_FULL ? all : all.filter((c) => !isAdvisoryCheck(c));
};

// How many checks are being withheld, so the upsell can name a real number
// instead of gesturing at "more".
export const withheldBevCheckCount = (checks, scope) => {
  const all = Array.isArray(checks) ? checks : [];
  return all.length - visibleBevCheckChecks(all, scope).length;
};
