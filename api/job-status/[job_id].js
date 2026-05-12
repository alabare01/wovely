// api/job-status/[job_id].js
// GET /api/job-status/[job_id] — returns import job status for the authed user.
//
// Auth: caller must include Authorization: Bearer <supabase access token>.
// We pass the user's token through to Supabase REST so RLS filters out rows
// not owned by the caller (returns 404 instead of leaking ownership info).

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return res.status(500).json({ error: "Supabase not configured on server" });

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Missing Authorization bearer token" });
  }
  const userToken = authHeader.slice(7);

  const jobId = req.query.job_id;
  if (!jobId || typeof jobId !== 'string') return res.status(400).json({ error: "job_id required" });

  // RLS via user JWT — only returns row if user_id = auth.uid()
  const r = await fetch(
    `${supabaseUrl}/rest/v1/import_jobs?id=eq.${encodeURIComponent(jobId)}&select=id,status,extracted_data,error_message,extraction_method,file_type,retry_count,created_at,updated_at,cover_image_url`,
    {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${userToken}`,
      },
    }
  );
  if (!r.ok) {
    const errBody = await r.text();
    console.error("[job-status] Fetch failed:", r.status, errBody.substring(0, 200));
    return res.status(500).json({ error: "Failed to fetch job" });
  }
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(404).json({ error: "Job not found" });
  }
  const job = rows[0];
  return res.status(200).json({
    id: job.id,
    status: job.status,
    extracted_data: job.extracted_data,
    error_message: job.error_message,
    extraction_method: job.extraction_method,
    file_type: job.file_type,
    retry_count: job.retry_count,
    created_at: job.created_at,
    updated_at: job.updated_at,
    cover_image_url: job.cover_image_url,
  });
}
