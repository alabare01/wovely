-- Migration 004 — add cover_image_url to import_jobs (Queue System v1, Session 65)
--
-- The client renders PDF page 1 to a JPEG, uploads to Cloudinary, and now passes
-- the resulting URL into the queue so it survives the modal-close handoff and
-- can be threaded back to AddPatternModal when ImportPill completes.
--
-- Existing RLS policies on import_jobs are row-scoped (user_id = auth.uid()),
-- so this new column is automatically covered — no policy changes needed.

alter table public.import_jobs add column if not exists cover_image_url text;
