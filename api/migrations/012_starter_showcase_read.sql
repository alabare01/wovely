-- 012_starter_showcase_read.sql
-- Starter catalog read access. Showcase patterns (is_showcase = true) are the
-- ready made starters Wovely offers on the first-run fork. They live in the
-- same patterns table but must be readable by everyone — both signed-in users
-- and anonymous guests browsing before they have an account — so the starter
-- gallery can list them and clone the chosen one into the user's own library.
--
-- This policy ONLY exposes is_showcase rows for SELECT. It does not grant any
-- write access, and it does not widen visibility of normal user patterns (those
-- stay gated by the existing owner-scoped policies). Showcase rows carry no
-- user data — they are Wovely-authored sample content.
--
-- NOTE: Claude.ai owns the DB side and applies this. The client only READS
-- these rows. Do not apply from the app build.

CREATE POLICY "Anyone can view showcase starters"
  ON public.patterns FOR SELECT
  TO anon, authenticated
  USING (is_showcase = true);
