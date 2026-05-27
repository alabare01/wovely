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
import { storageStateFor } from "./session.js";

const NAV_TIMEOUT = 45_000;
const SETTLE_MS = 1_800;

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

// Click the first locator (from a list of candidates) that is visible. Patient
// and scroll-aware: mobile pages render slower and elements often sit below the
// fold, so we wait generously and scroll the target into view before clicking.
async function clickFirstVisible(page, candidates, { timeout = 9_000 } = {}) {
  for (const c of candidates) {
    const loc = (typeof c === "function" ? c(page) : page.locator(c)).first();
    try {
      await loc.waitFor({ state: "visible", timeout });
      await loc.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
      await loc.click({ timeout: 5_000 });
      return true;
    } catch { /* try next */ }
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

  if (loadState === "loaded" && ids.firstPattern) {
    if (tier === "craft") {
      steps.push(
        { name: "pattern-detail-materials", path: `/pattern/${ids.firstPattern}`, prepare: openTab("Materials") },
        { name: "pattern-detail-instructions", path: `/pattern/${ids.firstPattern}`, prepare: openTab("Instructions/Rows") },
        { name: "pattern-detail-notes", path: `/pattern/${ids.firstPattern}`, prepare: openTab("My Notes") },
      );
    } else {
      steps.push({ name: "pattern-detail", path: `/pattern/${ids.firstPattern}` });
    }
  }

  // Craft-loaded is the "full feature" account: charts/lightbox, collections,
  // the add-pattern modal, and the secondary tool views.
  if (tier === "craft" && loadState === "loaded") {
    if (ids.chartPattern) {
      steps.push({ name: "pattern-detail-lightbox", path: `/pattern/${ids.chartPattern}`, prepare: openLightbox });
    }
    if (ids.collection) {
      steps.push({ name: "collection-detail", path: `/collections/${ids.collection}` });
    }
    steps.push({ name: "add-pattern-modal-open", path: "/", prepare: openAddPatternModal });
    for (const [name, p] of [
      ["builds", "/builds"], ["browse", "/browse"], ["stash", "/stash"],
      ["tools", "/tools"], ["stitch-check", "/stitch-check"], ["shopping", "/shopping"],
    ]) {
      steps.push({ name, path: p });
    }
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
    contextOpts.storageState = storageStateFor(target.session, target.tier);
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
    try {
      await gotoStable(page, step.path);
      if (step.prepare) await step.prepare(page, vp);
      const out = outPathFor(target, vp.name, step.name);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, fullPage: true, animations: "disabled" });
      log(`  ✓ ${tag}`);
      ok += 1;
    } catch (e) {
      log(`  ✗ ${tag} — ${e.message}`);
      logFailure(`${new Date().toISOString()}  ${vp.name} ${label} ${step.name} (${step.path}) :: ${e.message}`);
      fail += 1;
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
