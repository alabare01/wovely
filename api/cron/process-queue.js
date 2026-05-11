// api/cron/process-queue.js
// Vercel scheduled function — drains pending import_jobs queue.
//
// Schedule: every 1 minute (configured in vercel.json crons array).
// Also called immediately on POST /api/import-job for fast-start UX.
//
// Auth: requires Authorization: Bearer <CRON_SECRET> if CRON_SECRET is set.
// Vercel automatically includes this header on scheduled invocations.
//
// Per-job flow:
//   1. Claim a pending row atomically (PATCH WHERE status='pending')
//   2. Run extraction via runPdfExtraction or runVisionExtraction
//   3. On success: status='completed', extracted_data=..., extraction_method=...
//   4. On failure:
//      - retry_count <= 0 (i.e. first failure → bumped to 1): status='pending', will retry next tick
//      - retry_count >= 1 (already retried once → bumped to 2): status='failed', error_message set

import { runPdfExtraction } from '../extract-pattern.js';
import { runVisionExtraction } from '../extract-pattern-vision.js';

export const config = { maxDuration: 300 };

const POSTHOG_HOST = 'https://us.i.posthog.com';
// A job fails permanently once retry_count reaches this value (so the original
// attempt + one retry, then status='failed'). Shared by the in-loop catch
// block and the stuck-in-processing sweep.
const MAX_RETRY_COUNT = 2;
// Per-extraction wall-clock ceiling. 60s under Vercel's 300s function cap so
// the worker has time to write status='failed' cleanly before the runtime
// kills the function.
const EXTRACTION_TIMEOUT_MS = 240_000;
// Stuck-in-processing sweep: rows whose updated_at hasn't moved in this
// window are treated as orphans (crash / function timeout).
const STUCK_PROCESSING_WINDOW_MS = 5 * 60 * 1000;

function captureServerEvent({ posthogKey, distinctId, event, properties }) {
  if (!posthogKey || !distinctId) return;
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: posthogKey,
      event,
      distinct_id: distinctId,
      properties: { ...properties, $lib: 'wovely-server', source: 'queue-worker' },
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => {});
}

function logToVercelLogs({ supabaseUrl, serviceKey, level, message, status_code, user_id }) {
  if (!supabaseUrl || !serviceKey) return;
  fetch(`${supabaseUrl}/rest/v1/vercel_logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      level, message, source: 'serverless',
      request_path: '/api/cron/process-queue',
      request_method: 'POST',
      status_code,
      project_id: 'wovely',
      user_id: user_id || null,
    }),
    keepalive: true,
  }).catch(() => {});
}

async function fetchImageAsDataUri(fileUrl) {
  const r = await fetch(fileUrl);
  if (!r.ok) throw new Error(`Image fetch failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer()).toString('base64');
  const mime = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  return `data:${mime};base64,${buf}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const posthogKey = process.env.VITE_POSTHOG_KEY || process.env.POSTHOG_API_KEY;
  const cronSecret = process.env.CRON_SECRET;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // Auth — Vercel cron sends Authorization: Bearer <CRON_SECRET>; manual kick same.
  // If CRON_SECRET is unset, allow through (initial setup, dev) but log a warning.
  if (cronSecret) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    console.warn('[process-queue] CRON_SECRET not set — endpoint is unauthenticated');
  }

  const t0 = Date.now();
  const supaHeaders = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // ── Sweep: rescue rows stuck in 'processing' past the orphan window. ─────
  // Common causes: function killed by Vercel maxDuration, unhandled crash
  // between claim and write-back. We bump retry_count; if the bump would
  // exceed MAX_RETRY_COUNT we mark the row failed rather than looping forever.
  const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_WINDOW_MS).toISOString();
  const stuckListRes = await fetch(
    `${supabaseUrl}/rest/v1/import_jobs?status=eq.processing&updated_at=lt.${encodeURIComponent(stuckCutoff)}&select=id,retry_count,user_id,file_type`,
    { headers: supaHeaders }
  );
  if (stuckListRes.ok) {
    const stuck = await stuckListRes.json();
    if (Array.isArray(stuck) && stuck.length > 0) {
      let sweptReset = 0;
      let sweptFailed = 0;
      for (const row of stuck) {
        const newRetry = (row.retry_count || 0) + 1;
        const willFail = newRetry >= MAX_RETRY_COUNT;
        const body = willFail
          ? { status: 'failed', retry_count: newRetry, error_message: 'Stuck in processing; max retries exceeded' }
          : { status: 'pending', retry_count: newRetry };
        await fetch(`${supabaseUrl}/rest/v1/import_jobs?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify(body),
        });
        if (willFail) sweptFailed++;
        else sweptReset++;
      }
      console.log(`[sweep] rescued ${stuck.length} orphaned processing jobs (reset=${sweptReset}, failed=${sweptFailed})`);
      logToVercelLogs({
        supabaseUrl, serviceKey, level: 'warn',
        message: `[sweep] rescued ${stuck.length} orphaned processing jobs (reset=${sweptReset}, failed=${sweptFailed})`,
        status_code: 200,
      });
    }
  } else {
    console.error('[sweep] stuck-list query failed:', stuckListRes.status);
  }

  // Fetch pending rows (oldest first)
  const listRes = await fetch(
    `${supabaseUrl}/rest/v1/import_jobs?status=eq.pending&order=created_at.asc&limit=10&select=*`,
    { headers: supaHeaders }
  );
  if (!listRes.ok) {
    const errBody = await listRes.text();
    console.error('[process-queue] List pending failed:', listRes.status, errBody.substring(0, 300));
    logToVercelLogs({ supabaseUrl, serviceKey, level: 'error', message: `[process-queue] list pending failed: ${listRes.status}`, status_code: 500 });
    return res.status(500).json({ error: 'Failed to list pending jobs' });
  }
  const pending = await listRes.json();
  if (!Array.isArray(pending) || pending.length === 0) {
    return res.status(200).json({ ok: true, processed: 0, idle: true });
  }

  console.log(`[process-queue] Found ${pending.length} pending jobs`);
  const summary = { processed: 0, completed: 0, failed: 0, retried: 0, skipped: 0 };

  for (const job of pending) {
    const elapsed = Date.now() - t0;
    if (elapsed > 240000) {
      console.warn(`[process-queue] Time budget low (${elapsed}ms), deferring remaining jobs to next tick`);
      summary.skipped++;
      break;
    }

    // Claim: atomically PATCH status pending → processing for this id only.
    // If another worker beat us, the patched row count is 0; skip.
    const claimRes = await fetch(
      `${supabaseUrl}/rest/v1/import_jobs?id=eq.${job.id}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { ...supaHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({ status: 'processing' }),
      }
    );
    if (!claimRes.ok) {
      console.error(`[process-queue] Claim failed for ${job.id}: ${claimRes.status}`);
      summary.skipped++;
      continue;
    }
    const claimed = await claimRes.json();
    if (!Array.isArray(claimed) || claimed.length === 0) {
      // Lost the race or status changed underneath us — skip.
      summary.skipped++;
      continue;
    }
    const claimedJob = claimed[0];

    captureServerEvent({
      posthogKey,
      distinctId: claimedJob.user_id,
      event: 'import_job_started',
      properties: { job_id: claimedJob.id, file_type: claimedJob.file_type, retry_count: claimedJob.retry_count },
    });

    // Run extraction, bounded by EXTRACTION_TIMEOUT_MS. The AbortController
    // gives a hard wall-clock ceiling so the worker can write status='failed'
    // cleanly before Vercel's 300s function-kill orphans the row. The
    // underlying extraction modules do not currently consume `signal`, so the
    // timeout fires via Promise.race; the in-flight extraction is abandoned
    // but the function exits on its own when the runtime tears down.
    let result;
    const extractController = new AbortController();
    let extractTimer;
    const timeoutPromise = new Promise((_, reject) => {
      extractTimer = setTimeout(() => {
        extractController.abort();
        reject(new Error(`Extraction timed out after ${Math.floor(EXTRACTION_TIMEOUT_MS / 1000)}s`));
      }, EXTRACTION_TIMEOUT_MS);
    });
    try {
      let extractionPromise;
      if (claimedJob.file_type === 'pdf') {
        if (!claimedJob.raw_text) throw new Error('pdf job missing raw_text');
        extractionPromise = runPdfExtraction({
          pdfText: claimedJob.raw_text,
          pageCount: null,
          geminiKey,
          anthropicKey,
        });
      } else if (claimedJob.file_type === 'image') {
        const dataUri = await fetchImageAsDataUri(claimedJob.file_url);
        extractionPromise = runVisionExtraction({
          images: [dataUri],
          fileName: claimedJob.file_url.split('/').pop() || 'image',
          geminiKey,
          anthropicKey,
        });
      } else {
        throw new Error(`Unknown file_type: ${claimedJob.file_type}`);
      }
      result = await Promise.race([extractionPromise, timeoutPromise]);
    } catch (extractErr) {
      console.error(`[process-queue] Extraction failed for ${claimedJob.id}: ${extractErr.message}`);
      const newRetryCount = (claimedJob.retry_count || 0) + 1;
      const willFail = newRetryCount >= MAX_RETRY_COUNT;
      const updateBody = willFail
        ? { status: 'failed', retry_count: newRetryCount, error_message: extractErr.message.substring(0, 500) }
        : { status: 'pending', retry_count: newRetryCount };

      await fetch(`${supabaseUrl}/rest/v1/import_jobs?id=eq.${claimedJob.id}`, {
        method: 'PATCH',
        headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify(updateBody),
      });

      captureServerEvent({
        posthogKey,
        distinctId: claimedJob.user_id,
        event: willFail ? 'import_job_failed' : 'import_job_retried',
        properties: {
          job_id: claimedJob.id,
          file_type: claimedJob.file_type,
          retry_count: newRetryCount,
          error_message: extractErr.message.substring(0, 200),
        },
      });

      logToVercelLogs({
        supabaseUrl, serviceKey,
        level: willFail ? 'error' : 'warn',
        message: `[process-queue] job=${claimedJob.id} ${willFail ? 'failed (final)' : 'retrying'} retry=${newRetryCount} err="${extractErr.message.substring(0, 200)}"`,
        status_code: willFail ? 500 : 202,
        user_id: claimedJob.user_id,
      });

      summary.processed++;
      if (willFail) summary.failed++;
      else summary.retried++;
      continue;
    } finally {
      clearTimeout(extractTimer);
    }

    // Success — mark completed
    const completeRes = await fetch(`${supabaseUrl}/rest/v1/import_jobs?id=eq.${claimedJob.id}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        status: 'completed',
        extracted_data: result.data,
        extraction_method: result.extractionMethod,
        error_message: null,
      }),
    });
    if (!completeRes.ok) {
      console.error(`[process-queue] Failed to mark ${claimedJob.id} completed: ${completeRes.status}`);
      logToVercelLogs({
        supabaseUrl, serviceKey, level: 'error',
        message: `[process-queue] job=${claimedJob.id} extraction succeeded but PATCH completed failed (${completeRes.status})`,
        status_code: 500, user_id: claimedJob.user_id,
      });
      summary.processed++;
      summary.failed++;
      continue;
    }

    captureServerEvent({
      posthogKey,
      distinctId: claimedJob.user_id,
      event: 'import_job_completed',
      properties: {
        job_id: claimedJob.id,
        file_type: claimedJob.file_type,
        extraction_method: result.extractionMethod,
        duration_ms: result.durationMs,
      },
    });

    logToVercelLogs({
      supabaseUrl, serviceKey, level: 'info',
      message: `[process-queue] job=${claimedJob.id} completed type=${claimedJob.file_type} method=${result.extractionMethod} (${result.durationMs}ms)`,
      status_code: 200, user_id: claimedJob.user_id,
    });

    summary.processed++;
    summary.completed++;
  }

  return res.status(200).json({ ok: true, ...summary, total_elapsed_ms: Date.now() - t0 });
}
