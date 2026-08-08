// ─── ANALYTICS SCOPE FOR THE PUBLIC TOOL PAGES ───────────────────────────────
//
// The public tool pages invite a stranger to paste a crochet pattern they may
// well have paid for. Session replay records the DOM, and the converter renders
// the pasted pattern straight back out as ordinary page text, so a replay would
// carry the document itself off the device — while the page's own copy told the
// reader that nothing left their browser.
//
// Rather than soften that promise into something the reader cannot check,
// replay is off on these routes: `disable_session_recording` at init for the
// search visitor who lands directly, and `stopReplayForToolPage()` on mount for
// the signed-in user who navigates in client-side and never re-runs init.
//
// Deliberately one-way. Nothing here ever calls startSessionRecording, because
// that would switch replay ON for a project that may have it off.
//
// Pageviews still count. A pageview is a URL and a referrer, which is what the
// copy on the page now says and what the privacy policy already covers.

import posthog from "posthog-js";

export const NO_REPLAY_PATHS = [
  "/uk-us-crochet-terms",
  "/crochet-abbreviations",
  "/crochet-stitch-counter",
  "/tools",
];

export const isNoReplayPath = (pathname) =>
  NO_REPLAY_PATHS.includes(
    pathname ?? (typeof window !== "undefined" ? window.location.pathname : "")
  );

export const stopReplayForToolPage = () => {
  try { posthog.stopSessionRecording(); } catch { /* replay may not be enabled at all */ }
};
