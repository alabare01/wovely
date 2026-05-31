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

// Renderer modes (RENDER / INLINE_SECTION_MAX / chooseRenderer) were retired with
// the unified pattern-detail shell: every pattern now uses one shell (Materials |
// Instructions | Notes), and the Instructions tab varies by STRUCTURE (single →
// rows; multi-part → parts grid ⇄ scoped part) gated by TIER, rather than by a
// pre-computed renderer mode. Import routing (decideImportRoute) is unchanged.

// Every clue child of a split inherits the parent import's source file URL.
// Parent payload wins; fall back to the import handoff's URL when the modal
// payload didn't carry it (pill→modal resume). Pure so the regression is
// directly testable (S76 part A).
export function resolveChildSourceUrl(parentSourceUrl, importFileUrl) {
  return parentSourceUrl || importFileUrl || null;
}

// A line that reads like a workable, checkable stitch instruction (a row), as
// opposed to narrative prose. Used by the coverage diagnostic to catch the
// pass-2 failure mode (instructions trapped in `body`). Broad on purpose:
// catching an instruction hiding in prose matters more than the odd false
// positive. Shared + tested so the guardrail can't silently drift.
const ROW_INSTRUCTION_RE = /^\s*(?:r(?:nd|ound|ow)?\.?\s*\d+\b|round\s*\d+\b|row\s*\d+\b|\d+\s*[:.)]\s*\S|ch(?:ain)?\s+\d+\b|fasten\s+off\b|\bfo\b|magic\s+ring\b|\(\s*\d*\s*sc\b|sc\s*\d+\b|\binc\b|\bdec\b|\bsl\s*st\b)/i;
export function looksLikeRowInstruction(line) {
  return typeof line === 'string' && ROW_INSTRUCTION_RE.test(line);
}
export function bodyHasTrappedInstructions(body) {
  return (typeof body === 'string' ? body.split(/\r?\n/) : []).some(looksLikeRowInstruction);
}

// Scoped part-to-part navigation: clamp index+delta to [0, total). Returns the
// current index unchanged when the move would leave the range.
export function clampPartIndex(index, delta, total) {
  const next = index + delta;
  return next >= 0 && next < total ? next : index;
}

// Short label for a part chip: strip the "── ... ──" wrapper and a leading
// "Part N:" prefix so a chip can show just the distinctive part name.
export function shortPartLabel(text) {
  const c = (text || '').replace(/──/g, '').trim();
  const m = c.match(/^part\s*\d+\s*[:.\-]?\s*(.*)$/i);
  return (m && m[1].trim()) || c;
}

export function isActivePart(id, currentId) {
  return id === currentId;
}

// Build the scoped-view part strip model from the ordered header rows. Pure so
// the chip ordering + current-highlight can be tested without a DOM.
export function buildPartStrip(headers, currentId) {
  return (headers || []).map((h, i) => ({
    id: h.id,
    number: i + 1,
    label: shortPartLabel(h.text),
    active: isActivePart(h.id, currentId),
  }));
}

// A named section with no rows AND no captured prose is a flat reference chip
// (do not open an empty drill-in). A section with rows OR a `body` is a real
// drill-in. Shared by SectionHub (the grid) and RowManager (S76 part D).
export function isReferenceChip(rowCount, hasBody) {
  return (rowCount || 0) === 0 && !hasBody;
}

// ── Asset (chart/diagram) scoping for the unified shell ──────────────────────
// The persistent asset carousel narrows to the open section when one is selected
// and widens to the whole pattern otherwise. Narrowing degrades by DATA QUALITY:
// an MKAL clue→asset link is reliable (each clue is its own pattern, so the fetch
// is already scoped), while a multi-part part→chart link is NOT (component_name is
// free-text sub-component — MOUTH, RIBS, SOULS — that often matches no part). So
// we narrow ONLY on a reliable normalized match; anything without one stays in the
// top-level view and is never dropped, never force-matched. cover/glossary (no
// component_name) are always top-level.
const PART_STOP_WORDS = new Set(['MAKE', 'PART', 'THE', 'AND', 'OF', 'FOR', 'A', 'AN']);

export function normalizePartName(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/──/g, ' ')
    .replace(/\bPART\s*\d+\s*[:.\-]?/g, ' ')
    .replace(/\(\s*MAKE\s*\d+\s*\)/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function partTokens(s) {
  return normalizePartName(s).split(' ').filter(t => t && !PART_STOP_WORDS.has(t));
}

// Reliable match only: one side's significant tokens are a subset of the other's,
// AND they share at least one token of length >= 3 (so a stray short token can't
// force a match). cover/glossary never scope to a part.
export function imageMatchesPart(image, partHeaderText) {
  if (!image) return false;
  if (image.image_type === 'cover' || image.image_type === 'glossary') return false;
  const ct = partTokens(image.component_name);
  const pt = partTokens(partHeaderText);
  if (ct.length === 0 || pt.length === 0) return false;
  const cs = new Set(ct), ps = new Set(pt);
  const subset = (a, b) => a.every(t => b.has(t));
  const shareStrong = ct.some(t => ps.has(t) && t.length >= 3);
  return shareStrong && (subset(ct, ps) || subset(pt, cs));
}

// No section selected → all assets. A section selected → only its reliably matched
// assets (everything else remains visible at the top level when you back out).
export function scopeAssetsToSection(images, partHeaderText) {
  const list = Array.isArray(images) ? images : [];
  if (!partHeaderText) return list;
  return list.filter(img => imageMatchesPart(img, partHeaderText));
}
