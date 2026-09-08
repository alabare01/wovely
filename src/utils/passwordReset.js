// ─── PASSWORD RESET, THE PARTS WITH NO UI IN THEM ────────────────────────────
//
// WHY THIS FILE EXISTS
// Wovely shipped with no password reset at all until 2026-09-08: no "Forgot
// password?" control, no call to Supabase's recover endpoint anywhere in the
// tree, no /reset-password route, and App.jsx explicitly discarded any
// `type=recovery` token that arrived. An email/password customer who forgot
// their password was locked out permanently.
//
// The rules below live here, apart from the screen that renders them, so they
// can be tested for real rather than asserted against source text. The screen
// is JSX and cannot be imported by node --test; this cannot break without a
// test noticing.

// Supabase's own minimum. Stated once so the validator and the copy that tells
// the user the number cannot drift apart.
export const MIN_PASSWORD_LENGTH = 6;

// Set by App.jsx the instant it claims a recovery token off the URL hash, read
// by the reset screen to decide which of its two steps to show.
export const RECOVERY_FLAG = "wovely_password_recovery";

// ONE message, whether or not the address has an account.
//
// Supabase answers /auth/v1/recover with 200 either way, deliberately, and the
// UI must not undo that. "No account with that email" would turn this screen
// into a free oracle for testing a leaked address list against Wovely's user
// base. The cost of the vaguer copy is one sentence of reassurance; the cost
// of the specific copy is every customer's email address being confirmable by
// a stranger.
export const RESET_SENT_MSG =
  "If that address has a Wovely account, a reset link is on its way. It lasts one hour. Check your spam folder if it has not arrived in a few minutes.";

/**
 * Can this new password be submitted, and if not, what does the person read?
 *
 * Pure on purpose: no DOM, no fetch, no storage. The reset screen renders
 * whatever this returns and adds nothing of its own.
 */
export const validateNewPassword = (pass, confirm) => {
  if (!pass || !confirm) return { ok: false, message: "Please fill in both fields." };
  if (pass.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (pass !== confirm) return { ok: false, message: "Those two passwords do not match." };
  return { ok: true, message: null };
};

/**
 * Which step the reset screen is on.
 *
 * Derived, never passed in. "set a new password" requires BOTH the recovery
 * flag and a real access token, so there is no way to land on the form with
 * nothing to change the password against. Losing either one drops back to
 * "ask for a link", which is a screen that can always make progress.
 */
export const resetStep = ({ recoveryFlag, hasAccessToken }) =>
  (recoveryFlag && hasAccessToken ? "set" : "request");

/**
 * What a failed reset request should say.
 *
 * 429 is the only failure a person can act on, so it is the only one named.
 * Everything else gets one honest sentence and a human to write to, because
 * "something went wrong" with no way forward is how a locked-out customer
 * becomes a refund.
 */
export const resetRequestErrorMessage = (status) =>
  (status === 429
    ? "Too many requests. Wait a minute and try again."
    : "We could not send that link just now. Try again in a moment, or email bev@wovely.app and a real person will sort it out.");
