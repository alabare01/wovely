// api/pulse.js
// The beacon. The browser tells this endpoint that something happened.
//
// THIS ENDPOINT NEVER SENDS MAIL. It writes rows and returns 204. Every
// decision about what reaches Adam is made in api/_monitor.js and executed by
// the per-minute cron, which is authenticated. That split is deliberate: a
// public endpoint that can send is an inbox somebody else controls, and the
// worst a flood here can do is write rows that the throttle then collapses
// into one message.
//
// WHAT IT ACCEPTS: a kind from the fixed vocabulary in EVENT_KINDS, a path, a
// referring hostname, an opaque per-tab session id, and a Supabase uid. That
// is the whole contract. Anything else in the body is dropped by
// normalizeEvent, and every string is truncated on arrival, so there is no
// field a caller can push a person's pattern through.
//
// Kill switch: MONITOR_ENABLED=0 makes this a no-op with no deploy. The
// browser keeps posting and the server keeps ignoring, which is the right way
// round: the switch has to work without shipping new client code.

// SYNTHETIC PROBES: a request carrying the correct PROBE_HEADER token is still
// recorded, on the synthetic prefix, and is invisible to every interrupt, push
// and heartbeat count. It also skips the bot screen, because a probe SHOULD be
// recorded, and curl is exactly what the bot screen is built to reject. An
// unmarked request is a real person in every failure mode. See api/_monitor.js.

import { normalizeEvent, recordPulse, looksLikeBot, monitorConfig, isSyntheticRequest } from './_monitor.js';

// Second belt behind the throttle. Per warm instance, so it is a speed bump
// rather than a wall, and the real ceiling on cost is the send throttle.
const MAX_EVENTS_PER_REQUEST = 10;
const BURST_WINDOW_MS = 60 * 1000;
const BURST_MAX = 120;
let burstCount = 0;
let burstStart = 0;

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return null; }
  }
  if (Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString('utf8')); } catch { return null; }
  }
  return body && typeof body === 'object' ? body : null;
}

function overBurst(now) {
  if (now - burstStart > BURST_WINDOW_MS) {
    burstStart = now;
    burstCount = 0;
  }
  burstCount += 1;
  return burstCount > BURST_MAX;
}

export default async function handler(req, res) {
  // Same-origin only. No Access-Control-Allow-Origin header is set on purpose,
  // so a browser on another site cannot post here.
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 204 on every path below. The browser must never learn whether an event was
  // accepted, dropped as a bot, or ignored because the monitor is off, and a
  // beacon must never surface an error into a real user's session.
  const ok = () => res.status(204).end();

  try {
    if (!monitorConfig().enabled) return ok();
    const synthetic = isSyntheticRequest(req.headers);
    if (!synthetic && looksLikeBot(req.headers['user-agent'])) return ok();
    if (overBurst(Date.now())) return ok();

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return ok();

    // navigator.sendBeacon can only send a CORS-safelisted content type, so the
    // client posts text/plain and the platform hands it over as a raw string.
    // A keepalive fetch sends application/json and arrives already parsed.
    // Both shapes have to work or the beacon silently does nothing on the path
    // that actually fires on unload.
    const body = parseBody(req.body);
    const raw = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_REQUEST) : [body];
    const events = raw.map((e) => normalizeEvent(e)).filter(Boolean);
    if (events.length === 0) return ok();

    await recordPulse({ supabaseUrl, serviceKey, events, synthetic });
    return ok();
  } catch {
    return ok();
  }
}
