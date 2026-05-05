Wovely Project Context
Single source of truth for Wovely project context. Both Claude.ai and Claude Code read this file at session start.
Last updated: Session 63 close, 2026-05-05

WOVELY MASTER DOC v105
SESSION CLOSE WORKFLOW (adopted Session 59, refined Session 60)
Claude.ai writes the updated doc as plain text in chat at session close. Adam copies into C:\Users\adam\wovely\WOVELY_CONTEXT.md and saves. No Claude Code prompt required at close.
Claude Code pushes to GitHub opportunistically. Next time Adam is in Claude Code for any reason, one-line instruction: "also commit WOVELY_CONTEXT.md to main." Zero logic, zero avalanche risk.
Session open: Adam pastes current local content into chat at session open and Claude treats that as canonical for the session. No GitHub fetch required.
Session edits to this doc happen ONCE, at close, as a full rewrite. Do not surgically edit sections mid-session.

CURRENT PRODUCTION STATE
Live on wovely.app. SOV remains offline in production and is now formally PARKED (see SOV STATUS section). Session 63 was a decision/discipline session — no code shipped, but architectural debt was cleaned up.
Session 63 deliverables:

SOV formally parked with full architecture decision memo at docs/sov-architecture-decision.md
Memo committed to main standalone (commit: docs: add SOV architecture decision memo)
Future SOV UX direction locked: scan-for-a-match (single verdict, not ranked list)
Six-week un-park trigger established (mid-June 2026 forces explicit re-decision)
Queue System acknowledged as needing a strategic conversation before build, not just execution

Supabase on Pro tier. DKIM live. Stripe live mode active.
FIRST THING SESSION 64
STRATEGIC CONVERSATION ABOUT QUEUE SYSTEM, NOT EXECUTION.
Queue System has been on the docket since Session 60. Three sessions of slip. Adam flagged at S63 close that the spec has grown into something he's afraid to touch — that's a signal the doc is ahead of his actual conviction.
Session 64 opens with:

What is Queue System actually for, in Adam's words, today
What does it unlock that Adam actually cares about right now (Collections? SOV rebuild? something else?)
What's the minimum version that solves the real problem vs the version currently spec'd
What would it look like if we were wrong about needing it at all

Only after that conversation produces conviction do we touch code.
SESSION 64 PRIORITY ORDER

### Session 64 input: turttlesong feedback (received 2026-05-04)
Engaged beta tester reported "charts are not imported with the patterns" as an Idea/bug, not a feature request. She expected it to work. This is a real signal that chart handling (Bev's Read territory) is closer to table-stakes than the master doc has been treating it.

Implication for the conviction conversation: Bev's Read needs Queue System the same way SOV rebuild does. If conviction holds on Queue System, Bev's Read may belong sooner in the sequence than Collections. Worth re-examining the post-queue priority order.Queue System conviction conversation (above) — gates everything else
Queue System foundation build (only if conviction holds)
Collections UI (after queue system)
Welcome re-engagement email send (script exists, not yet fired)
CORS audit
RLS full table audit
BevCheck UI polish (needs Dani written feedback)
notify-signup.js wiring (requires Supabase webhook config, Adam action)
Yearly pricing decision ($59.99/yr vs $9.99/yr)
Pattern Share / Trophy Case
Domain reputation warmup (60-90 day horizon)
SOV re-architecture (parked, see memo)


SOV STATUS (as of Session 63)
PARKED. See docs/sov-architecture-decision.md for full memo, options analysis, and trigger conditions to un-park.
Future UX direction: scan-for-a-match (single verdict, not ranked list). Locked S63.
Recommended rebuild path: Option 1 (embedding-based visual search) after Queue System and Collections ship.
Six-weeks-elapsed clause forces re-decision around mid-June 2026 if not addressed sooner.

STITCH LIBRARY (SESSION 62 DELIVERABLE — FOUNDATION COMPLETE)
What's live in production

Supabase table stitch_library on project vbtsdyxvqqwxjzpuseaf
307 entries, all provenance='canonical', verified_by_dani=false
4 RLS policies: public_read, admin_write/update/delete (gated to Adam's UUID)
Indexes on slug, primary_name, also_known_as (GIN), provenance
All entries have image_url pointing to Cloudinary stitch-library/<slug>.png
Fields: slug, primary_name, abbreviation (NULL all rows), symbol_description (NULL all rows), visual_cues (text[]), construction_note (NULL all rows), instructions, also_known_as (text[]), bevs_tip (NULL all rows), provenance, verified_by_dani, source_filename, usage_count, confidence_score, version, image_url, description, dimensions, difficulty, common_uses (text[]), created_at, updated_at, created_by

What's in the candidates table (built S62, not yet populated)

stitch_library_candidates table created with RLS
Captures unmatched SOV scans for admin review
Fields: id, user_id, image_url, vision_model_guess, vision_model_confidence, library_attempted_match, match_failed_reason, reviewed_by_admin, promoted_to_library_slug, rejected_reason, created_at
Currently has 1-2 test rows from session 62 testing, can be cleared

Reconciliation findings (Session 62)

646 source screenshots scanned via Sonnet 4.6 subagents (~$2-4 cost, 7 min wall time)
100% extraction accuracy confirmed (1 false positive resolved: Gemma Edging sub-headings Large Outside Edging and Small Inside Edging treated as standalone stitches by scanner; correctly bundled by extraction; added to also_known_as)
HTML reconciliation report at C:\Users\adam\wovely\stitch-reconciliation-report.html

Known data quality issues

1 stitch (diamond-lasa-motif) has null description in source
abbreviation, symbol_description, construction_note are NULL on all 307 rows (not in source extraction)
Mojibake artifacts in instructions field: em-dashes appear as â€" (e.g., "Rep rows 2â€"5"). Pre-existing in source JSON. Single UPDATE can clean these up post-Dani-review.
bevs_tip is null on all 307 entries (intentional, deferred until SOV validation succeeds)

Pending Dani review pass (parked until SOV proven)

Local Stitch Review app at C:\Users\adam\wovely-tools\stitch-review\
Network-accessible for Dani at http://10.0.0.193:5173/ when Adam runs npm run dev
localStorage per-device — Dani's review work won't sync to Adam's machine
Tip authoring work was started in Session 62 (slip stitch hook size, joining ribbing, linked stitches, fiber counts, cables) before being correctly identified as gold-plating and parked


QUEUE SYSTEM ARCHITECTURE (LOCKED SESSION 60 — STILL UNBUILT, REQUIRES CONVICTION CHECK S64)
Foundation for Collections, Stitch Library migration, Ask Bev, Bev's Read, all future async features. Every new AI feature must use this pipeline — IF the conviction check at S64 confirms the need.
Schema: import_jobs table in Supabase

id (uuid, primary key)
user_id (fk to auth.users)
status (enum: pending, processing, completed, failed)
file_type (pdf, image)
file_url (Supabase Storage URL)
extracted_data (jsonb, populated on completion)
error_message (text, populated on failure)
retry_count (integer, default 0)
created_at, updated_at

RLS from day one
Users can only see their own jobs. Non-negotiable.
Processing architecture

Vercel scheduled function runs every 30 seconds
Dequeues all status = 'pending' jobs
Processes sequentially
Calls existing extraction logic (Gemini/Haiku, moved server-side from client)
Updates job record with extracted_data + status = 'completed' on success
Or status = 'failed' + error_message on failure

Client flow

Upload triggers POST to /api/import-job with file_url + metadata
Returns job_id immediately
Client polls /api/job-status/[job_id] every 3 seconds
Bev loading state during polling
On completion, user sees extracted pattern in review modal
User reviews and commits → moves data from import_jobs.extracted_data to patterns table

Failure handling

One automatic retry after 5 minutes
Then status = 'failed' and surface to user

Retention

Completed jobs: 30-day retention
Failed jobs: 90-day retention

Missing implementation details (resolve after S64 conviction conversation)

Retry mechanism wiring (cron re-dequeue vs separate retry queue)
Concurrency safeguards beyond sequential
Job TTL cleanup function
Alerting when failure rate spikes

Build sequence (assuming conviction holds)

Session 64: Conviction conversation → if green-lit, Supabase schema + RLS + Vercel scheduled function skeleton + extraction logic server-side
Session 65: Client polling + review modal + end-to-end flow
Session 66: QA, edge cases, merge to main, delete client-side extraction code
Session 67+: Collections UI built on top of queue system


COLLECTIONS SPEC (ready to build, blocked on queue system)
Extends import queue. Schema ready. 4 Claude Code prompts. 2 sessions to ship v1.

collections table + collection_patterns join
UI list + detail page + import wiring
MKAL/MCAL support (multi-pattern episodic imports)
Monetization: gate behind Craft tier (~$14.99/mo)
RLS from day one


PRICING TIER VISION

Free — 5 patterns, 3 Snap-and-Stitch/mo
Pro — $8.99/mo (LIVE) — unlimited patterns, unlimited Stitch-O-Vision (offline currently), BevCheck
Craft — TBD (~$14.99/mo) — Collections, Bev's Read, other higher-order features

Yearly pricing — REQUIRES DECISION. Originally $59.99/yr in Sessions 28-37. Later doc versions show $9.99/yr.
Bev's Read (Craft tier, unblocked by symbol legend asset)
Chart intelligence via Gemini multimodal. Revisit post-Collections, in parallel with Stitch Library build.

PRODUCT SURFACE — WHAT EXISTS
Import pipeline (5 methods, all live)

Manual entry
URL import
PDF import (chunked >1200 avgText/page)
In-browser Find Patterns
Snap-and-Stitch / Hive Vision

My Wovely — Craft Room redesign (Session 37)
Defines DNA of every surface. Glass cards, fixed body::before background, warm gradient fallback. Two-column grid desktop. Playfair italic time-of-day greeting. BevCorner typewriter. Right-side vertical Add Pattern tab.
Stitch-O-Vision (OFFLINE in production, PARKED post-S62)
Architecture failure documented S62. Parked S63. See docs/sov-architecture-decision.md for full options analysis and trigger conditions. Future UX direction: scan-for-a-match (single verdict, locked S63). Branch feat/sov-library-integration preserved but not merged.
Feedback infrastructure
FeedbackWidget z-60. Persistent heart icon. Supabase feedback table. Draft persistence to sessionStorage key wovely_feedback_draft.
Edge Functions (Supabase)

get-signed-url
vercel-log-drain


SOV ARCHITECTURE FAILURE ANALYSIS (Session 62)
STATUS: This analysis is preserved for historical context. SOV is PARKED as of Session 63. See docs/sov-architecture-decision.md for current state, options, and un-park trigger conditions.
What went wrong
The library-grounded approach we shipped sends 307 stitch names + visual_cues + descriptions to Haiku 4.5 as TEXT. The model picks one based on what's in the user's image. We never sent the actual reference images.
When testing with library reference images that contain page header text, stitch names in red type, and full prose descriptions, the model "identified" stitches with HIGH confidence. We thought we were testing visual identification.
When the same images were cropped to swatch-only (which is what real users upload), accuracy collapsed to 1/10. The model had been reading text labels on the reference images, not visually identifying stitches.
Specific failure modes documented

8/10 cropped-swatch tests returned NO MATCH (UNSURE) — safe failure but useless
Waffle Rib swatch identified as Tweed (medium confidence) — pure visual confusion of textured patterns
Diamond Tweed → Tweed even on the original image — model can't disambiguate close variants
Pineapple was the only pure-visual win (1/10) due to its dramatic, repeating motif

Why this didn't surface earlier

Initial smoke tests used library reference images directly (which contained text labels)
The Spider/Tweed misclassification on the user's actual upload was the first signal something was wrong
Even the "fix" (enriched prompt with visual_cues + descriptions) failed because the architecture was fundamentally wrong, not the prompt

What WAS validated successfully in Session 62

Database schema and migration logic
RLS policies and admin gating
Cloudinary upload pipeline
PostHog event tracking (sov_scan_started, sov_scan_matched, sov_scan_no_match, sov_scan_failed)
Candidate row capture for no-match scans
Honest UNSURE pathway works correctly (no confidently wrong answers in production-shape testing)
The architectural principle "either library content or honest unsure" is enforced at the model layer

Critical takeaway for next architecture pass
Whatever direction Session 64+ chooses, the fundamental requirement is: vision model must compare user's upload against actual visual data from the library, not against text descriptions of the library. Embedding-based similarity (Option 1) or multi-image vision prompts (Option 2) both meet this requirement. Text-only prompts do not.

OPEN BUGS (priority order)

Client timeout on very large PDFs — queue system solves
SOV architecture (parked, see memo)
BevCheck UI — gauge typography, zone labels, full report unfinished. Needs Dani feedback
Modal layering bug — desktop import modal stacked background layers
StitchResultPage favicon missing on public share page
Bev Notes nav icon — blue shield needs personality
PDF cover intelligence
/hive fossil route still in router
Pages not scrolling to top on load (S39 partial fix, may have regressions)
Gemini client-side calls in AddPatternModal.jsx and HiveVisionForm need server-side migration (queue system resolves)
Cookie consent banner missing
Mobile login landing position
Mojibake em-dashes in stitch_library.instructions field (â€" artifact, single UPDATE can resolve)


UNCONFIRMED — REQUIRES VERIFICATION

sub_counter_state progress loss on device switch
Action row numbering stealing row numbers (S17)
Stitch Check save report feature build status
yh_is_pro localStorage cache post-anonymous-mode refactor
Header hide-on-scroll in pattern detail (fixed S24, side effects?)
Founder Dashboard at wovely.app/founders post S46-59 rendering


DANIELLE FEEDBACK LOG

[LOVES IT] My Wovely Craft Room redesign — iMessage Apr 6
[SHIPPED S40] Instructions/Rows tab rename, import spinner, nav guard removed, email capture removed, iPad scroll fix
[BLOCKER S60] Stitch-O-Vision Linen Stitch misclassification → Shipped offline same day
[S58 PROPOSAL] Stitch Library — full spec locked S60, foundation built S62 (data layer complete, vision layer requires re-architecture, parked S63)
[GIFT S60] 18-stitch swatch grid + symbol legend, both Dani-verified, parked for build
[S61 DELIVERABLE FOR HER] 307 stitches extracted from her content, review app built, ready for her review pass
[S62 — Dani review still parked] localStorage architecture issue + tips deferred until SOV validation
[NEEDS DISCUSSION] BevCheck full report UI
[NEEDS DISCUSSION] Stitch Check link to error location in pattern
[NEEDS DISCUSSION] Floating import banner covers side nav while processing
[NEEDS DISCUSSION] No warning when user refreshes during import
[NEEDS DISCUSSION] Stash + button should add yarn, not upload pattern
[NEEDS DISCUSSION] Color palette — pure white feels cold


KEY USERS (strategic only)

Danielle (me.com) — north star, UX veto, 17 patterns. Stitch Library co-creator + reviewer.
Danielle (gmail) — second account
Adam — founder
Steffanie Brown — engaged Pro, champion candidate
turttlesong — beta tester, M-Cal suggester, NO trial deadline (corrected S60)
Morgan — YouTuber, browser-blocked. Domain reputation warmup parked 60-90 day horizon.

For current user count and activity, query Supabase live or PostHog (project 363175).
USER IDS

Adam: 6e1a02d9-c210-4bc4-968e-dde3435565d1
Danielle me.com: d6b18345-a85e-42bd-b7cb-f20efd4b2fe7
Danielle gmail: 038442a2-b13d-4abb-9960-24a360078f6c

INFRASTRUCTURE

Live: wovely.app
GitHub: github.com/alabare01/wovely
Local: C:/Users/adam/wovely
Internal tools: C:/Users/adam/wovely-tools/ (sibling folder, NOT in main repo)
Supabase: vbtsdyxvqqwxjzpuseaf — PRO
Vercel: prj_SZYwLGH5V7kCZYryr4MSy3US3bfz / team_mRQaDsQzhF6HFGU5Ka7hi5OM — PRO
Stripe: acct_1TDQ1WGbX5hxxc0T (LIVE) — $8.99/mo Pro
Cloudinary: dmaupzhcx (credentials in .env.local: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET — server-side only, no VITE_ prefix)
PostHog: Project 363175
Current session: 64 (next)

EMAIL STACK

Google Workspace: adam@wovely.app, support@wovely.app
Resend: RESEND_API_KEY in Vercel
DNS: GoDaddy. DKIM LIVE. SPF/DKIM/DMARC passing.

LEGAL

Wovely LLC — filed March 30 2026, doc L26000181882, Florida
EIN reassigned from Hive Works to Wovely
Annual report due Jan 1 to May 1 2027 at sunbiz.org

TECH STACK
React/Vite, Supabase Pro, Vercel Pro, Claude Haiku 4.5 primary, Gemini 2.5 Flash fallback + BevCheck primary, Stripe $8.99/mo, Cloudinary, Resend, PostHog

STYLE GUIDE v1.0 (LOCKED)
Primary: #9B7EC8, Navy: #2D3A7C, White: #FFFFFF, Surface: #F8F6FF, Border: #EDE4F7
Text primary: #2D2D4E, Text secondary: #6B6B8A, Danger: #C0544A
Fonts: Playfair Display (headings), Inter (body)
NEVER USE: #1A1A2E, terracotta #B85A3C or #C05A5A, cream #FAF7F2
Pastel semantic palette (S53)

Pass: dusty teal #A4C2C3
Heads-Up: soft buttercup #E2D985
Issues: dusty rose #CEA0A4

Card token system (S43)

CARD_LABEL: fontSize 9, fontWeight 700, letterSpacing 1.2, uppercase, #9B7EC8, Inter
CARD_TITLE: fontSize 14, fontWeight 700, #2D2D4E, lineHeight 1.3, Playfair Display
CARD_SUBTITLE: fontSize 11, #6B6B8A, lineHeight 1.4, Inter
CARD_PILL: fontSize 10, fontWeight 600, padding 3px 8px, borderRadius 20, bg #F8F6FF, #6B6B8A, border 1px #EDE4F7
BADGE: 32x32, solid #5B9B6B, white text fontSize 11 fontWeight 700

BEV
Hyper-realistic crochet amigurumi lavender snake, named after Danielle's grandmother Beverly.
Canonical reference: IMG_3968 (no text, navy hexagon frame). Character bible locked S19.
bev_neutral.png in /public.
ALL loading states: static Bev inside spinning ring.
NEVER snake emoji where Bev image can be used.
NEVER use "AI" in user-facing copy — Bev owns all intelligence.
Bev's voice = Dani's voice. Locked.
Future assets: bev_happy.png, bev_warning.png, bev_concerned.png
Named AI feature suite: Stitch-O-Vision (offline, parked), BevCheck, Ask Bev (future), Bev's Read (future Craft tier).
BACKGROUND CSS (CRITICAL)

body::before: image, position fixed, z-index -1
body::after: gradient overlay, position fixed, z-index -1
#root: position relative, z-index 1
App.jsx: NO background-color on layout wrapper
Content wrappers: min-height 100vh
iOS: background-attachment fixed broken — use fixed pseudo-elements

Z-INDEX MAP

FeedbackWidget: 60
Add Pattern tab: 40
Mobile header: 20
Tooltips: 100
Modals/overlays: 50+


PENDING ADAM ACTIONS

SOV is parked. Re-decision triggers documented in docs/sov-architecture-decision.md. Six-weeks-elapsed clause forces re-decision around mid-June 2026 if not addressed sooner.
Supabase webhook config: auth.users INSERT → https://wovely.app/api/notify-signup (dashboard-only)
Replace cover image on First Sunrise Blanket Pattern
Claim @wovely on Instagram + TikTok
File annual report Wovely LLC at sunbiz.org Jan 1 to May 1 2027
Try Recraft.ai for Bev vector logo
Create bev_happy.png, bev_warning.png, bev_concerned.png
Get Danielle written feedback on BevCheck full report UI
Send welcome re-engagement email (script built S56, not yet sent)
Commit WOVELY_CONTEXT.md to main opportunistically next time in Claude Code
Decide yearly pricing ($59.99/yr vs $9.99/yr)
Migrate Claude Design account from adam@terrainnovations.com → adam@wovely.app at natural breakpoint
Open loop: Gemini 2.5 Pro never tested vs. Haiku primary. Background curiosity.
Text Danielle confirming SOV offline ship from S60, framing Stitch Library foundation as built but vision layer parked pending re-architecture
Hand off Stitch Review app to Dani — parked until SOV validation succeeds (architecture decision required first)
Direct founder-to-user email engagement — personal outreach to specific Wovely users (Steffanie Brown, turttlesong, other engaged Pros). Build a list of 5-10 priority users first.
Decide whether feat/sov-library-integration branch is preserved (with re-architecture commits added) or closed and replaced with a new branch when un-park triggers fire.


TECHNICAL GOTCHAS
Auth & session

supabaseAuth.getUser() is SYNCHRONOUS — never await
Supabase signup returns sessions in two shapes — normalization required
Post-login lands on My Wovely (sessionStorage key wovely_redirect_intent)
/pattern/:id and /hive/:id paths stored in redirect intent, 15-min window, cleared on manual signout
RLS with zero policies silently blocks all writes — no error surfaced

Server / API

Pattern fetch needs Range: 0-499 header
Missing await on async = silent 500 with no logs
Utility module imports silently fail in Vercel serverless — inline only reliable
Vercel env var changes require fresh deployment
Vercel Pro maxDuration 300 on extract-pattern.js and extract-pattern-vision.js
Vercel 17-function limit (Pro) — BevCheck consolidated into extract-pattern.js via mode param
Vercel runtime logs truncate at first console.log — use vercel_logs Supabase table via execute_sql
Supabase execute_sql requires auth.users with explicit schema prefix
Auth schema FK relationships not reliably discoverable via information_schema — use pg_constraint joined to pg_class/pg_namespace with pg_get_constraintdef()
user_profiles has NO email column — join through auth.users
Mobile background fetch: start fetch before UI transition
Claude Haiku model: MUST use claude-haiku-4-5-20251001
BevCheck max_tokens: 2000
Gemini 2.5 Flash: model string gemini-2.5-flash, API path /v1beta/
Gemini: strip markdown fences before JSON.parse
Gemini responses: skip parts where part.thought === true
Stripe webhook env var: STRIPE_WEBHOOK_SECRET

Client / UI

detailOnSave must spread updated_at onto local state
Hero image: PILL sentinel check before using photo field
useBlocker requires createBrowserRouter — Wovely uses BrowserRouter, do NOT use
iPad Safari scroll bounce: never overflow-y scroll on inner containers
App.jsx fragment wrapping: DO NOT wrap App return in React fragments
Fixed position banners in Dashboard.jsx: DO NOT USE
DEFAULT_STARTERS excluded from stats via is_starter filter
Client timeout on extract pipeline: 240s S58
PDFs → Supabase Storage (pattern-files bucket). Images → Cloudinary. Brand assets → /public
Cloudinary MCP cannot upload local files or base64. Claude Code with Cloudinary Node SDK CAN, given API credentials in env. Validated S62 with 307-image upload.

Claude Code subagents (S61 LEARNING)

Haiku 4.5 (200k context) cannot fit Claude Code's deferred MCP tool surface in subagent context. "Prompt is too long" before any work starts.
Use Sonnet 4.6 for subagent vision work in Claude Code environment. Quality is excellent for structured extraction, cost is reasonable, no context window issues.
Opus 4.7 only when Sonnet quality is genuinely insufficient — almost never the case for structured extraction tasks.
For parallel-subagent jobs writing to disk, pre-grant Write permission to target directory in .claude/settings.json. S61 had subagents return data inline because they hit "permission denied" on disk writes.

Claude Code workflow (S63 LEARNING)

Claude Code sometimes asks too many questions when given a clear task. When you want execution, not collaboration, say "just do it" explicitly. Permission/option-laying-out behavior is overcalibrated to safety on simple file operations.
Avoid surgical find-and-replace edits to WOVELY_CONTEXT.md mid-session. The doc is rewritten in full at session close. Single source of truth, single edit point.

PowerShell / Windows

PowerShell inline command character limit: 948 bytes for Claude Code execution. Longer commands MUST be written to a script file (e.g., temp-query.ps1) and executed via powershell -ExecutionPolicy Bypass -File <path>.
Windows Snipping Tool with auto-save → C:\Users\adam\Pictures\Screenshots\ by default
OneDrive auto-syncs Pictures folder including Screenshots → C:\Users\adam\OneDrive\Pictures\Screenshots N\

Vision model architecture (S62 LEARNING — CRITICAL)

Sending only TEXT (stitch names + descriptions) to a vision model and asking it to identify a user's image does NOT do visual identification. The model reads any text it can see in the image (page headers, labels, descriptions) and pattern-matches that against the prompt. With clean swatch images (no text), accuracy collapses.
Library reference images extracted from PDF pages contain page text — they are NOT clean studio swatch shots. The model "sees" the text on these images and reports HIGH confidence matches based on reading words, not analyzing fabric.
Real visual identification requires either: (a) sending actual reference images alongside the user's image for visual comparison, or (b) embedding-based similarity matching where image fingerprints are pre-computed and nearest-neighbor lookup happens mathematically.
This finding overturns the working assumption from S61 that "constrained-list selection from text descriptions" was sufficient. It is not.

Spec drift / conviction (S63 LEARNING)

Specs that survive multiple sessions of slip can grow into something the founder is afraid to touch. When that happens, the spec has drifted from "thing I understand" to "thing I've been told is important." Those are different states.
Before executing on a long-deferred spec, run a conviction conversation: what is this for in your words today, what does it unlock that you actually care about, what's the minimum version that solves the real problem, what would it look like if we were wrong about needing it at all.
Queue System hit this state at S63 close. Conviction check scheduled for S64 open.

Analytics

BevCheck events still named stitch_check_run in PostHog
PostHog production traffic filter: properties.$current_url LIKE '%wovely.app%'
PostHog project 363175
New SOV server-side events fire correctly via direct POST to https://us.i.posthog.com/i/v0/e/: sov_scan_started, sov_scan_matched, sov_scan_no_match, sov_scan_failed

Misc

SessionStorage keys: wovely_feedback_draft, wovely_redirect_intent, wovely_sov_anon_scan_used
RLS must be applied to ALL new tables at creation time
CORS: audit all serverless functions

Research dead-ends (don't rehash)

Cannot ingest copyrighted blog/book content via any automation
AI-generated crochet images technically fail and brand-damage
Antique Pattern Library scans CC BY-NC-SA — commercial disqualified
Pre-1929 public domain real but aesthetically limited
No shortcut to Stitch Library data layer. Built S62. (SOV vision layer is a separate problem, parked S63.)


CHANGELOG RULE
Only user-facing features. Never mention AI — Bev language only. Prepend each session to src/changelog.js.

CLAUDE CODE DESKTOP APP WORKFLOW
Two-window setup: Claude.ai browser for strategy, Claude Code desktop for code execution. Diff viewer mandatory before every merge. Permission modes: Ask for Stripe/auth/hotfixes, Auto for queue system/CORS/RLS/Collections, Plan for large refactors. ALWAYS query vercel_logs first when debugging.

CLAUDE RULES

Adam pastes master doc at session open — treat as canonical
Next session = 64
- Next session = 64. S64 opens with Queue System conviction conversation + re-examination of post-queue priority order (Collections vs Bev's Read sequencing) given turttlesong feedback.
Danielle feedback overrides everything
ONE complete Claude Code prompt per task
Never push direct to main (except WOVELY_CONTEXT.md)
Match Adam energy, read the room
ALWAYS query vercel_logs first when debugging
Model swap first when provider is flaky
Proactively flag platform limits and upgrade paths
Never use em dashes in copy or emails written for Adam
Session close: full doc rewrite in chat, Adam saves locally, GitHub push opportunistic. NO surgical mid-session edits.
Never declare session closed without Adam's explicit confirmation
When Adam is verbalizing, talk like a person not a doc
When Adam is exploring a shortcut that doesn't exist, say so plainly
Stitch Library content: Dani's voice is canonical. Bev's voice = Dani's voice. SOV outputs assembled from library, never freely generated.
COPYRIGHT RED LINE: Never help find workarounds to use copyrighted images, text, or content from third parties in Wovely. The Stitch Library is built from: (1) original Dani/contract work, (2) pre-1929 public domain, (3) licensed partnerships. That's the list.
VISION MODEL ARCHITECTURE RED LINE (S62): Sending text-only descriptions of images to a vision model is NOT visual identification. The model can read text in images. Always validate by testing with clean inputs that contain no text labels before declaring a vision-matching architecture working.
SPEC CONVICTION RULE (S63): If a spec has slipped 3+ sessions, run a conviction conversation before executing. Long-deferred specs can grow into things the founder is afraid to touch. Get back to "do we actually need this, in this shape" before writing code.
Decline scheduled-agent suggestions from Claude Code unless they're genuinely solving a recurring problem. Most are gold-plating.
When Adam asks for a simple thing, do the simple thing. Don't lay out four options if he gave you the answer already.


Session 63 closed 2026-05-05.