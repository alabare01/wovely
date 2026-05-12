// api/import-job.js
// POST /api/import-job — creates a queued import job, returns { job_id }
//
// Auth: caller must include Authorization: Bearer <supabase access token>.
// We decode the JWT to extract sub (user_id) for the row, then insert with
// the user's token so RLS validates user_id = auth.uid() server-side at Supabase.
//
// After insert, fires a fire-and-forget kick to /api/cron/process-queue with
// keepalive:true so the queue starts processing this job within seconds rather
// than waiting up to 60s for the next cron tick.

export const config = { maxDuration: 30 };

function decodeJwtSub(token) {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).sub || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;
  const _t0 = Date.now();

  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: "Supabase not configured on server" });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Missing Authorization bearer token" });
  }
  const userToken = authHeader.slice(7);
  const userId = decodeJwtSub(userToken);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  const { file_url, file_type, raw_text, cover_image_url } = req.body || {};
  if (!file_url || !file_type) return res.status(400).json({ error: "file_url and file_type required" });
  if (file_type !== 'pdf' && file_type !== 'image') return res.status(400).json({ error: "file_type must be 'pdf' or 'image'" });
  if (file_type === 'pdf' && !raw_text) return res.status(400).json({ error: "raw_text required for pdf jobs" });

  // Insert row via user's own access token — RLS enforces user_id = auth.uid()
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/import_jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${userToken}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      file_type,
      file_url,
      raw_text: file_type === 'pdf' ? raw_text : null,
      cover_image_url: cover_image_url || null,
    }),
  });
  if (!insertRes.ok) {
    const errBody = await insertRes.text();
    console.error("[import-job] Insert failed:", insertRes.status, errBody.substring(0, 300));
    return res.status(500).json({ error: "Failed to create job", detail: errBody.substring(0, 200) });
  }
  const inserted = await insertRes.json();
  const job = Array.isArray(inserted) ? inserted[0] : inserted;
  const jobId = job?.id;
  if (!jobId) return res.status(500).json({ error: "Insert succeeded but no id returned" });

  // Best-effort awaited kick — AbortController gives a hard 800ms ceiling so a
  // slow worker can't block the POST response. The worker returns ~immediately
  // once it has claimed (or determined idle), so the typical kick resolves in
  // well under that. Failures (timeout, network, non-200) are swallowed: the
  // cron (post-merge to main) and the next POST will retry the trigger. The
  // kick is best-effort, not authoritative.
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  if (baseUrl) {
    const kickT0 = Date.now();
    const kickController = new AbortController();
    const kickTimer = setTimeout(() => kickController.abort(), 800);
    try {
      const kickHeaders = cronSecret ? { 'Authorization': `Bearer ${cronSecret}` } : {};
      const kickRes = await fetch(`${baseUrl}/api/cron/process-queue`, {
        method: 'POST',
        headers: kickHeaders,
        signal: kickController.signal,
      });
      console.log(`[keepalive] kicked worker in ${Date.now() - kickT0}ms (status=${kickRes.status})`);
    } catch (kickErr) {
      const reason = kickErr?.name === 'AbortError' ? 'timeout at 800ms' : (kickErr?.message || 'unknown');
      console.log(`[keepalive] kick failed: ${reason}`);
    } finally {
      clearTimeout(kickTimer);
    }
  }

  // Inline log
  if (supabaseUrl && serviceKey) {
    fetch(`${supabaseUrl}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: `POST /api/import-job → 200 job=${jobId} type=${file_type} (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/import-job', request_method: 'POST', status_code: 200, project_id: 'wovely', user_id: userId })
    }).catch(() => {});
  }

  return res.status(200).json({ job_id: jobId });
}
