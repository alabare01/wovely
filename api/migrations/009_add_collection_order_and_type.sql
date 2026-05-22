-- Migration 009 — Collections Phase 1 (MKAL + multi-file)
--
-- Adds the ordering and type metadata Collections needs:
--   patterns.collection_id        link to a collection (already on prod
--                                 per Adam's setup notes, but ALTER IF
--                                 NOT EXISTS keeps the migration safe
--                                 to re-run on staging or new branches)
--   patterns.collection_order     1-based position inside the collection.
--                                 Used by MKAL to label clues (Clue 1,
--                                 Clue 2, etc) and to order the detail
--                                 view list. 0 = unordered (general).
--   patterns.is_collection_part   convenience flag so the library grid
--                                 can hide collection patterns from the
--                                 flat My Wovely view without joining.
--                                 Always derivable from collection_id
--                                 not null; the flag stays in sync via
--                                 the application layer for now.
--   collections.collection_type   'mkal' | 'general'. Affects display:
--                                 MKAL renders ordered with clue labels,
--                                 general renders as a grid.
--
-- All ALTERs are IF NOT EXISTS so re-running is a no-op. The
-- collections and collection_jobs tables are created here only if they
-- don't already exist on the target DB — RLS on production was set up
-- separately and stays. The CREATE blocks are belt-and-suspenders for
-- environments (preview branches, local dev) that may have been spun
-- up after the manual table creation but before this migration.

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Collection',
  description text,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_user_id_idx on public.collections(user_id);

alter table public.collections
  add column if not exists collection_type text not null default 'general';

alter table public.collections
  drop constraint if exists valid_collection_type;
alter table public.collections
  add constraint valid_collection_type check (collection_type in ('mkal', 'general'));

alter table public.patterns
  add column if not exists collection_id uuid references public.collections(id) on delete set null;

alter table public.patterns
  add column if not exists collection_order integer not null default 0;

alter table public.patterns
  add column if not exists is_collection_part boolean not null default false;

create index if not exists patterns_collection_id_idx on public.patterns(collection_id);

-- RLS — only create policies if they don't exist. Production has these
-- already per Adam's setup; this is for fresh branches.
alter table public.collections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'collections' and policyname = 'Users can manage their own collections'
  ) then
    create policy "Users can manage their own collections" on public.collections
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
