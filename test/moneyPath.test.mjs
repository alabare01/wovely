// The money path: checkout, session lifetime, and tier coherence.
//
// WHY THIS FILE EXISTS
// Wovely had three separate call sites that POSTed /api/stripe-checkout, and
// every one of them swallowed its failures into console.error. A customer whose
// checkout died saw an unchanged page, concluded the button was broken, and
// left. There is no way to detect that from the outside, which is exactly what
// makes it expensive: the app cannot tell "nobody clicked" from "everybody
// clicked and it failed".
//
// Two of these are real unit tests against src/utils/checkout.js. The rest are
// source-level assertions, because App.jsx is JSX and supabase.js reads
// import.meta.env, so neither can be imported by node --test without a
// transform. Same technique as test/firstRun.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  requestCheckoutSession,
  CHECKOUT_GENERIC_MSG,
  CHECKOUT_NO_SESSION_MSG,
  CHECKOUT_NETWORK_MSG,
} from '../src/utils/checkout.js';
import { requiredTier, FEATURE_GATES } from '../src/utils/featureGates.js';
import { isPaidTier, TIER_PRO, TIER_CRAFT } from '../src/utils/tierUtils.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const APP = read('../src/App.jsx');
const SUPA = read('../src/supabase.js');
const CHECKOUT_API = read('../api/stripe-checkout.js');
const WEBHOOK_API = read('../api/stripe-webhook.js');
const IMPORT_JOB = read('../api/import-job.js');

const ok = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// ── 1. Silent checkout failures ──────────────────────────────────────────────

test('checkout: a happy path returns the url', async () => {
  const r = await requestCheckoutSession(
    { userId: 'u1', email: 'a@b.com', tier: 'craft', cadence: 'annual' },
    async () => ok({ url: 'https://checkout.stripe.com/x', tier: 'craft' }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://checkout.stripe.com/x');
});

test('checkout: every failure carries a user-facing message', async () => {
  const cases = [
    // No identity: the post-signup race where the JWT has not settled.
    { name: 'no identity', args: { userId: null, email: null }, fetch: async () => ok({}), expect: 'no_session' },
    // Network dead.
    { name: 'network', args: { userId: 'u', email: 'e' }, fetch: async () => { throw new Error('offline'); }, expect: 'network' },
    // Server said no, with copy of its own.
    { name: 'server error with message', args: { userId: 'u', email: 'e' }, fetch: async () => ok({ error: 'price_not_configured', message: 'Checkout is not set up yet.' }, 500), expect: 'price_not_configured' },
    // Server said no with raw Stripe text only. Must NOT be shown.
    { name: 'server error, no message', args: { userId: 'u', email: 'e' }, fetch: async () => ok({ error: 'No such price: price_123' }, 500), expect: 'No such price: price_123' },
    // Gateway timeout: HTML body, json() throws.
    { name: 'unparseable body', args: { userId: 'u', email: 'e' }, fetch: async () => ({ ok: false, status: 504, json: async () => { throw new Error('not json'); } }), expect: 'http_504' },
    // 200 with no url. This used to navigate the browser to "undefined".
    { name: '200 without url', args: { userId: 'u', email: 'e' }, fetch: async () => ok({ tier: 'craft' }), expect: 'no_url' },
  ];
  for (const c of cases) {
    const r = await requestCheckoutSession(c.args, c.fetch);
    assert.equal(r.ok, false, `${c.name} should fail`);
    assert.equal(r.code, c.expect, `${c.name} code`);
    assert.equal(typeof r.message, 'string', `${c.name} must carry a message`);
    assert.ok(r.message.length > 20, `${c.name} message must be real copy, got: ${r.message}`);
    assert.ok(!r.url, `${c.name} must not hand back a url`);
  }
});

test('checkout: raw Stripe exception text never reaches the customer', async () => {
  const r = await requestCheckoutSession(
    { userId: 'u', email: 'e' },
    async () => ok({ error: 'No such price: price_1QsomethingLive' }, 500),
  );
  assert.equal(r.ok, false);
  assert.ok(!r.message.includes('price_1QsomethingLive'), 'internal price id leaked into user copy');
  assert.equal(r.message, CHECKOUT_GENERIC_MSG);
});

test('checkout: failure copy says money did not move and names a next step', async () => {
  for (const msg of [CHECKOUT_GENERIC_MSG, CHECKOUT_NO_SESSION_MSG, CHECKOUT_NETWORK_MSG]) {
    assert.ok(/nothing has been charged/i.test(msg), `must reassure no charge: ${msg}`);
    assert.ok(/try again|sign out|email/i.test(msg), `must name a next step: ${msg}`);
  }
});

test('checkout: house style holds in customer-facing copy (no em dash, no exclamation)', () => {
  for (const msg of [CHECKOUT_GENERIC_MSG, CHECKOUT_NO_SESSION_MSG, CHECKOUT_NETWORK_MSG]) {
    assert.ok(!msg.includes('—'), `em dash in external copy: ${msg}`);
    assert.ok(!msg.includes('!'), `exclamation point in external copy: ${msg}`);
  }
});

test('checkout: /api/stripe-checkout is only ever called through the shared helper', () => {
  // Any hand-rolled fetch is a call site that can swallow a failure again.
  const stray = APP.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => line.includes('/api/stripe-checkout') && !line.trim().startsWith('//'));
  assert.deepEqual(stray, [], `hand-rolled checkout fetch in App.jsx at ${stray.map(([n]) => n).join(', ')}`);
  assert.ok(APP.includes('requestCheckoutSession'), 'App.jsx must use the shared checkout helper');
});

test('checkout: no call site discards the helper result', () => {
  // Three surfaces fire checkout. Each must set a failure state, not just log.
  for (const surface of ['plans_modal', 'post_signup', 'upgrade_intent']) {
    assert.ok(APP.includes(`surface: "${surface}"`) || APP.includes(`surface:"${surface}"`),
      `checkout surface ${surface} must report failures to analytics`);
  }
  assert.ok(APP.includes('setCheckoutFailure'), 'failures must reach a UI state');
  assert.ok(APP.includes('CheckoutFailurePanel'), 'a user-facing failure panel must exist');
  assert.ok(APP.includes('checkoutFailureOverlay'), 'the app-level failure surface must be rendered');
});

test('checkout: a stalled redirect is recoverable, not a dead spinner', () => {
  assert.ok(APP.includes('CHECKOUT_REDIRECT_WATCHDOG_MS'), 'redirect watchdog missing');
  assert.ok(APP.includes('redirect_stalled'), 'stalled redirect must be reported');
  assert.ok(APP.includes('Continue to checkout'), 'stalled redirect must offer a manual link');
});

test('checkout API: every failure response carries a customer-safe message', () => {
  // The `fail` helper is the only way out of an error branch.
  assert.ok(CHECKOUT_API.includes('const fail = (status, code, message)'), 'fail() helper missing');
  const rawReturns = CHECKOUT_API.match(/res\.status\(\d+\)\.json\(/g) || [];
  assert.deepEqual(rawReturns, [], 'error responses must go through fail(), which forces a message');
  assert.ok(!CHECKOUT_API.includes('error: err.message'), 'raw Stripe error text must not be returned to the client');
});

test('checkout API: a paid session can always be traced back to an account', () => {
  assert.ok(CHECKOUT_API.includes('client_reference_id: userId'),
    'checkout must set client_reference_id as a fallback carrier for the user id');
  assert.ok(WEBHOOK_API.includes('session.client_reference_id'),
    'webhook must fall back to client_reference_id when metadata is empty');
});

test('telemetry: upgrade_completed is separated from a confirmed entitlement', () => {
  // upgrade_completed fires off the ?upgrade=success redirect param alone, so
  // it proves the browser came back from Stripe and nothing more. The
  // entitlement check reports what the database actually says.
  assert.ok(APP.includes('upgrade_entitlement_check'),
    'a redirect-based upgrade_completed needs a database-backed counterpart');
});

// ── 2. Expired JWT dead end ──────────────────────────────────────────────────

test('session: the app can tell when its token expires', () => {
  assert.ok(SUPA.includes('export const sessionExpiresAt'), 'sessionExpiresAt missing');
  assert.ok(SUPA.includes('export const millisUntilExpiry'), 'millisUntilExpiry missing');
  assert.ok(SUPA.includes('export const refreshSession'), 'refreshSession missing');
});

test('session: refresh is deduped so two rotations cannot race each other', () => {
  // Supabase invalidates a refresh token the moment it is used. Two concurrent
  // rotations would have the loser rejected and log the user out.
  assert.ok(SUPA.includes('inFlightRefresh'), 'refreshSession must share one in-flight request');
});

test('session: a network failure is not treated as an expired session', () => {
  // Signing someone out because their wifi blinked is its own dead end.
  assert.ok(SUPA.includes('reason: "network"'), 'refreshSession must distinguish network failure');
  assert.ok(APP.includes('r.reason === "network"'), 'App must retry on network failure rather than log out');
});

test('session: a proactive refresh timer exists and survives a sleeping tab', () => {
  assert.ok(APP.includes('REFRESH_LEAD_MS'), 'no refresh lead window');
  assert.ok(APP.includes('refreshTimerRef'), 'no refresh timer');
  assert.ok(APP.includes('visibilitychange'), 'timers do not survive sleep; a wake check is required');
  assert.ok(/refreshTimerRef\.current\s*=\s*setTimeout/.test(APP), 'refresh must actually be scheduled');
});

test('session: expiry ends with an explanation, not a blank landing page', () => {
  assert.ok(APP.includes('endExpiredSession'), 'no graceful expiry path');
  assert.ok(APP.includes('SessionEndedNotice'), 'no user-facing expiry notice');
  assert.ok(APP.includes('startAt={sessionExpired'), 'expired users must land on the sign-in card');
  // A first-time visitor has no session and must never see "your session ended".
  assert.ok(APP.includes('if (!s?.refresh_token) { clearAuth(); setAuthChecked(true); isValidating.current=false; return; }'),
    'the no-session-at-all branch must stay ahead of the expiry notice');
});

// ── 3. Pro is referenced but cannot be bought ────────────────────────────────

test('tiers: nothing points a customer at the unpurchasable Pro tier', () => {
  assert.ok(!IMPORT_JOB.includes("required_tier: 'pro'"), "import-job still gates on 'pro'");
  assert.ok(!/upgrade to Pro|Pro members/.test(IMPORT_JOB), 'import-job copy still sells Pro');
  assert.ok(!/'pro'/.test(CHECKOUT_API.replace(/\/\/.*$/gm, '')), 'checkout must not sell Pro');
});

test('tiers: requiredTier never recommends a plan Stripe does not sell', () => {
  for (const feature of Object.keys(FEATURE_GATES)) {
    assert.notEqual(requiredTier(feature), TIER_PRO,
      `requiredTier('${feature}') recommends Pro, which cannot be purchased`);
  }
  assert.equal(requiredTier('chunkedImport'), TIER_CRAFT);
});

test('tiers: legacy Pro rows keep their paid entitlement', () => {
  // Removing Pro from the purchasable set must not strip existing accounts.
  assert.equal(isPaidTier(TIER_PRO), true, 'legacy pro rows must still count as paid');
  assert.equal(isPaidTier(TIER_CRAFT), true);
  assert.equal(isPaidTier('free'), false);
});

test('tiers: the chunked-import gate and the checkout endpoint agree', () => {
  // The gate says Craft; the endpoint sells Craft; the 402 payload says Craft.
  assert.deepEqual(FEATURE_GATES.chunkedImport, [TIER_CRAFT]);
  assert.ok(IMPORT_JOB.includes("required_tier: 'craft'"));
  assert.ok(CHECKOUT_API.includes("const tier = 'craft';"));
});
