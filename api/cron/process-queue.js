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

import { runPdfExtraction, runBevCheck } from '../extract-pattern.js';
import { runVisionExtraction } from '../extract-pattern-vision.js';

export const config = { maxDuration: 300 };

// Phase order for the pill UI. The worker writes each as it advances and
// stamps phase_timestamps['<phase>_started_at'] for elapsed-time display.
// Keep these slugs aligned with PHASE_CONFIG in src/components/ImportPill.jsx.
const PHASE_READING = 'reading';
const PHASE_EXTRACTING = 'extracting';
const PHASE_VALIDATING = 'validating';
const PHASE_FINALIZING = 'finalizing';

// Build a single, reasonably faithful text representation of extracted_data for
// BevCheck on image imports (no raw_text on file). PDF imports send raw_text
// directly. We include rows because the structural checks (round sequence,
// stitch math, duplicates, cross-refs) are what the validator looks at — not
// metadata. Capped at TEXT_LIMIT inside runBevCheck.
function serializeExtractedForBevCheck(data) {
  if (!data || typeof data !== 'object') return '';
  const lines = [];
  if (data.title) lines.push(`Title: ${data.title}`);
  if (data.designer) lines.push(`Designer: ${data.designer}`);
  if (data.hook_size) lines.push(`Hook: ${data.hook_size}`);
  if (data.yarn_weight) lines.push(`Yarn: ${data.yarn_weight}`);
  if (data.pattern_notes) lines.push(`Notes: ${data.pattern_notes}`);
  if (Array.isArray(data.components)) {
    for (const c of data.components) {
      lines.push(`\n--- ${c.name || 'Component'} ---`);
      for (const r of (c.rows || [])) {
        lines.push(`${r.label || ''}: ${r.text || ''}${r.stitch_count != null ? ` (${r.stitch_count})` : ''}`);
      }
    }
  }
  return lines.join('\n');
}

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
        // current_phase intentionally not set in either branch — preserve the
        // last phase the row was in so the UI / debugging can see where it died.
        const body = willFail
          ? { status: 'failed', retry_count: newRetry, error_message: 'Max retry count exceeded' }
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

  // Fetch pending rows (oldest first). The retry_count filter is a defensive
  // belt — the sweep + in-loop catch already mark exhausted rows as 'failed',
  // but if a row ever lands in 'pending' with retry_count >= MAX_RETRY_COUNT
  // (older bug, manual UPDATE, race), this prevents it from being re-picked.
  const listRes = await fetch(
    `${supabaseUrl}/rest/v1/import_jobs?status=eq.pending&retry_count=lt.${MAX_RETRY_COUNT}&order=created_at.asc&limit=10&select=*`,
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

    // Claim: atomically PATCH status pending → processing, set initial phase
    // to 'reading' so the pill UI has a phase to display immediately. If
    // another worker beat us, the patched row count is 0; skip.
    const nowIso = new Date().toISOString();
    const claimRes = await fetch(
      `${supabaseUrl}/rest/v1/import_jobs?id=eq.${job.id}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { ...supaHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          status: 'processing',
          current_phase: PHASE_READING,
          // Merge into existing object via SQL? PostgREST can't express ||
          // here without a custom RPC, so we just set the initial stamps.
          // Subsequent phase updates use Supabase RPC-less round-trips below.
          phase_timestamps: { [`${PHASE_READING}_started_at`]: nowIso },
        }),
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

    // Helper: append a phase transition stamp without losing prior stamps.
    // We read the current phase_timestamps (already on claimedJob, or refresh
    // on each call), merge, and PATCH the whole object back. Cheap — single
    // small jsonb column, single small row.
    let phaseStamps = claimedJob.phase_timestamps || { [`${PHASE_READING}_started_at`]: nowIso };
    const setPhase = async (phase) => {
      phaseStamps = { ...phaseStamps, [`${phase}_started_at`]: new Date().toISOString() };
      try {
        await fetch(`${supabaseUrl}/rest/v1/import_jobs?id=eq.${claimedJob.id}`, {
          method: 'PATCH',
          headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ current_phase: phase, phase_timestamps: phaseStamps }),
        });
      } catch (e) {
        // Phase updates are best-effort instrumentation. A network blip here
        // shouldn't fail the import.
        console.warn(`[process-queue] setPhase(${phase}) failed: ${e.message}`);
      }
    };

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
      await setPhase(PHASE_EXTRACTING);
      let extractionPromise;
      if (claimedJob.file_type === 'pdf') {
        if (!claimedJob.raw_text) throw new Error('pdf job missing raw_text');
        extractionPromise = runPdfExtraction({
          pdfText: claimedJob.raw_text,
          pageCount: null,
          geminiKey,
          anthropicKey,
          pdfMetadataTitle: claimedJob.pdf_metadata_title || null,
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

    // Validation phase — run BevCheck before flipping to completed so the
    // modal/pill review path always has a validation_report present. BevCheck
    // is non-blocking: a network error, parse error, or budget exhaustion is
    // captured as { error: ... } in validation_report and the import still
    // succeeds. The pill UI treats null and {error} both as "no report".
    await setPhase(PHASE_VALIDATING);
    let validationReport = null;
    try {
      const bevText = claimedJob.file_type === 'pdf'
        ? claimedJob.raw_text
        : serializeExtractedForBevCheck(result.data);
      if (bevText && bevText.trim().length > 30) {
        validationReport = await runBevCheck({ patternText: bevText, geminiKey, anthropicKey });
      } else {
        validationReport = { skipped: true, reason: 'no pattern text to validate' };
      }
    } catch (bevErr) {
      console.warn(`[process-queue] BevCheck failed for ${claimedJob.id}: ${bevErr.message}`);
      validationReport = { error: bevErr.message.substring(0, 300) };
    }

    await setPhase(PHASE_FINALIZING);

    // Success — mark completed with extracted data + validation report
    const completeRes = await fetch(`${supabaseUrl}/rest/v1/import_jobs?id=eq.${claimedJob.id}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        status: 'completed',
        extracted_data: result.data,
        extraction_method: result.extractionMethod,
        validation_report: validationReport,
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
