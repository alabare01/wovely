# Wovely Project Context

This file is the single source of truth for Wovely project context, replacing the former api/master-doc.js endpoint workflow. Both Claude.ai and Claude Code read this file at session start.

Last migrated from master doc API: 2026-04-16

---

# WOVELY MASTER DOC v95

## CURRENT PRODUCTION STATE
Live on wovely.app — Session 53 shipped. Claude Design system for Wovely created and published with Danielle's direct input on semantic palette and BevCheck gauge redesign. WEBHOOK_SECRET still pending. Production code unchanged this session.

## FIRST THING NEXT SESSION
1. Set WEBHOOK_SECRET in Vercel + verify Stripe signatures in webhook handler — FINANCIAL INTEGRITY GAP (carried over from S53)
2. CORS audit on all serverless functions (carried over from S53)
3. RLS full table audit (carried over from S53)
4. Background functions + queue system build — UI can now leverage the Claude Design system for mockups

## SESSION 54 PRIORITY ORDER
1. WEBHOOK_SECRET + Stripe signature verification (security — financial integrity)
2. CORS audit — all serverless functions
3. RLS full table audit
4. Background functions + import queue system (with RLS on import_jobs from day one)
5. Collections build — naturally extends queue system
6. BevCheck UI polish — needs Danielle written feedback first
7. notify-signup.js wiring
8. Yearly pricing ($9.99)
9. Pattern Share / Trophy Case

## SECURITY AUDIT (from Reddit AI codebase review — Session 50)
Source: Solo founder built SaaS in 6 months with AI. Code review revealed systemic invisible-layer gaps.
Core lesson: AI is consistently good at visible (UI, features, flows) and consistently weak at invisible (security, testing, architecture, vendor lock-in).

Wovely findings mapped:

[SOLID] Vendor lock-in — Provider router with Gemini + Haiku fallback. We own both keys. Not locked in.
[SOLID] Auth — Supabase handles all auth + crypto. No Math.random() password generation.
[ACTION REQUIRED] WEBHOOK_SECRET — Env var exists in pending actions but not yet set. Without it, Stripe signatures are unverified. Anyone who knows the webhook URL can fake subscription events. Fix FIRST.
[ACTION REQUIRED] CORS — Wildcard Access-Control-Allow-Origin: * likely present on all serverless functions. Audit and restrict to wovely.app origin.
[ACTION REQUIRED] RLS audit — Verify all existing tables have correct policies. New tables (import_jobs, collections) must have RLS from day one — never retroactively.
[ACTION REQUIRED] Stripe webhook verification — Confirm checkout.session.completed handler verifies stripe-signature header before processing.
[ACKNOWLEDGED] Zero automated tests — Defensible at 9 users. Becomes liability at scale. Payment flows and auth paths need coverage before public launch.

## WHAT SHIPPED SESSION 49
- Gemini billing confirmed active — Paid Tier 1, StitchBox project, $28.77 spent Mar 19-Apr 15
- Spend cap set at $50/mo
- Gemini 2.5 Flash restored across all API files (was 1.5 Flash since Session 47)
- Files updated: _providerRouter.js, extract-pattern.js, fetch-pattern.js, stitch-vision.js
- All /v1beta/ paths preserved
- Rollback tag pre-gemini-25 created on main
- Tested: Marina the Manatee (text path, Haiku), Beehive (vision path, Gemini 2.5 Flash), Stitch-O-Vision Waffle Stitch — all passed
- Octopus 87-page timeout is a known client-side issue, server completes but client gives up — separate bug

## WHAT SHIPPED SESSION 52
- DKIM authentication configured end-to-end for wovely.app
- Google Workspace DKIM record generated (2048-bit, selector: google)
- TXT record published via GoDaddy DNS
- Gmail inbox delivery confirmed with DKIM PASS in headers
- Supabase upgraded from Free to Pro tier with spend cap enabled
- Trial retention email sent to turttlesong@yahoo.com ahead of May 3 expiry

## WHAT SHIPPED SESSION 53
- Claude Design system for Wovely created and published (v1.0)
- Source of truth connected: github.com/alabare01/wovely repo + style guide + bev_neutral.png
- All cards reviewed and approved: Core palette, Typography, Semantic/Stitch Check, Forbidden colors, Spacing, Components, Bev components, Voice examples
- BevCheck gauge redesigned with Danielle's direct input: zone-anchored labels, score below arc, glass treatment, Bev integrated into arc interior, band-colored needle
- Semantic palette updated from sage/gold/rust to pastel direction per Danielle: dusty teal #A4C2C3 (Pass), soft buttercup #E2D985 (Heads-Up), dusty rose #CEA0A4 (Issues)
- All production code unchanged — Claude Design outputs are reference/mockup layer only
- Fonts flagged as "substitute rendering" in Claude Design — need licensed WOFF2 upload later
- Claude Design account lives under adam@terrainnovations.com — flagged for future migration to adam@wovely.app at natural breakpoint

## KEY LEARNINGS SESSION 49
- Gemini 2.5 Flash 503s were free tier problem, not model problem — paid tier held up clean
- Vision path (avgText/page <1200) uses Gemini. Text path (>1200) uses Haiku chunking. These are separate pipelines.
- Client timeout fires before server finishes on large chunked jobs — client needs better waiting UX
- Supabase API calls are unlimited on all plans — upgrading Supabase is about uptime/reliability not rate limits
- Vercel Pro already active — background functions available, just need to be built

## KEY LEARNINGS SESSION 53
- Claude Design handoff bundle workflow is the real unlock — mockup → Danielle feedback → Code, not mockup → Code → Danielle feedback
- Danielle's design instinct in the loop DURING design (not after) collapses iteration cycles dramatically
- Internal shorthand ("AI-first infrastructure") must not leak into brand positioning inputs — "AI" is a banned word in all user-facing surfaces and brand descriptions
- Pastel semantic palette (washed, cool-toned, sidewalk-chalk) feels more Wovely than saturated traffic-light colors
- Design decisions get anchored by the first visible output — future system-level changes (like surface color) should be made against live site on Danielle's phone, not against Claude Design preview renders
- Claude.ai chat + Claude Code + Claude Design form a parallel-segmented stack when set up properly: one design system per product, one project per product, one workspace per product

## BACKGROUND FUNCTIONS + QUEUE SYSTEM SPEC (build Session 50+)
Problem: Large PDFs (87+ pages, text path) take 150s+ of Haiku chunking. Client times out. User sees failure even when server succeeds.
Solution: Async import queue with background processing and real-time UI feedback.

Architecture:
- Supabase table: import_jobs (id, user_id, status, pdf_url, result, created_at, updated_at)
- RLS REQUIRED FROM DAY ONE: user can only read/write their own rows (auth.uid() = user_id)
- Client submits job -> gets job_id back immediately
- Vercel background function processes job async, updates import_jobs row on completion
- Client polls import_jobs every 3s for status updates
- UI shows Bev loading state with progress messaging while job runs
- On completion, flows into normal pattern review UI

UI vision:
- Queue dashboard showing active/pending/completed imports
- Bev animated waiting state with fun copy (not just a spinner)
- Progress indicator showing which chunk is being processed
- Naturally extends into Collections — queue multiple patterns, process as a batch

This is the foundation Collections needs anyway. Build queue first, Collections becomes a UI wrapper on top.

## OPEN BUGS (priority order)
1. Client timeout fires on large PDFs before server finishes — needs better waiting UX + queue system
2. BevCheck UI — gauge typography, zone labels, full report unfinished. Needs Danielle feedback first
3. Modal layering bug — desktop import modal stacked background layers
4. Stitch-O-Vision complex geometric prompts
5. StitchResultPage favicon missing
6. Bev Notes nav icon — blue shield needs personality
7. PDF cover intelligence — text-heavy first pages as hero
8. /hive fossil route — YarnHive remnant
9. Pages not scrolling to top on load

## GEMINI STATUS
Gemini 2.5 Flash: ACTIVE. Restored Session 49. Model string: gemini-2.5-flash. API path: /v1beta/
Gemini 1.5 Flash: RETIRED. Was stable fallback, now replaced.
Rollback: git checkout pre-gemini-25 if 2.5 Flash shows instability on production.

## ANTHROPIC API STATUS
Tier 1 — 90K OTPM, 1K RPM. $40 credit added Apr 14 2026.
Haiku: claude-haiku-4-5-20251001
max_tokens BevCheck: 2000. max_tokens extract: 32000

## EXTRACT PIPELINE ARCHITECTURE (as of Session 49)
Client detects avgText/page:
- <300 or 300-1200 (mixed) = vision path = POST /api/extract-pattern-vision with pdfUrl — GEMINI 2.5 FLASH
- >1200 = text path = POST /api/extract-pattern with full pdfText, 270s client timeout — HAIKU CHUNKED

Server extract-pattern.js:
- <14k chars = single pass: Gemini fast-path (4s) then Haiku fallback (55s)
- >14k chars = chunked: splitIntoChunks(14k, 500 overlap) then sequential callClaudeChunk then mergeChunkResults
- 250s budget guard stops chunking early
- maxDuration: 300

BevCheck cascade: Gemini 2.5 Flash v1beta (8s) then Haiku 55s (2000 max_tokens) then bev_tangled

## COLLECTIONS SPEC (ready to build Session 50+)
Naturally extends import queue system. Build queue first, Collections is the UI wrapper.
Schema ready to write. 4 Claude Code prompts needed. 2 sessions to ship v1.
v1: collections table + collection_patterns join + UI list + detail page + import wiring.
MCAL import already works as components. Collections is the grouping wrapper.
Monetization: gate behind Craft tier (~$14.99/mo).
RLS REQUIRED FROM DAY ONE on collections and collection_patterns tables.

## DANIELLE FEEDBACK LOG
- [LOVES IT] My Wovely redesign — confirmed iMessage Apr 6
- [SHIPPED S40] Instructions/Rows tab rename
- [SHIPPED S40] Import spinner clears on failed upload
- [SHIPPED S40] Nav guard modal removed
- [SHIPPED S40] Email capture popup removed
- [SHIPPED S40] iPad scroll bounce fix — needs Danielle confirmation
- [NEEDS DISCUSSION] BevCheck full report UI — unfinished feel, get her written feedback
- [NEEDS DISCUSSION] Stitch Check — link to error location in pattern
- [NEEDS DISCUSSION] Floating import banner covers side nav while processing
- [NEEDS DISCUSSION] No warning when user refreshes during import
- [NEEDS DISCUSSION] Stash + button should add yarn not upload pattern
- [NEEDS DISCUSSION] Color palette — Danielle finds pure white cold
- [APPROVED S53 — mockup only] BevCheck gauge redesign — pastel palette, zone-anchored labels, score below arc, glass instrument treatment. Approved in Claude Design. Production build pending.
- [NEEDS DISCUSSION] Wovely surface color — Danielle flagged the lavender canvas in Claude Design preview. Decision deferred: evaluate on live site on her phone before any style guide change.

## SESSION 53 INSIGHT — BEVCHECK METER COLOR LOGIC
Surfaced during Claude Design setup. Production BevCheck gauge currently renders lavender regardless of result band — aesthetically pleasant but semantically inert. Redesigned gauge (approved in Claude Design) uses pastel semantic palette per result:
- 80%+ PASS → dusty teal #A4C2C3
- 60-79% HEADS-UP → soft buttercup #E2D985
- <60% ISSUES → dusty rose #CEA0A4
Zone-anchored labels (PASS left, HEADS UP top, ISSUES right) outside the arc. Score (large navy) below arc. Glass instrument treatment. Bev integrated into arc interior, needle on foreground layer. Dynamic "Bev spotted {count} {thing/things}" copy template.
Status: APPROVED by Danielle in Claude Design on 4/18/26. NOT YET BUILT in production code. Build task queued for Session 54 or later depending on priority order.

## ACTIVE USERS (9)
danielle2673@me.com — Pro — 17 patterns — Active (north star)
alabare@gmail.com — Pro — 4 patterns — Active
steffaniembrown@gmail.com — Pro — 5 patterns — Active
turttlesong@yahoo.com — Pro — 2 patterns — Trial
ronsrit@hotmail.com — Pro — 3 patterns — At risk
danielle2673@gmail.com — Pro — 2 patterns — Drifting
stinkyswife@gmail.com — Pro — 0 patterns — Ghosted
tbrightjax@gmail.com — Pro — 0 patterns — Ghosted
alabare+test1@gmail.com — Free — 0 patterns — Test

## USER IDS
Adam: 6e1a02d9-c210-4bc4-968e-dde3435565d1
Danielle me.com: d6b18345-a85e-42bd-b7cb-f20efd4b2fe7
Danielle gmail: 038442a2-b13d-4abb-9960-24a360078f6c

## INFRASTRUCTURE
Live: wovely.app
GitHub: github.com/alabare01/wovely
Local: C:/Users/adam/wovely
Supabase: vbtsdyxvqqwxjzpuseaf — PRO (upgraded Session 52, spend cap enabled)
Vercel: prj_SZYwLGH5V7kCZYryr4MSy3US3bfz / team_mRQaDsQzhF6HFGU5Ka7hi5OM — PRO
Stripe: acct_1TDQ1WGbX5hxxc0T (LIVE) $8.99/mo Pro
Cloudinary: dmaupzhcx
PostHog: Project 363175 — 157 unique visitors since Jan 1 2026
Current session: 54

## EMAIL STACK
Google Workspace: adam@wovely.app, support@wovely.app
Resend: RESEND_API_KEY in Vercel
DNS: GoDaddy. MX records fine. SPF chained. DKIM LIVE — verified at google._domainkey.wovely.app (Session 52). Gmail delivery confirmed with DKIM PASS.

## LEGAL
Wovely LLC — filed March 30 2026, doc L26000181882, Florida
Annual report due Jan 1 to May 1 2027

## TECH STACK
React/Vite, Supabase, Vercel PRO, Gemini 2.5 Flash, Claude Haiku fallback, Stripe $8.99/mo, Cloudinary, Resend, PostHog

## STYLE GUIDE v1.0 (LOCKED)
Primary: #9B7EC8, Navy: #2D3A7C, White: #FFFFFF, Surface: #F8F6FF, Border: #EDE4F7
Text primary: #2D2D4E, Text secondary: #6B6B8A, Danger: #C0544A
Fonts: Playfair Display (headings), Inter (body)
NEVER USE: #1A1A2E, terracotta #B85A3C or #C05A5A, cream #FAF7F2

## BEV
Hyper-realistic crochet amigurumi lavender snake, named after Danielles grandmother Beverly.
bev_neutral.png in /public.
ALL loading states: static Bev inside spinning ring.
NEVER snake emoji where Bev image can be used.
NEVER use AI in user-facing copy — Bev owns all intelligence.
Future: bev_happy.png, bev_warning.png, bev_concerned.png
BevCorner message pool includes turttlesong shoutout as of Session 48.

## BACKGROUND CSS (CRITICAL)
body::before: image, position fixed, z-index -1
body::after: gradient overlay, position fixed, z-index -1
#root: position relative, z-index 1
App.jsx: NO background-color on any layout wrapper

## Z-INDEX MAP
FeedbackWidget: 60, Add Pattern tab: 40, Mobile header: 20, Tooltips: 100, Modals: 50+

## PENDING ADAM ACTIONS
1. Add WEBHOOK_SECRET env var to Vercel — CRITICAL, financial integrity gap
2. Supabase webhook: auth.users INSERT -> https://wovely.app/api/notify-signup
3. Replace cover image on First Sunrise Blanket Pattern
4. Claim @wovely on Instagram + TikTok
5. Enable Apple sign-in in Supabase
6. POST IN FACEBOOK GROUPS — only after import rock solid
7. File annual report Wovely LLC at sunbiz.org (L26000181882) Jan 1 to May 1 2027
8. Try Recraft.ai for Bev vector logo
9. Create bev_happy.png, bev_warning.png, bev_concerned.png
10. Get Danielle written feedback on BevCheck full report UI
11. Delete feature/turttlesong-shoutout: git push origin --delete feature/turttlesong-shoutout
12. Migrate Claude account from adam@terrainnovations.com to adam@wovely.app at a natural breakpoint (requires cancel + rebuild, estimated 2-4 hours, not urgent)
13. Upload licensed Playfair Display + Inter WOFF2 files to Claude Design to resolve "substitute web fonts" warning

## TECHNICAL GOTCHAS
supabaseAuth.getUser() is SYNCHRONOUS — never await
Pattern fetch needs Range: 0-499 header
DEFAULT_STARTERS excluded from stats
detailOnSave must spread updated_at onto local state
Hero image: PILL sentinel check before using photo field
Vercel Pro: maxDuration 300 on extract-pattern.js and extract-pattern-vision.js
iOS: background-attachment fixed broken — use fixed pseudo-elements
Gemini: strip markdown fences before JSON.parse
Gemini responses: skip parts where part.thought === true
Gemini 2.5 Flash: ACTIVE — model string gemini-2.5-flash, API path /v1beta/
Claude Haiku model: MUST use claude-haiku-4-5-20251001
BevCheck max_tokens: 2000
Missing await on async = silent 500. Check this first.
Mobile background fetch: start fetch before UI transition
user_profiles has NO email column — join through auth.users
PDFs -> Supabase Storage. Images -> Cloudinary. Brand assets -> /public
SessionStorage: wovely_feedback_draft, wovely_redirect_intent
useBlocker requires createBrowserRouter — Wovely uses BrowserRouter, do NOT use
iPad Safari scroll bounce: never overflow-y scroll on inner containers
BevCheck calls never go direct to Gemini from browser
Provider router: probes gemini-2.5-flash on /v1beta/ — must match actual call model and path
Large PDF chunking: SHIPPED S48
Smart PDF routing: SHIPPED S48 — avgText/page threshold 300/1200
Fixed position banners in Dashboard.jsx: DO NOT USE — causes layout issues
App.jsx fragment wrapping: DO NOT wrap App return in React fragments — breaks render
Client timeout fires before server finishes on large jobs — queue system needed
RLS must be applied to ALL new tables at creation time — never retroactively
CORS: audit all serverless functions — wildcard origin likely present, restrict to wovely.app
Stripe webhook: must verify stripe-signature header before processing any event

## STITCH-O-VISION
Gemini 2.5 Flash — no Haiku fallback. Complex geometric patterns: ongoing prompt refinement needed.

## CHANGELOG RULE
Only user-facing features. Never mention AI — Bev language only. Prepend each session.

## CLAUDE CODE DESKTOP APP WORKFLOW
Adopted Session 50. Desktop app replaces CLI terminal + browser alt-tab workflow.

Two-window setup:
- Claude.ai in browser = strategy conversations with Claude (this instance). Master doc context lives here.
- Claude Code desktop app = code execution. Opus 4.7 xhigh default.
- Alt-tab between them. Do NOT try to unify in one window.

Panel usage:
- Chat panel = where Claude Code executes tasks. Paste Claude.ai prompts here. 95% of work happens here.
- Terminal panel = for manual commands Adam runs himself (git status, git push, npm run dev). Skip Claude turn when command is known.
- Preview panel = for UI work. Runs local dev server inside desktop. Essential for landing page, BevCheck UI, queue dashboard, anything Danielle-facing.
- Diff viewer = mandatory before every merge. Replaces git diff in terminal. Catches mistakes before shipping.
- Plan panel = for big tasks. Turn on for queue system build, Collections. Skip for small fixes.
- Tasks panel = for multi-step work tracking. Queue system build is ideal use case.

Session management:
- New session per feature branch. Do not reuse old sessions for new tasks.
- Each session gets isolated git worktree. Changes in one session do not affect others until committed.
- Parallel sessions for independent tasks (CORS audit + queue build can run simultaneously).

Permission modes:
- Ask permissions (default) = approve every edit. Use for Stripe, auth, production hotfixes.
- Auto mode = Claude handles permissions via classifiers. Use for queue system build, CORS fixes, RLS additions, Collections build.
- Plan mode = Claude maps approach without touching files. Use before large refactors.

Model:
- Opus 4.7 xhigh default. Current Adam setting: High. Bump to xhigh for queue system and Collections.

Routines (later, not now):
- After Collections ships: weekly security audit, nightly pattern import health, PostHog digest, changelog generator.

Ultrareview budget:
- 3 free remaining. Spend on: post-queue-system pre-merge, post-Stripe-verification pre-merge, first Craft tier feature.

Master doc status:
- External API workflow still in use as of Session 50.
- Evaluating Project knowledge migration in Session 51 as parallel test.
- Do not deprecate until replacement is proven across at least one session.

## CLAUDE RULES
Fetch master doc first, no exceptions
Next session = 54
Danielle feedback overrides everything
ONE complete Claude Code prompt per task
Never push direct to main
Match Adam energy
ALWAYS query vercel_logs first when debugging
Model swap first when provider is flaky
Proactively flag platform limits and upgrade paths
Never use em dashes in copy or emails written for Adam
