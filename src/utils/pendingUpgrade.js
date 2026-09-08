// ─── THE PICKED-PLAN INTENT ──────────────────────────────────────────────────
//
// WHY THIS FILE EXISTS
// When a visitor clicks a paid plan before they have an account, the picked
// tier and billing cadence are stashed in sessionStorage so the signup flow
// can open Stripe on the far side without asking them to pick again. The keys
// survive an OAuth round-trip, a reload and any remount, which is the whole
// point of using storage rather than React state.
//
// Surviving is also the failure. Audited live 2026-09-08: click "Go Craft",
// walk off that screen without using a close control, take the free route
// instead, and the keys were still sitting there. The post-signup handler
// reads them and fires checkout. Someone who chose FREE could be sent to a
// PAID checkout.
//
// The root cause was not the missing clear. It was that reading, writing and
// clearing were open-coded sessionStorage calls scattered across App.jsx,
// Auth.jsx and AuthWallModal.jsx, so "clear it when the user backs out" was a
// thing each site had to remember separately, and the full-page Auth screen
// forgot. One module, three functions, and the clear is now something you can
// call rather than something you have to remember to type.
//
// Every function takes the storage object so it can be tested against a plain
// Map-backed fake, and every one is total: a storage that throws (Safari
// private mode, storage disabled) degrades to "no intent", never to a crash.

export const PENDING_UPGRADE_KEY = "wovely_pending_upgrade_tier";
export const PENDING_UPGRADE_CADENCE_KEY = "wovely_pending_upgrade_cadence";

// Billing cadence when none was recorded. Monthly is the safe default: it is
// the smaller charge, so a lost cadence can never silently bill a year.
export const DEFAULT_CADENCE = "monthly";

const store = (s) => {
  if (s) return s;
  try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; }
};

/** { tier, cadence } for the stashed intent, or { tier: null, cadence: null }. */
export const readPendingUpgrade = (s) => {
  const st = store(s);
  if (!st) return { tier: null, cadence: null };
  try {
    const tier = st.getItem(PENDING_UPGRADE_KEY) || null;
    if (!tier) return { tier: null, cadence: null };
    return { tier, cadence: st.getItem(PENDING_UPGRADE_CADENCE_KEY) || DEFAULT_CADENCE };
  } catch { return { tier: null, cadence: null }; }
};

/**
 * Record a picked paid plan. A falsy tier means the visitor picked Free, and
 * picking Free is not a weaker intent than picking Craft — it is the explicit
 * opposite — so it CLEARS rather than storing an empty string.
 */
export const writePendingUpgrade = (tier, cadence, s) => {
  const st = store(s);
  if (!st) return;
  try {
    if (!tier) {
      st.removeItem(PENDING_UPGRADE_KEY);
      st.removeItem(PENDING_UPGRADE_CADENCE_KEY);
      return;
    }
    st.setItem(PENDING_UPGRADE_KEY, tier);
    st.setItem(PENDING_UPGRADE_CADENCE_KEY, cadence || DEFAULT_CADENCE);
  } catch {}
};

/** Drop the intent. Called on every route out of a paid flow, and on success. */
export const clearPendingUpgrade = (s) => {
  const st = store(s);
  if (!st) return;
  try {
    st.removeItem(PENDING_UPGRADE_KEY);
    st.removeItem(PENDING_UPGRADE_CADENCE_KEY);
  } catch {}
};

/**
 * The single question the money path asks: should this signup open checkout?
 *
 * Kept as a function rather than an `if` at each call site so the answer is
 * one testable thing. `alreadyPaid` is the guard that stops an existing
 * subscriber being sent to Stripe for a second subscription.
 */
export const shouldOpenCheckout = ({ tier, isAnonymous = false, alreadyPaid = false }) => {
  if (!tier) return false;
  if (isAnonymous) return false;
  if (alreadyPaid) return false;
  return true;
};
