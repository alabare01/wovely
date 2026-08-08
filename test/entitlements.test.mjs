// Entitlements: what a user may actually do, per tier and per state.
//
// WHY THIS FILE EXISTS
// Three published promises did not match the code that enforced them.
//
//   1. "3 free scans a month" was printed on the Snap & Stitch card and
//      counted nowhere. The limit was decoration and the paid wedge was free.
//   2. BevCheck was sold on the Free card and gated to [TIER_CRAFT] in
//      FEATURE_GATES. Nothing read that gate, so nobody was locked out yet,
//      but the map and the pricing page said opposite things.
//   3. The 5-pattern cap counted deleted and parked rows, so users hit a
//      paywall on slots they had already given back. That blocks real usage
//      and it makes every conversion number a lie, because the paywall fires
//      on people who never reached the cap.
//
// Each of those is a promise to a paying customer, so each gets a test that
// fails loudly if it drifts back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { countActivePatterns, isActivePattern } from '../src/utils/patternCounts.js';
import {
  FEATURE_GATES, requiredTier, canAccess,
  bevCheckScope, visibleBevCheckChecks, withheldBevCheckCount,
  BEVCHECK_SCOPE_FULL, BEVCHECK_SCOPE_CORE,
} from '../src/utils/featureGates.js';
import { TIER_FREE, TIER_CRAFT, TIER_PRO } from '../src/utils/tierUtils.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const APP = read('../src/App.jsx');
const AUTH = read('../src/Auth.jsx');
const ADD_MODAL = read('../src/AddPatternModal.jsx');
const IMAGE_MODAL = read('../src/ImageImportModal.jsx');
const STITCH_CHECK = read('../src/StitchCheck.jsx');
const LLMS = read('../public/llms.txt');

// scanQuota touches localStorage. Give it a real one before importing.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
const {
  FREE_SCANS_PER_MONTH, SCAN_SNAP_STITCH, SCAN_STITCH_VISION,
  canScan, recordScan, scansLeft, scansUsed, currentMonth, readUsage,
} = await import('../src/utils/scanQuota.js');

const FREE_CAP = 5;
const pattern = (over = {}) => ({ id: Math.random(), status: 'active', isStarter: false, ...over });

// ── 1. The pattern cap counts only what the user is actually holding ────────

test('cap: a deleted pattern gives its slot back', () => {
  const five = [
    pattern(), pattern(), pattern(),
    pattern({ status: 'deleted' }), pattern({ status: 'deleted' }),
  ];
  assert.equal(countActivePatterns(five), 3,
    'soft-deleted rows stay in userPatterns for the rest of the session; they must not hold a slot');
  assert.ok(countActivePatterns(five) < FREE_CAP, 'user with 2 deletes is under the cap, not paywalled');
});

test('cap: a parked pattern gives its slot back', () => {
  const five = [
    pattern(), pattern(), pattern(), pattern(),
    pattern({ status: 'parked' }),
  ];
  assert.equal(countActivePatterns(five), 4,
    'parking is a deliberate put-this-away; if it did not free the slot, parking would be strictly worse than deleting');
});

test('cap: starters are on the house and never count', () => {
  const rows = [pattern(), pattern({ isStarter: true }), pattern({ isStarter: true })];
  assert.equal(countActivePatterns(rows), 1,
    "Dashboard's at-cap banner promises starters never count, so the gate has to honour it");
});

test('cap: five genuinely active patterns is at the cap', () => {
  const rows = Array.from({ length: 5 }, () => pattern());
  assert.equal(countActivePatterns(rows), FREE_CAP);
});

test('cap: isActivePattern rejects only deleted and parked', () => {
  assert.equal(isActivePattern(pattern({ status: 'active' })), true);
  assert.equal(isActivePattern(pattern({ status: 'in_progress' })), true);
  assert.equal(isActivePattern(pattern({ status: 'deleted' })), false);
  assert.equal(isActivePattern(pattern({ status: 'parked' })), false);
  assert.equal(isActivePattern(null), false);
});

test('cap: the gate is fed the filtered count, not a raw array length', () => {
  assert.ok(/const activePatternCount\s*=\s*countActivePatterns\(userPatterns\)/.test(APP),
    'App must derive the cap count through countActivePatterns');
  assert.ok(/useTier\(tier,\s*activePatternCount\)/.test(APP),
    'useTier must be called with the active count');
  assert.ok(!/useTier\(tier,\s*userPatterns\.length/.test(APP),
    'the raw-length call is the original bug and must not come back');
  assert.ok(!/isAnonymous\s*&&\s*\(userPatterns\.length\s*-\s*userStarterCount\)/.test(APP),
    'the guest cap must use the same active count as the free cap');
});

// ── 2. The scan allowance is real ───────────────────────────────────────────

test('scans: a free user gets exactly the published number', () => {
  store.clear();
  assert.equal(FREE_SCANS_PER_MONTH, 3, 'the number the pricing surface prints');
  assert.equal(scansLeft(TIER_FREE, SCAN_SNAP_STITCH), 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(canScan(TIER_FREE, SCAN_SNAP_STITCH), true, `scan ${i + 1} should be allowed`);
    recordScan(TIER_FREE, SCAN_SNAP_STITCH);
  }
  assert.equal(canScan(TIER_FREE, SCAN_SNAP_STITCH), false, 'the fourth scan is refused');
  assert.equal(scansLeft(TIER_FREE, SCAN_SNAP_STITCH), 0);
});

test('scans: the two surfaces hold separate counters', () => {
  store.clear();
  recordScan(TIER_FREE, SCAN_SNAP_STITCH);
  recordScan(TIER_FREE, SCAN_SNAP_STITCH);
  recordScan(TIER_FREE, SCAN_SNAP_STITCH);
  assert.equal(canScan(TIER_FREE, SCAN_SNAP_STITCH), false);
  assert.equal(canScan(TIER_FREE, SCAN_STITCH_VISION), true,
    'spending Snap & Stitch must not consume Stitch-O-Vision');
});

test('scans: a paid tier is uncapped and never renders a countdown', () => {
  store.clear();
  for (let i = 0; i < 50; i++) recordScan(TIER_CRAFT, SCAN_SNAP_STITCH);
  assert.equal(canScan(TIER_CRAFT, SCAN_SNAP_STITCH), true);
  assert.equal(scansLeft(TIER_CRAFT, SCAN_SNAP_STITCH), Infinity,
    'Infinity, not a number, so no surface can accidentally print "0 left" to a Craft member');
  assert.equal(scansLeft(TIER_PRO, SCAN_SNAP_STITCH), Infinity, 'legacy Pro keeps its paid entitlement');
});

test('scans: last month\'s counter does not spend this month\'s allowance', () => {
  store.clear();
  localStorage.setItem(SCAN_SNAP_STITCH, JSON.stringify({ count: 3, month: '2001-01' }));
  assert.equal(scansUsed(SCAN_SNAP_STITCH), 0, 'a stale month reads as zero');
  assert.equal(canScan(TIER_FREE, SCAN_SNAP_STITCH), true);
});

test('scans: a corrupt counter fails open, never locking a user out', () => {
  store.clear();
  localStorage.setItem(SCAN_SNAP_STITCH, '{not json');
  assert.deepEqual(readUsage(SCAN_SNAP_STITCH), { count: 0, month: '' });
  assert.equal(canScan(TIER_FREE, SCAN_SNAP_STITCH), true);
  localStorage.setItem(SCAN_SNAP_STITCH, JSON.stringify({ count: -9, month: currentMonth() }));
  assert.equal(scansUsed(SCAN_SNAP_STITCH), 0, 'a negative count must not become free scans either');
});

test('scans: Snap & Stitch checks before it spends and charges only on success', () => {
  assert.ok(/if\(!canScan\(tier,SCAN_SNAP_STITCH\)\)/.test(ADD_MODAL),
    'the gate must run before the FileReader and the Gemini call');
  const call = ADD_MODAL.indexOf('const result=await callGeminiVision(src);');
  const charge = ADD_MODAL.indexOf('recordScan(tier,SCAN_SNAP_STITCH);');
  assert.ok(call > -1 && charge > -1);
  assert.ok(charge > call,
    'the scan is charged after the call resolves, so our own failures are not billed to the user');
});

test('scans: the card prints the live remaining count, not a fixed claim', () => {
  // Match the rendered JSX, not the comment above it that quotes the old
  // string for context.
  assert.ok(!/>✨ Snap & Stitch — 3 free scans\/month</.test(ADD_MODAL),
    'the hardcoded claim was the uncounted promise');
  assert.ok(/free scans left this month/.test(ADD_MODAL));
});

// ── 3. BevCheck: free is real, full verification is the wedge ───────────────

test('bevcheck: the gate agrees with the Free card that sells it', () => {
  assert.ok(FEATURE_GATES.bevCheck.includes(TIER_FREE),
    'the pricing page sells BevCheck on Free; a [TIER_CRAFT] gate contradicted it outright');
  assert.deepEqual(FEATURE_GATES.bevCheckAdvisory, [TIER_CRAFT],
    'full verification stays the paid wedge');
  assert.equal(requiredTier('bevCheck'), TIER_FREE,
    'never prompt an upgrade for something the customer already has');
  assert.equal(requiredTier('bevCheckAdvisory'), TIER_CRAFT);
});

test('bevcheck: free and guest get core, Craft gets full', () => {
  assert.equal(bevCheckScope(TIER_FREE), BEVCHECK_SCOPE_CORE);
  assert.equal(bevCheckScope(TIER_CRAFT), BEVCHECK_SCOPE_FULL);
  assert.equal(bevCheckScope(TIER_FREE, true), BEVCHECK_SCOPE_CORE,
    'a guest gets one import and the card promises BevCheck on every import');
  assert.equal(bevCheckScope(TIER_CRAFT, true), BEVCHECK_SCOPE_CORE,
    'anonymous never reaches a paid scope regardless of a cached tier string');
});

test('bevcheck: the advisory checks are withheld from free, not merely dimmed', () => {
  const report = [
    { id: 'sequence', tier: 'core' },
    { id: 'stitch_math', tier: 'core' },
    { id: 'duplicates', tier: 'core' },
    { id: 'cross_refs', tier: 'core' },
    { id: 'translation', tier: 'advisory' },
    { id: 'structure', tier: 'advisory' },
  ];
  const free = visibleBevCheckChecks(report, bevCheckScope(TIER_FREE));
  assert.equal(free.length, 4);
  assert.deepEqual(free.map(c => c.id), ['sequence', 'stitch_math', 'duplicates', 'cross_refs']);
  assert.equal(withheldBevCheckCount(report, bevCheckScope(TIER_FREE)), 2,
    'the upsell names a real number instead of gesturing at "more"');

  const craft = visibleBevCheckChecks(report, bevCheckScope(TIER_CRAFT));
  assert.equal(craft.length, 6, 'Craft sees the whole report');
  assert.equal(withheldBevCheckCount(report, bevCheckScope(TIER_CRAFT)), 0);
});

test('bevcheck: an untagged check defaults to core, never silently hidden', () => {
  const report = [{ id: 'mystery' }, { id: 'adv', tier: 'advisory' }];
  const free = visibleBevCheckChecks(report, BEVCHECK_SCOPE_CORE);
  assert.deepEqual(free.map(c => c.id), ['mystery'],
    'a provider that omits the tier field must not cost a free user a check they are entitled to');
});

test('bevcheck: every renderer filters through the shared helper', () => {
  for (const [name, src] of [['AddPatternModal', ADD_MODAL], ['ImageImportModal', IMAGE_MODAL], ['StitchCheck', STITCH_CHECK]]) {
    assert.ok(/visibleBevCheckChecks\(/.test(src), `${name} must scope its checks`);
    assert.ok(/bevCheckScope\(/.test(src), `${name} must resolve the scope from tier`);
    assert.ok(!/const allChecks\s*=\s*validationReport\.checks\s*\|\|\s*\[\]/.test(src),
      `${name} must not read the raw unscoped check list`);
  }
});

test('bevcheck: the issue count never exceeds what the user can see', () => {
  const report = [
    { id: 'sequence', tier: 'core', status: 'pass' },
    { id: 'translation', tier: 'advisory', status: 'fail' },
  ];
  const shown = visibleBevCheckChecks(report, BEVCHECK_SCOPE_CORE);
  const issues = shown.filter(c => c.status === 'fail' || c.status === 'warning' || c.status === 'warn');
  assert.equal(issues.length, 0,
    'the gauge must not claim a problem it then refuses to show');
});

test('bevcheck: canAccess still refuses gated features to guests', () => {
  assert.equal(canAccess('bevCheckAdvisory', TIER_CRAFT, true), false);
  assert.equal(canAccess('collections', TIER_FREE), false);
});

// ── 4. The support claim describes something that exists ────────────────────

test('support: no surface promises 24/7 coverage', () => {
  for (const [name, src] of [['Auth.jsx', AUTH], ['App.jsx', APP], ['llms.txt', LLMS]]) {
    assert.ok(!/24\/7/.test(src),
      `${name} still promises 24/7 support, which is not an offer anyone has committed to`);
  }
});

test('support: no surface promises a response time', () => {
  const promise = /(within|under|less than)\s+(\d+|one|two|a few|an?)\s*(minute|hour|day|business day)/i;
  for (const [name, src] of [['Auth.jsx', AUTH], ['llms.txt', LLMS]]) {
    assert.ok(!promise.test(src),
      `${name} promises a response time that nothing in the code guarantees`);
  }
});

test('support: the claim points at the channel that actually exists', () => {
  assert.ok(/Live chat that reaches a real person/.test(AUTH),
    'BevChat submits to /api/send-feedback, which emails support@wovely.app');
  assert.ok(/A real person reads every message/.test(AUTH));
});

test('support: the described channel is really wired to a person', () => {
  const feedback = read('../api/send-feedback.js');
  assert.ok(/to:\s*'support@wovely\.app'/.test(feedback),
    'if this stops emailing a human, the copy above becomes an overclaim');
  const chat = read('../src/BevChat.jsx');
  assert.ok(/\/api\/send-feedback/.test(chat), 'Bev chat must actually submit somewhere');
});

// ── 5. House style holds in the copy this change introduced ────────────────

test('copy: the new entitlement copy carries no em dash and no exclamation', () => {
  const introduced = [
    'Live chat that reaches a real person, plus Bev in the app',
    'Vault, calculators &amp; live chat with a real person',
    'A real person reads every message',
    'BevCheck stitch math on every import',
    'Full BevCheck verification, plus a large pattern library',
    '3 Snap &amp; Stitch photo scans a month',
  ];
  for (const line of introduced) {
    assert.ok(AUTH.includes(line), `expected copy missing: ${line}`);
    assert.ok(!line.includes('—'), `em dash in: ${line}`);
    assert.ok(!line.includes('!'), `exclamation in: ${line}`);
  }
});

test('copy: the new in-product strings hold house style too', () => {
  // Every user-facing string this change added, across all three surfaces.
  // House style (SecondBrain CLAUDE.md section 5): no em dash, no exclamation.
  const introduced = [
    ['AddPatternModal', "free scans left this month"],
    ['AddPatternModal', "You've used your {FREE_SCANS_PER_MONTH} free scans this month"],
    ['AddPatternModal', 'Your scans reset at the start of next month.'],
    ['AddPatternModal', 'The stitch math is free on every import.'],
    ['ImageImportModal', 'The stitch math is free on every import.'],
    ['StitchCheck', 'The math above is free on every import.'],
  ];
  const src = { AddPatternModal: ADD_MODAL, ImageImportModal: IMAGE_MODAL, StitchCheck: STITCH_CHECK };
  for (const [file, needle] of introduced) {
    assert.ok(src[file].includes(needle), `${file} is missing: ${needle}`);
  }
  // House style, checked against the exact sentences rather than the lines
  // they sit on: these JSX blobs are single-line, so a line-wide scan would
  // trip over every `!==` in the surrounding code.
  const sentences = [
    ': ${remaining} of ${FREE_SCANS_PER_MONTH} free scans left this month',
    'Your scans reset at the start of next month. Craft has no scan limit, and you can still add patterns by PDF or link in the meantime.',
    'The stitch math is free on every import. Full verification adds Bev’s advisory pass.'.replace('’', "'"),
    'The math above is free on every import. Craft adds Bev’s advisory pass: translation artifacts and component structure, the two that catch a pattern that counts correctly and still cannot be followed.'.replace('’', "'"),
  ];
  for (const s of sentences) {
    assert.ok(!s.includes('—'), `em dash in new copy: ${s}`);
    assert.ok(!s.includes('!'), `exclamation in new copy: ${s}`);
    const found = Object.values(src).some(t => t.includes(s));
    assert.ok(found, `copy no longer present in any surface: ${s}`);
  }
});

test('copy: the free card claims only what the code enforces', () => {
  assert.ok(!/BevCheck on every import<\/li>/.test(AUTH),
    'the unqualified claim outran the scope that is actually granted');
  assert.ok(/BevCheck stitch math on every import/.test(AUTH),
    'name the scope that free genuinely gets');
});
