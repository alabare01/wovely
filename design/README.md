# Wovely design handoff — for Claude Code

These are the 6 canonical design sources plus the `assets/` images they reference.
Drop this whole folder into the repo as `design/` and pick option 2 (pixel-faithful).

## How to read a .dc.html file
Each file is self-contained HTML. The parts that matter:
- `<helmet>` block at the top of `<x-dc>` → all CSS: design tokens, utility classes, component styles. Lift exact hex values, radii, shadows, font sizes from here.
- The markup between `</helmet>` and the closing `</x-dc>` → the screens. `<sc-if value="{{ isX }}">` blocks = one app screen each (library/craft room, pattern, import, importing, review, find, stash, bench, community, profile, paywall + overlays: chat, welcome, coach marks, vault celebration, share composer).
- `<script data-dc-script>` → the interaction logic (plain JS class). State shapes, calculator math, chat tree, sort logic — port these behaviors, not the framework.
- `{{ name }}` holes = dynamic values fed from the logic class `renderVals()`.

## Files
- `Wovely App 2b.dc.html` — the app, ALL core-loop surfaces (largest, start here)
- `Wovely Landing.dc.html` — marketing funnel (# → #try → #signup → #fork → #checkout → #done)
- `Wovely Pricing.dc.html` — pricing page (annual/monthly toggle)
- `Wovely Emails.dc.html` — win-back email design (day-10; day-24 variant noted inline)
- `Wovely Handbook.dc.html` — design-decision rationale (reference, not a build target)
- `Wovely Responsive Spec.dc.html` — all pages × desktop/tablet/mobile behavior

Canon (pricing, Bev voice, build order) lives in the Obsidian vault: `Wovely Vault/`.
Bev artwork rule: only `assets/bev.png` / `assets/bev-hero.png` are approved. Nothing new without Adam.