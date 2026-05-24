// Collections data layer — Supabase REST helpers.
//
// Matches the no-SDK pattern used elsewhere in the app: direct fetch to
// the PostgREST endpoints with the user's JWT for RLS. Every helper
// returns { data, error } so call sites can decide what to do without
// throwing through React render paths.
//
// Per migration 009:
//   collections(id, user_id, name, description, cover_image_url,
//               collection_type, created_at, updated_at)
//   patterns(... collection_id, collection_order, is_collection_part)
//
// Sequencing rule: collection_order is 1-based for MKAL clues, 0 means
// "unordered" (general collections). The detail view sorts by order
// then by created_at as a tiebreaker.

import { SUPABASE_URL, SUPABASE_ANON_KEY, getSession, supabaseAuth } from "../supabase.js";

const headers = () => {
  const s = getSession();
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${s?.access_token || ""}`,
    "Content-Type": "application/json",
  };
};

// List all of the active user's collections, newest first.
export const listCollections = async () => {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/collections?select=*&order=created_at.desc`,
      { headers: headers() },
    );
    if (!res.ok) return { error: await res.text() };
    return { data: await res.json() };
  } catch (e) { return { error: e.message }; }
};

// Patterns inside a single collection, ordered for MKAL display.
export const listPatternsInCollection = async (collectionId) => {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/patterns?collection_id=eq.${collectionId}&status=neq.deleted&order=collection_order.asc,created_at.asc`,
      { headers: headers() },
    );
    if (!res.ok) return { error: await res.text() };
    return { data: await res.json() };
  } catch (e) { return { error: e.message }; }
};

// Create a new collection row. Returns the inserted record so the
// caller can stash the id for subsequent pattern link-ups.
export const createCollection = async ({ name, description, collection_type, cover_image_url, part_label, expected_part_count }) => {
  const user = supabaseAuth.getUser();
  if (!user) return { error: "Not authenticated" };
  try {
    const body = {
      user_id: user.id,
      name: name || "Untitled Collection",
      description: description || null,
      collection_type: collection_type || "general",
      cover_image_url: cover_image_url || null,
    };
    // Only send optional metadata when present — Supabase rejects unknown
    // columns from older clients otherwise, and we want this helper to
    // stay usable from the lightweight zero-friction create paths too.
    if (part_label) body.part_label = part_label;
    if (typeof expected_part_count === "number" && expected_part_count > 0) body.expected_part_count = expected_part_count;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/collections`, {
      method: "POST",
      headers: { ...headers(), "Prefer": "return=representation" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: await res.text() };
    const rows = await res.json();
    return { data: Array.isArray(rows) ? rows[0] : rows };
  } catch (e) { return { error: e.message }; }
};

// Pull the part label from a collection row with a safe default. The
// column was added in migration 010 — older rows pre-migration return
// null, so default to "Part" so the UI never renders "undefined 1".
export const partLabelFor = (collection) => (collection?.part_label || "Part");
export const partLabelPlural = (collection) => {
  const base = partLabelFor(collection);
  // English plural rule covers Clue/Part/Section/Chapter/Module/Block.
  return /s$/i.test(base) ? base : `${base}s`;
};

export const updateCollection = async (id, patch) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/collections?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...headers(), "Prefer": "return=representation" },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return { error: await res.text() };
    const rows = await res.json();
    return { data: Array.isArray(rows) ? rows[0] : rows };
  } catch (e) { return { error: e.message }; }
};

// Delete the collection along with its clue patterns. A standalone "Clue #2"
// stripped of its collection is meaningless clutter, so the collection-part
// patterns are deleted outright rather than released back into the library.
// Their pattern_images cascade-delete via FK. Any non-clue patterns that were
// loosely linked have their collection_id nulled by the collection FK.
export const deleteCollection = async (id) => {
  try {
    // Delete the clue patterns first (before the collection row, so the query
    // still resolves them by collection_id).
    await fetch(`${SUPABASE_URL}/rest/v1/patterns?collection_id=eq.${id}&is_collection_part=eq.true`, {
      method: "DELETE",
      headers: { ...headers(), "Prefer": "return=minimal" },
    });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/collections?id=eq.${id}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (!res.ok) return { error: await res.text() };
    return { data: true };
  } catch (e) { return { error: e.message }; }
};

// Link a pattern to a collection at the given order (defaults to next
// available slot). Caller computes nextOrder; this helper just writes.
export const linkPatternToCollection = async (patternId, collectionId, order) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${patternId}`, {
      method: "PATCH",
      headers: { ...headers(), "Prefer": "return=minimal" },
      body: JSON.stringify({
        collection_id: collectionId,
        collection_order: order ?? 0,
        is_collection_part: true,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) return { error: await res.text() };
    return { data: true };
  } catch (e) { return { error: e.message }; }
};

// Remove a pattern from its collection without deleting the pattern.
export const unlinkPatternFromCollection = async (patternId) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${patternId}`, {
      method: "PATCH",
      headers: { ...headers(), "Prefer": "return=minimal" },
      body: JSON.stringify({
        collection_id: null,
        collection_order: 0,
        is_collection_part: false,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) return { error: await res.text() };
    return { data: true };
  } catch (e) { return { error: e.message }; }
};

// Update collection_order on a single pattern. Used by the up/down
// reorder buttons in the MKAL detail view.
export const setPatternOrder = async (patternId, order) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/patterns?id=eq.${patternId}`, {
      method: "PATCH",
      headers: { ...headers(), "Prefer": "return=minimal" },
      body: JSON.stringify({ collection_order: order, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) return { error: await res.text() };
    return { data: true };
  } catch (e) { return { error: e.message }; }
};

// 3-per-rolling-30-days cap for Craft members. Client-side check before
// opening the create flow; server-side enforcement happens via RLS +
// the application layer (no separate API route per the no-new-routes
// constraint in CLAUDE.md). Returns { used, cap, available, nextSlotAt }
// so the UI can render the remaining-count and the next-available date.
const MONTHLY_CAP = 3;

export const getMonthlyCollectionUsage = async () => {
  const user = supabaseAuth.getUser();
  if (!user) return { error: "Not authenticated" };
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/collections?user_id=eq.${user.id}&created_at=gte.${since}&select=created_at&order=created_at.asc`,
      { headers: headers() },
    );
    if (!res.ok) return { error: await res.text() };
    const rows = await res.json();
    const used = rows.length;
    const cap = MONTHLY_CAP;
    // When the user is at cap, the next slot opens 30 days after their
    // oldest in-window collection rolls off. Returned as an ISO string
    // so the UI can format it however it wants.
    let nextSlotAt = null;
    if (used >= cap && rows[0]?.created_at) {
      nextSlotAt = new Date(new Date(rows[0].created_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    return { data: { used, cap, available: Math.max(0, cap - used), nextSlotAt } };
  } catch (e) { return { error: e.message }; }
};

// Merge materials arrays from multiple patterns. Yarn entries with the
// same name get their yardage summed; everything else is deduped by
// name (case-insensitive). Returns the merged array in priority order
// of the source patterns — pass clues in clue-1-first order so Clue 1's
// full materials list anchors the merged view.
export const mergeMaterials = (patterns) => {
  const merged = new Map();
  for (const p of (patterns || [])) {
    for (const m of (p?.materials || [])) {
      const key = (m.name || "").toLowerCase().trim();
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...m });
      } else if (m.yardage > 0) {
        // Yarn-like materials carry yardage we can sum across clues.
        existing.yardage = (existing.yardage || 0) + m.yardage;
      }
    }
  }
  return Array.from(merged.values());
};

// Aggregate progress across every pattern in a collection. Returns the
// percentage of checkable rows that are done. Headers and note-only
// rows don't count, matching the pct() helper used elsewhere.
export const aggregatePct = (patterns) => {
  let done = 0, total = 0;
  for (const p of (patterns || [])) {
    const checkable = (p.rows || []).filter(r => !r.isHeader && !r.isNoteOnly);
    total += checkable.length;
    done += checkable.filter(r => r.done).length;
  }
  return total > 0 ? Math.round((done / total) * 100) : 0;
};
