# Wovely Project Context

Single source of truth for Wovely project context. Both Claude.ai and Claude Code read this file at session start.

Last updated: Session 61 close, 2026-04-25

---

# WOVELY MASTER DOC v103

## SESSION CLOSE WORKFLOW (adopted Session 59, refined Session 60)
Claude.ai writes the updated doc as plain text in chat at session close. Adam copies into C:\Users\adam\wovely\WOVELY_CONTEXT.md and saves. No Claude Code prompt required at close.

Claude Code pushes to GitHub opportunistically. Next time Adam is in Claude Code for any reason, one-line instruction: "also commit WOVELY_CONTEXT.md to main." Zero logic, zero avalanche risk.

Session open: Adam pastes current local content into chat at session open and Claude treats that as canonical for the session. No GitHub fetch required.

---

## CURRENT PRODUCTION STATE
Live on wovely.app. Session 60 shipped Stitch-O-Vision offline. Session 61 was a planned queue system build that pivoted to a Stitch Library extraction side quest that took the entire session. Queue system is rolled to S62.

Session 61 deliverables:
- 307 stitches extracted from 646 screenshots of Dani's authored content into structured JSON
- 307 reference images preserved (full-screenshot, lossless)
- Local "Stitch Review" web app built at C:\Users\adam\wovely-tools\stitch-review\ — Tinder-style swipe UI for Dani to approve/reject/edit/flag each stitch
- Bev's Tip field added to review app for Dani to author tips in her voice during review

Supabase on Pro tier. DKIM live. Stripe live mode active with STRIPE_WEBHOOK_SECRET verified S54.

## FIRST THING SESSION 62 (in order)
1. Queue System foundation build — Supabase schema + RLS policies on import_jobs table (architecture locked Session 60)
2. Vercel scheduled function (30-second poller + job processor)
3. Wire existing extraction logic server-side, add retry/error handling
4. Test on preview URL, merge to main when solid

## SESSION 62 PRIORITY ORDER
1. Queue System build (held over from S61)
2. In parallel: Dani begins Stitch Library review pass via local app at localhost:5173 (her work, not Adam's)
3. Collections UI (after queue system)
4. Stitch Library schema + database migration (after Dani's review completes)
5. Stitch Library Phase 1 (Stitch-O-Vision integration with library as ground truth)
6. Welcome re-engagement email send (script exists, not yet fired)
7. CORS audit — all serverless functions
8. RLS full table audit
9. BevCheck UI polish — needs Danielle written feedback
10. notify-signup.js wiring — requires Supabase webhook config (Adam action)
11. Yearly pricing decision ($59.99/yr vs $9.99/yr)
12. Pattern Share / Trophy Case
13. Domain reputation warmup — Google Safe Browsing + VirusTotal submissions, security headers audit (60-90 day horizon)

---

## STITCH LIBRARY EXTRACTION (SESSION 61 DELIVERABLE)

### What got built
- Source: 646 screenshots of Dani's original authored stitch reference content (her work, copyright clean — confirmed S61)
- Extraction tool: Claude Code with Sonnet 4.6 subagents, 13 chunks of 50, parent-child stitch merge logic
- Output JSON: C:\Users\adam\wovely\stitch-extraction-output.json (307 stitches)
- Output images: C:\Users\adam\wovely\stitch-extraction-images\ (307 PNGs, full-screenshot lossless copies, 372 MB)
- Runtime: ~3 hours wall-clock, ~83 min subagent compute, 1-2M vision tokens
- Skip rate: 323 entries skipped of 646 (legitimate — 280 were merge-into-parent operations, not data loss)

### Stitch Library Data Hierarchy (LOCKED S61)
1. RAW: stitch-extraction-output.json — historical record only. Never modified, never imported. Source of truth ONLY for tracing back to original screenshots.
2. CANONICAL: stitch-review-output-{timestamp}.json — exported from Stitch Review app after Dani completes review pass. Includes approved stitches, her edits, bevs_tip authored in her voice, status flags, rejection reasons, flag notes. THIS file migrates into Supabase.
3. PRODUCTION: Supabase stitch_library table — live data Wovely and Stitch-O-Vision read from. Populated via migration script ingesting the canonical JSON. Future updates flow through review app → Supabase, never direct table edits.

CRITICAL: Don't bypass the review app. Every stitch that lands in the production table must flow through Dani's approval gate. This is the canonical voice control mechanism, and the same gate every future stitch (user-imported, contract photography, partnership) will pass through.

### Stitch Review App (BUILT S61)
- Location: C:\Users\adam\wovely-tools\stitch-review\
- Stack: Vite + React + TypeScript + Tailwind + Framer Motion
- Runs locally at http://localhost:5173/ via npm run dev
- Sibling folder to wovely repo (NOT inside main repo) — internal tooling, not production
- UI: Tinder-style card swipes — right=approve, left=reject, up=flag-for-Adam, button=edit
- Edit modal includes Bev's Tip field for Dani to author tips in her voice
- localStorage persistence (key: stitch-review-progress) — never loses progress
- Export downloads stitch-review-output-{timestamp}.json with all decisions
- Keyboard shortcuts: A=Approve, R=Reject, F=Flag, E=Edit, ←/→=navigate

### Known issues to address during Dani review pass
1. Tunisian Basketweave collision — only one Basketweave Stitch entry kept (regular crochet). Tunisian version at Screenshot 2026-04-24 060139.png needs manual re-extraction with disambiguated slug "tunisian-basketweave-stitch"
2. "Single Rib" vs "Single Rib Stitch" — possible duplicate, manual eyeball needed
3. ~3 transcription artifacts spotted during audit (Kiwi Lace Row 8 missing turning chain, Row 16 doubled "next next", Pineapple Row 2 awkward bracketing). Pattern likely repeats at low frequency across other stitches. Dani catches these during review.
4. Tips were systematically NOT captured — 0 of 307 entries have tip content. Estimated 60-100 stitches originally had a TIP block in source. RESOLUTION: Dani authors all tips in her voice during review pass via Bev's Tip field. Historical tips intentionally not recovered — Dani's current voice is canonical.
5. Source JSON has UTF-8 BOM (PowerShell artifact). Doesn't affect review app. Can be cleaned up post-review.

---

## STITCH LIBRARY FLYWHEEL (strategic vision, S61 captured)

The Stitch Library isn't a static reference — it's the seed of a compounding moat. Every user pattern import either uses or grows the library. Every library entry makes future imports smarter. The longer Wovely runs, the harder it gets for competitors to catch.

### The flywheel
1. Library seeded from Dani's curated content + future contract photography
2. Pattern imports cross-reference stitches against library
3. Recognized stitches link to canonical entries (Bev gets smarter)
4. Unknown stitches flagged for review queue (same Stitch Review UI)
5. Dani promotes/edits/rejects candidates from queue
6. Promoted entries enter library, trigger backfill on past patterns
7. Stitch-O-Vision and BevCheck accuracy improve as reference grows

### Schema considerations for stitch_library Supabase table
- provenance field (canonical | community_inferred | partner_licensed | public_domain)
- verified_by_dani boolean — Dani is the canonical voice gate
- usage_count — how many patterns reference this stitch
- confidence_score — for community-inferred entries before promotion
- Versioning on description/instructions — patterns reference a stitch version, not just slug
- aliases vs also_known_as separated — aliases are exact-match, AKA is fuzzy/historical
- bevs_tip field for Dani's tip content per stitch

### Build dependencies (none of this happens until)
- Queue system foundation ships (S62+)
- Collections ships (post-queue)
- Stitch Library Phase 1 with Dani-reviewed library imported to Supabase
- Pattern import pipeline upgraded to cross-reference library

### Strategic principle this anchors
Wovely doesn't just store crochet content — it learns from it. Every user interaction is potential intelligence growth. This applies beyond Stitch Library: Pattern Library, Tip Library, Bev's training data, Stitch-O-Vision accuracy. Treat user imports as a free training set.

Don't build this in S62. This is an architectural lens to apply when the relevant features actually get built.

---

## STITCH-O-VISION + LIBRARY VALIDATION PATH (locked S61)

The mission: Stitch-O-Vision identifies what a user is looking at. The library is the ground truth that makes those identifications accurate. All output is in Bev's voice (which is Dani's).

### "Will it work" = does SOV identify stitches more accurately when it has library data to check against?

Validation path:
1. Dani reviews 307 stitches via review app, authors tips, exports canonical JSON
2. Schema design + database migration — JSON imports to stitch_library Supabase table
3. SOV integration — vision pipeline gets a new step: after candidate identification, cross-reference against library. Library answer is authoritative on match. Output text assembled from library content, not generated freely.
4. A/B comparison — run SOV with library vs without on same swatches. Specifically re-test failure cases (Linen Stitch in Chevron, Rule A overcorrection cases).

### SOV output principle (LOCKED S61)
SOV outputs are ASSEMBLED from library content, not generated freely.
- Pull matched stitch's name/description/instructions from library (Dani's voice, locked content)
- Wrap in Bev's standard reaction phrasing ("Looks like you're working on..." / "I see...")
- Model isn't writing stitch descriptions anymore. It's selecting and presenting library content.
- Either SOV says something Dani wrote, or it says "I'm not sure what this is." No third state.

This is the trust fix for the Linen Stitch in Chevron problem. SOV won't invent confidently-wrong content because it can't invent at all — only retrieve and present.

---

## QUEUE SYSTEM ARCHITECTURE (LOCKED SESSION 60)

Foundation for Collections, Stitch Library migration, Ask Bev, Bev's Read, all future async features. Every new AI feature must use this pipeline.

### Schema: import_jobs table in Supabase
- id (uuid, primary key)
- user_id (fk to auth.users)
- status (enum: pending, processing, completed, failed)
- file_type (pdf, image)
- file_url (Supabase Storage URL)
- extracted_data (jsonb, populated on completion)
- error_message (text, populated on failure)
- retry_count (integer, default 0)
- created_at, updated_at

### RLS from day one
Users can only see their own jobs. Non-negotiable.

### Processing architecture
- Vercel scheduled function runs every 30 seconds
- Dequeues all status = 'pending' jobs
- Processes sequentially
- Calls existing extraction logic (Gemini/Haiku, moved server-side from client)
- Updates job record with extracted_data + status = 'completed' on success
- Or status = 'failed' + error_message on failure

### Client flow
- Upload triggers POST to /api/import-job with file_url + metadata
- Returns job_id immediately
- Client polls /api/job-status/[job_id] every 3 seconds
- Bev loading state during polling
- On completion, user sees extracted pattern in review modal
- User reviews and commits → moves data from import_jobs.extracted_data to patterns table

### Failure handling
- One automatic retry after 5 minutes
- Then status = 'failed' and surface to user

### Retention
- Completed jobs: 30-day retention
- Failed jobs: 90-day retention

### Missing implementation details (resolve in Session 62)
- Retry mechanism wiring (cron re-dequeue vs separate retry queue)
- Concurrency safeguards beyond sequential
- Job TTL cleanup function
- Alerting when failure rate spikes

### Build sequence
- Session 62: Supabase schema + RLS + Vercel scheduled function skeleton + extraction logic server-side
- Session 63: Client polling + review modal + end-to-end flow
- Session 64: QA, edge cases, merge to main, delete client-side extraction code
- Session 65+: Collections UI built on top of queue system

---

## STITCH LIBRARY STRATEGY (multi-source approach, locked Session 60)

Build order after queue system + Collections + Dani-reviewed library import.

### Tier 1: Pre-1929 public domain (foundational stitches)
Source from archive.org, HathiTrust, Google Books. Extract original illustrations from Weldon's, Priscilla, Butterick's 1891, Beeton's 1870, DMC Library Irish Crochet Lace. Include with attribution. ~30-50 foundational stitches.

### Tier 2: Modern stitches, Danielle + contract photography
For post-1929 named stitches and modern variants. Danielle photographs MVP starter set. Beyond that, contract a crochet content creator for standardized 100-swatch set, work-for-hire. Rough cost ~$2-4K.

### Tier 3: Creative Commons supplement
Scout CC-licensed crochet imagery via Flickr, Wikipedia Commons, Unsplash. Low volume but legitimate.

### Tier 4: Partnership/licensing (optional, later)
Reach out to originating designers for licensing. Rich Textures Crochet, Heart Hook Home, Made by Gootie identified as high-quality potential partners.

### Strategic value
Fixes Rule A overcorrection root cause. Makes "also known as," tutorials, Bev descriptions authoritative. Every entry becomes /stitches/[slug] SEO landing page. Backbone of future Ask Bev. Makes BevCheck smarter. Proprietary curated content is real moat.

---

## COLLECTIONS SPEC (ready to build, blocked on queue system)
Extends import queue. Schema ready. 4 Claude Code prompts. 2 sessions to ship v1.
- collections table + collection_patterns join
- UI list + detail page + import wiring
- MKAL/MCAL support (multi-pattern episodic imports)
- Monetization: gate behind Craft tier (~$14.99/mo)
- RLS from day one

---

## PRICING TIER VISION
- Free — 5 patterns, 3 Snap-and-Stitch/mo
- Pro — $8.99/mo (LIVE) — unlimited patterns, unlimited Stitch-O-Vision (offline currently), BevCheck
- Craft — TBD (~$14.99/mo) — Collections, Bev's Read, other higher-order features

Yearly pricing — REQUIRES DECISION. Originally $59.99/yr in Sessions 28-37. Later doc versions show $9.99/yr. Decide before implementation.

### Bev's Read (Craft tier, unblocked by symbol legend asset)
Chart intelligence via Gemini multimodal. Revisit post-Collections, in parallel with Stitch Library build.

---

## PRODUCT SURFACE — WHAT EXISTS

### Import pipeline (5 methods, all live)
1. Manual entry
2. URL import
3. PDF import (chunked >1200 avgText/page)
4. In-browser Find Patterns
5. Snap-and-Stitch / Hive Vision

### My Wovely — Craft Room redesign (Session 37)
Defines DNA of every surface. Glass cards, fixed body::before background, warm gradient fallback. Two-column grid desktop. Playfair italic time-of-day greeting. BevCorner typewriter. Right-side vertical Add Pattern tab.

### Stitch-O-Vision (OFFLINE as of Session 60)
Re-enable when library integration ships. SOV will assemble outputs from library data, not generate freely.

### Feedback infrastructure
FeedbackWidget z-60. Persistent heart icon. Supabase feedback table. Draft persistence to sessionStorage key wovely_feedback_draft.

### Edge Functions (Supabase)
- get-signed-url
- vercel-log-drain

---

## OPEN BUGS (priority order)
1. Client timeout on very large PDFs — queue system solves
2. Rule A overcorrection on SOV (offline until library fix)
3. BevCheck UI — gauge typography, zone labels, full report unfinished. Needs Dani feedback
4. Modal layering bug — desktop import modal stacked background layers
5. StitchResultPage favicon missing on public share page
6. Bev Notes nav icon — blue shield needs personality
7. PDF cover intelligence
8. /hive fossil route still in router
9. Pages not scrolling to top on load (S39 partial fix, may have regressions)
10. Gemini client-side calls in AddPatternModal.jsx and HiveVisionForm need server-side migration (queue system resolves)
11. Cookie consent banner missing
12. Mobile login landing position

---

## UNCONFIRMED — REQUIRES VERIFICATION
- sub_counter_state progress loss on device switch
- Action row numbering stealing row numbers (S17)
- Stitch Check save report feature build status
- yh_is_pro localStorage cache post-anonymous-mode refactor
- Header hide-on-scroll in pattern detail (fixed S24, side effects?)
- Founder Dashboard at wovely.app/founders post S46-59 rendering

---

## DANIELLE FEEDBACK LOG
- [LOVES IT] My Wovely Craft Room redesign — iMessage Apr 6
- [SHIPPED S40] Instructions/Rows tab rename, import spinner, nav guard removed, email capture removed, iPad scroll fix
- [BLOCKER S60] Stitch-O-Vision Linen Stitch misclassification → Shipped offline same day
- [S58 PROPOSAL] Stitch Library — full spec locked S60
- [GIFT S60] 18-stitch swatch grid + symbol legend, both Dani-verified, parked for build
- [S61 DELIVERABLE FOR HER] 307 stitches extracted from her content, review app built, ready for her review pass
- [NEEDS DISCUSSION] BevCheck full report UI
- [NEEDS DISCUSSION] Stitch Check link to error location in pattern
- [NEEDS DISCUSSION] Floating import banner covers side nav while processing
- [NEEDS DISCUSSION] No warning when user refreshes during import
- [NEEDS DISCUSSION] Stash + button should add yarn, not upload pattern
- [NEEDS DISCUSSION] Color palette — pure white feels cold

---

## KEY USERS (strategic only)
- Danielle (me.com) — north star, UX veto, 17 patterns. Stitch Library co-creator + reviewer.
- Danielle (gmail) — second account
- Adam — founder
- Steffanie Brown — engaged Pro, champion candidate
- turttlesong — beta tester, M-Cal suggester, NO trial deadline (corrected S60)
- Morgan — YouTuber, browser-blocked. Domain reputation warmup parked 60-90 day horizon.

For current user count and activity, query Supabase live or PostHog (project 363175).

## USER IDS
- Adam: 6e1a02d9-c210-4bc4-968e-dde3435565d1
- Danielle me.com: d6b18345-a85e-42bd-b7cb-f20efd4b2fe7
- Danielle gmail: 038442a2-b13d-4abb-9960-24a360078f6c

## INFRASTRUCTURE
- Live: wovely.app
- GitHub: github.com/alabare01/wovely
- Local: C:/Users/adam/wovely
- Internal tools: C:/Users/adam/wovely-tools/ (sibling folder, NOT in main repo)
- Supabase: vbtsdyxvqqwxjzpuseaf — PRO
- Vercel: prj_SZYwLGH5V7kCZYryr4MSy3US3bfz / team_mRQaDsQzhF6HFGU5Ka7hi5OM — PRO
- Stripe: acct_1TDQ1WGbX5hxxc0T (LIVE) — $8.99/mo Pro
- Cloudinary: dmaupzhcx
- PostHog: Project 363175
- Current session: 62 (next)

## EMAIL STACK
- Google Workspace: adam@wovely.app, support@wovely.app
- Resend: RESEND_API_KEY in Vercel
- DNS: GoDaddy. DKIM LIVE. SPF/DKIM/DMARC passing.

## LEGAL
- Wovely LLC — filed March 30 2026, doc L26000181882, Florida
- EIN reassigned from Hive Works to Wovely
- Annual report due Jan 1 to May 1 2027 at sunbiz.org

## TECH STACK
React/Vite, Supabase Pro, Vercel Pro, Claude Haiku 4.5 primary, Gemini 2.5 Flash fallback + BevCheck primary, Stripe $8.99/mo, Cloudinary, Resend, PostHog

---

## STYLE GUIDE v1.0 (LOCKED)
Primary: #9B7EC8, Navy: #2D3A7C, White: #FFFFFF, Surface: #F8F6FF, Border: #EDE4F7
Text primary: #2D2D4E, Text secondary: #6B6B8A, Danger: #C0544A
Fonts: Playfair Display (headings), Inter (body)
NEVER USE: #1A1A2E, terracotta #B85A3C or #C05A5A, cream #FAF7F2

### Pastel semantic palette (S53)
- Pass: dusty teal #A4C2C3
- Heads-Up: soft buttercup #E2D985
- Issues: dusty rose #CEA0A4

### Card token system (S43)
- CARD_LABEL: fontSize 9, fontWeight 700, letterSpacing 1.2, uppercase, #9B7EC8, Inter
- CARD_TITLE: fontSize 14, fontWeight 700, #2D2D4E, lineHeight 1.3, Playfair Display
- CARD_SUBTITLE: fontSize 11, #6B6B8A, lineHeight 1.4, Inter
- CARD_PILL: fontSize 10, fontWeight 600, padding 3px 8px, borderRadius 20, bg #F8F6FF, #6B6B8A, border 1px #EDE4F7
- BADGE: 32x32, solid #5B9B6B, white text fontSize 11 fontWeight 700

## BEV
Hyper-realistic crochet amigurumi lavender snake, named after Danielle's grandmother Beverly.
Canonical reference: IMG_3968 (no text, navy hexagon frame). Character bible locked S19.
bev_neutral.png in /public.
ALL loading states: static Bev inside spinning ring.
NEVER snake emoji where Bev image can be used.
NEVER use "AI" in user-facing copy — Bev owns all intelligence.
Bev's voice = Dani's voice. Locked.
Future assets: bev_happy.png, bev_warning.png, bev_concerned.png
Named AI feature suite: Stitch-O-Vision (offline), BevCheck, Ask Bev (future), Bev's Read (future Craft tier).

## BACKGROUND CSS (CRITICAL)
- body::before: image, position fixed, z-index -1
- body::after: gradient overlay, position fixed, z-index -1
- #root: position relative, z-index 1
- App.jsx: NO background-color on layout wrapper
- Content wrappers: min-height 100vh
- iOS: background-attachment fixed broken — use fixed pseudo-elements

## Z-INDEX MAP
- FeedbackWidget: 60
- Add Pattern tab: 40
- Mobile header: 20
- Tooltips: 100
- Modals/overlays: 50+

---

## PENDING ADAM ACTIONS
1. Supabase webhook config: auth.users INSERT → https://wovely.app/api/notify-signup (dashboard-only)
2. Replace cover image on First Sunrise Blanket Pattern
3. Claim @wovely on Instagram + TikTok
4. File annual report Wovely LLC at sunbiz.org Jan 1 to May 1 2027
5. Try Recraft.ai for Bev vector logo
6. Create bev_happy.png, bev_warning.png, bev_concerned.png
7. Get Danielle written feedback on BevCheck full report UI
8. Send welcome re-engagement email (script built S56, not yet sent)
9. Commit WOVELY_CONTEXT.md to main opportunistically next time in Claude Code
10. Decide yearly pricing ($59.99/yr vs $9.99/yr)
11. Migrate Claude Design account from adam@terrainnovations.com → adam@wovely.app at natural breakpoint
12. Open loop: Gemini 2.5 Pro never tested vs. Haiku primary. Background curiosity.
13. Text Danielle confirming SOV offline ship, framing Stitch Library as real fix path
14. Hand off Stitch Review app to Dani — she runs npm run dev at C:\Users\adam\wovely-tools\stitch-review\, opens localhost:5173, swipes through 307 stitches, authors Bev's Tips in her voice, exports decisions JSON when done. No deadline pressure.
15. Direct founder-to-user email engagement — personal outreach to specific Wovely users (Steffanie Brown, turttlesong, other engaged Pros). Distinct from automated re-engagement script. Goal: qualitative feedback, champion conversion. Adam's call when to fire. Build a list of 5-10 priority users first.

---

## TECHNICAL GOTCHAS

### Auth & session
- supabaseAuth.getUser() is SYNCHRONOUS — never await
- Supabase signup returns sessions in two shapes — normalization required
- Post-login lands on My Wovely (sessionStorage key wovely_redirect_intent)
- /pattern/:id and /hive/:id paths stored in redirect intent, 15-min window, cleared on manual signout
- RLS with zero policies silently blocks all writes — no error surfaced

### Server / API
- Pattern fetch needs Range: 0-499 header
- Missing await on async = silent 500 with no logs
- Utility module imports silently fail in Vercel serverless — inline only reliable
- Vercel env var changes require fresh deployment
- Vercel Pro maxDuration 300 on extract-pattern.js and extract-pattern-vision.js
- Vercel 17-function limit (Pro) — BevCheck consolidated into extract-pattern.js via mode param
- Vercel runtime logs truncate at first console.log — use vercel_logs Supabase table via execute_sql
- Supabase execute_sql requires auth.users with explicit schema prefix
- Auth schema FK relationships not reliably discoverable via information_schema — use pg_constraint joined to pg_class/pg_namespace with pg_get_constraintdef()
- user_profiles has NO email column — join through auth.users
- Mobile background fetch: start fetch before UI transition
- Claude Haiku model: MUST use claude-haiku-4-5-20251001
- BevCheck max_tokens: 2000
- Gemini 2.5 Flash: model string gemini-2.5-flash, API path /v1beta/
- Gemini: strip markdown fences before JSON.parse
- Gemini responses: skip parts where part.thought === true
- Stripe webhook env var: STRIPE_WEBHOOK_SECRET

### Client / UI
- detailOnSave must spread updated_at onto local state
- Hero image: PILL sentinel check before using photo field
- useBlocker requires createBrowserRouter — Wovely uses BrowserRouter, do NOT use
- iPad Safari scroll bounce: never overflow-y scroll on inner containers
- App.jsx fragment wrapping: DO NOT wrap App return in React fragments
- Fixed position banners in Dashboard.jsx: DO NOT USE
- DEFAULT_STARTERS excluded from stats via is_starter filter
- Client timeout on extract pipeline: 240s S58
- PDFs → Supabase Storage (pattern-files bucket). Images → Cloudinary. Brand assets → /public
- Cloudinary MCP cannot upload local files or base64

### Claude Code subagents (S61 LEARNING)
- Haiku 4.5 (200k context) cannot fit Claude Code's deferred MCP tool surface in subagent context. "Prompt is too long" before any work starts.
- Use Sonnet 4.6 for subagent vision work in Claude Code environment. Quality is excellent for structured extraction, cost is reasonable, no context window issues.
- Opus 4.7 only when Sonnet quality is genuinely insufficient — almost never the case for structured extraction tasks.

### Screenshots / Windows (S61 LEARNING)
- Windows Snipping Tool with auto-save → C:\Users\adam\Pictures\Screenshots\ by default
- OneDrive auto-syncs Pictures folder including Screenshots → C:\Users\adam\OneDrive\Pictures\Screenshots N\ where N is sync version
- For batch screenshot capture workflows, change Snipping Tool save location to project-specific folder (e.g., wovely\stitch-extraction-source\) to avoid OneDrive layover
- Screenshots not visible locally? Check OneDrive Pictures path before assuming loss

### Analytics
- BevCheck events still named stitch_check_run in PostHog
- PostHog production traffic filter: properties.$current_url LIKE '%wovely.app%'
- PostHog project 363175

### Misc
- SessionStorage keys: wovely_feedback_draft, wovely_redirect_intent, wovely_sov_anon_scan_used
- RLS must be applied to ALL new tables at creation time
- CORS: audit all serverless functions

### Research dead-ends (don't rehash)
- Cannot ingest copyrighted blog/book content via any automation
- AI-generated crochet images technically fail and brand-damage
- Antique Pattern Library scans CC BY-NC-SA — commercial disqualified
- Pre-1929 public domain real but aesthetically limited
- No shortcut to Stitch Library. Building it is the moat.

---

## CHANGELOG RULE
Only user-facing features. Never mention AI — Bev language only. Prepend each session to src/changelog.js.

---

## CLAUDE CODE DESKTOP APP WORKFLOW
Two-window setup: Claude.ai browser for strategy, Claude Code desktop for code execution. Diff viewer mandatory before every merge. Permission modes: Ask for Stripe/auth/hotfixes, Auto for queue system/CORS/RLS/Collections, Plan for large refactors. ALWAYS query vercel_logs first when debugging.

---

## CLAUDE RULES
- Adam pastes master doc at session open — treat as canonical
- Next session = 62
- Danielle feedback overrides everything
- ONE complete Claude Code prompt per task
- Never push direct to main (except WOVELY_CONTEXT.md)
- Match Adam energy, read the room
- ALWAYS query vercel_logs first when debugging
- Model swap first when provider is flaky
- Proactively flag platform limits and upgrade paths
- Never use em dashes in copy or emails written for Adam
- Session close: plain text doc in chat, Adam saves locally, GitHub push opportunistic
- Never declare session closed without Adam's explicit confirmation
- When Adam is verbalizing, talk like a person not a doc
- When Adam is exploring a shortcut that doesn't exist, say so plainly
- Stitch Library content: Dani's voice is canonical. Bev's voice = Dani's voice. SOV outputs assembled from library, never freely generated.
- COPYRIGHT RED LINE: Never help find workarounds to use copyrighted images, text, or content from third parties in Wovely. The Stitch Library is built from: (1) original Dani/contract work, (2) pre-1929 public domain, (3) licensed partnerships. That's the list.