// The first-run starter invariant, in one place.
//
// Imported by BOTH the vite build (vite.config.js — fails the build) and the
// test suite (test/firstRun.test.mjs). Shared rather than copied so the build
// gate and the test can never drift into disagreeing about what "a new user has
// something to open" means.
//
// BACKGROUND
// Wovely has had two starter mechanisms, and only one is live at a time:
//
//   DEFAULT_STARTERS — client-only seed patterns. Deliberately emptied on
//   2026-04-19 (63154ca: "reading as AI-generated filler on first
//   impression"). Not to be refilled with filler.
//
//   STARTER (S83) — one real PDF in the Supabase pattern-files bucket. Picking
//   it runs the genuine import pipeline. Landed 2026-06-10 (3c3f7dc). Live.
//
// Between those two dates the app opened on nothing for a brand-new user. That
// is the failure this guard exists to make loud. The invariant is therefore
// "at least one mechanism is live", NOT "DEFAULT_STARTERS is non-empty" —
// the latter would fail correct code today.

/**
 * @param {string} appSource raw text of src/App.jsx
 */
export function readStarterMechanisms(appSource) {
  let defaultStartersCount = null;
  const arr = appSource.match(/const DEFAULT_STARTERS\s*=\s*\[([\s\S]*?)\n\];/);
  if (arr) {
    defaultStartersCount = (arr[1].match(/\bisStarter\s*:\s*true\b/g) || []).length;
  } else if (/const DEFAULT_STARTERS\s*=\s*\[\s*\];/.test(appSource)) {
    defaultStartersCount = 0;
  }

  let starterFields = null;
  const obj = appSource.match(/const STARTER\s*=\s*\{([\s\S]*?)\n\};/);
  if (obj) {
    const body = obj[1];
    const field = (name) => {
      const f = body.match(new RegExp(`\\b${name}\\s*:\\s*"([^"]*)"`));
      return f ? f[1] : null;
    };
    starterFields = {
      title: field('title'),
      blurb: field('blurb'),
      coverUrl: field('coverUrl'),
      storagePath: field('storagePath'),
    };
  }

  const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
  const starterIsLive = !!(
    starterFields &&
    nonEmpty(starterFields.title) &&
    nonEmpty(starterFields.coverUrl) &&
    nonEmpty(starterFields.storagePath)
  );

  return { defaultStartersCount, starterFields, starterIsLive };
}

/**
 * @returns {{ok: boolean, reason: string|null}}
 */
export function checkFirstRunInvariant(appSource) {
  const { defaultStartersCount, starterFields, starterIsLive } = readStarterMechanisms(appSource);

  if (defaultStartersCount === null && starterFields === null) {
    return {
      ok: false,
      reason:
        'Neither DEFAULT_STARTERS nor the STARTER constant was found in src/App.jsx. ' +
        'One of them must exist: a new user with an empty library needs a pattern to open.',
    };
  }

  if ((defaultStartersCount || 0) > 0 || starterIsLive) return { ok: true, reason: null };

  return {
    ok: false,
    reason:
      'BOTH starter mechanisms are empty. DEFAULT_STARTERS has ' +
      `${defaultStartersCount} entries and the S83 STARTER constant is not fully populated ` +
      `(title=${JSON.stringify(starterFields?.title ?? null)}, ` +
      `coverUrl=${JSON.stringify(starterFields?.coverUrl ?? null)}, ` +
      `storagePath=${JSON.stringify(starterFields?.storagePath ?? null)}).\n` +
      'A brand-new user would open Wovely on an empty library with no pattern offered, ' +
      'so their only route in would be finding and uploading their own PDF. That is the ' +
      '2026-04-19 regression repeating.\n' +
      'Fix by repopulating the S83 STARTER (preferred: point it at a real PDF in the ' +
      'pattern-files bucket) or by refilling DEFAULT_STARTERS.',
  };
}
