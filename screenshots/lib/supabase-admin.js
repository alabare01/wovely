// Supabase admin helpers for the screenshot harness. All calls use the service
// role key (bypasses RLS) so the harness can create accounts, set tiers, and
// clone patterns across users. Self-contained over REST — no MCP, no SDK.

import { env } from "./env.js";

const URL_BASE = env.SUPABASE_URL;

function svcHeaders(extra = {}) {
  const key = env.SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest(pathAndQuery, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathAndQuery}`, {
    method,
    headers: svcHeaders(prefer ? { Prefer: prefer } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`REST ${method} ${pathAndQuery} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function authAdmin(path, { method = "GET", body } = {}) {
  const res = await fetch(`${URL_BASE}/auth/v1/${path}`, {
    method,
    headers: svcHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`AUTH ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

// ─── Users ───────────────────────────────────────────────────────────────────

// Find an auth user by email by paging the admin list endpoint.
export async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const data = await authAdmin(`admin/users?page=${page}&per_page=200`);
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) break; // last page
  }
  return null;
}

// Create a user with the email already confirmed (so password sign-in works
// immediately, no email round-trip). Idempotent: returns the existing user if
// one already has this email.
export async function ensureUser(email, password) {
  const existing = await findUserByEmail(email);
  if (existing) return { id: existing.id, created: false };
  const created = await authAdmin("admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true },
  });
  return { id: created.id, created: true };
}

export async function deleteUser(userId) {
  // Remove app data first in case FKs aren't ON DELETE CASCADE.
  await rest(`pattern_images?user_id=eq.${userId}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
  await rest(`patterns?user_id=eq.${userId}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
  await rest(`import_jobs?user_id=eq.${userId}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
  await rest(`collections?user_id=eq.${userId}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
  await authAdmin(`admin/users/${userId}`, { method: "DELETE" });
}

// ─── Profile / tier ──────────────────────────────────────────────────────────

// Upsert the user_profiles row with the right tier and onboarding marked done
// (so the app lands on the dashboard, not the onboarding flow).
export async function setTierAndProfile(userId, tier) {
  await rest("user_profiles", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      id: userId,
      tier,
      is_pro: tier === "pro" || tier === "craft",
      has_completed_onboarding: true,
    },
  });
}

// ─── Patterns ────────────────────────────────────────────────────────────────

export async function countPatterns(userId) {
  const rows = await rest(`patterns?user_id=eq.${userId}&is_starter=eq.false&select=id`);
  return Array.isArray(rows) ? rows.length : 0;
}

export async function listPatterns(userId) {
  return rest(`patterns?user_id=eq.${userId}&select=id,title,collection_id&order=created_at.asc`);
}

export async function deletePatternsForUser(userId) {
  await rest(`pattern_images?user_id=eq.${userId}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
  await rest(`patterns?user_id=eq.${userId}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
}

// Columns we must not copy verbatim when cloning a pattern into another user.
const PATTERN_SKIP_COLS = new Set(["id", "user_id", "created_at", "updated_at", "collection_id", "is_collection_part", "collection_order"]);

// Clone a source pattern (and its pattern_images) into targetUserId. Returns the
// new pattern id. Charts/photos reference public Cloudinary URLs, so they render
// for the clone without re-upload.
export async function clonePattern(sourceId, targetUserId) {
  const srcRows = await rest(`patterns?id=eq.${sourceId}&select=*`);
  const src = Array.isArray(srcRows) ? srcRows[0] : null;
  if (!src) throw new Error(`Clone source pattern ${sourceId} not found`);

  const insert = { user_id: targetUserId, is_starter: false };
  for (const [k, v] of Object.entries(src)) {
    if (!PATTERN_SKIP_COLS.has(k)) insert[k] = v;
  }
  const inserted = await rest("patterns", {
    method: "POST",
    prefer: "return=representation",
    body: insert,
  });
  const newId = (Array.isArray(inserted) ? inserted[0] : inserted)?.id;
  if (!newId) throw new Error("Pattern clone insert returned no id");

  const imgs = await rest(`pattern_images?pattern_id=eq.${sourceId}&select=*`);
  if (Array.isArray(imgs) && imgs.length) {
    const imgInserts = imgs.map((img) => {
      const row = { pattern_id: newId, user_id: targetUserId };
      for (const [k, v] of Object.entries(img)) {
        if (!["id", "pattern_id", "user_id", "created_at"].includes(k)) row[k] = v;
      }
      return row;
    });
    await rest("pattern_images", { method: "POST", prefer: "return=minimal", body: imgInserts });
  }
  return newId;
}

// First pattern id for an account (for /pattern/:id navigation).
export async function firstPatternId(userId) {
  const rows = await rest(`patterns?user_id=eq.${userId}&is_starter=eq.false&select=id&order=created_at.asc&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}

// A pattern id for this account that has chart images (for the lightbox capture).
export async function patternIdWithCharts(userId) {
  const imgs = await rest(`pattern_images?user_id=eq.${userId}&image_type=eq.chart&select=pattern_id&limit=1`);
  return Array.isArray(imgs) && imgs[0] ? imgs[0].pattern_id : null;
}

export async function firstCollectionId(userId) {
  const rows = await rest(`collections?user_id=eq.${userId}&select=id&order=created_at.asc&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}

// Ensure the account has a collection with a couple of patterns linked, so the
// /collections/:id detail view (a Craft headline feature) has content to show.
export async function ensureCollection(userId, name = "Sample Collection") {
  const existing = await firstCollectionId(userId);
  if (existing) return existing;

  const patterns = await rest(`patterns?user_id=eq.${userId}&is_starter=eq.false&select=id&order=created_at.asc&limit=2`);
  const ids = (Array.isArray(patterns) ? patterns : []).map((p) => p.id);

  const inserted = await rest("collections", {
    method: "POST",
    prefer: "return=representation",
    body: { user_id: userId, name, collection_type: "general", pattern_count: ids.length },
  });
  const collectionId = (Array.isArray(inserted) ? inserted[0] : inserted)?.id;
  if (!collectionId) throw new Error("Collection insert returned no id");

  for (let i = 0; i < ids.length; i++) {
    await rest(`patterns?id=eq.${ids[i]}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { collection_id: collectionId, is_collection_part: true, collection_order: i },
    });
  }
  return collectionId;
}

// ─── S76 audit helpers ───────────────────────────────────────────────────────

// Lightweight metadata for an account's patterns: id, title, and structural
// section count (header rows, falling back to components length). Used to pick
// which pattern feeds the hub capture (sections > 3) vs the inline capture.
export async function listPatternsMeta(userId) {
  const rows = await rest(
    `patterns?user_id=eq.${userId}&is_starter=eq.false&select=id,title,components,rows,collection_id&order=created_at.asc`,
  );
  return (Array.isArray(rows) ? rows : []).map((p) => {
    const headerRows = Array.isArray(p.rows) ? p.rows.filter((r) => r && r.isHeader).length : 0;
    const compCount = Array.isArray(p.components) ? p.components.length : 0;
    return { id: p.id, title: p.title || "", sections: headerRows || compCount, inCollection: !!p.collection_id };
  });
}

// Set of pattern ids (for this user) that have chart images — used to keep the
// inline-pattern pick free of charts so it renders the plain inline tabs view.
export async function chartPatternIds(userId) {
  const imgs = await rest(`pattern_images?user_id=eq.${userId}&image_type=eq.chart&select=pattern_id`);
  return new Set((Array.isArray(imgs) ? imgs : []).map((i) => i.pattern_id));
}

// First pattern id whose title starts with the given prefix (case-insensitive).
export async function patternIdByTitlePrefix(userId, prefix) {
  const rows = await rest(
    `patterns?user_id=eq.${userId}&is_starter=eq.false&title=ilike.${encodeURIComponent(prefix + "%")}&select=id&order=created_at.asc&limit=1`,
  );
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}

// Id of the account's MKAL collection (collection_type=mkal), if any.
export async function mkalCollectionId(userId) {
  const rows = await rest(`collections?user_id=eq.${userId}&collection_type=eq.mkal&select=id&order=created_at.asc&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}

// Create a collection row with explicit type/label metadata; returns its id.
export async function createCollectionRow(userId, { name, collection_type = "general", part_label, expected_part_count } = {}) {
  const body = { user_id: userId, name, collection_type };
  if (part_label) body.part_label = part_label;
  if (typeof expected_part_count === "number") body.expected_part_count = expected_part_count;
  const inserted = await rest("collections", { method: "POST", prefer: "return=representation", body });
  const id = (Array.isArray(inserted) ? inserted[0] : inserted)?.id;
  if (!id) throw new Error("Collection insert returned no id");
  return id;
}

// Patch arbitrary columns on a pattern row (service role — bypasses RLS).
export async function setPatternFields(patternId, fields) {
  await rest(`patterns?id=eq.${patternId}`, { method: "PATCH", prefer: "return=minimal", body: fields });
}
