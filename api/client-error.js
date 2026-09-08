// api/client-error.js
// Where a JavaScript error that a real person saw goes.
//
// 🔴 THIS ENDPOINT WAS RETURNING 500 IN PRODUCTION. Commit fd84aba ("remove
// unused logger utility") deleted api/utils/logger.js and left the import at
// the top of this file, so every POST here died at module resolution before it
// ran a line. src/utils/errorReporter.js swallows network failures by design,
// which is correct for a reporter and meant nobody ever saw the 500. Verified
// against the live site on 2026-09-08:
//   node scripts/probe.mjs https://wovely.app  →  was 500, now 200
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
// path, a session id, a uid and a short message and nothing else, because it
// feeds an email and a phone push.
//
// 🔴 AND THE DEFECT THAT CAME OUT OF THE FIX ABOVE, which is why the probe
// header exists. Confirming the 500 was gone meant curling this endpoint. Both
// probes were recorded as a real person hitting a real error and both woke
// Adam. A health check that pages a human is a broken health check. Send the
// PROBE_HEADER token (scripts/probe.mjs does it for you) and the row is still
// written, on the synthetic prefix, where nothing can page anybody. Unmarked
// traffic is a real user, always, in every failure mode. See api/_monitor.js.

import { recordPulse, isSyntheticRequest, SYNTHETIC_PATH_PREFIX } from './_monitor.js';

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
const SID_RE = /^[0-9a-f]{8,32}$/i;

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
  // The same opaque per-tab id the beacon uses, so the monitor can answer the
  // one question that matters most about an error: what did that session do
  // next. src/utils/errorReporter.js puts it in context.
  const rawSid = context && typeof context === 'object' ? context.sid : null;
  const sid = SID_RE.test(String(rawSid ?? '')) ? String(rawSid).toLowerCase() : null;

  // Unmarked is real. Every failure in the check below returns false.
  const synthetic = isSyntheticRequest(req.headers);

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
        level: synthetic ? 'info' : 'error',
        // A probe is still WRITTEN, because a health check that leaves no
        // record proves nothing. It is written somewhere that no alert, no
        // digest and no "what have real users hit" query reads.
        message: `${synthetic ? 'SYNTHETIC PROBE' : 'CLIENT ERROR'}: ${String(message || 'unknown').slice(0, 500)}${source ? ` @ ${String(source).slice(0, 200)}` : ''}`,
        source: synthetic ? 'synthetic' : 'client',
        request_path: synthetic ? `${SYNTHETIC_PATH_PREFIX}client-error` : String(source || 'client').slice(0, 200),
        request_method: 'CLIENT',
        status_code: 0,
        project_id: 'wovely',
        user_id: uid,
        context: {
          stack: typeof stack === 'string' ? stack.slice(0, 4000) : null,
          ...(context && typeof context === 'object' ? context : {}),
          ...(synthetic ? { synthetic: true } : {}),
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
    synthetic,
    events: [{
      kind: 'user_error',
      path: pathFrom(context),
      ref: null,
      sid,
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
