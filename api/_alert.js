// api/_alert.js
// Pages Adam when the core action of the product breaks.
//
// THE FACT THIS FILE EXISTS TO FIX: pattern import was 100% broken for four
// months. The worker wrote retry_count: 2, set status='failed', and stopped.
// A signup emailed Adam within seconds. A total failure of the thing people
// came for emailed nobody.
//
// MECHANISM: the same one the signup notification uses. A direct POST to
// Resend from support@wovely.app to adam@wovely.app, through api/_mail.js.
// No second channel, no new service.
//
// THROTTLE: a WINDOWED DIGEST, not one message per failed job.
//   - process-queue runs every minute, so this is evaluated every minute
//     whether or not a job failed on that tick.
//   - It sends at most one message per ALERT_WINDOW_MS (15 minutes).
//   - The message covers EVERY job that failed since the previous alert, so a
//     burst of ten failures is one email listing ten jobs, and no failure is
//     dropped just because it landed inside a quiet window.
//   - When nothing has failed it writes nothing, so the very first failure
//     after a quiet spell alerts on the next tick, inside 60 seconds.
//
// Chosen over "one email per failed job" (an outage would mail Adam ten times
// a minute) and over a plain "first failure in N minutes" rule (a sustained
// outage would alert once and then go quiet forever, which is the exact
// failure mode this file exists to end).
//
// LEDGER: the existing vercel_logs table, on a reserved request_path. No new
// table, so no migration Adam has to run before this works.

import { sendMail, FROM_APP, OWNER_INBOX } from './_mail.js';

// At most one alert per window.
export const ALERT_WINDOW_MS = 15 * 60 * 1000;
// Cold start guard. With no marker in the ledger we would otherwise look back
// over all history and mail four months of failures in one message.
export const ALERT_MAX_LOOKBACK_MS = 60 * 60 * 1000;
// Reserved request_path in vercel_logs. Not a real route.
export const ALERT_MARKER_PATH = '/internal/import-failure-alert';
// Cap on jobs listed in one message. The count in the subject is the truth.
const ALERT_MAX_LISTED = 20;

/**
 * Decide whether an alert is due and, when it is, which failures it covers.
 * Pure so it can be tested without a network.
 * @returns {{due:boolean, reason:string, since?:Date}}
 */
export function alertDecision({ now, lastAlertAt, windowMs = ALERT_WINDOW_MS, maxLookbackMs = ALERT_MAX_LOOKBACK_MS }) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  if (lastAlertAt) {
    const last = lastAlertAt instanceof Date ? lastAlertAt.getTime() : Number(lastAlertAt);
    if (t - last < windowMs) {
      return { due: false, reason: 'throttled' };
    }
    // Cover everything since the last alert, but never reach back further than
    // the cold-start cap.
    return { due: true, reason: 'window_elapsed', since: new Date(Math.max(last, t - maxLookbackMs)) };
  }
  return { due: true, reason: 'no_previous_alert', since: new Date(t - maxLookbackMs) };
}

/** Compose the alert body. Pure, so the wording is testable. */
export function buildAlertEmail(jobs, { since, now }) {
  const n = jobs.length;
  const subject =
    n === 1
      ? 'Wovely: a pattern import failed'
      : `Wovely: ${n} pattern imports failed`;

  const lines = [
    n === 1
      ? 'One import job failed and gave up.'
      : `${n} import jobs failed and gave up.`,
    `Window: ${since.toISOString()} to ${now.toISOString()}`,
    '',
  ];

  for (const j of jobs.slice(0, ALERT_MAX_LISTED)) {
    lines.push(`job ${j.id}`);
    lines.push(`  user: ${j.user_label || j.user_id || 'unknown'}`);
    lines.push(`  type: ${j.file_type || 'unknown'}   retries: ${j.retry_count ?? '?'}`);
    lines.push(`  failed at: ${j.updated_at || 'unknown'}`);
    lines.push(`  error: ${j.error_message || '(no error_message recorded)'}`);
    lines.push('');
  }
  if (n > ALERT_MAX_LISTED) {
    lines.push(`and ${n - ALERT_MAX_LISTED} more not listed.`);
    lines.push('');
  }

  lines.push('Logs: https://vercel.com/dashboard  ·  rows: import_jobs where status = failed');
  lines.push('');
  lines.push(`Next alert no sooner than ${Math.round(ALERT_WINDOW_MS / 60000)} minutes from now.`);

  return { subject, text: lines.join('\n') };
}

async function readLastAlertAt({ supabaseUrl, headers }) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vercel_logs?request_path=eq.${encodeURIComponent(ALERT_MARKER_PATH)}&order=timestamp.desc&limit=1&select=timestamp`,
      { headers, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const ts = Array.isArray(rows) && rows[0]?.timestamp;
    return ts ? new Date(ts) : null;
  } catch {
    return null;
  }
}

async function readFailedSince({ supabaseUrl, headers, since }) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/import_jobs?status=eq.failed&updated_at=gt.${encodeURIComponent(since.toISOString())}` +
      `&order=updated_at.desc&limit=100&select=id,user_id,file_type,error_message,updated_at,retry_count`,
    { headers, signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

/**
 * Best-effort email lookup so the alert names a person rather than a UUID.
 * auth.users is not exposed through PostgREST, so this goes at the admin API.
 * Failure is fine: the uid is still in the message.
 */
async function resolveUserLabels({ supabaseUrl, serviceKey, jobs }) {
  const ids = [...new Set(jobs.map((j) => j.user_id).filter(Boolean))].slice(0, 10);
  const labels = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const u = await res.json();
        if (u?.email) labels[id] = `${u.email} (${id})`;
      } catch {
        /* uid stands on its own */
      }
    })
  );
  return labels;
}

async function writeMarker({ supabaseUrl, headers, count }) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `[alert] import failure digest sent, ${count} job(s)`,
        source: 'serverless',
        request_path: ALERT_MARKER_PATH,
        request_method: 'POST',
        status_code: 500,
        project_id: 'wovely',
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* the alert already went out; a missing marker only risks one repeat */
  }
}

/**
 * Evaluate and, if due, send. Never throws.
 * Call it once per cron tick, at the end of the run.
 * @returns {Promise<{sent:boolean, reason:string, count?:number, error?:string}>}
 */
export async function alertImportFailures({ supabaseUrl, serviceKey, now = new Date() }) {
  if (!supabaseUrl || !serviceKey) return { sent: false, reason: 'no_supabase_credentials' };
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'no_resend_key' };
  if (process.env.IMPORT_FAILURE_ALERTS_ENABLED === '0') return { sent: false, reason: 'disabled' };

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  try {
    const lastAlertAt = await readLastAlertAt({ supabaseUrl, headers });
    const decision = alertDecision({ now, lastAlertAt });
    if (!decision.due) return { sent: false, reason: decision.reason };

    const jobs = await readFailedSince({ supabaseUrl, headers, since: decision.since });
    if (jobs.length === 0) return { sent: false, reason: 'no_failures' };

    const labels = await resolveUserLabels({ supabaseUrl, serviceKey, jobs });
    for (const j of jobs) j.user_label = labels[j.user_id] || j.user_id;

    const { subject, text } = buildAlertEmail(jobs, { since: decision.since, now });
    const result = await sendMail({
      from: FROM_APP,
      to: OWNER_INBOX,
      subject,
      text,
      tags: [{ name: 'kind', value: 'import_failure_alert' }],
    });

    if (!result.ok) {
      console.error('[alert] send failed:', result.error);
      return { sent: false, reason: 'send_failed', error: result.error };
    }

    await writeMarker({ supabaseUrl, headers, count: jobs.length });
    console.log(`[alert] import failure digest sent for ${jobs.length} job(s)`);
    return { sent: true, reason: decision.reason, count: jobs.length };
  } catch (err) {
    console.error('[alert] unexpected error:', err?.message || err);
    return { sent: false, reason: 'exception', error: err?.message || String(err) };
  }
}
