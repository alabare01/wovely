// Self-serve account deletion.
//
// WHY THIS FILE EXISTS
// Until 2026-09-08 nothing in src/ or api/ could delete a Wovely account. The
// product asks a stranger for an email on the first screen and offered no way
// back out, and "email us and we will do it" is not self-serve.
//
// The failure mode this suite is really guarding against is subtler than the
// button going missing. Wovely already has a soft delete: deleting a pattern
// sets status='deleted' and the row stays in the table, filtered out of the
// library fetch. Reaching for that same pattern for an ACCOUNT would produce a
// delete that satisfies the UI and deletes nothing, which is worse than having
// no button, because now the promise has been made. So these assert real
// DELETEs and, above all, that the login itself goes.
//
// Source-level assertions: the handler talks to Supabase and Stripe, so it
// cannot be invoked here. What can be checked is that the code says what it
// must say and does not say what it must not.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const API = read('../api/delete-account.js');
const UI = read('../src/DeleteAccountSection.jsx');
const APP = read('../src/App.jsx');

// ── It exists and it is reachable ───────────────────────────────────────────

test('deletion: the endpoint exists and is a POST handler', () => {
  assert.match(API, /export default async function handler/);
  assert.match(API, /req\.method !== 'POST'/);
});

test('deletion: a signed-in user can reach it from settings', () => {
  assert.match(APP, /import DeleteAccountSection from "\.\/DeleteAccountSection\.jsx"/);
  assert.match(APP, /<DeleteAccountSection /,
    'the section is imported but never rendered, so there is still no way to delete an account');
  assert.match(APP, /authed&&!isAnonymous&&<DeleteAccountSection/,
    'deletion must be offered to signed-in accounts and not to guests, who have no account to delete');
  assert.match(UI, /fetch\("\/api\/delete-account"/);
});

// ── It actually deletes ─────────────────────────────────────────────────────

test('deletion: it is a real delete, not the soft delete used for patterns', () => {
  assert.doesNotMatch(API, /status:\s*['"]deleted['"]/,
    'the account "delete" is setting a status flag. That is the pattern soft delete, and it ' +
    'would leave every row in place while telling the user they were gone.');
  assert.match(API, /method: 'DELETE'/,
    'nothing in the handler issues a DELETE');
});

test('deletion: the login itself is removed', () => {
  // This is the one step that makes it real. Rows without an auth user is a
  // half delete; an auth user without rows is an account that still exists.
  assert.match(API, /auth\/v1\/admin\/users\/\$\{userId\}/,
    'the Supabase auth user is never deleted, so the account still exists after "deletion"');
  assert.match(API, /if \(!authDeleted\)/,
    'a failure to delete the login must not report success');
  assert.match(API, /delete_incomplete/,
    'a partial delete needs its own honest response, not a 200');
});

test('deletion: the user-owned tables are covered', () => {
  // Anything holding user rows that is missed here survives the deletion.
  for (const t of ['patterns', 'rows', 'collections', 'pattern_images', 'import_jobs',
                   'finished_objects', 'fo_comments', 'fo_likes', 'snaps', 'notes',
                   'yarn_stash', 'stitch_results', 'user_profiles', 'user_follows']) {
    assert.ok(API.includes(t), `${t} is never cleared, so those rows outlive the account`);
  }
});

test('deletion: kept rows are unlinked from the person', () => {
  // Operational logs and support conversations survive on purpose, but they
  // must stop pointing at a deleted human.
  assert.match(API, /\['vercel_logs', \{ user_id: null \}\]/);
  assert.match(API, /\['feedback', \{ user_id: null, email: null \}\]/);
});

// ── It cannot be triggered by accident or by a stranger ─────────────────────

test('deletion: the session is verified, not merely decoded', () => {
  assert.match(API, /auth\/v1\/user`, \{\s*headers: \{ apikey: anonKey, Authorization: `Bearer \$\{userToken\}` \}/,
    'the handler must ask Supabase who this token belongs to. Decoding a JWT client-side proves ' +
    'nothing about whether the session is real.');
  assert.doesNotMatch(API, /req\.body.*user_id|body\.userId/,
    'a user id must never come from the request body on a destructive endpoint');
  assert.match(API, /return res\.status\(401\)/);
});

test('deletion: it needs an explicit confirmation', () => {
  assert.match(API, /confirm !== 'DELETE'/,
    'a POST with no confirmation must not delete an account');
  assert.match(API, /confirmation_required/);
});

test('deletion: the UI asks the user to type the word', () => {
  assert.match(UI, /const CONFIRM_WORD = "DELETE"/);
  assert.match(UI, /typed\.trim\(\)\.toUpperCase\(\) === CONFIRM_WORD/,
    'a single tap must not be able to destroy an account');
  assert.match(UI, /disabled=\{!armed \|\| busy\}/,
    'the delete button must stay disabled until the confirmation is typed');
});

// ── Consequences it must not leave behind ───────────────────────────────────

test('deletion: billing is cancelled before the account goes', () => {
  assert.match(API, /stripe_subscription_id/,
    'a deleted account with a live subscription keeps being charged');
  assert.match(API, /subscriptions\.cancel/);
});

test('deletion: the client session is torn down afterwards', () => {
  assert.match(APP, /const handleAccountDeleted = async/);
  assert.match(APP, /saveSession\(null\)/);
  assert.match(APP, /onAccountDeleted=\{handleAccountDeleted\}/,
    'the section is rendered but nothing happens when the delete succeeds');
});

test('deletion: the copy says plainly what is about to happen', () => {
  assert.match(UI, /cannot be undone/i);
  assert.doesNotMatch(UI, /—/, 'em dash in user-facing copy');
  // A word followed immediately by "!", which is what copy looks like. The
  // bare character would match every negation and comparison in the file.
  assert.doesNotMatch(UI, /[A-Za-z0-9]!/, 'exclamation point in user-facing copy');
});
