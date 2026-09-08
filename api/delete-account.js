// api/delete-account.js
// POST /api/delete-account. A signed-in user deletes their own account.
//
// WHY THIS FILE EXISTS
// Until 2026-09-08 Wovely had no self-serve account deletion anywhere in src/
// or api/. The product asks a stranger for an email address on the first screen
// and then gives them no way to take it back, which is a trust problem before
// it is a compliance one.
//
// WHY IT IS A SERVER ROUTE AT ALL
// The client cannot do this. Removing a row in auth.users needs the Supabase
// admin API and the service role key, which must never reach a browser. This is
// the one part of the account-deletion work that could not be done inside src/.
//
// WHAT IT DELETES
// Every row keyed to the user across the product tables, then the auth user
// itself. Real DELETEs, not a status flag: the app already has a soft delete
// (status='deleted') for patterns and that is exactly what this must NOT be.
// A "deleted" account whose rows are still readable by the service role has not
// been deleted, it has been hidden.
//
// Two deliberate exceptions, both stated rather than quietly skipped:
//   vercel_logs: operational error logs. The user_id is nulled instead of the
//     row being dropped, so the log stays useful and stops pointing at a person.
//   feedback: the message they sent us is our copy of a conversation, so the
//     row survives with its user_id nulled and its email cleared.
//
// BILLING
// A live Stripe subscription is cancelled first. Deleting the account and
// leaving the card on file being charged monthly would be a worse failure than
// having no delete button at all. Best effort: if Stripe is unreachable the
// deletion still proceeds and the failure is logged loudly, because a user who
// asked to be gone should not be held hostage to our billing integration.
//
// AUTH
// The bearer token is verified against Supabase (GET /auth/v1/user), not merely
// decoded. A decoded JWT proves someone can write base64, not that the session
// is real. The body must also carry confirm:"DELETE" so a stray POST cannot do
// this by accident.

export const config = { maxDuration: 30 };

// Ordered children-first so foreign keys do not block the parents.
const USER_ID_TABLES = [
  'pattern_images',
  'rows',
  'pattern_ratings',
  'pattern_saves',
  'fo_likes',
  'fo_comments',
  'finished_objects',
  'shared_patterns',
  'snaps',
  'notes',
  'yarn_stash',
  'stitch_results',
  'stitch_library_candidates',
  'import_jobs',
  'collection_jobs',
  'patterns',
  'collections',
  'user_achievements',
  'user_xp',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('[delete-account] Supabase env missing');
    return res.status(500).json({ error: 'server_not_configured', message: 'Account deletion is unavailable right now. Please try again later.' });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' });
  }
  const userToken = authHeader.slice(7);

  const { confirm } = req.body || {};
  if (confirm !== 'DELETE') {
    return res.status(400).json({ error: 'confirmation_required', message: 'This request did not carry a deletion confirmation.' });
  }

  // ── Verify the session with Supabase, do not just decode it ───────────────
  let userId = null;
  let userEmail = null;
  try {
    const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!who.ok) return res.status(401).json({ error: 'invalid_token' });
    const u = await who.json();
    userId = u?.id || null;
    userEmail = u?.email || null;
  } catch (e) {
    console.error('[delete-account] Session verify failed:', e?.message);
    return res.status(502).json({ error: 'verify_failed', message: 'We could not confirm your session. Sign in again and retry.' });
  }
  if (!userId) return res.status(401).json({ error: 'invalid_token' });

  const svc = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  const deleted = {};
  const failures = [];

  // ── 1. Cancel billing before anything is removed ──────────────────────────
  let subscriptionCancelled = false;
  try {
    const profRes = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=stripe_subscription_id`,
      { headers: svc },
    );
    const prof = profRes.ok ? await profRes.json() : [];
    const subId = prof?.[0]?.stripe_subscription_id || null;
    if (subId && process.env.STRIPE_SECRET_KEY) {
      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      await stripe.subscriptions.cancel(subId);
      subscriptionCancelled = true;
      console.log('[delete-account] Cancelled subscription', subId, 'for', userId);
    }
  } catch (e) {
    // Loud, and not fatal. See the header note.
    failures.push('stripe_cancel');
    console.error('[delete-account] Stripe cancel failed for', userId, e?.message);
  }

  // ── 2. Delete the product rows ────────────────────────────────────────────
  for (const table of USER_ID_TABLES) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/${table}?user_id=eq.${userId}`, {
        method: 'DELETE',
        headers: { ...svc, Prefer: 'return=representation,count=exact' },
      });
      if (!r.ok) {
        // A table that does not exist in this project is not a failure worth
        // aborting on; a real constraint error is.
        const body = await r.text().catch(() => '');
        if (r.status === 404) continue;
        failures.push(`${table}:${r.status}`);
        console.error(`[delete-account] ${table} delete failed`, r.status, body.slice(0, 300));
        continue;
      }
      const rows = await r.json().catch(() => []);
      if (Array.isArray(rows) && rows.length) deleted[table] = rows.length;
    } catch (e) {
      failures.push(`${table}:exception`);
      console.error(`[delete-account] ${table} delete threw`, e?.message);
    }
  }

  // Social graph: two columns, so it does not fit the loop above.
  for (const col of ['follower_id', 'following_id']) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/user_follows?${col}=eq.${userId}`, {
        method: 'DELETE',
        headers: { ...svc, Prefer: 'return=minimal' },
      });
    } catch (e) {
      failures.push(`user_follows:${col}`);
    }
  }

  // Kept rows, unlinked from the person.
  for (const [table, patch] of [
    ['vercel_logs', { user_id: null }],
    ['feedback', { user_id: null, email: null }],
  ]) {
    try {
      await fetch(`${supabaseUrl}/rest/v1/${table}?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: { ...svc, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
    } catch (e) {
      failures.push(`${table}:anonymize`);
    }
  }

  // The profile row is keyed on id, not user_id.
  try {
    await fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}`, {
      method: 'DELETE',
      headers: { ...svc, Prefer: 'return=minimal' },
    });
  } catch (e) {
    failures.push('user_profiles:exception');
  }

  // ── 3. Delete the auth user. This is the step that makes it real ──────────
  let authDeleted = false;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    authDeleted = r.ok;
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[delete-account] auth user delete failed', r.status, body.slice(0, 300));
    }
  } catch (e) {
    console.error('[delete-account] auth user delete threw', e?.message);
  }

  // If the login still exists, the account still exists. Say so plainly rather
  // than returning a success the user would act on.
  if (!authDeleted) {
    return res.status(500).json({
      error: 'delete_incomplete',
      message: 'We removed your patterns but could not close the login. Contact us and we will finish it by hand.',
      deleted,
      failures,
    });
  }

  console.log('[delete-account] Deleted account', userId, userEmail ? `(${userEmail})` : '', JSON.stringify(deleted), failures.length ? `failures=${failures.join(',')}` : '');
  return res.status(200).json({ ok: true, deleted, subscription_cancelled: subscriptionCancelled, failures });
}
