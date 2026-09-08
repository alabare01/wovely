// What an import failure says to the person, and what it says to us.
//
// WHY THIS FILE EXISTS
// On 2026-09-08 a prospect on wovely.app was shown this, verbatim, in the
// import pill:
//
//   "Bev got tangled — PDF extraction failed: Gemini and Claude both failed.
//    Last error: Claude API er…"
//
// That is an internal message. It names two vendors, describes our provider
// fallback chain, and truncates mid-word, and it tells the reader nothing they
// can act on. The raw string is genuinely useful, but it is useful to us, not
// to them.
//
// So the split is: the person gets one plain sentence and a next step; the raw
// string keeps going to the console and to /api/client-error, where it stays
// searchable. Nothing is swallowed.
//
// WHAT THE SERVER NOW SENDS, AND WHY THIS STILL MATTERS
// api/extract-pattern.js was fixed the same day (bddd78a) and no longer returns
// the provider error: a 500 comes back as { error: "extraction_failed",
// message: "We could not read that pattern." } with the detail and stack in the
// server log. That closes the direct route. It does not close this one. The
// queue worker writes its own text into import_jobs.error_message, and the pill
// and both modals render that field, so a raw string still reaches the browser
// through the job row. This file is the guard on the render side: the matching
// below is used ONLY to pick which sentence to show, and the raw string is
// never returned to a caller.
//
// RULES FOR THE COPY BELOW
// Plain, short, and it says what to do next. No vendor names, no stack
// vocabulary, no "oops", no exclamation points, no em dashes. It is allowed to
// be dull. It is not allowed to be cute, and it is not allowed to leave the
// reader with nothing to do.

import { reportClientError } from './errorReporter.js';

// The one line a person reads when we could not read their pattern.
export const IMPORT_FAILED_HEADLINE = 'That import did not finish';

// Fallback body copy, used when nothing in the raw error tells us anything
// more specific.
export const IMPORT_FAILED_BODY = 'Bev could not get through that one. Give it another go, and if it fails again send it over with the feedback button and we will read it by hand.';

// Raw-message patterns we can turn into a genuinely more useful instruction.
// Order matters: first match wins. Every `test` runs against the lowercased
// raw message, so patterns stay lowercase.
const SPECIFIC = [
  {
    test: /too large|file size|payload too large|413/,
    body: 'That file is over the size we can read. Try a smaller export of it, or split it into parts.',
  },
  {
    test: /password|encrypted|permission|protected/,
    body: 'That PDF is locked, so nothing can read the text inside it. Re-save it without the password and try again.',
  },
  {
    test: /no text|text layer|empty|scanned|image[- ]only/,
    body: 'That file has no readable text in it, which usually means it is a scan. Photograph the pages instead and use the photo import, and Bev will read them.',
  },
  {
    test: /timed? ?out|timeout|deadline/,
    body: 'That one took longer than we allow and stopped part way. Try it once more, and it usually goes through on the second run.',
  },
  {
    test: /network|fetch failed|econn|socket|dns/,
    body: 'We could not reach the import service. Check your connection and try again.',
  },
  {
    test: /rate limit|429|quota|overloaded|capacity/,
    body: 'The import service is busy right now. Wait a minute and try again.',
  },
];

/**
 * Turn a raw failure message into something worth showing a person.
 *
 * @param {string|null|undefined} raw  the internal error text, as-is
 * @returns {string} plain body copy, never containing the raw text
 */
export function friendlyImportError(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return IMPORT_FAILED_BODY;
  // The API's own safe strings carry no detail worth branching on.
  if (s === 'extraction_failed' || s === 'we could not read that pattern.') return IMPORT_FAILED_BODY;
  const hit = SPECIFIC.find(r => r.test.test(s));
  return hit ? hit.body : IMPORT_FAILED_BODY;
}

/**
 * Keep the real error. Console for whoever is looking now, /api/client-error
 * for whoever looks later. Never throws, never blocks a render.
 *
 * @param {string} where   short tag for the call site, e.g. 'import-pill'
 * @param {string} raw     the internal error text
 * @param {object} extra   anything else worth having in the log row
 */
export function logImportFailure(where, raw, extra = {}) {
  const message = `[import-failure:${where}] ${raw || 'no message'}`;
  try { console.error(message, extra); } catch {}
  try { reportClientError(message, { source: `import:${where}`, ...extra }); } catch {}
}

/**
 * The two things a caller almost always wants at once: the line to render and
 * the line written to the logs.
 */
export function handleImportFailure(where, raw, extra = {}) {
  logImportFailure(where, raw, extra);
  return friendlyImportError(raw);
}
