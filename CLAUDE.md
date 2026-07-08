---
name: wovely-patterns
description: "Critical technical and design patterns for the Wovely codebase (wovely.app). Use this skill whenever working on ANY Wovely task — UI changes, API work, CSS, auth, file handling, Supabase queries, or deployment. This skill MUST be consulted before writing any code for the Wovely project. Triggers on mentions of Wovely, wovely.app, YarnHive, Bev, BevCheck, Stitch-O-Vision, patterns app, crochet app, or any reference to the Wovely tech stack (Supabase + Vercel + React/Vite + Gemini)."
---

# Wovely Codebase Patterns

Non-negotiable rules and patterns for the Wovely codebase. Read this before writing a single line of code.

---

## Style Guide — Design System 2b (LOCKED — supersedes v1.0)

> Source of truth: `design/Wovely App 2b.dc.html` + `10 Canon/Design System 2b.md` (Wovely Vault).
> Token mirrors: `src/theme.jsx` (`T`) and `:root` in `src/index.css`. Change tokens there, not inline.

```
Accent (lavender):   #7B6AD4   (T.accent / --accent)
Deep accent:         #6E5AC8   (T.accentD / --accentD)   ← gradients, pressed states
Canvas / bg:         #FBF9FF   (T.bg / --bg)              ← cool, NOT warm cream
Panel / card:        #FFFFFF   (T.panel)
Soft lavender fill:  #F2EEFB   (T.soft)
Line / border:       #ECE6F8   (T.line / --line)
Text primary (ink):  #2E2748   (T.ink)
Text secondary:      #726A92   (T.muted / T.ink2)
```

**Full palette (playful, used deliberately):** Coral `#FF8A73` · Sun/Gold `#FFC24B` · Mint `#5EC9AE` · Sky `#6FB7F0` · Pink `#C98BE0`

**Gold is SCARCE** — yarn cord + Craft/premium treatments only. Never decorative.

**Stitch Check / BevCheck gauge:** ok green `#1E8A63` (80%+), warn amber `#B07B1E` (60–79%), low coral `#C2564A` (<60%)

**Fonts:** **Fredoka** (display/headings, weights 400–700) + **Nunito** (body/UI, weights 500–900). Loaded in `index.html`.

**Texture:** woven 45° crosshatch on canvases (`T.crosshatch` / `--crosshatch`).

**NEVER USE:** the old palette (`#9B7EC8` lavender, `#2D3A7C` navy, Playfair/Inter, warm cream `#FAF8F5`/`#FAF7F2`), `#1A1A2E`, terracotta/salmon `#B85A3C`.

---

## Card Treatment — 2b (the design language)

2b cards are **solid white panels on the woven canvas** — soft hairline border + layered lavender shadow, generous radius. (Heavy glass/blur is reserved for surfaces that sit directly over photography, e.g. sticky topbar `rgba(251,249,255,.86)+blur(8px)`.) My Wovely (Dashboard.jsx) is the gold standard.

```js
// Standard 2b card — use everywhere
const CARD = {
  background: '#FFFFFF',            // T.panel
  border: '1px solid #ECE6F8',     // T.line
  borderRadius: 22,
  boxShadow: '0 16px 34px -22px rgba(90,66,160,0.4)',   // T.shadowLg
};
// Hover lift: translateY(-4px) + shadow → 0 26px 46px -22px rgba(90,66,160,0.5)

// Standard page content container — stops wall-to-wall stretch
const PAGE_CONTAINER = {
  maxWidth: 1180,        // 2b .content width
  margin: '0 auto',
  padding: '8px 40px 48px',
};
```

---

## Background CSS (CRITICAL — never break this)

```css
body::before  → background image, position: fixed, 100vw/100vh, z-index: -1
body::after   → gradient overlay, position: fixed, 100vw/100vh, z-index: -1
#root         → position: relative, z-index: 1
index.html    → background: transparent
App.jsx       → NO background-color on any layout wrapper
Content wrappers → min-height: 100vh (desktop AND mobile)
```

**iOS specific:** `background-attachment: fixed` is broken on iOS. Always use fixed pseudo-elements instead.

---

## Z-Index Map

```
FeedbackWidget heart:     z-index 60
Add Pattern tab (right):  z-index 40
Mobile header:            z-index 20
Tooltips:                 z-index 100
Modals/overlays:          z-index 50+
```

---

## Bev Character Rules

- Hyper-realistic crochet amigurumi lavender snake
- Image file: `bev_neutral.png` in `/public`
- ALL loading states: static Bev inside spinning ring
- Sidebar logo mark + BevCorner typewriter companion
- NEVER use 🐍 snake emoji where Bev image can be used
- Character bible locked — do not reinterpret Bev's personality

---

## Supabase Patterns

```js
// CRITICAL: getUser() is SYNCHRONOUS — never await it
const user = supabaseAuth.getUser(); // correct
const user = await supabaseAuth.getUser(); // WRONG

// user_profiles has NO email column — always join through auth.users
SELECT up.*, au.email
FROM user_profiles up
JOIN auth.users au ON au.id = up.id
WHERE au.email = '[email]';

// Pattern fetch requires Range header
headers: { Range: '0-499' }

// Pro upgrade pattern
UPDATE user_profiles SET is_pro = true 
WHERE id = (SELECT id FROM auth.users WHERE email = '[email]');

// is_pro caches in localStorage as 'yh_is_pro'
// User must sign out/in to clear stale Pro state after manual upgrade
```

---

## File Routing Rules

```
PDFs         → Supabase Storage (pattern-files bucket) — NEVER Cloudinary
Images       → Cloudinary
Brand assets → /public folder, served via Vercel
```

Cloudinary returns 401 on PDFs. Do not attempt PDF uploads to Cloudinary under any circumstances.

---

## Vercel Serverless Functions

**Current limit: 17 functions deployed. DO NOT add new API files.**
Vercel Hobby plan — upgrade to Pro before Collections build.
10 second function timeout — Gemini calls can approach this limit.

If a task requires a new API endpoint, consolidate into an existing function rather than creating a new file.

---

## Gemini Integration

```js
// Always strip markdown fences before JSON.parse
const clean = response.replace(/```json|```/g, '').trim();
const parsed = JSON.parse(clean);

// Skip thought blocks
const parts = response.parts.filter(p => !p.thought);

// maxOutputTokens too low causes mid-string truncation — set high
```

---

## Post-Login Redirect

```js
// sessionStorage key: wovely_redirect_intent
// Structure: { url: '/pattern/[id]', storedAt: Date.now() }
// Rules:
//   - Only /pattern/:id and /hive/:id paths are stored
//   - 15-minute window — stale intents land on / (My Wovely)
//   - Cleared immediately on manual sign out
//   - Session expires → always land on My Wovely
```

---

## DEFAULT_STARTERS

Exclude from all user stats. Always filter with `is_starter` check.

---

## Pattern Detail (detailOnSave)

Must spread `updated_at` onto local state after save — otherwise On the Hook hero card shows stale data.

```js
setPattern(prev => ({ ...prev, ...savedData, updated_at: savedData.updated_at }));
```

---

## Hero Image Sentinel

Before using `photo` field for hero image, always check for PILL sentinel:

```js
if (pattern.photo && pattern.photo !== 'PILL') {
  // safe to use as hero
}
```

---

## SessionStorage Keys

```
wovely_feedback_draft     → FeedbackWidget draft persistence (survives iOS Safari repaint)
wovely_redirect_intent    → Post-login redirect { url, storedAt }
```

---

## Branch & Deploy Rules

- **Never push direct to main** — always a dev branch
- Branch alias format: `wovely-git-[branch-name]-alabare-8435s-projects.vercel.app`
- One complete Claude Code prompt per task — never split
- Merge only after Adam confirms it works on preview URL
- Vercel env var changes require a fresh deployment (empty git commit if needed)

---

## Key User IDs

```
Adam:             6e1a02d9-c210-4bc4-968e-dde3435565d1
Danielle me.com:  d6b18345-a85e-42bd-b7cb-f20efd4b2fe7
Danielle gmail:   038442a2-b13d-4abb-9960-24a360078f6c
```

---

## Changelog Rule

Only user-facing features in `src/changelog.js`. Internal tools (founders dashboard, analytics) never mentioned. Prepend new session entry at the start of each session.
