// Ensure the six test accounts exist with the correct tier. Idempotent: safe to
// run before every capture. Accounts persist between runs (the reset script is
// the only thing that deletes them).

import { ACCOUNTS } from "../config.js";
import { env } from "./env.js";
import { ensureUser, setTierAndProfile } from "./supabase-admin.js";

// Returns a map: account key -> { ...account, userId }.
export async function ensureAccounts(log = console.log) {
  const result = {};
  for (const acct of ACCOUNTS) {
    const { id, created } = await ensureUser(acct.email, env.TEST_PASSWORD);
    await setTierAndProfile(id, acct.tier);
    result[acct.key] = { ...acct, userId: id };
    log(`  ${created ? "created" : "exists "} ${acct.email}  →  tier=${acct.tier}`);
  }
  return result;
}
