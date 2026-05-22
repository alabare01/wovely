// Three-tier plan helpers. `tier` is the source of truth on user_profiles
// (migration 008). The legacy `is_pro` boolean is kept for backward compat
// during the transition; derive it from tier when the new column is set.

export const TIER_FREE = 'free';
export const TIER_PRO = 'pro';
export const TIER_CRAFT = 'craft';

const VALID_TIERS = new Set([TIER_FREE, TIER_PRO, TIER_CRAFT]);

// Anonymous (guest) users live BELOW the Free tier. Their DB profile row is
// still tier='free' so the rest of the stack keeps working, but the UI applies
// stricter caps (1 pattern, 25% preview). Anonymous status comes from the JWT
// `is_anonymous` claim, not from the tier column — keep the two concepts
// distinct.
export const isAnonymousTier = (isAnonymous) => isAnonymous === true;

export const normalizeTier = (t) => (VALID_TIERS.has(t) ? t : TIER_FREE);

// True for any paying tier. Replaces the old is_pro boolean wherever the
// distinction is "free vs paying" rather than "Pro vs Craft".
export const isPaidTier = (tier) => tier === TIER_PRO || tier === TIER_CRAFT;

// True only for the top tier. Use for Craft-exclusive gates (Collections,
// future Bev's Read).
export const isCraftTier = (tier) => tier === TIER_CRAFT;

export const tierLabel = (tier) => ({
  [TIER_FREE]: 'Free',
  [TIER_PRO]: 'Pro',
  [TIER_CRAFT]: 'Craft',
}[normalizeTier(tier)]);

// Derive tier from a legacy is_pro boolean for the cohort that predates the
// tier column. Pre-migration testers landed on Craft. Anything else is Free.
export const tierFromLegacyIsPro = (isPro) => (isPro ? TIER_CRAFT : TIER_FREE);

// Read the cached tier from localStorage. Prefers the new yh_tier key,
// falls back to the legacy yh_is_pro flag for sessions that haven't
// refreshed their profile fetch yet. Always returns a valid tier.
export const readCachedTier = () => {
  try {
    const direct = localStorage.getItem('yh_tier');
    if (direct && VALID_TIERS.has(direct)) return direct;
    const legacy = localStorage.getItem('yh_is_pro');
    if (legacy === 'true') return TIER_CRAFT;
    return TIER_FREE;
  } catch {
    return TIER_FREE;
  }
};

export const writeCachedTier = (tier) => {
  const normalized = normalizeTier(tier);
  try {
    localStorage.setItem('yh_tier', normalized);
    // Keep yh_is_pro in sync for any legacy reader that's still around.
    if (isPaidTier(normalized)) localStorage.setItem('yh_is_pro', 'true');
    else localStorage.removeItem('yh_is_pro');
  } catch {}
};

export const clearCachedTier = () => {
  try {
    localStorage.removeItem('yh_tier');
    localStorage.removeItem('yh_is_pro');
  } catch {}
};

// Anonymous flag cache — mirrors the JWT is_anonymous claim so the next page
// load doesn't flash "free user UI" before the JWT is decoded.
export const readCachedIsAnonymous = () => {
  try { return localStorage.getItem('yh_is_anonymous') === 'true'; }
  catch { return false; }
};

export const writeCachedIsAnonymous = (isAnon) => {
  try {
    if (isAnon) localStorage.setItem('yh_is_anonymous', 'true');
    else localStorage.removeItem('yh_is_anonymous');
  } catch {}
};

export const clearCachedIsAnonymous = () => {
  try { localStorage.removeItem('yh_is_anonymous'); } catch {}
};
