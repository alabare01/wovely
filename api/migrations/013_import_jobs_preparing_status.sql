-- Migration 013 — add the 'preparing' status to import_jobs.
--
-- WHY (2026-07-14, engine regression follow-up):
-- The import job was only created AFTER the client finished pdf.js text
-- extraction. On an 87-page pattern that is 1–4 minutes during which NO job
-- row exists — so the ImportPill has nothing to attach to, and navigating away
-- silently destroyed the import with zero trace. Verified live on production.
--
-- Fix: the row is now created the moment the file lands in Storage, with
-- status='preparing'. The client then PATCHes raw_text and flips it to
-- 'pending' when its text extraction finishes. The worker only ever claims
-- 'pending', so 'preparing' is invisible to it — but the pill can see it, and
-- the user can now leave the page from second one.
--
-- Idempotent: safe to re-run.

alter table public.import_jobs
  drop constraint if exists import_jobs_status_check;

alter table public.import_jobs
  add constraint import_jobs_status_check
  check (status in ('preparing', 'pending', 'processing', 'completed', 'failed'));

-- The sweep in api/cron/process-queue.js reaps 'preparing' rows that go stale
-- (tab closed mid-extraction). Index the lookup it does.
create index if not exists import_jobs_preparing_updated_idx
  on public.import_jobs (status, updated_at)
  where status = 'preparing';
