# Wovely — Product Definition

> A crochet pattern companion app. Help makers import, track, and master patterns from any source.

## Product Essence

**Who:** Crocheters of all levels (hobby to semi-pro).  
**What:** Find patterns, import from anywhere (PDF, URL, manual), track progress row-by-row, get AI feedback on pattern quality, organize multi-part projects.  
**Why:** Crochet patterns are chaotic (PDFs, Instagram screenshots, old books, Ravelry). Wovely is the single place to collect, organize, track, and finish them.

**Current Stage:** Beta. 40 users (web only), 0 paying. Goal: proof of payment ($200-500 MRR) before iOS/Android.

---

## Core Features

### Free Tier (5 patterns max)
- Import patterns (PDF, URL, manual entry)
- Track progress (row checkboxes)
- Yarn stash management
- Bev mascot (motivational messages, progress nudges)

### Craft Tier ($6.99/mo or $59.99/yr)
- 100 patterns max
- **BevCheck:** Stitch recognition & pattern quality analysis (AI-powered)
- **Collections:** Group multi-part projects (MKALs, bundles)
- Extended Bev features (advanced tips, pattern difficulty assessment)

---

## User Journeys

### Journey 1: Casual Maker (1-2 patterns)
**Path:** Browse → Sign up Free → Import pattern → Track rows → Finish

**Moments:**
1. Landing page: "Save and track patterns" — hook
2. Signup: No paywall mention (Free is enough)
3. First import: Onboarding teaches app layout
4. Pattern detail: Row tracking, progress bar (core loop)
5. Completion: Celebrate + see "Upgrade to Craft for more" nudge

---

### Journey 2: Active Maker (5+ patterns, multi-part projects)
**Path:** Browse → Sign up Free → Import 5 patterns → Hit cap → Upgrade to Craft → Collections → BevCheck

**Moments:**
1. Landing: "Organize your whole pattern library" — hook
2. Signup + onboarding: Tier awareness (Free = 5, Craft = 100)
3. Import 4 patterns: Pattern count meter shows "3 of 5"
4. Import pattern #5: Success, but see "1 slot left" warning
5. Import pattern #6: Friction. Modal: "Your library is full. Upgrade to Craft."
6. Upgrade: 7-day trial offered
7. Collections exploration: Create "Spring MKAL 2025" project (3 clues)
8. BevCheck feature: See pattern analysis (stitch symbols, off-counts, etc.)

---

### Journey 3: Power User (MKAL organizer, pattern designer feedback)
**Path:** Browse → Sign up → Rapid imports → Immediate Craft upgrade → Collections + BevCheck

**Moments:** Same as Journey 2, but faster and more intentional.

---

## Monetization Model

### Pricing
- **Free:** Always free. 5 patterns max. No credit card required.
- **Craft:** $6.99/mo or $59.99/yr (20% discount annually). 100 patterns + BevCheck + Collections.

### Conversion Funnel
1. Landing: Value prop (Wovely Free vs. Craft)
2. Signup: Tier choice offered (Free or 7-day trial)
3. Onboarding: Tier education
4. Pattern import #6: Hard paywall (can't import without upgrade)
5. BevCheck discovery: Soft paywall (blur + contextual modal)
6. Collections: Soft paywall (disabled feature + preview)

### Success Metrics
- Signup to Craft trial: 15-20% conversion
- Free to Craft (at pattern cap): 20-30% conversion
- Craft trial to paid: 30-40% (industry standard)
- Target: $200-500 MRR by end of Q3 2026

---

## Design Philosophy

### Tone & Voice
- Warm, not corporate. Bev is a friend, not a feature.
- Benefit-driven copy, not feature-lists.
- Conversational: "Save your progress here" not "Enable offline persistence."

### Visual Language
- **Premium glass-card aesthetic.** Frosted blur, soft shadows, semi-transparent whites.
- **Lavender as the brand color.** #9B7EC8 for accents, CTAs, highlights.
- **Typography:** Playfair Display (serif, headlines) + Inter (sans, body). Elegant + readable.
- **Spacing & rhythm:** Varied, not uniform. Breathing room. 16px base unit.
- **Accessibility first:** 4.5:1 contrast minimum. Touch targets ≥48px on mobile. Readable fonts.

### Platform Strategy
- **Web first** (proof of payment). Desktop-responsive.
- **iOS second** (2026 Q4). Native SwiftUI, design tokens match web.
- **Android third** (2026 Q4). Native Kotlin, design tokens match web.
- **Design system:** Tokens (colors, spacing, fonts) are the bridge. Reusable across web + native.

---

## Technical Stack

- **Frontend (web):** React 18 + Vite, Supabase auth
- **Backend:** Supabase (PostgreSQL, auth, storage, edge functions)
- **AI:** Gemini (stitch recognition, pattern analysis)
- **Deploy:** Vercel (web). Pre-planning for iOS (Xcode) + Android (Android Studio).
- **Analytics:** PostHog (user behavior, funnel analysis)
- **Payments:** Stripe (subscriptions)
- **Assets:** Cloudinary (pattern images, cover photos)

---

## Current State (2026-06-30)

- **Users:** 40 beta (web only)
- **Paying users:** 0
- **Features live:** Core import, track, Bev mascot. Collections in beta. BevCheck in beta.
- **Next:** Phase 1 monetization funnel (landing, onboarding, paywall tuning). Then iOS/Android.

---

## Design Registers

**Register:** Product (design serves the product; not brand-hero marketing).  
**Context:** This is a utility app. The interface should get out of the way and let makers make. Premium feel, not flashy.  
**Mobile-first:** Design every component for mobile first, then scale up. Touch-friendly defaults.
