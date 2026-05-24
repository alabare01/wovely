Wovely Project Context
Single source of truth for Wovely project context. Both Claude.ai and Claude Code read this file at session start.
Last updated: Session 67 close, 2026-05-15

WOVELY MASTER DOC v110

⚠️ S68 OPENS WITH WORKFLOW REBUILD, NOT CODE WORK ⚠️
This doc is too big. Pasting at open and rewriting at close eats ~44k tokens per session before any real work starts. S68 = restructure the entire context-management workflow before resuming feature work. Claude has agreed to walk Adam through the rebuild step by step in a fresh chat. Do not start S68 by pasting this file. Start S68 with: "walk me through the workflow rebuild we agreed on at S67 close."

S68 WORKFLOW REBUILD — PLANNED PATH
Tier 1: Create Claude Project called "Wovely". Connect to github.com/alabare01/wovely. Commit WOVELY_CONTEXT.md to repo root so project knowledge auto-syncs. Move top-level instructions (SESSION OPEN, SESSION CLOSE, WORKFLOW RULES blocks) into project custom instructions. Test with a small task.
Tier 2: Split the doc. WOVELY_CORE.md = infrastructure, style guide, Bev canon, tech gotchas, user IDs, Claude rules (~5k tokens, monthly cadence). WOVELY_STATE.md = current session, open bugs, untested work, change summary (~2-3k tokens, per-session cadence). Both in repo, both in project knowledge.
Tier 3 (optional, later): Mirror this pattern for Terra, Horne Lake, personal — each its own Claude Project with its own GitHub/Drive connection. Top-level chats stay for cross-lane work only.
Known caveat: GitHub-connected projects sync on a delay (minutes, not instant). Workaround: wait 2-3 min between session close and next session open, or manually re-upload doc as fallback.
Adam asked Claude to write the custom instructions block (boiled-down version of current SESSION OPEN/CLOSE/WORKFLOW blocks) as part of the S68 walkthrough.

SESSION CLOSE WORKFLOW (CURRENT — TO BE REPLACED IN S68)
Claude.ai writes the updated doc as plain text in chat at session close. Adam copies into C:\Users\adam\wovely\WOVELY_CONTEXT.md and saves. No Claude Code prompt required at close. Claude Code pushes to GitHub opportunistically.
This workflow ends after S68 rebuild. Replacement path documented above.

CURRENT PRODUCTION STATE
Live on wovely.app. SOV remains offline and parked. Queue System v1 with S66 + S67 polish landed on feat/queue-system-v1. S67 added a Stage 1.5.3 polish pass (yarn extraction, copy unification, BevCheck direct save, tappable My Notes empty state) — Adam tested visually during S67 close and found a NEW structural UI bug. Fix prompt for that bug was written at S67 close, NOT YET SENT TO CLAUDE CODE. Branch still NOT merged.

SESSION 67 — WHAT HAPPENED
Opened in reconstruction mode at S68 framing (chat numbering was off by one — corrected mid-session). Actual S67 covered:
1. Wrote v109 of this doc reconstructing the prior session's Stage 1.5.3 work from chat fragments.
2. Adam tested the deployed Stage 1.5.3 build visually and found a structural UI bug: import has THREE visible states (full modal, medium "Expand/Importing/X" pill, small bottom-left pill) when it should have TWO (full modal + small bottom-left pill only).
3. Adam confirmed the desired model: full modal stays open until backdrop click or navigation away; on dismissal, small bottom-left pill takes over; tapping small pill during processing reopens full modal with elapsed counter continuing; medium pill should never render.
4. Claude wrote a Claude Code prompt to fix this — collapse three states to two, remove medium-pill render branch, remove X button from loading state, add elapsed time to full modal, wire backdrop+navigation dismissal, wire pill tap to reopen modal.
5. Adam DID NOT send the prompt to Claude Code yet — paused to address the context-window-overhead problem first.
6. Session closed with workflow rebuild plan in place.

S67 POLISH PROMPT — WRITTEN BUT NOT SENT
Suggested commit message: "fix(stage-1.5.3): collapse import UI to two states — full modal + bottom-left pill"
Scope (preserved here in case the workflow rebuild takes priority and this gets sent to Claude Code later):
- Remove medium-pill render branch from src/AddPatternModal.jsx loading state
- Remove X button from loading state of AddPatternModal (keep X on review and BevCheck states)
- Add elapsed time display to full modal loading state (same value/format as ImportPill, ideally via shared hook)
- Wire backdrop click during loading to: close modal + write wovely_active_import_job to sessionStorage if not already there
- Wire route-change dismissal to same path (NO useBlocker — Wovely is on BrowserRouter)
- Verify ImportPill tap during processing reopens AddPatternModal with same job_id, elapsed counter continuing (elapsed comes from phase_timestamps in DB, not local mount timer)
- npm run build clean, branch stay on feat/queue-system-v1
- Do NOT touch HiveVisionForm, useSnapProgress, Snap & Stitch flow, review state, or BevCheck state

S67 PRE-FIX VERIFICATION (Adam-visual, not full QA pass)
- Stage 1.5.3 build is on preview at https://wovely-git-feat-queue-system-v1-alabare-8435s-projects.vercel.app
- Phase copy unification: appears working (copy is consistent across modal and pill)
- Bev image displaying in both full modal and small pill: working
- Small bottom-left pill design: matches intent (image 3 in S67 chat — KEEPER)
- Full modal design: needs elapsed time added, otherwise visually right
- Medium pill design: should not exist, currently does
- Yarn extraction fix on Beehive PDF: NOT YET RE-IMPORTED
- BevCheck direct save path: NOT TESTED
- Tappable My Notes empty state: NOT TESTED
- Chunked metadata fix on >13KB PDFs: NOT TESTED
- Warden hang status: UNKNOWN

UNTESTED — VERIFY AFTER WORKFLOW REBUILD AND MEDIUM-PILL FIX
S66 commit af99a49 polish (carried from v108):
- Chunked metadata fix on >13KB PDFs — needs a real large PDF test
- BevCheck server-side regression fix (option A) — test clean + flagged pattern
- Phase pill with real elapsed time + Bev's voice copy + slow-path detection
- X-button discard confirm in review/BevCheck state
- useImportJobPolling hook usage by all three consumers (PDFUploadForm, ImageImportModal, ImportPill)

S67 Stage 1.5.3 polish:
- Modal phase headline transitions on phase change, NOT every 8s
- Pill copy matches modal copy when modal minimized
- BevCheck direct save path with both clean + flagged patterns
- My Notes empty state tappable on a pattern with no notes
- Beehive PDF re-import to verify yarn extraction fix landed
- Whether haptic feedback bonus actually shipped

S67 medium-pill fix (queued, not yet sent to Claude Code):
- After fix: import a PDF, confirm full modal opens with elapsed time
- Click outside modal, confirm small pill appears with same elapsed counter
- Tap small pill, confirm full modal reopens with same elapsed and same phase
- Navigate route during import, confirm modal closes and pill persists
- Confirm medium "Expand / Importing..." pill never renders

Warden hang status:
- Did the SQL diagnostic run, and what did it return? Unknown.
- Was a fix shipped, or is the hang still reproducible on preview? Unknown.

CARRIED BUGS / WORK
Critical (blocking merge):
0. S68 workflow rebuild — must complete first, frees up context for actual work
1. Medium-pill fix — prompt written, not sent, send after workflow rebuild
2. Full verification pass on queue v1 (S66 + S67 + medium-pill fix) — must complete before merge
3. Warden hang status — confirm resolved or still open
4. Image-import polling lag (resolves on merge-to-main when cron kicks in)

After verification clean:
5. Dedicated Imports page — active imports with progress bars, history, retry failed, link to source, cover thumbs. Pro feature, Free gets teaser.
6. Imports page is where multi-pattern UX lives. Until it ships, single-file picker stays + queue handles repeat imports.
7. ImageImportModal "Retry BevCheck" button is a half-dead path on queue-completed jobs. Imports page should own retry semantics.

Cleanup debt:
8. Real phase-duration measurement pass ~2 weeks post-merge — one SQL query against phase_timestamps, swap reference range constants in commit

New product surfaces deferred:
9. Embedded PDF image extraction (charts, photos, diagrams) — real 3-5 day build. Architecture decisions needed: pdf.js vs pdf-lib vs poppler, Vercel 300s cap (may need QStash/Inngest fan-out), Cloudinary budget, gallery UI.

Open product threads:
10. Marketing push test design — channel, hook, success metrics, founder-led vs product-led. Parked behind queue merge.
11. Yearly pricing decision ($59.99/yr vs $9.99/yr).
12. 6-photo composite quality on image imports (queue v1.1 watch-out).

QUEUE SYSTEM v1 — FINAL ARCHITECTURE (LOCKED, SHIPPED IN S65-67, VERIFICATION INCOMPLETE)
import_jobs table:
- id uuid PK, user_id fk, status (pending|processing|completed|failed)
- file_type (pdf|image), file_url, raw_text, extracted_data jsonb, cover_image_url
- extraction_method, error_message, retry_count, created_at, updated_at
- validation_report jsonb (S66), current_phase text (S66), phase_timestamps jsonb (S66), pdf_metadata_title text (S66)
- RLS from day one, service role bypass for cron

Processing:
- Scheduled function /api/cron/process-queue every 1 minute (PRODUCTION ONLY — preview relies entirely on keepalive)
- Immediate keepalive kick from POST /api/import-job with 800ms AbortController timeout (best-effort)
- Worker sweeps stuck-in-processing jobs older than 5 minutes back to pending (or to failed if retry_count exceeds MAX_RETRY_COUNT)
- Per-extraction 240s AbortController-driven timeout
- Sequential processing, one job per tick budget
- Phase tracking: worker writes current_phase + phase_timestamps on each transition
- Phases: 'reading' (pickup) → 'extracting' (before extract call) → 'validating' (before BevCheck) → 'finalizing' (before final status update)
- BevCheck server-side (option A): runs in worker AFTER extraction, BEFORE status='completed'. Non-blocking on BevCheck failure (stores {"error":"..."} but continues). Single source of truth: validation_report column.

Client flow:
- POST /api/import-job → returns job_id, immediately tries keepalive kick
- Modal stays mounted with loading state if user stays on page
- (PENDING MEDIUM-PILL FIX) On backdrop click or navigation: modal closes, ImportPill picks up via sessionStorage wovely_active_import_job within ~1s
- Polling every 3 seconds against /api/job-status/[job_id]
- useImportJobPolling hook (S66) centralizes fetch+interval+cleanup across PDFUploadForm, ImageImportModal, ImportPill
- Pill self-dismisses on tap-to-review (or tap-to-reopen-modal during processing, PENDING medium-pill fix)
- Phase pill copy (centralized in src/utils/importPhaseCopy.js per S67):
  * reading: "Bev's reading your pattern" / typical 2-5s
  * extracting: "Bev's untangling the structure" / typical 30-90s
  * validating: "Bev's giving it a once-over" / typical 5-15s
  * finalizing: "Almost done" / typical 1-3s
  * slow path (>120% of typicalMax): "Bev's taking a little longer than usual on this one..."
- Modal headline and pill copy share the same source per S67
- X-button in review/BevCheck state: "Discard" + confirm dialog ("Discard this import? Bev's work won't be saved."). X-button during loading: BEING REMOVED in medium-pill fix.
- BevCheck direct save path added S67 — user can save directly from BevCheck state without bouncing back through review

DEFERRED ARCHITECTURE WORK (v1.2+)
- Content-aware page-by-page PDF routing (text/chart/swatch pages → different models, reassemble) — foundation for Bev's Read
- Retention policies (30-day completed, 90-day failed)
- Real-time error alerting on import_jobs.status='failed'
- Concurrency beyond sequential
- QStash/Inngest fan-out for >300s extractions (needed for embedded image work)
- Job-id-keyed BevCheck retry endpoint (for Imports page retry button)

STITCH LIBRARY (S62 FOUNDATION COMPLETE — PARKED PENDING SOV)
- Supabase stitch_library: 307 entries, provenance='canonical', verified_by_dani=false, all have image_url
- stitch_library_candidates table built but unused
- Local Stitch Review app at C:\Users\adam\wovely-tools\stitch-review\ — network-accessible at http://10.0.0.193:5173/ for Dani
- Tip authoring deferred until SOV proven

SOV — PARKED
Re-decision triggers in docs/sov-architecture-decision.md. Six-weeks-elapsed clause forces re-decision ~mid-June 2026. Future direction: scan-for-a-match. Branch feat/sov-library-integration preserved.

COLLECTIONS SPEC — READY, BLOCKED ON QUEUE MERGE + IMPORTS PAGE
Extends import queue. Schema ready. 4 Claude Code prompts. 2 sessions to ship v1.

PRICING TIER VISION
- Free — 5 patterns, 3 Snap-and-Stitch/mo
- Pro — $8.99/mo LIVE — unlimited patterns, unlimited SOV (offline), BevCheck
- Craft — TBD ~$14.99/mo — Collections, Bev's Read, higher-order features

PRODUCT SURFACE
Import pipeline:
- Add PDF (queue, S66 + S67 polish landed — verification incomplete, medium-pill fix queued)
- Add from photos (queue, S65 working)
- Paste a URL (still sync, NOT migrated to queue)
- Explore free patterns (in-app browser)

My Wovely — Craft Room redesign (S37) — DNA of every surface. Glass cards, fixed body::before background, warm gradient fallback. Two-column grid desktop. Playfair italic time-of-day greeting. BevCorner typewriter. Right-side vertical Add Pattern tab.

Feedback infrastructure — FeedbackWidget z-60, Supabase feedback table, sessionStorage draft.

Edge Functions — get-signed-url, vercel-log-drain.

My Notes (S67)
Empty state on a pattern's My Notes tab now tappable to enter editing directly. Previously required some other interaction to begin a note. NOT YET VERIFIED on a pattern with no existing notes.

OPEN BUGS (priority post-S67)
1. Medium "Expand / Importing..." pill should not render — fix prompt written, not sent
2. Warden hang at "reading" phase — diagnosis may have run in earlier session, outcome unverified
3. Chunked metadata fix landed but unverified (needs >13KB PDF test)
4. BevCheck server-side regression fix landed but unverified
5. Pill progress signaling landed but unverified
6. X-button discard confirm landed but unverified
7. Modal+pill copy unification landed — appears working visually, full QA pending
8. BevCheck direct save path landed but unverified
9. My Notes empty state tap landed but unverified
10. Yarn extraction fix landed but unverified (S67 — Beehive PDF was failing yarn extraction)
11. Client timeout on very large PDFs (queue solves once chunked fix verified)
12. SOV architecture (parked)
13. BevCheck UI — gauge typography, zone labels, full report — needs Dani feedback
14. Modal layering bug — desktop import modal stacked background layers
15. StitchResultPage favicon missing
16. Bev Notes nav icon — blue shield needs personality
17. PDF cover intelligence (we now have a cover from page 1; this becomes "vision-pick best page" — future)
18. /hive fossil route still in router
19. Pages not scrolling to top on load
20. Cookie consent banner missing
21. Mobile login landing position
22. Mojibake em-dashes in stitch_library.instructions

UNCONFIRMED — REQUIRES VERIFICATION
- sub_counter_state progress loss on device switch
- Action row numbering stealing row numbers (S17)
- Stitch Check save report feature build status
- yh_is_pro localStorage cache post-anonymous-mode refactor
- Header hide-on-scroll in pattern detail
- Founder Dashboard at wovely.app/founders post S46-59 rendering
- Haptic feedback on extreme BevCheck scores (S67 bonus — may or may not have shipped)

DANIELLE FEEDBACK LOG
- [LOVES IT] My Wovely Craft Room redesign — iMessage Apr 6
- [SHIPPED S40] Instructions/Rows tab rename, import spinner, nav guard removed, email capture removed, iPad scroll fix
- [BLOCKER S60] Stitch-O-Vision Linen Stitch misclassification → Shipped offline same day
- [S58 PROPOSAL] Stitch Library — locked S60, foundation built S62, parked S63
- [GIFT S60] 18-stitch swatch grid + symbol legend — both Dani-verified, parked
- [S61 DELIVERABLE FOR HER] 307 stitches extracted, review app built, ready for review pass
- [S62 — Dani review parked] localStorage architecture issue + tips deferred until SOV validation
- [NEEDS DISCUSSION] BevCheck full report UI
- [NEEDS DISCUSSION] Stitch Check link to error location in pattern
- [NEEDS DISCUSSION] Floating import banner covers side nav while processing — partially resolved S65 with stay-mounted flow, medium-pill fix in S67/S68 will fully resolve
- [NEEDS DISCUSSION] No warning when user refreshes during import
- [NEEDS DISCUSSION] Stash + button should add yarn, not upload pattern
- [NEEDS DISCUSSION] Color palette — pure white feels cold

KEY USERS (strategic only)
- Danielle (me.com) — north star, UX veto, 17 patterns, Stitch Library co-creator + reviewer
- Danielle (gmail) — second account
- Adam — founder
- Steffanie Brown — engaged Pro, champion candidate
- turttlesong — beta tester, M-Cal suggester. S64 input: charts not importing. Bev's Read sequence reconsideration tied to her feedback.
- Morgan — YouTuber, browser-blocked. Domain reputation warmup parked 60-90 day horizon.

For current user count and activity: Supabase live or PostHog (project 363175).

USER IDS
- Adam: 6e1a02d9-c210-4bc4-968e-dde3435565d1
- Danielle me.com: d6b18345-a85e-42bd-b7cb-f20efd4b2fe7
- Danielle gmail: 038442a2-b13d-4abb-9960-24a360078f6c

INFRASTRUCTURE
- Live: wovely.app
- GitHub: github.com/alabare01/wovely
- Local: C:/Users/adam/wovely
- Internal tools: C:/Users/adam/wovely-tools/ (sibling, NOT in main repo)
- Supabase: vbtsdyxvqqwxjzpuseaf — PRO
- Vercel: prj_SZYwLGH5V7kCZYryr4MSy3US3bfz / team_mRQaDsQzhF6HFGU5Ka7hi5OM — PRO. No hard function-count limit. Real constraint: $20 included + $200 on-demand budget cap.
- Stripe: acct_1TDQ1WGbX5hxxc0T (LIVE) — $8.99/mo Pro
- Cloudinary: dmaupzhcx (.env.local: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET — server-side, no VITE_ prefix)
- PostHog: Project 363175
- Current session: 68 (next)
- Active branch: feat/queue-system-v1 — NOT merged. S68 opens with workflow rebuild, NOT code work.

VERCEL ENV VARS NOTE
Five vars currently flagged "Needs Attention" in Vercel: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Work fine. Hygiene task: mark Sensitive. Deferred to deliberate 10-min pass between sessions.

EMAIL STACK
Google Workspace: adam@wovely.app, support@wovely.app
Resend: RESEND_API_KEY in Vercel. DKIM live. SPF/DKIM/DMARC passing.

LEGAL
Wovely LLC — filed March 30 2026, L26000181882, Florida. EIN reassigned from Hive Works. Annual report due Jan 1–May 1 2027 at sunbiz.org.

TECH STACK
React/Vite, Supabase Pro, Vercel Pro, Claude Haiku 4.5 primary, Gemini 2.5 Flash fallback + BevCheck primary, Stripe $8.99/mo, Cloudinary, Resend, PostHog

STYLE GUIDE v1.0 (LOCKED)
Primary: #9B7EC8, Navy: #2D3A7C, White: #FFFFFF, Surface: #F8F6FF, Border: #EDE4F7
Text primary: #2D2D4E, Text secondary: #6B6B8A, Danger: #C0544A
Fonts: Playfair Display (headings), Inter (body)
NEVER USE: #1A1A2E, terracotta #B85A3C or #C05A5A, cream #FAF7F2

Pastel semantic (S53)
- Pass: dusty teal #A4C2C3
- Heads-Up: soft buttercup #E2D985
- Issues: dusty rose #CEA0A4

Card token system (S43)
- CARD_LABEL: 9px 700 1.2sp uppercase #9B7EC8 Inter
- CARD_TITLE: 14px 700 #2D2D4E 1.3lh Playfair
- CARD_SUBTITLE: 11px #6B6B8A 1.4lh Inter
- CARD_PILL: 10px 600 padding 3px 8px radius 20 bg #F8F6FF #6B6B8A border 1px #EDE4F7
- BADGE: 32x32 solid #5B9B6B white text 11px 700

BEV
Hyper-realistic crochet amigurumi lavender snake, named after Danielle's grandmother Beverly.
Canonical: IMG_3968 (no text, navy hexagon frame). Character bible locked S19.
bev_neutral.png in /public.
ALL loading states: static Bev inside spinning ring.
NEVER snake emoji where Bev image can be used.
NEVER use "AI" in user-facing copy — Bev owns all intelligence.
Bev's voice = Dani's voice. Locked.
Failed state copy: "Bev got tangled — try again"
Future assets: bev_happy.png, bev_warning.png, bev_concerned.png
AI suite: Stitch-O-Vision (offline, parked), BevCheck, Ask Bev (future), Bev's Read (future Craft tier)

BACKGROUND CSS (CRITICAL)
- body::before: image, position fixed, z-index -1
- body::after: gradient overlay, position fixed, z-index -1
- #root: position relative, z-index 1
- App.jsx: NO background-color on layout wrapper
- Content wrappers: min-height 100vh
- iOS: background-attachment fixed broken — use fixed pseudo-elements

Z-INDEX MAP
- FeedbackWidget: 60
- ImportPill: 50
- Add Pattern tab: 40
- Mobile header: 20
- Tooltips: 100
- Modals/overlays: 50+ (review modal at 400 sits above ImportPill)

PENDING ADAM ACTIONS
- S68: Workflow rebuild (Claude Project + GitHub sync + doc split). Claude will walk through step by step.
- After workflow rebuild: send the medium-pill fix prompt to Claude Code.
- After medium-pill fix: full verification pass on queue v1.
- SOV parked. Re-decision triggers in docs/sov-architecture-decision.md. ~mid-June 2026.
- Supabase webhook config: auth.users INSERT → https://wovely.app/api/notify-signup
- Replace cover image on First Sunrise Blanket Pattern
- Claim @wovely on Instagram + TikTok
- File annual report Jan 1–May 1 2027 at sunbiz.org
- Try Recraft.ai for Bev vector logo
- Create bev_happy.png, bev_warning.png, bev_concerned.png
- Get Dani written feedback on BevCheck full report UI
- Send welcome re-engagement email (script built S56, not sent)
- Commit WOVELY_CONTEXT.md to main opportunistically next time in Claude Code (becomes automatic after S68 rebuild)
- Decide yearly pricing ($59.99/yr vs $9.99/yr)
- Migrate Claude Design account from adam@terrainnovations.com → adam@wovely.app
- Open loop: Gemini 2.5 Pro never tested vs Haiku primary
- Text Dani confirming SOV offline ship from S60, Stitch Library foundation built but vision layer parked
- Hand off Stitch Review app to Dani — parked until SOV validation
- Direct founder-to-user email engagement — personal outreach to specific users
- Decide whether feat/sov-library-integration branch is preserved or replaced
- Mark Vercel env vars Sensitive (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) — deliberate 10-min pass between sessions
- Marketing push test design — channel, hook, success metrics, founder-led vs product-led — parked behind queue merge

TECHNICAL GOTCHAS
Auth & session
- supabaseAuth.getUser() is SYNCHRONOUS — never await
- Supabase signup returns sessions in two shapes — normalization required
- Post-login → My Wovely (sessionStorage wovely_redirect_intent)
- /pattern/:id and /hive/:id stored in redirect intent, 15-min window, cleared on signout
- RLS with zero policies silently blocks all writes

Server / API
- Pattern fetch needs Range: 0-499 header
- Missing await on async = silent 500
- Utility module imports silently fail in Vercel serverless — inline only reliable
- Vercel env var changes require fresh deployment
- Vercel Pro maxDuration 300 on extract-pattern.js and extract-pattern-vision.js
- Vercel runtime logs truncate at first console.log — use vercel_logs Supabase table via execute_sql
- Vercel cron minimum is 1 minute — no sub-minute scheduling
- Vercel env vars are snapshotted at deploy time — older deployments retain stale values even after env update (S65 learning)
- Supabase execute_sql requires auth.users with explicit schema prefix
- Auth schema FK relationships not discoverable via information_schema — use pg_constraint joined to pg_class/pg_namespace
- user_profiles has NO email column — join through auth.users
- Mobile background fetch: start fetch before UI transition
- Claude Haiku model: claude-haiku-4-5-20251001
- BevCheck max_tokens: 2000
- Gemini 2.5 Flash: model gemini-2.5-flash, /v1beta/
- Gemini: strip markdown fences before JSON.parse
- Gemini: skip parts where part.thought === true
- Stripe webhook env var: STRIPE_WEBHOOK_SECRET
- Vercel keepalive over keepalive:true is NOT reliable (S65 learning) — use awaited fetch with short AbortController timeout instead
- Cron only runs on Production deployments, not Preview branches (S65 learning) — preview depends 100% on keepalive

Codebase reality (S66-67 corrections)
- Migrations live at api/migrations/, NOT supabase/migrations/
- PDFUploadForm is inline in src/AddPatternModal.jsx (~line 840+), not its own file
- No src/services/bevCheck.js — client uses direct fetch to /api/extract-pattern with mode:"bevcheck"
- Server BevCheck logic lives in api/extract-pattern.js — exported as runBevCheck for worker (no separate api/lib/bevCheck.js file, preserves function count)
- Refs alone don't trigger re-renders — when conditional UI depends on a state-like value, use useState even if you also need a ref for handlers
- Phase copy centralized in src/utils/importPhaseCopy.js as of S67 — modal headline and pill both import from here

Client / UI
- detailOnSave must spread updated_at onto local state
- Hero image: PILL sentinel check before using photo field
- useBlocker requires createBrowserRouter — Wovely uses BrowserRouter, DO NOT use
- iPad Safari scroll bounce: never overflow-y scroll on inner containers
- App.jsx fragment wrapping: DO NOT wrap App return in React fragments
- Fixed position banners in Dashboard.jsx: DO NOT USE (ImportPill exception, lives at App.jsx level)
- DEFAULT_STARTERS excluded from stats via is_starter filter
- Client timeout on extract pipeline: 240s S58
- PDFs → Supabase Storage (pattern-files bucket). Images → Cloudinary. Brand assets → /public
- Cloudinary MCP cannot upload local files or base64. Claude Code with Cloudinary Node SDK CAN.
- Modal closing on /api/import-job 200 destroys local state — wire any field through the queue or it's lost (S65 learning, root cause of cover image regression)
- Backdrop dismissal MUST be guarded when extracted/preview/validationReport state exists (S65 learning)
- Import UI state model (S67): two states only — full modal OR small bottom-left pill. No medium/intermediate state. Medium "Expand/Importing/X" render branch being removed in queued fix.

Claude Code subagents (S61)
- Haiku 4.5 (200k context) cannot fit Claude Code's deferred MCP tool surface
- Sonnet 4.6 for subagent vision work
- Opus 4.7 only when Sonnet quality insufficient
- Pre-grant Write permission in .claude/settings.json for parallel-subagent jobs

Claude Code workflow
- Claude Code asks too many questions when given a clear task. Say "just do it" explicitly
- Avoid surgical edits to WOVELY_CONTEXT.md mid-session. Full rewrite at close
- When Claude Code flags pre-build architectural conflicts, answer with conviction
- Claude Code can mint a Supabase session via admin generate_link for verification — may trigger magic-link email, safe to ignore (S65)

PowerShell / Windows
- Inline command character limit: 948 bytes
- Snipping Tool auto-save → C:\Users\adam\Pictures\Screenshots\
- OneDrive auto-syncs → C:\Users\adam\OneDrive\Pictures\Screenshots N\

Vision model architecture (S62 — CRITICAL)
- Sending only TEXT to a vision model and asking it to identify a user's image does NOT do visual identification.
- Real visual identification requires actual reference images alongside user's image, or embedding-based similarity.

Spec drift / conviction (S63-64)
- Specs that survive multiple sessions of slip grow into something the founder is afraid to touch.
- Run conviction conversation before executing on long-deferred spec.

Chunked extraction (S65 learning, fix shipped S66 unverified)
- isChunked path in extract-pattern.js (>13KB pdfText) tells the model "metadata already captured from chunk 1" for chunks 2+
- S66 merge logic now includes title/designer/materials/hook_size/yarn_weight/gauge/finished_size/difficulty in deep-merge
- Materials specifically concatenated + deduped (commonly split across pages)
- Client-side fallback: pdfjs.getMetadata().info.Title passed in POST as pdf_metadata_title; worker uses if extracted title empty
- extraction_method gets _with_pdf_meta_title suffix when fallback fires (S66)
- Has existed since 2026-04-14, queue made it visible. Test plan requires >13KB PDF to verify — Warden at 9855 chars is below threshold.

Yarn extraction (S67 fix unverified)
- Beehive PDF specifically failing on yarn field extraction. Other patterns (Warden et al) extract yarn correctly.
- Fix shipped in S67 but unverified. Re-import Beehive as smoke test.

Phase pill (S66 + S67)
- current_phase + phase_timestamps written by worker on every transition
- pill reads current_phase from poll, computes elapsed from phase_timestamps[currentPhase + '_started_at']
- Local 1s tick smooths display between 3s polls
- Cross-fade 200ms on phase change
- Legacy/pre-instrumentation jobs fall back to "Bev's working on it... {totalElapsed}s" no reference
- S67 added: modal headline and pill share copy via src/utils/importPhaseCopy.js
- S67 pending fix: same elapsed value will surface in full modal (currently only visible in small pill)

Analytics
- BevCheck events still named stitch_check_run in PostHog
- Production traffic filter: properties.$current_url LIKE '%wovely.app%'
- PostHog project 363175
- Queue events server-side: import_job_started/completed/failed/retried (props include file_type, extraction_method, duration_ms, error_message)

Misc
- SessionStorage keys: wovely_feedback_draft, wovely_redirect_intent, wovely_sov_anon_scan_used, wovely_active_import_job
- RLS must be applied to ALL new tables at creation
- CORS: audit all serverless functions

Research dead-ends
- Cannot ingest copyrighted blog/book content via automation
- AI-generated crochet images technically fail and brand-damage
- Antique Pattern Library scans CC BY-NC-SA — commercial disqualified
- Pre-1929 public domain real but aesthetically limited
- No shortcut to Stitch Library data layer

CHANGELOG RULE
Only user-facing features. Never mention AI — Bev language only. Prepend each session to src/changelog.js.

CLAUDE CODE WORKFLOW
Two windows: Claude.ai for strategy, Claude Code desktop for code execution. Diff viewer mandatory before merge. Permission modes: Ask for Stripe/auth/hotfixes, Auto for queue system/CORS/RLS/Collections, Plan for large refactors. ALWAYS query vercel_logs first when debugging.

CLAUDE RULES
- Adam pastes master doc at session open — treat as canonical (CHANGES AFTER S68 REBUILD)
- Next session = 68. S68 opens with workflow rebuild, not code work.
- Danielle feedback overrides everything
- ONE complete Claude Code prompt per task
- Never push direct to main (except WOVELY_CONTEXT.md)
- Match Adam energy, read the room
- ALWAYS query vercel_logs first when debugging
- Model swap first when provider is flaky
- Proactively flag platform limits and upgrade paths
- Never use em dashes in copy or emails written for Adam
- Session close: full doc rewrite in chat, Adam saves locally, GitHub push opportunistic (CHANGES AFTER S68 REBUILD)
- Never declare session closed without Adam's explicit confirmation
- When Adam is verbalizing, talk like a person not a doc
- When Adam is exploring a shortcut that doesn't exist, say so plainly
- When Adam is tired, recognize it and offer the off-ramp
- Stitch Library content: Dani's voice is canonical. Bev's voice = Dani's voice.
- COPYRIGHT RED LINE: Never help find workarounds for copyrighted images/text/content
- VISION MODEL ARCHITECTURE RED LINE: Text-only descriptions to vision model ≠ visual identification
- SPEC CONVICTION RULE: 3+ session slip = conviction conversation before executing
- Decline scheduled-agent suggestions from Claude Code unless solving recurring problem
- When Adam asks for a simple thing, do the simple thing
- Don't project local time onto Adam — he is in Jacksonville Eastern time (S65 reminder)
- Queue refactors that change HOW extraction runs must preserve WHAT extraction produces — wires get cut silently otherwise (S65 learning)
- Verify migrations against a real working import before declaring a queue prompt done (S66 learning — migration column count being correct is not the same as the worker actually using them end-to-end)
- If a session runs long and gets compacted, write the doc rewrite EARLY rather than at the very end (S67 learning — chat died before doc could be written, forced reconstruction)
- When the master doc itself becomes a context-eating problem, name it as a workflow bug and rebuild the workflow before resuming feature work (S67 learning — the v109 → v110 jump came from the doc eating 25%+ of context before any work began)

CHANGE SUMMARY v109 → v110
- S67 actual work: tested Stage 1.5.3 build visually, found medium-pill structural bug, wrote fix prompt (NOT YET SENT to Claude Code).
- Identified context-window overhead crisis: 22k-token doc pasted at open + rewritten at close = ~44k tokens/session of pure bookkeeping. Unsustainable.
- S68 plan locked: workflow rebuild before any further code work. Claude Project + GitHub sync + doc split (CORE + STATE).
- S68 opens with Claude walking Adam through the rebuild step by step in fresh chat.
- New Claude rule: when the master doc becomes a context problem, rebuild the workflow before resuming feature work.

Session 67 closed 2026-05-15. Workflow rebuild queued as first priority for S68. Medium-pill UI fix prompt drafted but not sent — will be sent after workflow rebuild is complete and we have working room to verify. Queue v1 still on feat/queue-system-v1, still NOT merged. Branch preview URL: https://wovely-git-feat-queue-system-v1-alabare-8435s-projects.vercel.app