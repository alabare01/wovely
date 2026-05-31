// Screenshot harness entry point.
//
//   node screenshots/run.js              full suite (all tiers, both viewports)
//   node screenshots/run.js --quick      logged-out + craft tier, desktop only
//   node screenshots/run.js --reseed     wipe & re-seed loaded accounts first
//
// Steps: ensure 6 test accounts → seed loaded accounts → capture.

import { chromium } from "playwright";
import { VIEWPORTS, ACCOUNTS, accountByKey, OUTPUT_ROOT, RUN_DATE } from "./config.js";
import { env } from "./lib/env.js";
import { ensureAccounts } from "./lib/accounts.js";
import { seedPatterns } from "./lib/seed.js";
import { seedAuditFixtures } from "./seed-audit.mjs";
import { signIn } from "./lib/session.js";
import {
  firstPatternId, patternIdWithCharts, firstCollectionId,
  patternIdByTitlePrefix, mkalCollectionId, listPatternsMeta, chartPatternIds,
} from "./lib/supabase-admin.js";
import { INLINE_SECTION_MAX } from "../src/utils/docType.js";
import { captureTarget, totalShots, failuresLogPath } from "./lib/capture.js";

const args = new Set(process.argv.slice(2));
const QUICK = args.has("--quick");
const RESEED = args.has("--reseed");

const log = (...a) => console.log(...a);
const hr = () => log("─".repeat(64));

async function buildLoggedInTarget(acct) {
  const account = { ...acct, userId: acct.userId };
  const target = {
    authState: "logged-in",
    tier: acct.tier,
    loadState: acct.loaded ? "loaded" : "empty",
    account,
    ids: {},
  };
  try {
    target.session = await signIn(acct.email, env.TEST_PASSWORD);
  } catch (e) {
    log(`  ✗ sign-in failed for ${acct.email}: ${e.message}`);
    return null;
  }
  if (acct.loaded) {
    target.ids.firstPattern = await firstPatternId(acct.userId).catch(() => null);
    target.ids.chartPattern = await patternIdWithCharts(acct.userId).catch(() => null);
    // Prefer the reconstructed MKAL collection (chart-bearing clues) for the
    // collection-detail capture; fall back to any collection the account has.
    target.ids.collection =
      (await mkalCollectionId(acct.userId).catch(() => null)) ||
      (await firstCollectionId(acct.userId).catch(() => null));

    if (acct.tier === "craft") {
      // Hub capture needs a multi-section object (>INLINE_SECTION_MAX parts);
      // inline-tab capture needs a genuinely inline pattern (≤max parts, no
      // charts). firstPattern is now a hub object post-S76, so resolve both
      // explicitly from pattern metadata.
      const [meta, charts] = await Promise.all([
        listPatternsMeta(acct.userId).catch(() => []),
        chartPatternIds(acct.userId).catch(() => new Set()),
      ]);
      target.ids.hubPattern =
        (await patternIdByTitlePrefix(acct.userId, "Blooming Daisy").catch(() => null)) ||
        (meta.find((p) => p.sections > INLINE_SECTION_MAX)?.id ?? null);
      const inline = meta.find(
        (p) => p.sections >= 1 && p.sections <= INLINE_SECTION_MAX && !charts.has(p.id) && p.id !== target.ids.hubPattern && !p.inCollection,
      );
      target.ids.inlinePattern = inline?.id ?? null;
    }
  }
  return target;
}

async function main() {
  const started = Date.now();
  hr();
  log(`Wovely screenshot harness  ·  ${RUN_DATE}  ·  ${QUICK ? "QUICK" : "FULL"}${RESEED ? " · RESEED" : ""}`);
  log(`Target: ${process.env.SCREENSHOT_BASE_URL || "https://wovely.app"}`);
  log(`Output: ${OUTPUT_ROOT}/${RUN_DATE}`);
  hr();

  log("Ensuring test accounts…");
  const accountsMap = await ensureAccounts(log);

  hr();
  log("Seeding patterns…");
  await seedPatterns(accountsMap, { reseed: RESEED, log });

  hr();
  log("Seeding S77 audit fixtures (Craft hub + MKAL collection)…");
  await seedAuditFixtures(log);

  hr();
  log("Preparing capture targets…");

  // Logged-out target (no account).
  const targets = [{ authState: "logged-out" }];

  // Logged-in targets — enrich the ensured accounts with userId, session, ids.
  const wanted = QUICK ? ACCOUNTS.filter((a) => a.tier === "craft") : ACCOUNTS;
  for (const a of wanted) {
    const enriched = { ...a, userId: accountsMap[a.key].userId };
    const t = await buildLoggedInTarget(enriched);
    if (t) targets.push(t);
  }

  const viewports = QUICK ? VIEWPORTS.filter((v) => v.name === "desktop") : VIEWPORTS;
  const total = totalShots(targets, viewports);
  log(`Planned ${total} screenshots across ${targets.length} targets × ${viewports.length} viewport(s).`);

  hr();
  const browser = await chromium.launch();
  const counter = { n: 0 };
  let ok = 0, fail = 0;
  try {
    for (const vp of viewports) {
      for (const target of targets) {
        const res = await captureTarget(browser, target, vp, { counter, total, log });
        ok += res.ok; fail += res.fail;
      }
    }
  } finally {
    await browser.close();
  }

  hr();
  const secs = Math.round((Date.now() - started) / 1000);
  log(`Done in ${secs}s — ${ok} captured, ${fail} failed.`);
  if (fail > 0) log(`Failures logged to ${failuresLogPath()}`);
  log(`Screenshots: ${OUTPUT_ROOT}/${RUN_DATE}`);
}

main().catch((e) => {
  console.error("\nFatal:", e.message);
  process.exit(1);
});
