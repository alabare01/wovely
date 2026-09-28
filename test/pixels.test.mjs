import { test } from "node:test";
import assert from "node:assert/strict";
import { metaEventFor, shouldLoad, PIXELS } from "../src/utils/pixels.js";

const win = (host, webdriver = false) => ({ location: { hostname: host }, navigator: { webdriver } });

test("the Wovely dataset is set and is not the 2ndBrain one", () => {
  assert.equal(PIXELS.meta, "1094637423151254");
  assert.notEqual(PIXELS.meta, "2688987694849962");
  // Meta only: 2ndBrain's Google Ads tag (AW-18410615088) must never load on Wovely
  assert.deepEqual(Object.keys(PIXELS), ["meta"]);
  assert.ok(!JSON.stringify(PIXELS).includes("AW-18410615088"));
});

test("page views and the three conversions map to Meta's standard events", () => {
  assert.deepEqual(metaEventFor("$pageview", {}), ["PageView"]);
  assert.deepEqual(metaEventFor("email_captured", { source: "x" }), ["Lead"]);
  assert.deepEqual(metaEventFor("user_signed_up", {}), ["CompleteRegistration"]);
});

test("Purchase only fires on a database-confirmed paid tier", () => {
  assert.deepEqual(metaEventFor("upgrade_entitlement_check", { tier: "craft", paid: true }), ["Purchase", { currency: "USD", content_name: "craft" }]);
  assert.equal(metaEventFor("upgrade_entitlement_check", { tier: null, paid: false }), null);
  assert.equal(metaEventFor("upgrade_completed", { had_session: true }), null, "the redirect param alone is not a purchase");
});

test("unmapped events are not mirrored", () => {
  assert.equal(metaEventFor("stitch_check_run", {}), null);
  assert.equal(metaEventFor("$autocapture", {}), null);
});

test("never loads for automation, local, previews or the native shell", () => {
  assert.equal(shouldLoad({ window: win("wovely.app") }), true);
  assert.equal(shouldLoad({ window: win("www.wovely.app") }), true);
  assert.equal(shouldLoad({ window: win("wovely.app", true) }), false);
  assert.equal(shouldLoad({ window: win("localhost") }), false);
  assert.equal(shouldLoad({ window: win("wovely-abc.vercel.app") }), false);
  assert.equal(shouldLoad({ window: win("wovely.app"), native: true }), false);
});

test("GA4 is dormant until Wovely's own id is configured, and never takes a 2ndBrain id", async () => {
  const { GA4_ID, ga4IdFrom } = await import("../src/utils/pixels.js");
  assert.equal(GA4_ID, "", "no VITE_GA4_ID in tests, so nothing Google loads");
  assert.equal(ga4IdFrom("G-KYJ4D76JVN"), "", "2ndBrain's GA4 id is refused");
  assert.equal(ga4IdFrom("AW-18410615088"), "", "a Google Ads id is not a GA4 id");
  assert.equal(ga4IdFrom("garbage"), "");
  assert.equal(ga4IdFrom(" G-ABC123XYZ9 "), "G-ABC123XYZ9");
});

test("the buyer path maps to GA4 recommended events", async () => {
  const { ga4EventFor } = await import("../src/utils/pixels.js");
  assert.equal(ga4EventFor("$pageview", { $pathname: "/tools" })[0], "page_view");
  assert.equal(ga4EventFor("email_captured", {})[0], "generate_lead");
  assert.equal(ga4EventFor("user_signed_up", {})[0], "sign_up");
  assert.equal(ga4EventFor("checkout_started", { tier: "craft", cadence: "annual" })[0], "begin_checkout");
  assert.equal(ga4EventFor("upgrade_entitlement_check", { paid: true, tier: "craft" })[0], "purchase");
  assert.equal(ga4EventFor("upgrade_entitlement_check", { paid: false }), null);
  assert.equal(ga4EventFor("upgrade_completed", {}), null, "the redirect param alone is not a purchase");
});
