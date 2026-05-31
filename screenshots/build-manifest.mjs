// node screenshots/build-manifest.mjs [outputDir]
//
// Scans a capture output folder (default audit-s77/) and writes MANIFEST.md:
//   1. the S77 required-screen checklist, mapped to the captured file at each
//      viewport (flags anything missing);
//   2. a full inventory grouped by screen, then device.
//
// Pure filesystem read of the PNGs the harness produced — no app/network calls.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.resolve(REPO, process.argv[2] || "audit-s77");
const VIEWPORTS = ["desktop", "mobile"];

// Walk the capture tree → records: { viewport, group, route, rel }.
// Path shape: <viewport>/logged-out/<route>.png
//             <viewport>/logged-in/<tier>/<loadState>/<route>.png
function collect() {
  const recs = [];
  for (const vp of VIEWPORTS) {
    const base = path.join(OUT_DIR, vp);
    if (!fs.existsSync(base)) continue;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".png")) {
          const rel = path.relative(OUT_DIR, full).replace(/\\/g, "/");
          const parts = rel.split("/"); // [vp, auth, (tier, load), route.png]
          const route = parts[parts.length - 1].replace(/\.png$/, "");
          const ctx = parts.slice(1, -1).join("/"); // auth[/tier/load]
          recs.push({ viewport: vp, group: ctx, route, rel });
        }
      }
    };
    walk(base);
  }
  return recs;
}

// Audit-required screens → the harness route that satisfies each, with the
// context group it lives under. order = triage order from the task list.
const REQUIRED = [
  { n: 1, screen: "Auth — login", group: "logged-out", route: "sign-in" },
  { n: 2, screen: "Auth — signup (landing)", group: "logged-out", route: "landing-signup" },
  { n: 3, screen: "Empty state — zero patterns (activation-leak)", group: "logged-in/craft/empty", route: "my-wovely" },
  { n: 4, screen: "Dashboard with patterns (two-column grid)", group: "logged-in/craft/loaded", route: "my-wovely" },
  { n: 5, screen: "Pattern detail — inline single (Materials)", group: "logged-in/craft/loaded", route: "pattern-detail-materials" },
  { n: 5, screen: "Pattern detail — inline single (Instructions)", group: "logged-in/craft/loaded", route: "pattern-detail-instructions" },
  { n: 5, screen: "Pattern detail — inline single (My Notes)", group: "logged-in/craft/loaded", route: "pattern-detail-notes" },
  { n: 6, screen: "Craft hub — parts-grid landing (NEW S76)", group: "logged-in/craft/loaded", route: "craft-hub-landing" },
  { n: 7, screen: "Craft hub — scoped part view + part-strip (NEW S76)", group: "logged-in/craft/loaded", route: "craft-hub-part" },
  { n: 8, screen: "Add Pattern modal — initial state", group: "logged-in/craft/loaded", route: "add-pattern-modal-open" },
  { n: 9, screen: "Import flow — mid-extraction BevCorner loading", group: "logged-in/craft/loaded", route: "import-bev-loading" },
  { n: 10, screen: "Chart lightbox (open)", group: "logged-in/craft/loaded", route: "pattern-detail-lightbox" },
  { n: 11, screen: "Collection view (Arcoiris MCAL, reconstructed)", group: "logged-in/craft/loaded", route: "collection-detail" },
  { n: 12, screen: "Feedback widget (open)", group: "logged-in/craft/loaded", route: "feedback-widget-open" },
];

function findRec(recs, group, route, vp) {
  return recs.find((r) => r.group === group && r.route === route && r.viewport === vp);
}

function build() {
  const recs = collect();
  const L = [];
  L.push("# Wovely S77 Audit — Screenshot Manifest", "");
  L.push(`Captured against **https://wovely.app** (production, S76 document-type architecture).`);
  L.push(`Viewports: **desktop 1440×900** · **mobile 390×844 (iPhone Safari UA)**. No iPad.`);
  L.push(`Output folder: \`audit-s77/<viewport>/<auth>[/<tier>/<load-state>]/<route>.png\``, "");
  L.push(`Total files: **${recs.length}** (${recs.filter((r) => r.viewport === "desktop").length} desktop · ${recs.filter((r) => r.viewport === "mobile").length} mobile).`, "");

  // ── 1. Required-screen checklist ──
  L.push("## 1. Required screens (triage order)", "");
  L.push("Each row is one audit-required screen, with its file at each viewport. ✅ = present, ❌ = missing.", "");
  L.push("| # | Screen | Desktop | Mobile |", "|---|---|---|---|");
  let missing = 0;
  for (const req of REQUIRED) {
    const d = findRec(recs, req.group, req.route, "desktop");
    const m = findRec(recs, req.group, req.route, "mobile");
    if (!d) missing++;
    if (!m) missing++;
    const cell = (rec) => (rec ? `\`${rec.rel}\`` : "❌ missing");
    L.push(`| ${req.n} | ${req.screen} | ${cell(d)} | ${cell(m)} |`);
  }
  L.push("");
  L.push(missing === 0
    ? "**All required screens captured at both viewports.**"
    : `**⚠ ${missing} required viewport(s) missing — see ❌ above and \`_failures.log\`.**`);
  L.push("");

  // ── 2. Full inventory grouped by screen then device ──
  L.push("## 2. Full inventory (grouped by screen, then device)", "");
  // group key = `${group} · ${route}`
  const byScreen = new Map();
  for (const r of recs) {
    const key = `${r.group} · ${r.route}`;
    if (!byScreen.has(key)) byScreen.set(key, {});
    byScreen.get(key)[r.viewport] = r.rel;
  }
  const keys = [...byScreen.keys()].sort();
  L.push("| Screen (context · route) | Desktop | Mobile |", "|---|---|---|");
  for (const k of keys) {
    const v = byScreen.get(k);
    L.push(`| ${k} | ${v.desktop ? `\`${v.desktop}\`` : "—"} | ${v.mobile ? `\`${v.mobile}\`` : "—"} |`);
  }
  L.push("");

  // ── Notes ──
  L.push("## 3. Notes on test data", "");
  L.push("- **Read-only against prod.** Logged-in screens use the dedicated `alabare+pw-*` test accounts. Prod patterns were never mutated.");
  L.push("- **Craft hub source:** *Blooming Daisy* (prod `30c6908a`, 12 named parts) cloned into the craft-loaded test account — Warden `3a812d1e` has only 3 parts and renders inline, so it does not exercise the hub.");
  L.push("- **Collection (Arcoiris MCAL):** the audit's canonical collection `d195886a` and its clue IDs no longer exist in prod, so an equivalent `mkal` collection of chart-bearing clue children was reconstructed in the test account (real chart images → real ratios).");
  L.push("- **Import BevCorner loading:** captured by stubbing `/api/job-status` to a stable `extracting` phase on an isolated page — exercises the real ImportPill component without starting a real import.");

  const outFile = path.join(OUT_DIR, "MANIFEST.md");
  fs.writeFileSync(outFile, L.join("\n") + "\n");
  console.log(`Manifest written: ${outFile}`);
  console.log(`Files: ${recs.length} | Required missing viewports: ${missing}`);
}

build();
