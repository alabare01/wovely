// S76 document-type architecture — unit + regression suite.
// Pure-function tests (no DOM, no network) for the routing + renderer decisions
// that now sit in the hot path of EVERY import. Run with: npm test (node --test).
//
// The classifier itself is an LLM call and is validated via real imports (the
// S75 checkpoint). What is deterministic — and what a regression would silently
// break — is the mapping from document_type to destination, and the structural
// renderer choice. Those are what we lock down here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOC_TYPES, ROUTE, RENDER, INLINE_SECTION_MAX,
  decideImportRoute, importRouteMismatch, chooseRenderer,
  resolveChildSourceUrl, isReferenceChip,
  looksLikeRowInstruction, bodyHasTrappedInstructions, clampPartIndex,
  buildPartStrip, shortPartLabel, isActivePart,
} from '../src/utils/docType.js';

// ── Routing regression fixtures ──────────────────────────────────────────────
// Each asserts BOTH the document_type and the destination, mirroring the spec's
// regression table. A routing regression (a book collapsed into one pattern, or
// a single pattern fanned out) would flip one of these.
test('routing: mkal (Arcoiris-style) → collection', () => {
  assert.equal(decideImportRoute(DOC_TYPES.MKAL, 4), ROUTE.COLLECTION);
});
test('routing: pattern_book (multi-object) → collection / child patterns', () => {
  assert.equal(decideImportRoute(DOC_TYPES.BOOK, 6), ROUTE.COLLECTION);
});
test('routing: multi_section_pattern (Blooming Daisy) → ONE pattern, no collection', () => {
  assert.equal(decideImportRoute(DOC_TYPES.MULTI_SECTION, 12), ROUTE.SINGLE_PATTERN);
});
test('routing: plain single_pattern → one pattern', () => {
  assert.equal(decideImportRoute(DOC_TYPES.SINGLE, 1), ROUTE.SINGLE_PATTERN);
});

// ── Router safety: missing / unknown type falls back to structural behavior ──
test('routing: missing document_type → STRUCTURAL fallback', () => {
  assert.equal(decideImportRoute(undefined, 5), ROUTE.STRUCTURAL);
  assert.equal(decideImportRoute(null, 1), ROUTE.STRUCTURAL);
});
test('routing: unrecognized document_type → STRUCTURAL fallback', () => {
  assert.equal(decideImportRoute('garment_set', 3), ROUTE.STRUCTURAL);
});

// ── Mismatch logging signal (classifier vs structural) ───────────────────────
test('mismatch: single_pattern that is structurally multi → flagged', () => {
  assert.equal(importRouteMismatch(DOC_TYPES.SINGLE, 4), true);
});
test('mismatch: book/mkal that is structurally single → flagged', () => {
  assert.equal(importRouteMismatch(DOC_TYPES.BOOK, 1), true);
  assert.equal(importRouteMismatch(DOC_TYPES.MKAL, 0), true);
});
test('mismatch: multi_section is structurally multi BY DESIGN → never flagged', () => {
  assert.equal(importRouteMismatch(DOC_TYPES.MULTI_SECTION, 12), false);
});
test('mismatch: agreeing cases → not flagged', () => {
  assert.equal(importRouteMismatch(DOC_TYPES.SINGLE, 1), false);
  assert.equal(importRouteMismatch(DOC_TYPES.BOOK, 5), false);
});

// ── Renderer decision (structural; degrades gracefully against classifier) ───
test('renderer: <= 1 section → inline', () => {
  assert.equal(chooseRenderer({ sectionCount: 0, hasCharts: false, userIsCraft: true }), RENDER.INLINE);
  assert.equal(chooseRenderer({ sectionCount: 1, hasCharts: true, userIsCraft: true }), RENDER.INLINE);
});
test('renderer: light multi-section (<= max, no charts) → inline', () => {
  assert.equal(chooseRenderer({ sectionCount: INLINE_SECTION_MAX, hasCharts: false, userIsCraft: true }), RENDER.INLINE);
});
test('renderer: complex multi-section + below Craft → inline_with_upgrade_nudge', () => {
  assert.equal(chooseRenderer({ sectionCount: 8, hasCharts: true, userIsCraft: false }), RENDER.INLINE_NUDGE);
});
test('renderer: complex multi-section + Craft → hub', () => {
  assert.equal(chooseRenderer({ sectionCount: 8, hasCharts: true, userIsCraft: true }), RENDER.HUB);
});
test('renderer: many sections even without charts + Craft → hub', () => {
  assert.equal(chooseRenderer({ sectionCount: 12, hasCharts: false, userIsCraft: true }), RENDER.HUB);
});
test('renderer: graceful degradation — classifier says multi_section but only 2 light sections → inline', () => {
  // Proves the renderer leans on real structure, not the (possibly wrong) label.
  assert.equal(chooseRenderer({ sectionCount: 2, hasCharts: false, userIsCraft: false }), RENDER.INLINE);
});

// ── Part A regression: clue children inherit the import's source file URL ────
test('child source url: parent payload wins', () => {
  assert.equal(resolveChildSourceUrl('https://x/parent.pdf', 'https://x/import.pdf'), 'https://x/parent.pdf');
});
test('child source url: falls back to import handoff url when parent is empty', () => {
  assert.equal(resolveChildSourceUrl('', 'https://x/import.pdf'), 'https://x/import.pdf');
  assert.equal(resolveChildSourceUrl(null, 'https://x/import.pdf'), 'https://x/import.pdf');
});
test('child source url: never undefined (assert non-null when a url exists)', () => {
  assert.notEqual(resolveChildSourceUrl(null, 'https://x/import.pdf'), null);
  assert.equal(resolveChildSourceUrl(null, null), null); // genuinely none → null, not undefined
});

// ── Part D: reference section classification (body field) ────────────────────
test('section: rows present → drill-in (not a reference chip)', () => {
  assert.equal(isReferenceChip(8, false), false);
  assert.equal(isReferenceChip(8, true), false);
});
test('section: zero rows but captured body prose → drill-in (not a chip)', () => {
  assert.equal(isReferenceChip(0, true), false);
});
test('section: zero rows and no body → flat reference chip', () => {
  assert.equal(isReferenceChip(0, false), true);
});

// ── Part A guardrail: row instructions must never be trapped in body prose ───
test('row detection: real stitch instructions are recognized as rows', () => {
  assert.equal(looksLikeRowInstruction('RND 3: (sc, inc) x 6 (18)'), true);
  assert.equal(looksLikeRowInstruction('Row 5: sc in each st across'), true);
  assert.equal(looksLikeRowInstruction('Chain 20, sl st to join'), true);
  assert.equal(looksLikeRowInstruction('Fasten off and weave in ends'), true);
  assert.equal(looksLikeRowInstruction('1. Make a magic ring'), true);
});
test('row detection: genuine narrative prose is NOT a row', () => {
  assert.equal(looksLikeRowInstruction('This part forms the flower center.'), false);
  assert.equal(looksLikeRowInstruction('Gauge is not critical for this project.'), false);
  assert.equal(looksLikeRowInstruction('Choose any worsted-weight cotton you like.'), false);
});
test('body additive: a Petals-style body of stitch instructions is flagged (the pass-2 bug)', () => {
  const trappedBody = 'RND 1: 6 sc in magic ring (6)\nRND 2: inc around (12)\nRND 3: (sc, inc) x 6 (18)';
  assert.equal(bodyHasTrappedInstructions(trappedBody), true);
});
test('body additive: a reference-only body (overview prose) is clean', () => {
  const refBody = 'This tieback is worked in several pieces.\nSizing is flexible — block to taste.\nUse a tapestry needle to assemble.';
  assert.equal(bodyHasTrappedInstructions(refBody), false);
});

// ── Part C: scoped part-to-part navigation clamps to range ───────────────────
test('part nav: moves within range and clamps at the ends', () => {
  assert.equal(clampPartIndex(0, 1, 12), 1);   // next
  assert.equal(clampPartIndex(5, -1, 12), 4);  // prev
  assert.equal(clampPartIndex(0, -1, 12), 0);  // clamp at start
  assert.equal(clampPartIndex(11, 1, 12), 11); // clamp at end
});

// ── Pass 4 Part B: part strip model (current highlight + jump targets) ───────
const STRIP_HEADERS = [
  { id: 'h1', text: '── PART 1: OVERVIEW, SIZING ──' },
  { id: 'h2', text: '── PART 2: GAUGE ──' },
  { id: 'h3', text: '── PART 5: PETALS ──' },
];
test('part strip: one chip per part, in order, with correct numbers + labels', () => {
  const strip = buildPartStrip(STRIP_HEADERS, 'h2');
  assert.equal(strip.length, 3);
  assert.deepEqual(strip.map(c => c.number), [1, 2, 3]);
  assert.deepEqual(strip.map(c => c.id), ['h1', 'h2', 'h3']);
  assert.equal(strip[0].label, 'OVERVIEW, SIZING'); // "Part 1:" prefix stripped
  assert.equal(strip[2].label, 'PETALS');
});
test('part strip: exactly the current part is highlighted', () => {
  const strip = buildPartStrip(STRIP_HEADERS, 'h3');
  assert.deepEqual(strip.map(c => c.active), [false, false, true]);
});
test('part strip: tapping a chip targets that exact part id', () => {
  // The chip carries the header id the jump handler uses — assert it round-trips.
  const strip = buildPartStrip(STRIP_HEADERS, 'h1');
  const tapped = strip.find(c => c.number === 3);
  assert.equal(tapped.id, 'h3');
  assert.equal(isActivePart(tapped.id, 'h3'), true);
  assert.equal(isActivePart(tapped.id, 'h1'), false);
});
test('shortPartLabel: strips wrapper and Part-N prefix, keeps bare names', () => {
  assert.equal(shortPartLabel('── PART 7: HANGING CORDS ──'), 'HANGING CORDS');
  assert.equal(shortPartLabel('Assembly'), 'Assembly');
});
