-- Migration 010 — Collection metadata (part_label + expected_part_count)
--
-- Adds vernacular and slot-count metadata so the UI can talk about an
-- MKAL's parts using the language the pattern actually uses (Clue, Part,
-- Section, Chapter, Module, Block) and render the right number of
-- "unimported" placeholder slots when the planner knows the total.
--
-- Both columns are nullable / defaulted so existing rows keep working —
-- part_label defaults to 'Part' (safe generic) and expected_part_count
-- stays NULL when the planner can't determine it from the PDF.
--
-- Populated by:
--   - the planning pass in api/extract-pattern.js (returns part_label
--     and expected_part_count alongside collection_name/type)
--   - the auto-create-collection flow in App.jsx after a PDF extraction
--     that was kicked off as a collection import
--
-- The CollectionDetailView, PatternDetail breadcrumb/part nav, and
-- Dashboard library grid all read these columns to render the right
-- vernacular ("Clue 3 of 12" vs "Part 2", etc).

alter table public.collections
  add column if not exists part_label text default 'Part';

alter table public.collections
  add column if not exists expected_part_count integer;
