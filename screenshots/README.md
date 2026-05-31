# Wovely Screenshot Harness

One command captures full-page screenshots of every Wovely route across **two
viewports** (desktop 1440×900, mobile 390×844), **three tiers** (Free / Pro /
Craft), and **two pattern states** (empty / loaded). Built for repeatable visual
audits each sprint.

Output lands in `screenshots/<date>/…` with a predictable folder structure.
It targets **production** (`https://wovely.app`) by default.

---

## Quick start

```bash
npm run screenshots          # full suite — all tiers, both viewports (~64 shots)
npm run screenshots:quick    # logged-out + Craft tier, desktop only (fast iteration)
npm run screenshots:reset    # wipe the 6 test accounts + re-seed from scratch
```

First run does everything end to end: ensures the six test accounts exist, seeds
the "loaded" accounts, then captures. Accounts and their patterns **persist
between runs** — seeding is skipped when data already exists.

Force a fresh seed without wiping accounts:

```bash
node screenshots/run.js --reseed
```

---

## Output layout

```
screenshots/<date>/<viewport>/logged-out/<route>.png
screenshots/<date>/<viewport>/logged-in/<tier>/<load-state>/<route>.png
screenshots/<date>/_failures.log        # only created if something fails
```

Example:

```
screenshots/2026-05-26/desktop/logged-in/craft/loaded/pattern-detail-instructions.png
screenshots/2026-05-26/mobile/logged-out/sign-in.png
```

Captured PNGs are **git-ignored** (dated `screenshots/20*/` folders). The harness
*code* is committed; the *output* is not. Attach samples to PRs manually.

---

## What gets captured

**Logged-out** (both viewports): `landing-signup`, `sign-in`, `privacy`, `terms`.
There is no `/pricing` or `/sign-up` route — the landing page *is* the signup
screen, and pricing lives in the in-app tier modal (captured as
`pricing-upgrade-modal` on Free tier).

**Logged-in** (per tier × load-state):

| | Free | Pro | Craft |
|---|---|---|---|
| empty | my-wovely, account-settings, pricing-upgrade-modal | my-wovely, account-settings | my-wovely, account-settings |
| loaded | + pattern-detail | + pattern-detail | + pattern-detail tabs (Materials / Instructions / My Notes), lightbox, collection-detail, add-pattern-modal, builds, browse, stash, tools, stitch-check, shopping |

Craft-loaded is the "full feature" account, so it exercises charts/lightbox,
collections, the Add Pattern modal (open state — closed state is `my-wovely`),
and every secondary tool view.

---

## How login works

No auth UI is driven. The harness signs in via the Supabase password grant
(same call as the app's `supabaseAuth.signIn`) and injects the session into
`localStorage` as `yh_session`, plus the tier cache key `yh_tier`, using
Playwright `storageState`. The app boots already authenticated. A few first-run
overlays (What's New, welcome toast, yarn tip) are suppressed via localStorage so
they don't cover screenshots — see `lib/session.js`.

---

## How seeding works (hybrid)

`lib/seed.js`:

- **Free-loaded** → DB-clone of existing real, extracted patterns (rich content,
  chosen IDs in `config.js → FREE_CLONE_SOURCE_IDS`). The free tier's big-PDF gate
  blocks real uploads, and a clone of already-extracted content is identical on
  screen.
- **Pro-loaded / Craft-loaded** → **real upload pipeline**. The app's exact pdf.js
  text extraction runs inside a Chromium page, then the harness calls the same
  endpoints the app uses: Storage upload → `POST /api/import-job` → poll
  `GET /api/job-status/:id` (live Gemini extraction). The final `patterns` row is
  written from the returned `extracted_data`, mirroring the columns the app's save
  handler sets (App.jsx). PDFs come from `config.js → UPLOAD_PDFS` (default
  location `~/OneDrive/Desktop/Patterns`; override with `PATTERNS_DIR`).
  > Note: we replicate the upload endpoints rather than clicking through the
  > modal's multi-screen review flow — far more reliable, identical extraction
  > path. To drive the literal UI instead, that's the place to change.
- **Craft-loaded** additionally gets one chart-bearing pattern cloned in (so the
  chart lightbox always has content) and a sample **collection** (so
  collection-detail has content).

---

## Common edits

### Add a new route
Edit `routesFor(target)` in `lib/capture.js`. Push a step:

```js
steps.push({ name: "my-route", path: "/my-route" });
// with interaction before the shot (open a modal, switch a tab, etc.):
steps.push({ name: "my-route-modal", path: "/my-route", prepare: async (page, vp) => {
  await page.getByRole("button", { name: /open thing/i }).click();
  await page.waitForTimeout(800);
}});
```

The file name comes from `name`; the folder comes from the target (auth / tier /
load-state) automatically.

### Change which routes a tier captures
`routesFor` branches on `target.tier` and `target.loadState`. Adjust there.

### Update a test account's tier
Tiers are set in `config.js → ACCOUNTS`. Change the value and re-run — the harness
upserts `user_profiles.tier` on every run via `lib/accounts.js`. To change a tier
by hand in the DB:

```sql
UPDATE user_profiles SET tier = 'craft', is_pro = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'alabare+pw-...@gmail.com');
```

### Change viewports / target URL
`config.js → VIEWPORTS`. Target URL via `SCREENSHOT_BASE_URL` env var (defaults to
`https://wovely.app`).

### Add / swap upload PDFs
`config.js → UPLOAD_PDFS`. Keep them single-pattern PDFs (multi-clue files trigger
the collection import branch).

---

## Test accounts & credentials

Six dedicated accounts, all sharing one password:

```
alabare+pw-free-empty@gmail.com     (Free,  no patterns)
alabare+pw-free-loaded@gmail.com    (Free,  patterns)
alabare+pw-pro-empty@gmail.com      (Pro,   no patterns)
alabare+pw-pro-loaded@gmail.com     (Pro,   patterns)
alabare+pw-craft-empty@gmail.com    (Craft, no patterns)
alabare+pw-craft-loaded@gmail.com   (Craft, patterns)
```

Credentials & secrets — **none are committed**:

- `PLAYWRIGHT_TEST_PASSWORD` — shared account password, in `wovely/.env.local`.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — already in `.env.local`.
- `SUPABASE_SERVICE_ROLE_KEY` — **not** stored in the repo. The harness pulls it
  from **Vercel production env** on demand (`vercel env pull`) into
  `screenshots/.env.vercel.local` (git-ignored, cached between runs). Requires the
  Vercel CLI to be installed and authenticated (`vercel login`). Alternatively,
  set `SUPABASE_SERVICE_ROLE_KEY` directly in `.env.local` and the pull is skipped.

The service role key is used only for admin tasks: creating accounts with
pre-confirmed emails, setting tiers, and cloning seed patterns.

---

## Files

```
screenshots/
  run.js                 entry — ensure accounts → seed → capture
  reset.js               wipe + recreate + re-seed the 6 accounts
  config.js              viewports, accounts, PDFs, clone sources, output paths
  lib/
    env.js               env loading + Vercel service-key sourcing
    accounts.js          idempotent account + tier setup
    seed.js              hybrid seeding (clone + real upload)
    session.js           programmatic login → storageState
    supabase-admin.js    admin REST helpers (users, tiers, pattern/collection clone)
    capture.js           route plan + navigation + screenshot engine
  samples/               curated representative screenshots (committed for the PR;
                         the full dated output stays git-ignored)
```

---

## Troubleshooting

- **All logged-in shots blank / on the landing page** — the session didn't take.
  Check `PLAYWRIGHT_TEST_PASSWORD` matches what the accounts were created with; if
  unsure, run `npm run screenshots:reset`.
- **Service key errors** — run `vercel login`, confirm the project is linked
  (`.vercel/project.json` exists), or set `SUPABASE_SERVICE_ROLE_KEY` in
  `.env.local`.
- **`pricing-upgrade-modal` / `lightbox` failed** — these depend on clickable
  triggers that can move; the run continues and logs the failure to
  `_failures.log`. Update the selectors in `lib/capture.js`.
- **Real uploads time out** — live extraction is slow; the per-PDF timeout is in
  `lib/seed.js` (`PDF_EXTRACT_TIMEOUT_MS`). Failures are per-PDF and don't abort
  the rest of the run.
```
