// Password reset: the flow that did not exist.
//
// WHY THIS FILE EXISTS
// A real-browser audit of production on 2026-09-08 found Wovely had no
// password reset of any kind. Not a broken one — none at all:
//
//   · the sign-in screen had no "Forgot password?" anywhere;
//   · grep -rni "forgot|resetPasswordForEmail" src/ returned nothing, so
//     nothing in the codebase ever called Supabase's recover endpoint;
//   · no /reset-password route existed;
//   · and App.jsx explicitly threw recovery tokens away:
//         if (type === "recovery") { /* TODO */ return; }
//     so even a recovery link issued by hand from the Supabase dashboard
//     landed the user on the logged-out landing page and did nothing.
//
// Any email/password customer who forgot their password was locked out
// permanently with no self-service route. For a paying customer that is a
// refund and a support thread, which is why this gets a test file and not a
// line in a changelog.
//
// The pure rules are imported and exercised for real. The wiring — which
// component renders what, which route exists, which branch claims the token —
// is asserted against source text, because App.jsx and the screens are JSX and
// node --test cannot import them without a transform. Same technique as
// test/firstRun.test.mjs and test/moneyPath.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  MIN_PASSWORD_LENGTH,
  RECOVERY_FLAG,
  RESET_SENT_MSG,
  validateNewPassword,
  resetStep,
  resetRequestErrorMessage,
} from '../src/utils/passwordReset.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const APP = read('../src/App.jsx');
const AUTH = read('../src/Auth.jsx');
const WALL = read('../src/AuthWallModal.jsx');
const SUPA = read('../src/supabase.js');
const SCREEN = read('../src/ResetPassword.jsx');

// ── 1. The route exists, and exists once ─────────────────────────────────────

test('reset: the path is declared in exactly one place', () => {
  assert.match(SUPA, /export const RESET_PASSWORD_PATH = "\/reset-password"/,
    'RESET_PASSWORD_PATH must be defined in supabase.js as the single source of truth');
  // Nobody may hardcode the string. A second copy is how the redirect a
  // recovery email carries drifts away from the route that can serve it.
  for (const [name, src] of [['App.jsx', APP], ['Auth.jsx', AUTH], ['AuthWallModal.jsx', WALL]]) {
    assert.equal(/["'`]\/reset-password["'`]/.test(src), false,
      `${name} hardcodes "/reset-password" instead of importing RESET_PASSWORD_PATH`);
    assert.match(src, /RESET_PASSWORD_PATH/,
      `${name} should reference the shared RESET_PASSWORD_PATH constant`);
  }
});

test('reset: App routes /reset-password and knows the path', () => {
  assert.match(APP, /location\.pathname===RESET_PASSWORD_PATH/,
    'App.jsx must have a route branch for the reset path');
  assert.match(APP, /<ResetPassword/, 'the route must render the ResetPassword screen');
  // One list feeds both the not-found gate and the post-auth guard. From
  // 2026-09-16 to 2026-09-19 the path was in the guard's list and not the
  // gate's, and the gate renders first, so every recovery email landed on the
  // not-found page while this test passed.
  assert.match(APP, /KNOWN_APP_PATHS = \[[^\]]*RESET_PASSWORD_PATH/,
    'the reset path must be in KNOWN_APP_PATHS, or the not-found gate eats it');
  assert.equal(/knownPaths\s*=\s*\[/.test(APP), false,
    'no second hand-kept route list (knownPaths); the guard reads isKnownAppPath');
  const gateAt = APP.indexOf('if(!isKnownAppPath(location.pathname)) return <><CSS/><NotFoundPage');
  const routeAt = APP.indexOf('location.pathname===RESET_PASSWORD_PATH');
  assert.ok(gateAt > 0 && routeAt > gateAt,
    'the not-found gate renders before the reset route, so the gate must know the path');
});

test('reset: the route is served before the auth check', () => {
  // A recovery link puts a session in localStorage before React mounts, so the
  // visitor arrives "authed". Gating this route on !authed would hide the
  // screen from exactly the person who came to use it. Ordering is the whole
  // guarantee, so it is asserted by position.
  const routeAt = APP.indexOf('location.pathname===RESET_PASSWORD_PATH');
  const authGateAt = APP.indexOf('if(!authed) {');
  assert.ok(routeAt > 0, 'reset route branch not found');
  assert.ok(authGateAt > 0, 'auth gate not found');
  assert.ok(routeAt < authGateAt,
    'the /reset-password branch must return before the !authed gate');
});

// ── 2. The recovery token is claimed, not discarded ──────────────────────────

test('reset: recovery tokens are no longer thrown away', () => {
  assert.equal(/TODO\(password reset\)/.test(APP), false,
    'the TODO that discarded recovery tokens is still in App.jsx');
  assert.match(APP, /if \(type === "recovery"\)/,
    'App.jsx must still special-case type=recovery');
  assert.match(APP, /sessionStorage\.setItem\(RECOVERY_FLAG, "1"\)/,
    'a recovery arrival must raise the flag the reset screen reads');
  assert.match(APP, /replaceState\(\{\}, "", RESET_PASSWORD_PATH/,
    'a recovery arrival must land on the reset route, not the landing page');
});

test('reset: the session is saved BEFORE the recovery branch returns', () => {
  // The recovery session is what authorizes PUT /auth/v1/user. Returning
  // before saveSession would reproduce the original bug in a new shape: the
  // screen would render and the password change would have no credential.
  const saveAt = APP.indexOf('saveSession({');
  const branchAt = APP.indexOf('if (type === "recovery")');
  assert.ok(saveAt > 0 && branchAt > 0);
  assert.ok(saveAt < branchAt,
    'saveSession must run before the recovery branch, or there is no token to change the password with');
});

// ── 3. Supabase is actually called ───────────────────────────────────────────

test('reset: supabase.js calls the recover endpoint with a redirect', () => {
  assert.match(SUPA, /resetPasswordForEmail:/, 'resetPasswordForEmail must exist');
  assert.match(SUPA, /auth\/v1\/recover\?redirect_to=\$\{encodeURIComponent\(redirectTo\)\}/,
    'the recover call must carry an encoded redirect_to, or the email link goes nowhere useful');
  assert.match(SUPA, /redirectTo = `\$\{APP_ORIGIN\}\$\{RESET_PASSWORD_PATH\}`/,
    'the default redirect must be built from APP_ORIGIN + RESET_PASSWORD_PATH');
});

test('reset: supabase.js can set the new password', () => {
  assert.match(SUPA, /updatePassword:/, 'updatePassword must exist');
  const fn = SUPA.slice(SUPA.indexOf('updatePassword:'), SUPA.indexOf('signInWithOtp:'));
  assert.match(fn, /auth\/v1\/user/, 'updatePassword must PUT the user endpoint');
  assert.match(fn, /method: "PUT"/);
  assert.match(fn, /Authorization.*access_token/s,
    'the change must be authorized by the recovery session');
});

// ── 4. The user can find it ──────────────────────────────────────────────────

test('reset: sign-in surfaces offer a way in', () => {
  assert.match(AUTH, /Forgot password\?/,
    'the landing sign-in card must offer "Forgot password?"');
  assert.match(WALL, /Forgot password\?/,
    'the in-app auth wall must offer "Forgot password?" too');
  // Offered on sign-in, not on signup, where it would be meaningless.
  assert.match(AUTH, /isSignIn && \(\s*<div style=\{\{ textAlign: "right"/,
    'the landing control must be gated on sign-in mode');
  assert.match(WALL, /mode === "signin" && \(/,
    'the wall control must be gated on sign-in mode');
});

// ── 5. The rules, exercised rather than described ────────────────────────────

test('reset: a new password is checked before it is sent', () => {
  assert.equal(validateNewPassword('', '').ok, false);
  assert.equal(validateNewPassword('hunter2', '').ok, false);
  assert.equal(validateNewPassword('short', 'short').ok, false, 'five characters is under the minimum');
  assert.equal(validateNewPassword('abcdef', 'abcdeg').ok, false, 'a mismatch must not submit');
  assert.equal(validateNewPassword('abcdef', 'abcdef').ok, true);
  // Every rejection carries something the person can act on.
  for (const [a, b] of [['', ''], ['short', 'short'], ['abcdef', 'abcdeg']]) {
    const r = validateNewPassword(a, b);
    assert.equal(r.ok, false);
    assert.ok(r.message && r.message.length > 10, 'a rejection with no message is a dead form');
  }
});

test('reset: the minimum length in the copy is the minimum enforced', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
  const justUnder = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
  const justRight = 'x'.repeat(MIN_PASSWORD_LENGTH);
  assert.equal(validateNewPassword(justUnder, justUnder).ok, false);
  assert.equal(validateNewPassword(justRight, justRight).ok, true);
  assert.match(validateNewPassword(justUnder, justUnder).message, new RegExp(String(MIN_PASSWORD_LENGTH)));
  // The screen must print the number rather than a second hardcoded copy.
  assert.match(SCREEN, /\{MIN_PASSWORD_LENGTH\} characters/);
});

test('reset: "set a new password" needs BOTH a flag and a token', () => {
  assert.equal(resetStep({ recoveryFlag: true, hasAccessToken: true }), 'set');
  assert.equal(resetStep({ recoveryFlag: true, hasAccessToken: false }), 'request',
    'a flag with no session must fall back to asking for a link, never to a form that cannot save');
  assert.equal(resetStep({ recoveryFlag: false, hasAccessToken: true }), 'request',
    'an ordinary signed-in visitor must not be shown the recovery form');
  assert.equal(resetStep({ recoveryFlag: false, hasAccessToken: false }), 'request');
});

test('reset: the confirmation never says whether the account exists', () => {
  // Supabase answers 200 either way on purpose. Copy that says "no account
  // with that email" would hand a stranger a way to test a leaked address list
  // against Wovely's users.
  const lowered = RESET_SENT_MSG.toLowerCase();
  assert.match(lowered, /if that address has a wovely account/);
  for (const leak of ['no account', 'not found', "doesn't exist", 'does not exist', 'unknown email']) {
    assert.equal(lowered.includes(leak), false, `the sent message leaks existence: "${leak}"`);
  }
  // And the screen must render that one message rather than branching.
  assert.match(SCREEN, /\{RESET_SENT_MSG\}/);
});

test('reset: a rate limit is named, everything else offers a human', () => {
  assert.match(resetRequestErrorMessage(429), /Too many requests/);
  assert.match(resetRequestErrorMessage(500), /bev@wovely\.app/,
    'an unexplained failure must leave the customer a person to write to');
  assert.match(resetRequestErrorMessage(undefined), /bev@wovely\.app/);
});

test('reset: the flag name matches on both sides of the handoff', () => {
  assert.equal(RECOVERY_FLAG, 'wovely_password_recovery');
  // App.jsx writes it, the screen reads it. Different strings would leave the
  // screen permanently on the request step for someone holding a live token.
  assert.match(APP, /RECOVERY_FLAG/);
  assert.match(SCREEN, /RECOVERY_FLAG/);
  assert.equal(/["']wovely_password_recovery["']/.test(APP), false,
    'App.jsx must use the shared constant, not a second copy of the string');
});

// ── 6. House style ───────────────────────────────────────────────────────────

// Comments never reach a browser (the build strips them), so the rule is
// enforced on the code that ships, not on the notes around it.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trimStart().startsWith('//')).join('\n');

test('reset: the new screens keep the writing rules', () => {
  for (const [name, src] of [['ResetPassword.jsx', SCREEN], ['SharedLinkGate.jsx', read('../src/SharedLinkGate.jsx')]]) {
    const code = stripComments(src);
    assert.equal(code.includes('—'), false, `em dash in ${name}`);
    assert.equal(/[A-Za-z]!/.test(code), false, `exclamation point in ${name} copy`);
  }
  assert.equal(RESET_SENT_MSG.includes('!'), false, 'exclamation point in outward copy');
});
