// Who is the owner, for the two owner-only easter eggs.
//
// WHY THIS IS NOT AN EMAIL ADDRESS. Until 2026-09-08 both checks compared
// `user.email` against Adam's personal address as a string literal. Vite
// inlines string literals, so that email shipped in the public production bundle
// and was readable by anyone who opened devtools or fetched the JS. It was
// flagged on 2026-07-16 as a 30 minute fix and verified still present in
// production on 2026-09-08, two hits in the shipped bundle.
//
// A Supabase user id is a random UUID. It is already public to its own owner,
// it is not an inbox, it cannot be spammed, phished or looked up, and this
// exact id is already committed in scripts/winback-send.mjs. So moving the
// comparison to the id removes the personal data without adding a lookup.
//
// An env var would not have fixed this: VITE_ prefixed values are inlined into
// the client bundle exactly the same way. The problem was never where the
// string was configured, it was that the string was an email address.
//
// This gates nothing that matters. Both call sites are cosmetic: a five tap
// logo easter egg and a keyboard shortcut that re-opens the What's New modal.
// Server-side authority must never be decided here.
const OWNER_USER_ID = "6e1a02d9-c210-4bc4-968e-dde3435565d1";

export function isOwner(user) {
  return Boolean(user && user.id === OWNER_USER_ID);
}
