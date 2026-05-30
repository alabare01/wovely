// S76 document-type architecture — shared, pure decision helpers.
//
// These functions are the single source of truth for two decisions that used to
// be implicit and scattered:
//   1. import ROUTING: given a classified document_type (+ structural component
//      count), where does the import land — one pattern, or a collection?
//   2. pattern RENDERING: given the section structure (+ tier), which renderer
//      presents it — inline, inline-with-nudge, or hub-and-spoke?
//
// They are deliberately framework-free and side-effect-free so App.jsx,
// PatternDetail.jsx, and the unit tests all consume the exact same logic. The
// renderer decision is STRUCTURAL first (section count casts the deciding vote),
// so it degrades gracefully when the classifier is wrong.

// The four document types Bev classifies a PDF into (planner output, Part A).
export const DOC_TYPES = {
  SINGLE: 'single_pattern',          // one object, one continuous run of instructions
  MULTI_SECTION: 'multi_section_pattern', // ONE object assembled from named parts shipped together
  BOOK: 'pattern_book',              // MULTIPLE independent objects in one document
  MKAL: 'mkal',                      // ONE object revealed as time-released clues
};

// Import destinations.
export const ROUTE = {
  SINGLE_PATTERN: 'single_pattern', // one pattern row, sections live in `components`
  COLLECTION: 'collection',         // fan out to a collection with child patterns
  STRUCTURAL: 'structural',         // unknown type → defer to existing structural heuristic
};

// Pure routing decision. `document_type` is additive: when it is missing or
// unrecognized we return STRUCTURAL so callers fall back to the pre-S76 behavior
// (the field never becomes the sole routing authority on day one).
export function decideImportRoute(documentType, componentCount) {
  switch (documentType) {
    case DOC_TYPES.MULTI_SECTION: // one finished object → never a collection
    case DOC_TYPES.SINGLE:
      return ROUTE.SINGLE_PATTERN;
    case DOC_TYPES.BOOK: // independent objects → fan out
    case DOC_TYPES.MKAL: // time-released clues → collection
      return ROUTE.COLLECTION;
    default:
      return ROUTE.STRUCTURAL;
  }
}

// Does the classifier disagree with the structural component count in a way worth
// logging? multi_section is structurally multi BY DESIGN, so it is never a
// mismatch. A single_pattern that is structurally multi (a book mislabeled), or a
// book/mkal that is structurally single, is a mismatch we log (never silently
// override) so we can tune the classifier from real imports.
export function importRouteMismatch(documentType, componentCount) {
  const structuralMulti = (componentCount || 0) > 1;
  if (documentType === DOC_TYPES.SINGLE && structuralMulti) return true;
  if ((documentType === DOC_TYPES.BOOK || documentType === DOC_TYPES.MKAL) && !structuralMulti) return true;
  return false;
}

// Renderer modes.
export const RENDER = {
  INLINE: 'inline',                          // sections in one scroll, with headers
  INLINE_NUDGE: 'inline_with_upgrade_nudge', // inline + a (non-blocking) Craft nudge
  HUB: 'hub',                                // hub-and-spoke section cards (Craft)
};

// A multi-section object stays inline up to this many light sections.
export const INLINE_SECTION_MAX = 3;
// Reserved for future heavy-section weighting (row-count fan-out tuning).
export const ROW_THRESHOLD = 15;

// Every clue child of a split inherits the parent import's source file URL.
// Parent payload wins; fall back to the import handoff's URL when the modal
// payload didn't carry it (pill→modal resume). Pure so the regression is
// directly testable (S76 part A).
export function resolveChildSourceUrl(parentSourceUrl, importFileUrl) {
  return parentSourceUrl || importFileUrl || null;
}

// A named section with no rows AND no captured prose is a flat reference chip
// (do not open an empty drill-in). A section with rows OR a `body` is a real
// drill-in. Shared by SectionHub (the grid) and RowManager (S76 part D).
export function isReferenceChip(rowCount, hasBody) {
  return (rowCount || 0) === 0 && !hasBody;
}

// Pure renderer decision. STRUCTURAL, not type-driven: `document_type` only feeds
// in via the section count upstream. Real signals only — the current `components`
// shape has no per-section materials field, so that term from the original spec
// is intentionally omitted rather than invented.
export function chooseRenderer({ sectionCount, hasCharts, userIsCraft }) {
  const n = sectionCount || 0;
  if (n <= 1) return RENDER.INLINE;
  if (n <= INLINE_SECTION_MAX && !hasCharts) return RENDER.INLINE; // light multi-section
  // Complex multi-section object. Hub is the Craft presentation; everyone else
  // still gets a fully usable inline pattern with a nudge (never paywall the read).
  if (!userIsCraft) return RENDER.INLINE_NUDGE;
  return RENDER.HUB;
}
