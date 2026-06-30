# Wovely S77 Audit — Screenshot Manifest

Captured against **https://wovely.app** (production, S76 document-type architecture).
Viewports: **desktop 1440×900** · **mobile 390×844 (iPhone Safari UA)**. No iPad.
Output folder: `audit-s77/<viewport>/<auth>[/<tier>/<load-state>]/<route>.png`

Total files: **70** (36 desktop · 34 mobile).

## 1. Required screens (triage order)

Each row is one audit-required screen, with its file at each viewport. ✅ = present, ❌ = missing.

| # | Screen | Desktop | Mobile |
|---|---|---|---|
| 1 | Auth — login | `desktop/logged-out/sign-in.png` | `mobile/logged-out/sign-in.png` |
| 2 | Auth — signup (landing) | `desktop/logged-out/landing-signup.png` | `mobile/logged-out/landing-signup.png` |
| 3 | Empty state — zero patterns (activation-leak) | `desktop/logged-in/craft/empty/my-wovely.png` | `mobile/logged-in/craft/empty/my-wovely.png` |
| 4 | Dashboard with patterns (two-column grid) | `desktop/logged-in/craft/loaded/my-wovely.png` | `mobile/logged-in/craft/loaded/my-wovely.png` |
| 5 | Pattern detail — inline single (Materials) | `desktop/logged-in/craft/loaded/pattern-detail-materials.png` | `mobile/logged-in/craft/loaded/pattern-detail-materials.png` |
| 5 | Pattern detail — inline single (Instructions) | `desktop/logged-in/craft/loaded/pattern-detail-instructions.png` | `mobile/logged-in/craft/loaded/pattern-detail-instructions.png` |
| 5 | Pattern detail — inline single (My Notes) | `desktop/logged-in/craft/loaded/pattern-detail-notes.png` | `mobile/logged-in/craft/loaded/pattern-detail-notes.png` |
| 6 | Craft hub — parts-grid landing (NEW S76) | `desktop/logged-in/craft/loaded/craft-hub-landing.png` | `mobile/logged-in/craft/loaded/craft-hub-landing.png` |
| 7 | Craft hub — scoped part view + part-strip (NEW S76) | `desktop/logged-in/craft/loaded/craft-hub-part.png` | `mobile/logged-in/craft/loaded/craft-hub-part.png` |
| 8 | Add Pattern modal — initial state | `desktop/logged-in/craft/loaded/add-pattern-modal-open.png` | `mobile/logged-in/craft/loaded/add-pattern-modal-open.png` |
| 9 | Import flow — mid-extraction BevCorner loading | `desktop/logged-in/craft/loaded/import-bev-loading.png` | `mobile/logged-in/craft/loaded/import-bev-loading.png` |
| 10 | Chart lightbox (open) | `desktop/logged-in/craft/loaded/pattern-detail-lightbox.png` | `mobile/logged-in/craft/loaded/pattern-detail-lightbox.png` |
| 11 | Collection view (Arcoiris MCAL, reconstructed) | `desktop/logged-in/craft/loaded/collection-detail.png` | `mobile/logged-in/craft/loaded/collection-detail.png` |
| 12 | Feedback widget (open) | `desktop/logged-in/craft/loaded/feedback-widget-open.png` | `mobile/logged-in/craft/loaded/feedback-widget-open.png` |

**All required screens captured at both viewports.**

## 2. Full inventory (grouped by screen, then device)

| Screen (context · route) | Desktop | Mobile |
|---|---|---|
| logged-in/craft/empty · account-settings | `desktop/logged-in/craft/empty/account-settings.png` | `mobile/logged-in/craft/empty/account-settings.png` |
| logged-in/craft/empty · my-wovely | `desktop/logged-in/craft/empty/my-wovely.png` | `mobile/logged-in/craft/empty/my-wovely.png` |
| logged-in/craft/loaded · account-settings | `desktop/logged-in/craft/loaded/account-settings.png` | `mobile/logged-in/craft/loaded/account-settings.png` |
| logged-in/craft/loaded · add-pattern-modal-open | `desktop/logged-in/craft/loaded/add-pattern-modal-open.png` | `mobile/logged-in/craft/loaded/add-pattern-modal-open.png` |
| logged-in/craft/loaded · browse | `desktop/logged-in/craft/loaded/browse.png` | `mobile/logged-in/craft/loaded/browse.png` |
| logged-in/craft/loaded · builds | `desktop/logged-in/craft/loaded/builds.png` | `mobile/logged-in/craft/loaded/builds.png` |
| logged-in/craft/loaded · collection-detail | `desktop/logged-in/craft/loaded/collection-detail.png` | `mobile/logged-in/craft/loaded/collection-detail.png` |
| logged-in/craft/loaded · craft-hub-landing | `desktop/logged-in/craft/loaded/craft-hub-landing.png` | `mobile/logged-in/craft/loaded/craft-hub-landing.png` |
| logged-in/craft/loaded · craft-hub-part | `desktop/logged-in/craft/loaded/craft-hub-part.png` | `mobile/logged-in/craft/loaded/craft-hub-part.png` |
| logged-in/craft/loaded · feedback-widget-open | `desktop/logged-in/craft/loaded/feedback-widget-open.png` | `mobile/logged-in/craft/loaded/feedback-widget-open.png` |
| logged-in/craft/loaded · import-bev-loading | `desktop/logged-in/craft/loaded/import-bev-loading.png` | `mobile/logged-in/craft/loaded/import-bev-loading.png` |
| logged-in/craft/loaded · my-wovely | `desktop/logged-in/craft/loaded/my-wovely.png` | `mobile/logged-in/craft/loaded/my-wovely.png` |
| logged-in/craft/loaded · pattern-detail-instructions | `desktop/logged-in/craft/loaded/pattern-detail-instructions.png` | `mobile/logged-in/craft/loaded/pattern-detail-instructions.png` |
| logged-in/craft/loaded · pattern-detail-lightbox | `desktop/logged-in/craft/loaded/pattern-detail-lightbox.png` | `mobile/logged-in/craft/loaded/pattern-detail-lightbox.png` |
| logged-in/craft/loaded · pattern-detail-materials | `desktop/logged-in/craft/loaded/pattern-detail-materials.png` | `mobile/logged-in/craft/loaded/pattern-detail-materials.png` |
| logged-in/craft/loaded · pattern-detail-notes | `desktop/logged-in/craft/loaded/pattern-detail-notes.png` | `mobile/logged-in/craft/loaded/pattern-detail-notes.png` |
| logged-in/craft/loaded · shopping | `desktop/logged-in/craft/loaded/shopping.png` | `mobile/logged-in/craft/loaded/shopping.png` |
| logged-in/craft/loaded · stash | `desktop/logged-in/craft/loaded/stash.png` | `mobile/logged-in/craft/loaded/stash.png` |
| logged-in/craft/loaded · stitch-check | `desktop/logged-in/craft/loaded/stitch-check.png` | `mobile/logged-in/craft/loaded/stitch-check.png` |
| logged-in/craft/loaded · tools | `desktop/logged-in/craft/loaded/tools.png` | `mobile/logged-in/craft/loaded/tools.png` |
| logged-in/free/empty · account-settings | `desktop/logged-in/free/empty/account-settings.png` | `mobile/logged-in/free/empty/account-settings.png` |
| logged-in/free/empty · my-wovely | `desktop/logged-in/free/empty/my-wovely.png` | `mobile/logged-in/free/empty/my-wovely.png` |
| logged-in/free/empty · pricing-upgrade-modal | `desktop/logged-in/free/empty/pricing-upgrade-modal.png` | — |
| logged-in/free/loaded · account-settings | `desktop/logged-in/free/loaded/account-settings.png` | `mobile/logged-in/free/loaded/account-settings.png` |
| logged-in/free/loaded · my-wovely | `desktop/logged-in/free/loaded/my-wovely.png` | `mobile/logged-in/free/loaded/my-wovely.png` |
| logged-in/free/loaded · pattern-detail | `desktop/logged-in/free/loaded/pattern-detail.png` | `mobile/logged-in/free/loaded/pattern-detail.png` |
| logged-in/free/loaded · pricing-upgrade-modal | `desktop/logged-in/free/loaded/pricing-upgrade-modal.png` | — |
| logged-in/pro/empty · account-settings | `desktop/logged-in/pro/empty/account-settings.png` | `mobile/logged-in/pro/empty/account-settings.png` |
| logged-in/pro/empty · my-wovely | `desktop/logged-in/pro/empty/my-wovely.png` | `mobile/logged-in/pro/empty/my-wovely.png` |
| logged-in/pro/loaded · account-settings | `desktop/logged-in/pro/loaded/account-settings.png` | `mobile/logged-in/pro/loaded/account-settings.png` |
| logged-in/pro/loaded · my-wovely | `desktop/logged-in/pro/loaded/my-wovely.png` | `mobile/logged-in/pro/loaded/my-wovely.png` |
| logged-in/pro/loaded · pattern-detail | `desktop/logged-in/pro/loaded/pattern-detail.png` | `mobile/logged-in/pro/loaded/pattern-detail.png` |
| logged-out · landing-signup | `desktop/logged-out/landing-signup.png` | `mobile/logged-out/landing-signup.png` |
| logged-out · privacy | `desktop/logged-out/privacy.png` | `mobile/logged-out/privacy.png` |
| logged-out · sign-in | `desktop/logged-out/sign-in.png` | `mobile/logged-out/sign-in.png` |
| logged-out · terms | `desktop/logged-out/terms.png` | `mobile/logged-out/terms.png` |

## 3. Notes on test data

- **Read-only against prod.** Logged-in screens use the dedicated `alabare+pw-*` test accounts. Prod patterns were never mutated.
- **Craft hub source:** *Blooming Daisy* (prod `30c6908a`, 12 named parts) cloned into the craft-loaded test account — Warden `3a812d1e` has only 3 parts and renders inline, so it does not exercise the hub.
- **Collection (Arcoiris MCAL):** the audit's canonical collection `d195886a` and its clue IDs no longer exist in prod, so an equivalent `mkal` collection of chart-bearing clue children was reconstructed in the test account (real chart images → real ratios).
- **Import BevCorner loading:** captured by stubbing `/api/job-status` to a stable `extracting` phase on an isolated page — exercises the real ImportPill component without starting a real import.
