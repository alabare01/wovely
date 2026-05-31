// node screenshots/reset.js
//
// Wipes the six test accounts (auth users + their patterns/images/jobs/
// collections) and recreates them from scratch, then re-seeds. Use when seed
// data has drifted or you want a clean baseline. Normal runs do NOT need this —
// accounts and patterns persist between runs.

import { ACCOUNTS } from "./config.js";
import { findUserByEmail, deleteUser } from "./lib/supabase-admin.js";
import { ensureAccounts } from "./lib/accounts.js";
import { seedPatterns } from "./lib/seed.js";

const log = (...a) => console.log(...a);

async function main() {
  log("Resetting test accounts…");
  for (const a of ACCOUNTS) {
    const user = await findUserByEmail(a.email);
    if (user) {
      await deleteUser(user.id);
      log(`  deleted ${a.email}`);
    } else {
      log(`  (absent) ${a.email}`);
    }
  }

  log("\nRecreating accounts…");
  const accountsMap = await ensureAccounts(log);

  log("\nRe-seeding patterns…");
  await seedPatterns(accountsMap, { reseed: true, log });

  log("\nReset complete.");
}

main().catch((e) => {
  console.error("\nFatal:", e.message);
  process.exit(1);
});
