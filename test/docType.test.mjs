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
