// The abandoned paid intent, and the free signup it could turn into a charge.
//
// WHY THIS FILE EXISTS
// Reproduced in a real browser on 2026-09-08: click "Go Craft" on the landing
// pricing card, leave that screen without using a close control, then take the
// free route instead. sessionStorage still held
//
//     wovely_pending_upgrade_tier    = "craft"
//     wovely_pending_upgrade_cadence = "annual"
//
// and App.jsx's post-signup handler reads exactly those keys and opens Stripe
// checkout. Someone who chose FREE could be sent to a PAID checkout. It was
// never verified to an actual charge, and deliberately was not: the way to
// test the money path is against the logic, not against a customer's card.
//
// The clear existed only on AuthWallModal's onClose. The full-page <Auth/>
// screen has no close control at all, so it had no clear, and every way out of
// that screen leaked. The root cause was that read/write/clear were open-coded
// sessionStorage calls at a dozen sites, so "clear it when they back out" was
// something each site had to remember. src/utils/pendingUpgrade.js is now the
// one implementation and this file holds it to its contract.
//
// The pure module is exercised for real against a fake storage. The wiring in
// App.jsx and Auth.jsx is asserted against source text, because both are JSX
// and node --test cannot import them without a transform.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PENDING_UPGRADE_KEY,
  PENDING_UPGRADE_CADENCE_KEY,
  DEFAULT_CADENCE,
  readPendingUpgrade,
  writePendingUpgrade,
  clearPendingUpgrade,
  shouldOpenCheckout,
} from '../src/utils/pendingUpgrade.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const APP = read('../src/App.jsx');
const AUTH = read('../src/Auth.jsx');

// A sessionStorage stand-in. Same three methods the real one exposes.
const fakeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    size: () => m.size,
    raw: m,
  };
};

// ── 1. The contract ──────────────────────────────────────────────────────────

test('pending: the keys are the ones production already wrote', () => {
  // Renaming these orphans every intent stashed in a tab that is already open.
  assert.equal(PENDING_UPGRADE_KEY, 'wovely_pending_upgrade_tier');
  assert.equal(PENDING_UPGRADE_CADENCE_KEY, 'wovely_pending_upgrade_cadence');
});

test('pending: a round trip returns what was written', () => {
  const s = fakeStorage();
  writePendingUpgrade('craft', 'annual', s);
  assert.deepEqual(readPendingUpgrade(s), { tier: 'craft', cadence: 'annual' });
});

test('pending: a missing cadence defaults to monthly, never annual', () => {
  // Monthly is the smaller charge. A lost cadence must never silently bill a
  // year, so the default leans to the cheaper answer on purpose.
  assert.equal(DEFAULT_CADENCE, 'monthly');
  const s = fakeStorage({ [PENDING_UPGRADE_KEY]: 'craft' });
  assert.deepEqual(readPendingUpgrade(s), { tier: 'craft', cadence: 'monthly' });
  const s2 = fakeStorage();
  writePendingUpgrade('craft', null, s2);
  assert.equal(readPendingUpgrade(s2).cadence, 'monthly');
});

test('pending: clearing removes BOTH keys', () => {
  // Leaving the cadence behind is how a later intent inherits a billing period
  // nobody picked. Sign-out used to remove only the tier.
  const s = fakeStorage();
  writePendingUpgrade('craft', 'annual', s);
  clearPendingUpgrade(s);
  assert.deepEqual(readPendingUpgrade(s), { tier: null, cadence: null });
  assert.equal(s.size(), 0, 'a stale cadence was left behind');
});

test('pending: picking Free clears rather than stashing an empty intent', () => {
  const s = fakeStorage();
  writePendingUpgrade('craft', 'annual', s);
  writePendingUpgrade(null, null, s);
  assert.equal(readPendingUpgrade(s).tier, null);
  assert.equal(s.size(), 0);
});

test('pending: a storage that throws degrades to "no intent", never to a crash', () => {
  const hostile = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  };
  assert.deepEqual(readPendingUpgrade(hostile), { tier: null, cadence: null });
  assert.doesNotThrow(() => writePendingUpgrade('craft', 'annual', hostile));
  assert.doesNotThrow(() => clearPendingUpgrade(hostile));
});

// ── 2. The decision that spends money ────────────────────────────────────────

test('pending: nothing stashed means no checkout', () => {
  assert.equal(shouldOpenCheckout({ tier: null }), false);
  assert.equal(shouldOpenCheckout({ tier: undefined }), false);
  assert.equal(shouldOpenCheckout({ tier: '' }), false);
});

test('pending: an anonymous guest is never sent to checkout', () => {
  assert.equal(shouldOpenCheckout({ tier: 'craft', isAnonymous: true }), false);
});

test('pending: an existing subscriber is never charged twice', () => {
  assert.equal(shouldOpenCheckout({ tier: 'craft', alreadyPaid: true }), false);
});

test('pending: a real picked tier on a real new account does open checkout', () => {
  assert.equal(shouldOpenCheckout({ tier: 'craft' }), true);
  assert.equal(shouldOpenCheckout({ tier: 'pro', isAnonymous: false, alreadyPaid: false }), true);
});

// ── 3. The leak itself, walked step by step ──────────────────────────────────

test('pending: THE LEAK. Abandoning the paid card cannot follow you into a free signup', () => {
  const s = fakeStorage();

  // 1. The visitor clicks "Go Craft" on the landing pricing card.
  writePendingUpgrade('craft', 'annual', s);
  assert.equal(readPendingUpgrade(s).tier, 'craft');

  // 2. They walk off that screen. Before the fix this was a no-op, because the
  //    only clear lived on AuthWallModal.onClose and the full-page Auth screen
  //    has no close control. Every exit now calls this.
  clearPendingUpgrade(s);

  // 3. They take the free route and finish a signup.
  const after = readPendingUpgrade(s);
  assert.equal(after.tier, null, 'the abandoned Craft intent survived into the free signup');
  assert.equal(shouldOpenCheckout({ tier: after.tier }), false,
    'someone who chose free would be sent to a paid checkout');
});

// ── 4. The wiring, so the exits cannot quietly lose their clear ──────────────

test('pending: every way out of the paid flow clears the intent', () => {
  // These four are the entire set of exits from the full-page Auth screen:
  // the logo, "Start free", the demo, and taking a guest fork. The audit found
  // all four leaking.
  const exits = [
    ['goLanding', /const goLanding = \(\) => \{ dropPendingUpgrade\(\);/],
    ['goTry', /const goTry = \(\) => \{ dropPendingUpgrade\(\);/],
    ['goDemo', /const goDemo = \(\) => \{\s*dropPendingUpgrade\(\);/],
    ['tryFork', /const tryFork = \(intent\) => \{[\s\S]{0,400}?dropPendingUpgrade\(\);/],
  ];
  for (const [name, re] of exits) {
    assert.match(AUTH, re, `${name} does not clear the pending upgrade intent`);
  }
  // And explicitly choosing Free on the post-signup fork clears it too.
  assert.match(AUTH, /onFree=\{\(\) => \{ dropPendingUpgrade\(\); onEnterAsNew\(\); \}\}/,
    'the fork screen\'s free path must clear the intent');
});

test('pending: nobody hand-rolls the storage calls any more', () => {
  // The leak was a missing clear at one of a dozen open-coded call sites. If
  // a raw sessionStorage call against these keys reappears, the same class of
  // bug is back and this test is the thing that says so.
  for (const [name, src] of [['App.jsx', APP], ['Auth.jsx', AUTH]]) {
    assert.equal(/sessionStorage\.\w+\(PENDING_UPGRADE/.test(src), false,
      `${name} still calls sessionStorage directly for the pending upgrade keys`);
    assert.equal(/["']wovely_pending_upgrade_(tier|cadence)["']/.test(src), false,
      `${name} hardcodes a pending-upgrade key instead of using utils/pendingUpgrade.js`);
  }
  assert.match(APP, /from "\.\/utils\/pendingUpgrade\.js"/);
  assert.match(AUTH, /from "\.\/utils\/pendingUpgrade\.js"/);
});

test('pending: sign-out drops the intent entirely', () => {
  const signOut = APP.slice(APP.indexOf('const handleSignOut'), APP.indexOf('const handleSignOut') + 600);
  assert.match(signOut, /clearPendingUpgrade\(\)/,
    'signing out must not leave a paid intent behind for the next account in this tab');
});

// ── 5. The screen has to tell the truth about what was picked ────────────────

test('pending: the paid signup screen names Craft, the price and the checkout', () => {
  // The audit: clicking "Go Craft" showed "Let's get you set up. Bev's ready
  // when you are. Free means free, 5 patterns, no card." over a "Create my
  // account" button, with a Stripe redirect waiting on the far side. The
  // screen told the customer there was no card immediately before asking for
  // one.
  assert.match(AUTH, /const paidIntent = !isSignIn && pendingTier === "craft"/,
    'the auth card must know a paid tier was picked');
  assert.match(AUTH, /You picked Wovely Craft/, 'the heading must name the plan');
  assert.match(AUTH, /billed yearly at \$\$\{CRAFT_ANNUAL_TOTAL\}/,
    'the annual pick must state the amount that will actually be charged');
  assert.match(AUTH, /Create account and continue to checkout/,
    'the button must say a checkout follows');
  assert.match(AUTH, /Cancel anytime/);

  // And the free copy must still be the free copy for a free signup.
  assert.match(AUTH, /Free means free: <b>5 patterns, no card\.<\/b>/);
  const paidBlock = AUTH.slice(AUTH.indexOf('const paidIntent'), AUTH.indexOf('const submitLabel'));
  assert.equal(/no card/.test(paidBlock.slice(0, paidBlock.indexOf('paidIntent\n      ?'))), false,
    'the paid branch must not claim there is no card');
});

test('pending: the price on the auth card is the one canonical price', () => {
  assert.match(AUTH, /CRAFT_PRICE = \{ annual: "4\.58", monthly: "6\.99" \}/);
  assert.match(AUTH, /CRAFT_ANNUAL_TOTAL = "54\.99"/);
});
