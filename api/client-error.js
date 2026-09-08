// api/client-error.js
// Where a JavaScript error that a real person saw goes.
//
// 🔴 THIS ENDPOINT WAS RETURNING 500 IN PRODUCTION. Commit fd84aba ("remove
// unused logger utility") deleted api/utils/logger.js and left the import at
// the top of this file, so every POST here died at module resolution before it
// ran a line. src/utils/errorReporter.js swallows network failures by design,
// which is correct for a reporter and meant nobody ever saw the 500. Verified
// against the live site on 2026-09-08:
//   curl -X POST https://wovely.app/api/client-error -d '{}'  →  500
// So every window.onerror and every unhandled rejection any visitor has hit
// since that commit went nowhere at all. Fixed here by writing the row inline,
// which is the pattern every other handler in api/ already uses.
//
// It now does two things:
//   1. writes the full diagnostic row to vercel_logs, as before
//   2. tells the monitor a person saw an error, which is one of the six things
//      allowed to interrupt Adam
//
// The two payloads are deliberately different. The log row keeps the stack and
// the user agent because that is what a fix needs. The monitor row keeps a
// path, a uid and a short message and nothing else, because it feeds an email
// and a phone push.

import { recordPulse } from './_monitor.js';

// An error in a render loop can fire hundreds of times a second from one
// browser. The send throttle already caps what reaches Adam; this caps what
// reaches the database. Per warm instance, so it is a speed bump, not a wall.
const BURST_WINDOW_MS = 60 * 1000;
const BURST_MAX = 60;
let burstCount = 0;
let burstStart = 0;

function overBurst(now) {
  if (now - burstStart > BURST_WINDOW_MS) {
    burstStart = now;
    burstCount = 0;
  }
  burstCount += 1;
  return burstCount > BURST_MAX;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path only, out of whatever full URL the reporter sent. */
function pathFrom(context) {
  try {
    const u = context?.url;
    if (typeof u !== 'string' || !u) return '/';
    return new URL(u).pathname.slice(0, 120) || '/';
  } catch {
    return '/';
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // A reporter must never learn it failed, and must never be given a reason to
  // retry. 200 on every path below.
  const ok = () => res.status(200).json({ ok: true });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return ok();
  if (overBurst(Date.now())) return ok();

  const { message, source, stack, user_id, context } = req.body || {};
  const uid = UUID_RE.test(String(user_id ?? '')) ? String(user_id).toLowerCase() : null;

  try {
    await fetch(`${supabaseUrl}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `CLIENT ERROR: ${String(message || 'unknown').slice(0, 500)}${source ? ` @ ${String(source).slice(0, 200)}` : ''}`,
        source: 'client',
        request_path: String(source || 'client').slice(0, 200),
        request_method: 'CLIENT',
        status_code: 0,
        project_id: 'wovely',
        user_id: uid,
        context: {
          stack: typeof stack === 'string' ? stack.slice(0, 4000) : null,
          ...(context && typeof context === 'object' ? context : {}),
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* a reporter that can throw is a second bug stacked on the first */
  }

  await recordPulse({
    supabaseUrl,
    serviceKey,
    events: [{
      kind: 'user_error',
      path: pathFrom(context),
      ref: null,
      sid: null,
      uid,
      // The first few words are enough to tell two outages apart in a subject
      // line. The stack is on the log row above for whoever fixes it.
      meta: { detail: String(message || 'unknown').slice(0, 80) },
      at: new Date().toISOString(),
    }],
  });

  return ok();
}

export default handler;
