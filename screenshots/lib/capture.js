// Capture engine: given a target (auth state + tier + load state) and a viewport,
// navigates each route, prepares any modal/tab/lightbox state, and writes a
// full-page screenshot under the naming convention:
//
//   logged-in : [date]/[viewport]/logged-in/[tier]/[load-state]/[route-name].png
//   logged-out: [date]/[viewport]/logged-out/[route-name].png
//
// Each shot is isolated: a failure is logged to _failures.log and the run
// continues with the next shot.

import fs from "node:fs";
import path from "node:path";
import { BASE_URL, OUTPUT_ROOT, RUN_DATE } from "../config.js";
import { storageStateFor, signIn } from "./session.js";
import { env } from "./env.js";

const NAV_TIMEOUT = 45_000;
const SETTLE_MS = 2_400; // mobile (deviceScaleFactor 2) hydrates ~4s; give content time to mount

// ─── small DOM helpers ─────────────────────────────────────────────────────
async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

async function gotoStable(page, routePath) {
  const url = BASE_URL + routePath;
  await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT }).catch(async () => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }).catch(() => {});
  });
  await settle(page);
}

// The app boots the logged-out landing for a beat while it restores the injected
// session; under load (the last contexts of a full run) that flash can outlast
// `settle`, so a logged-in capture would otherwise snap the landing / an empty
// pre-auth view. Wait until the landing's signup CTA is gone before proceeding.
async function awaitAuthed(page) {
  await page.waitForFunction(() => {
    const t = (document.body && document.body.innerText) || "";
    return !/no signup required|create my free account|continue with google|no credit card needed/i.test(t);
  }, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(400);
}

// Click the first VISIBLE locator from a list of candidates. Patient and
// scroll-aware: mobile pages render slower and elements often sit below the
// fold, so we wait generously and scroll the target into view before clicking.
// Scans every match of each candidate — not just .first() — because some
// controls (the feedback heart, the add-pattern "+" button) are mounted in BOTH
// the desktop and mobile headers, one of which is display:none for the current
// viewport; .first() can land on the hidden instance.
async function clickFirstVisible(page, candidates, { timeout = 12_000, force = false } = {}) {
  for (const c of candidates) {
    const base = typeof c === "function" ? c(page) : page.locator(c);
    let n = 0;
    try { n = await base.count(); } catch { n = 0; }
    const tries = Math.max(n, 1); // when nothing matches yet, still wait once for it to appear
    for (let i = 0; i < tries; i++) {
      const loc = n ? base.nth(i) : base.first();
      try {
        await loc.waitFor({ state: "visible", timeout: i === 0 ? timeout : 2_000 });
        await loc.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
        // force bypasses the stability check for controls with a perpetual CSS
        // animation (e.g. the feedback heart's pulse), which never settles.
        await loc.click({ timeout: 5_000, force });
        return true;
      } catch { /* next match / candidate */ }
    }
  }
  return false;
}

// ─── prepare steps (mutate on-page state before the screenshot) ──────────────
async function switchToSignIn(page) {
  const ok = await clickFirstVisible(page, [
    (p) => p.getByText(/^sign in$/i),
    (p) => p.getByText(/already have an account/i),
    (p) => p.getByRole("button", { name: /sign in/i }),
  ]);
  if (!ok) throw new Error("could not find sign-in toggle");
  await page.waitForTimeout(700);
}

function openTab(label) {
  return async (page) => {
    // Let any late post-load re-render settle first — the pattern-detail view
    // re-inits its active tab from a fetch shortly after mount, which can
    // otherwise revert a too-early click back to the default Materials tab.
    await page.waitForTimeout(1_600);
    const click = async () => {
      const ok = await clickFirstVisible(page, [
        (p) => p.getByRole("button", { name: label, exact: true }),
        (p) => p.getByText(label, { exact: true }),
      ]);
      if (!ok) throw new Error(`tab "${label}" not found`);
    };
    await click();
    await page.waitForTimeout(800);
    // Verify the switch took. "Yarn Summary" is a Materials-only marker; if it's
    // still visible when we asked for another tab, a late re-render reverted us
    // — re-click until it sticks.
    if (label !== "Materials") {
      for (let i = 0; i < 3; i++) {
        const reverted = await page.getByText(/Yarn Summary/i).first().isVisible().catch(() => false);
        if (!reverted) break;
        await page.waitForTimeout(700);
        await click();
        await page.waitForTimeout(700);
      }
    }
  };
}

async function openLightbox(page) {
  await page.waitForTimeout(1_200);
  // Thumbnails carry an aria-label like "Crochet chart for ..."; the <img> alt
  // matches too. They sit in the charts strip below the hero — clickFirstVisible
  // scrolls them into view.
  const ok = await clickFirstVisible(page, [
    (p) => p.locator('[aria-label*="hart" i]'),     // (c)hart
    (p) => p.locator('img[alt*="hart" i]'),
    (p) => p.locator('[aria-label*="lossary" i]'),  // (g)lossary
    (p) => p.locator('img[alt*="lossary" i]'),
  ], { timeout: 12_000 });
  if (!ok) throw new Error("no chart thumbnail to open lightbox");
  // Wait for the fullscreen lightbox overlay to mount.
  await page.waitForTimeout(1_400);
}

async function openUpgradeModal(page) {
  await page.waitForTimeout(500);
  const ok = await clickFirstVisible(page, [
    (p) => p.getByRole("button", { name: /upgrade/i }),
    (p) => p.getByText(/see plans/i),
    (p) => p.getByText(/go pro/i),
    (p) => p.getByText(/^upgrade/i),
  ]);
  if (!ok) throw new Error("no upgrade trigger found");
  // Confirm the tier modal actually opened (price text is a stable marker).
  await page.getByText(/\$4\.99|\$8\.99|pick the plan|pick a plan/i).first()
    .waitFor({ state: "visible", timeout: 6_000 });
  await page.waitForTimeout(500);
}

async function openAddPatternModal(page) {
  await page.waitForTimeout(900);
  // Open the add menu (desktop "Add Pattern" pill, mobile header "+" or the
  // right-edge "+ Add Pattern" FAB).
  const opened = await clickFirstVisible(page, [
    (p) => p.getByRole("button", { name: /^\+?\s*add pattern$/i }),
    (p) => p.getByRole("button", { name: "+", exact: true }),
    (p) => p.locator('button', { hasText: /^\+$/ }),
  ]);
  if (!opened) throw new Error("could not open add menu");
  await page.waitForTimeout(700);
  // Choose the PDF path.
  const pdf = await clickFirstVisible(page, [
    (p) => p.getByText(/add pdf/i),
    (p) => p.getByText(/upload.*extract/i),
  ]);
  if (!pdf) throw new Error("could not find 'Add PDF' menu item");
  await page.waitForTimeout(1_400);
}

// S76 Craft hub: confirm the parts-grid landing rendered (the hub-and-spoke
// section grid). "The parts" / "Tap one to work it" is the SectionHub header.
async function awaitHubLanding(page) {
  await page.getByText(/the parts|tap one to work it/i).first()
    .waitFor({ state: "visible", timeout: 12_000 });
  await page.waitForTimeout(800);
}

// S76 Craft hub scoped part view: from the parts grid, open the first real
// section card, then confirm the scoped view + persistent part-strip nav
// ("Part N of M") mounted.
async function openHubPart(page) {
  await awaitHubLanding(page);
  // Section cards are <button>s carrying a "N steps" / "Reference" metadata line
  // (reference-only chips are non-interactive <div>s and are skipped).
  const ok = await clickFirstVisible(page, [
    (p) => p.locator("button").filter({ hasText: /\d+\s+steps?$|^Reference$|\bstep\b/i }),
  ], { timeout: 12_000 });
  if (!ok) throw new Error("no section card to open the scoped part view");
  await page.getByText(/part\s+\d+\s+of\s+\d+/i).first()
    .waitFor({ state: "visible", timeout: 8_000 });
  await page.waitForTimeout(900);
}

// Feedback widget (open): the persistent heart FAB carries aria-label
// "Send feedback"; clicking it opens the feedback form overlay.
async function openFeedbackWidget(page) {
  await page.waitForTimeout(600);
  const ok = await clickFirstVisible(page, [
    (p) => p.getByLabel(/send feedback/i),
    (p) => p.getByText(/talk to us/i),
  ], { force: true });
  if (!ok) throw new Error("could not find feedback heart");
  // The form's submit button ("Send Feedback") is a stable open-state marker.
  await page.getByRole("button", { name: /send feedback/i }).first()
    .waitFor({ state: "visible", timeout: 6_000 });
  await page.waitForTimeout(500);
}

// Import flow mid-extraction (BevCorner / Bev loading state). The ImportPill
// renders its processing UI (Bev avatar + spinning ring + phase copy) purely
// from sessionStorage('wovely_active_import_job') + a polled /api/job-status.
// We never start a real import: we seed the session key and stub job-status to a
// stable "extracting" phase, exercising the real component deterministically.
// Runs on an isolated page (see routesFor: isolate) so the stub never bleeds
// into other shots.
async function setupImportPill(page) {
  await page.route("**/api/job-status/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "audit-demo-job",
        status: "processing",
        current_phase: "extracting",
        phase_timestamps: {},
        created_at: new Date(Date.now() - 14_000).toISOString(),
        started_at: new Date(Date.now() - 14_000).toISOString(),
        file_type: "pdf",
      }),
    }),
  );
  await page.addInitScript(() => {
    try { sessionStorage.setItem("wovely_active_import_job", "audit-demo-job"); } catch {}
  });
}

async function awaitImportPill(page) {
  // Bev's avatar (alt="Bev") is the anchor of the processing pill.
  await page.locator('img[alt="Bev"]').first().waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(900);
}

// ─── route plan ──────────────────────────────────────────────────────────────
export function routesFor(target) {
  if (target.authState === "logged-out") {
    return [
      { name: "landing-signup", path: "/" },
      { name: "sign-in", path: "/", prepare: switchToSignIn },
      { name: "privacy", path: "/privacy" },
      { name: "terms", path: "/terms" },
    ];
  }

  const { tier, loadState, ids } = target;
  const steps = [
    { name: "my-wovely", path: "/" },
    { name: "account-settings", path: "/profile" },
  ];

  // Free tier: capture the upgrade/pricing modal (there is no /pricing route;
  // pricing lives in the tier comparison modal). Desktop-only — the profile
  // page exposes no reliable upgrade trigger on mobile.
  if (tier === "free") {
    steps.push({ name: "pricing-upgrade-modal", path: "/profile", prepare: openUpgradeModal, desktopOnly: true });
  }

  if (loadState === "loaded") {
    if (tier === "craft") {
      // Inline single-pattern detail. Post-S76 a Craft user sees the hub-and-
      // spoke renderer for any pattern with >3 sections, so the inline tab views
      // must target a genuinely inline pattern (≤3 sections, no charts) — NOT
      // ids.firstPattern, which is now a multi-section object rendered as a hub.
      const inlineId = ids.inlinePattern || ids.firstPattern;
      if (inlineId) {
        steps.push(
          { name: "pattern-detail-materials", path: `/pattern/${inlineId}`, prepare: openTab("Materials") },
          { name: "pattern-detail-instructions", path: `/pattern/${inlineId}`, prepare: openTab("Instructions/Rows") },
          { name: "pattern-detail-notes", path: `/pattern/${inlineId}`, prepare: openTab("My Notes") },
        );
      }
    } else if (ids.firstPattern) {
      steps.push({ name: "pattern-detail", path: `/pattern/${ids.firstPattern}` });
    }
  }

  // Craft-loaded is the "full feature" account: the S76 Craft hub, charts/
  // lightbox, collections, the add-pattern modal, and the secondary tool views.
  if (tier === "craft" && loadState === "loaded") {
    // S76 Craft hub (NEW): parts-grid landing + scoped part view (part-strip nav).
    if (ids.hubPattern) {
      steps.push(
        { name: "craft-hub-landing", path: `/pattern/${ids.hubPattern}`, prepare: awaitHubLanding },
        { name: "craft-hub-part", path: `/pattern/${ids.hubPattern}`, prepare: openHubPart },
      );
    }
    if (ids.chartPattern) {
      steps.push({ name: "pattern-detail-lightbox", path: `/pattern/${ids.chartPattern}`, prepare: openLightbox });
    }
    if (ids.collection) {
      steps.push({ name: "collection-detail", path: `/collections/${ids.collection}` });
    }
    steps.push({ name: "add-pattern-modal-open", path: "/", prepare: openAddPatternModal });
    steps.push({ name: "feedback-widget-open", path: "/", prepare: openFeedbackWidget });
    for (const [name, p] of [
      ["builds", "/builds"], ["browse", "/browse"], ["stash", "/stash"],
      ["tools", "/tools"], ["stitch-check", "/stitch-check"], ["shopping", "/shopping"],
    ]) {
      steps.push({ name, path: p });
    }
    // Import mid-extraction / BevCorner loading (NEW). Isolated so its job-status
    // stub + session key never affect any other shot.
    steps.push({ name: "import-bev-loading", path: "/", isolate: true, setup: setupImportPill, prepare: awaitImportPill });
  }

  return steps;
}

// ─── output path ─────────────────────────────────────────────────────────────
function outPathFor(target, viewportName, routeName) {
  const parts = [OUTPUT_ROOT, RUN_DATE, viewportName, target.authState];
  if (target.authState === "logged-in") parts.push(target.tier, target.loadState);
  parts.push(`${routeName}.png`);
  return path.join(...parts);
}

export function failuresLogPath() {
  return path.join(OUTPUT_ROOT, RUN_DATE, "_failures.log");
}

function logFailure(entry) {
  const file = failuresLogPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, entry + "\n");
}

// ─── capture one target × viewport ───────────────────────────────────────────
export async function captureTarget(browser, target, vp, { counter, total, log }) {
  const contextOpts = {
    viewport: vp.viewport,
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
  };
  if (vp.userAgent) contextOpts.userAgent = vp.userAgent;
  if (target.authState === "logged-in") {
    // Fresh session per (target × viewport): targets are built once at the start
    // of the run, so by the time the last contexts execute the cached token is
    // ~10 min stale. Re-signing in here keeps every context cleanly authed.
    let session = target.session;
    try { session = await signIn(target.account.email, env.TEST_PASSWORD); }
    catch { /* fall back to the pre-built session */ }
    contextOpts.storageState = storageStateFor(session, target.tier);
  }

  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  const label = target.authState === "logged-in"
    ? `${target.tier}/${target.loadState}`
    : "logged-out";

  let ok = 0, fail = 0;
  const steps = routesFor(target).filter((s) => !(s.desktopOnly && vp.name !== "desktop"));
  for (const step of steps) {
    counter.n += 1;
    const tag = `[${String(counter.n).padStart(3)}/${total}] ${vp.name} · ${label} · ${step.name}`;
    // Isolated steps (e.g. the import-pill stub) get their own page in the same
    // (still-authenticated) context so their route stubs / init scripts never
    // bleed into other shots.
    const stepPage = step.isolate ? await context.newPage() : page;
    try {
      if (step.setup) await step.setup(stepPage, vp);
      await gotoStable(stepPage, step.path);
      if (target.authState === "logged-in") await awaitAuthed(stepPage);
      if (step.prepare) await step.prepare(stepPage, vp);
      const out = outPathFor(target, vp.name, step.name);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await stepPage.screenshot({ path: out, fullPage: true, animations: "disabled" });
      log(`  ✓ ${tag}`);
      ok += 1;
    } catch (e) {
      log(`  ✗ ${tag} — ${e.message}`);
      logFailure(`${new Date().toISOString()}  ${vp.name} ${label} ${step.name} (${step.path}) :: ${e.message}`);
      // Save what was on screen at failure time for diagnosis.
      try {
        const dbg = outPathFor(target, vp.name, `${step.name}__FAILED`);
        fs.mkdirSync(path.dirname(dbg), { recursive: true });
        await stepPage.screenshot({ path: dbg, fullPage: true, animations: "disabled" });
      } catch { /* best effort */ }
      fail += 1;
    } finally {
      if (step.isolate) await stepPage.close().catch(() => {});
    }
  }

  await context.close();
  return { ok, fail };
}

// Count total shots up front so progress shows "N of M" (respects desktopOnly).
export function totalShots(targets, viewports) {
  let n = 0;
  for (const vp of viewports) {
    for (const t of targets) {
      n += routesFor(t).filter((s) => !(s.desktopOnly && vp.name !== "desktop")).length;
    }
  }
  return n;
}
