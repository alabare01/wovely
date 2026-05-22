# Supabase Anonymous Auth — Setup Notes

The Guest Import flow (`feat/guest-import`) uses Supabase native anonymous
authentication so unauthenticated visitors can import one pattern, see a
25% preview, and convert to a real account without losing their work.

## One-time dashboard setting (must be done before testing)

1. Supabase Dashboard → **Authentication → Settings → User Signups**.
2. Toggle **Allow anonymous sign-ins** to **ON**.
3. Save.

That is the entire backend setup. After this flips on, the existing
REST endpoint `POST /auth/v1/signup` (called with an empty body) returns
a real `auth.users` row where `is_anonymous = true`. The JWT for that
user carries the same `is_anonymous: true` claim, so RLS policies that
already key on `user_id = auth.uid()` continue to work without changes.

## What the app does

- On a guest's first "Add Pattern" tap, `supabaseAuth.signInAnonymously()`
  silently calls `POST /auth/v1/signup` with `{ data: {} }`. The session
  is saved exactly like any other Supabase session.
- The JWT payload is decoded client-side; if `is_anonymous === true`,
  the app sets the `isAnonymous` flag and applies the guest restrictions
  (1 pattern cap, 25% pattern preview, simplified nav, hidden Plans).
- When the guest clicks "Create Free Account" on the pattern detail page,
  the modal calls `PUT /auth/v1/user` with `{ email, password }`. The
  UUID is preserved, `is_anonymous` flips to `false`, and all the
  patterns and import_jobs the guest created stay attached. A session
  refresh follows so the new JWT no longer carries the anonymous claim.

## What did NOT change

- No schema changes to `patterns`, `import_jobs`, or `user_profiles`.
- No new RLS policies are required — anonymous users already satisfy
  the standard `user_id = auth.uid()` checks against their own UUID.
- No new database trigger is required. If `user_profiles` rows are
  created today by a `handle_new_user()` trigger on `auth.users`, that
  trigger fires for anonymous signups too. The app also runs a
  best-effort PATCH after `signInAnonymously` to seed the row if the
  trigger is missing.

## Future cleanup (not in this branch)

- Anonymous accounts that never convert accumulate forever. Add a cron
  later to delete `auth.users` rows where `is_anonymous = true AND
  created_at < now() - interval '30 days'`. Cascading FK deletes will
  remove the orphan patterns and import_jobs along with them.
- Existing-account sign-in from an anonymous session currently
  abandons the guest pattern (it stays attached to the anonymous UUID
  until the cleanup cron runs). A future enhancement could transfer
  patterns and import_jobs from the anonymous UUID to the
  just-authenticated UUID before signing the anonymous account out.
