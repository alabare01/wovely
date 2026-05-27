// Central configuration for the Wovely screenshot harness.
// Everything that changes between sprints (routes, accounts, viewports, seed
// sources) lives here so the engine code stays stable. See README.md.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ─── Target ──────────────────────────────────────────────────────────────────
export const BASE_URL = process.env.SCREENSHOT_BASE_URL || "https://wovely.app";

// ─── Viewports ───────────────────────────────────────────────────────────────
// Desktop is a standard laptop; mobile matches the iPhone 14 Pro logical size.
// isMobile/hasTouch make Chromium render the true mobile layout (not just a
// narrow desktop), which is an explicit acceptance criterion.
export const VIEWPORTS = [
  {
    name: "desktop",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
];

// ─── Test accounts ───────────────────────────────────────────────────────────
// All six share PLAYWRIGHT_TEST_PASSWORD (.env.local). `loaded` accounts get
// patterns seeded; `empty` accounts stay empty to capture empty states.
const ACCOUNT = (key, tier, loaded) => ({
  key,
  email: `alabare+pw-${key}@gmail.com`,
  tier,
  loaded,
});

export const ACCOUNTS = [
  ACCOUNT("free-empty", "free", false),
  ACCOUNT("free-loaded", "free", true),
  ACCOUNT("pro-empty", "pro", false),
  ACCOUNT("pro-loaded", "pro", true),
  ACCOUNT("craft-empty", "craft", false),
  ACCOUNT("craft-loaded", "craft", true),
];

export const accountByKey = (key) => ACCOUNTS.find((a) => a.key === key);

// ─── Pattern PDFs (real-upload seeding for pro/craft loaded) ─────────────────
// Adam's standard test PDFs. Default location is the OneDrive-redirected
// Desktop; override with PATTERNS_DIR if they live elsewhere.
export function resolvePatternsDir() {
  const candidates = [
    process.env.PATTERNS_DIR,
    path.join(os.homedir(), "OneDrive", "Desktop", "Patterns"),
    path.join(os.homedir(), "Desktop", "patterns"),
    path.join(os.homedir(), "Desktop", "Patterns"),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[candidates.length - 1];
}

// 3 PDFs uploaded per real-upload (pro/craft) loaded account. Kept to 3 so the
// live extraction wait stays manageable; bump to 4 if you want denser libraries.
export const UPLOAD_PDFS = [
  "HoneyBeeCrochetPattern.pdf",
  "Woobles Warden.pdf",
  "SUNNY_BLANKET_ENG.pdf",
];

// ─── DB-clone sources (free-loaded account) ──────────────────────────────────
// Real extracted patterns copied into the free-loaded account. Chosen for rich,
// varied content (full materials + multi-row instructions + covers + notes).
// IDs verified against the patterns table on 2026-05-26.
export const FREE_CLONE_SOURCE_IDS = [
  "26da7da0-534d-42b3-a3b7-394b640ce008", // MARINA THE MANATEE — 13 materials, 106 rows
  "b36383b8-3015-449e-afb6-d7de36c9afad", // Warden — 8 materials, 31 rows, 8 images
  "965b8bba-2708-4e8e-9228-42667bc6fd3f", // The Booty Bee — 11 materials, 62 rows
];

// Chart-bearing pattern cloned into craft-loaded so the chart lightbox always
// has content to open (craft is the only tier that displays charts).
export const CRAFT_CHART_SOURCE_ID = "f7befc1e-b4ed-45e5-ba90-968299c9e5e6"; // Clue #2 — 2 charts

// ─── Output ──────────────────────────────────────────────────────────────────
// The screenshots/ directory itself (this file's directory).
export const OUTPUT_ROOT = path.dirname(fileURLToPath(import.meta.url));
// Date stamp (YYYY-MM-DD) for the run's output folder.
export const RUN_DATE = process.env.SCREENSHOT_DATE || new Date().toISOString().slice(0, 10);
