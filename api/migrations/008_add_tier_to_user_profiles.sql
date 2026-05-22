-- Migration 008 — three-tier pricing (Free / Pro / Craft)
--
-- Adds a `tier` column to user_profiles as the source of truth for plan
-- gating. `is_pro` stays for one release as a backward-compat shim:
-- everywhere we currently check `is_pro` will read `tier` going forward,
-- but the column itself isn't dropped so an in-flight session that
-- somehow still references it doesn't break. Future cleanup migration
-- can drop the column once we're confident nothing reads it.
--
-- Backfill rule: every user who was manually upgraded via SQL (is_pro =
-- true) gets tier = 'craft' — they were our testers, top tier as thanks.
-- Everyone else gets the default 'free'.
--
-- Constraint: tier must be one of free | pro | craft. Anything else is
-- a code bug we want to fail loudly on, not silently degrade.

alter table public.user_profiles
  add column if not exists tier text not null default 'free';

update public.user_profiles
  set tier = 'craft'
  where is_pro = true and tier = 'free';

alter table public.user_profiles
  drop constraint if exists valid_tier;
alter table public.user_profiles
  add constraint valid_tier check (tier in ('free', 'pro', 'craft'));
