# Wovely — Design System

> Mobile-first, responsive, accessible. Tokens for web → iOS/Android.

---

## Color System (OKLCH)

### Primary Brand
- **Terra (Lavender):** `#9B7EC8` · OKLCH(68.5%, 0.14, 290°) — Accents, CTAs, highlights
- **Terra Light:** `#EDE4F7` · OKLCH(88%, 0.05, 280°) — Subtle backgrounds, borders

### Semantic
- **Success (Sage):** `#5C9E7A` — Completion, positive feedback
- **Warning (Gold):** `#C9853A` — Caution, alerts
- **Error (Rose):** `#C05A5A` — Errors, destructive actions

### Neutral Grays (Text & Structure)
- **Ink (Dark):** `#2D2D4E` — Primary text, headings
- **Ink 2 (Secondary):** `#6B6B8A` — Secondary text, meta info
- **Disabled:** `#B0AEC4` — Disabled states, placeholders

### Backgrounds
- **Body bg:** `#FAF8F5` · OKLCH(96.5%, 0.02, 75°) — Warm cream, not off-white
- **Surface:** `#F8F6FF` · OKLCH(95%, 0.03, 280°) — Subtle lavender tint
- **Card bg:** `#FFFFFF` · OKLCH(100%, 0, n/a) — Pure white, with glass-card effect

### Glass-Card Effect (CSS)
```css
background: rgba(255, 255, 255, 0.84);
border: 1px solid rgba(155, 126, 200, 0.18);
border-radius: 12px;
box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
backdrop-filter: blur(12px); /* Optional on web, easier on perf */
```

---

## Typography

### Font Stack
- **Serif (Display/Headings):** Playfair Display (400, 500, 700 weights)
- **Sans (Body/UI):** Inter (300, 400, 500, 600 weights)
- **Fallbacks:** Georgia, -apple-system, system-ui

### Scale (Responsive)

#### Mobile (320px–767px)
| Role | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| H1 (Page title) | 26px | 700 | 1.2 | -0.02em |
| H2 (Section) | 20px | 700 | 1.3 | 0 |
| H3 (Subsection) | 18px | 600 | 1.3 | 0 |
| Body | 14px | 400 | 1.6 | 0 |
| Small (Meta) | 12px | 400 | 1.4 | 0 |
| Label (Input) | 11px | 600 | 1.4 | 0.05em |

#### Desktop (1024px+)
| Role | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| H1 | 36px | 700 | 1.2 | -0.02em |
| H2 | 26px | 700 | 1.3 | 0 |
| H3 | 20px | 600 | 1.3 | 0 |
| Body | 15px | 400 | 1.6 | 0 |
| Small | 13px | 400 | 1.4 | 0 |
| Label | 12px | 600 | 1.4 | 0.05em |

### Usage
- **H1:** Page headings only (e.g., "My Patterns", "Pattern Detail")
- **H2:** Major sections (e.g., "Your Collections", "Bev's Tips")
- **H3:** Subsections (e.g., "Materials", "Instructions", "Progress")
- **Body:** Long-form content. Clamp line length to 65ch max.
- **Small:** Meta info (dates, counts, helper text)
- **Label:** Form field labels, UI labels

### Text Color Contrast
- **Body on light bg:** Use Ink (#2D2D4E) — 4.9:1 contrast against #FAF8F5
- **Secondary on light bg:** Use Ink2 (#6B6B8A) — 4.8:1 contrast against #FAF8F5
- **Body on card (white):** Use Ink (#2D2D4E) — 14:1 contrast
- **Labels / form text:** Use Ink2 (#6B6B8A) — 5.5:1 contrast against #F8F6FF

**Golden rule:** Never use gray text on tinted backgrounds. Use a darker shade of the tint instead, or a transparency of the text color.

---

## Spacing System (Base 4px)

| Token | Value | Use |
|-------|-------|-----|
| `xs` | 4px | Micro-spacing (icon gaps, tight layouts) |
| `sm` | 8px | Compact spacing (input padding, small gaps) |
| `md` | 16px | Standard spacing (section gaps, card padding) |
| `lg` | 24px | Generous spacing (major section gaps) |
| `xl` | 32px | Large spacing (page margins) |
| `2xl` | 48px | Hero spacing (page top margin) |

### Applied
- **Card padding:** `md` (16px)
- **Input padding:** `sm` (8px vertical) + `md` (16px horizontal)
- **Section gap:** `lg` (24px)
- **Page margin (mobile):** `md` (16px)
- **Page margin (desktop):** `xl` (32px)

---

## Responsive Breakpoints

| Breakpoint | Width | Device | Use |
|------------|-------|--------|-----|
| `mobile` | 320px–767px | Phone | Single column, touch-friendly |
| `tablet` | 768px–1099px | iPad, small laptop | 2-column, balance of touch + click |
| `desktop` | 1100px+ | Desktop, large screens | Multi-column, mouse-friendly |

### Mobile-First Approach
1. Design for mobile (smallest viewport) first
2. Add breakpoints only when needed (not at every size)
3. Use CSS Grid / Flexbox for natural scaling (avoid media query bloat)

### Example: Responsive Grid
```css
.pattern-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px; /* md spacing */
}
/* Scales naturally: 1 column on mobile, 2–3 on tablet, 4+ on desktop */
```

---

## Component Library (Planned for iOS/Android)

### Buttons
- **Primary:** Solid terra, white text, 48px height (touch)
- **Secondary:** Outlined terra, terra text
- **Tertiary:** Text only, terra color
- **States:** Normal, Hover (darker), Active (pressed), Disabled (gray)

### Cards
- **Standard:** Glass-card effect, all text colors inherit
- **Interactive:** Add active state (slightly darker border, subtle shadow)
- **Padding:** md (16px) standard, sm (8px) compact

### Inputs
- **Text input:** Light lavender bg (#F8F6FF), lavender border, 44px height (touch)
- **Focus state:** Darker lavender border, no outline (border is the focus indicator)
- **Placeholder:** Disabled text color, 4.5:1 contrast

### Modals / Dialogs
- **Backdrop:** Semi-transparent black (rgba 0,0,0,0.4)
- **Modal bg:** White, glass-card effect
- **Border-radius:** 12px
- **Padding:** lg (24px)
- **Close button:** Top-right, 48px target

### Progress Bars
- **Unfilled:** Terra light (#EDE4F7)
- **Filled:** Terra (#9B7EC8)
- **Height:** 4px (non-interactive), 8px (interactive)
- **Border-radius:** 2px

### Badges / Pills
- **Bg:** Light lavender or semantic color
- **Text:** Ink color, 11px small font
- **Padding:** 3px 8px (compact)
- **Border-radius:** 20px (pill)

---

## Accessibility Standards

### Contrast Ratios (WCAG AA)
- Body text: 4.5:1 minimum
- Large text (≥18px or ≥14px bold): 3:1 minimum
- UI components: 3:1 minimum
- Placeholder text: 4.5:1 (match body requirements)

### Touch Targets (iOS/Android)
- Minimum: 44px × 44px (Apple HIG standard)
- Comfortable: 48px × 48px (Google Material standard)
- Avoid stacking buttons closer than 8px apart

### Mobile-Specific Accessibility
- Font size minimum: 14px (prevents auto-zoom on iOS)
- Tap targets: Always 48px+
- Form labels: Associated with `<label>` tag (not placeholder-only)
- Avoid horizontal scroll on mobile

### Motion & Animation
- All animations: `prefers-reduced-motion` media query support
- Default: Fade-out with exponential ease (ease-out-quart / quint)
- Stagger delay: 50–100ms between items
- Duration: 200–400ms for UI, 300–600ms for modals

---

## Animation Principles

### Curve
- **Default:** `cubic-bezier(0.23, 1, 0.32, 1)` (ease-out-quart)
- **Gentle:** `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (ease-in-out)
- **Snappy:** `cubic-bezier(0.43, 0.13, 0.15, 0.96)` (ease-out-expo)

### Duration
- **Micro (hover, focus):** 150ms
- **Short (expand, collapse):** 250–300ms
- **Medium (modal enter, page transition):** 400–500ms
- **Long (reveal sequences):** 600–800ms

### Never Animate
- Layout properties (width, height) — too expensive
- Any property on scroll (creates jank)
- Without `prefers-reduced-motion` fallback

---

## Design Tokens (For iOS/Android Export)

### Token Naming Convention
```
{category}-{role}-{state}
e.g., color-terra-default, spacing-md, font-size-h2-mobile
```

### Example Token Map
```json
{
  "color": {
    "terra": "#9B7EC8",
    "terra-light": "#EDE4F7",
    "ink": "#2D2D4E",
    "ink-secondary": "#6B6B8A",
    "bg-body": "#FAF8F5",
    "bg-surface": "#F8F6FF",
    "bg-card": "#FFFFFF"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px"
  },
  "font": {
    "family-serif": "Playfair Display, Georgia, serif",
    "family-sans": "Inter, -apple-system, sans-serif",
    "size-h1-mobile": "26px",
    "size-body-mobile": "14px"
  },
  "breakpoint": {
    "mobile": "320px",
    "tablet": "768px",
    "desktop": "1100px"
  }
}
```

---

## Mobile-Ready Web Strategy

### Each Component Must
1. **Work on 320px width** (iPhone SE smallest viewport)
2. **Touch targets ≥48px** (no 16px buttons)
3. **No horizontal scroll** (viewport width = content width)
4. **Font size ≥14px** (prevents iOS auto-zoom)
5. **Responsive by default** (Grid/Flex, not media-query-heavy)
6. **Fast performance** (Critical CSS inline, lazy-load images, <3s First Paint)

### No Separate "Mobile Site"
- Single responsive codebase (web + export tokens to iOS/Android)
- Mobile-first design process
- Progressive enhancement (mobile baseline → desktop polish)

---

## What's Off Limits (Design Anti-Patterns)

### Banned
- **Gradient text** (background-clip: text) — illegible, decorative
- **Side-stripe borders** (border-left/right only) — use full borders or nothing
- **Nested cards** — visual clutter, breaks hierarchy
- **Tiny eyebrow text** (all-caps, tracked) above every section — AI scaffold
- **Identical card grids repeated** (icon + text + icon + text...) — boring, adds no info
- **Glassmorphism as default** (blur + transparency everywhere) — performance killer, use sparingly

### Careful With
- **Drop shadows** — only for depth (cards, modals); not decoration
- **Animations** — motion should enhance, not distract
- **Color** — don't use 5+ colors; terra + 1-2 semantic colors max
- **Typography** — don't mix 3+ font families

---

## Next Steps

1. **Component audit:** Inventory existing React components (Button, Card, Input, Modal, etc.)
2. **Token extraction:** Convert hard-coded colors/spacing into reusable tokens
3. **Responsive check:** Test every component at 320px, 768px, 1024px breakpoints
4. **Mobile build:** iOS/Android teams receive token export + component reference
5. **Living design system:** Update this doc as new components ship

---

## Figma / Design Tools (Optional)

If a designer joins:
- Figma file with component library (iOS + Android + Web)
- Token plugin (Figma → JSON export → iOS/Android)
- Storybook for web component docs

For now (solo builder):
- Keep tokens in code (`theme.jsx` + CSS variables)
- Document patterns in this file
- Test on real devices (not just browser)

---

_Design System v1. Adam + Claude. Updated 2026-06-30._
