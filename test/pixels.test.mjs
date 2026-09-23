import { test } from "node:test";
import assert from "node:assert/strict";
import { metaEventFor, shouldLoad, PIXELS } from "../src/utils/pixels.js";

const win = (host, webdriver = false) => ({ location: { hostname: host }, navigator: { webdriver } });

test("the Wovely dataset is set and is not the 2ndBrain one", () => {
  assert.equal(PIXELS.meta, "1094637423151254");
  assert.equal(PIXELS.ga4, "");
  assert.equal(PIXELS.google, "AW-18410615088");
  assert.notEqual(PIXELS.meta, "2688987694849962");
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
