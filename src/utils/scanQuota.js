// Monthly scan allowance for the two photo-scan surfaces.
//
// WHY THIS FILE EXISTS
// Two surfaces publish "3 free scans a month". Only one of them counted.
//
//   Stitch-O-Vision (src/StitchVision.jsx) had a month-keyed localStorage
//   counter written inline in the component.
//   Snap & Stitch (HiveVisionForm in src/AddPatternModal.jsx) had NOTHING.
//   It printed "3 free scans/month" on the card and then called Gemini on
//   every photo, forever, for every tier. The published limit was decoration.
//
// A published limit with no enforcement is a broken promise in both
// directions: it misrepresents the product, and it hands away the paid wedge
// for free. This module is the one counter both surfaces use.
//
// HONEST LIMITATION — READ BEFORE TRUSTING THIS
// The counter lives in localStorage, so a user who clears site data (or
// edits the key) gets a fresh three. That is the same strength the shipped
// Stitch-O-Vision limit already had; this change closes the "no limit at all"
// hole, it does not make the limit tamper-proof. A tamper-proof limit has to
// be counted server-side on the request that spends the quota, and neither
// surface can do that today: Snap & Stitch calls Gemini directly from the
// browser with VITE_GEMINI_API_KEY and never touches our backend, and
// api/stitch-vision.js takes no auth. Closing that properly means routing
// both through an authenticated endpoint that counts before it spends, and
// CLAUDE.md pins the deploy at the Vercel Hobby 17-function ceiling, so it is
// a consolidation job rather than a new file. Tracked, not done here.

import { isPaidTier } from './tierUtils.js';

// The number every surface publishes. Changing it here changes the gate and
// the copy that reads off the gate together.
export const FREE_SCANS_PER_MONTH = 3;

// Storage keys. wv_sv_uses is the key Stitch-O-Vision has been writing in
// production — keep it, and keep its { count, month } shape, so live users'
// counters carry across this change instead of silently resetting to zero.
export const SCAN_STITCH_VISION = 'wv_sv_uses';
export const SCAN_SNAP_STITCH = 'wv_snap_uses';

export const currentMonth = (d = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

// Reads the stored counter, normalising anything unparseable to a clean zero.
// A corrupt value must not read as "quota exhausted" — that would lock a
// paying-attention user out of a feature they are entitled to.
export const readUsage = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { count: 0, month: '' };
    const parsed = JSON.parse(raw);
    const count = Number(parsed?.count);
    return {
      count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
      month: typeof parsed?.month === 'string' ? parsed.month : '',
    };
  } catch {
    return { count: 0, month: '' };
  }
};

// Scans spent in the current calendar month. A stored counter from a previous
// month reads as zero — that is the monthly reset.
export const scansUsed = (key) => {
  const u = readUsage(key);
  return u.month === currentMonth() ? u.count : 0;
};

// Remaining scans. Paid tiers are uncapped, and report Infinity rather than a
// number so a caller cannot accidentally render "0 left" to a Craft member.
export const scansLeft = (tier, key) => {
  if (isPaidTier(tier)) return Infinity;
  return Math.max(0, FREE_SCANS_PER_MONTH - scansUsed(key));
};

export const canScan = (tier, key) => scansLeft(tier, key) > 0;

// Spend one scan. Call this only after the scan has actually been performed —
// charging on attempt would bill the user for our own failures.
export const recordScan = (tier, key) => {
  if (isPaidTier(tier)) return;
  const month = currentMonth();
  const count = scansUsed(key) + 1;
  try {
    localStorage.setItem(key, JSON.stringify({ count, month }));
  } catch {}
};
