// node screenshots/seed-audit.mjs
//
// S77 audit fixtures — idempotent. Seeds the two screens the pre-S76 harness
// never covered into the craft-loaded test account, using REAL prod patterns
// cloned read-only (prod rows are never mutated):
//
//   1. Craft hub source  — Blooming Daisy (12 named parts). A Craft user viewing
//      it gets the hub-and-spoke section grid (sections > 3 → RENDER.HUB).
//   2. Arcoiris MCAL      — the audit's canonical collection (d195886a) and its
//      clue patterns are gone from prod, so we rebuild an equivalent: a `mkal`
//      collection of chart-bearing clue children cloned from the surviving chart
//      clue, so the combined collection chart strip has real charts to render.
//
// Re-runs are no-ops once the fixtures exist. run.js calls this automatically;
// `npm run screenshots:seed-audit` runs it standalone.

import {
  CRAFT_HUB_SOURCE_ID, MKAL_CLUE_SOURCE_ID, MKAL_COLLECTION_NAME, MKAL_CLUE_COUNT,
} from "./config.js";
import {
  findUserByEmail, clonePattern, patternIdByTitlePrefix,
  mkalCollectionId, createCollectionRow, setPatternFields,
} from "./lib/supabase-admin.js";

const CRAFT_LOADED_EMAIL = "alabare+pw-craft-loaded@gmail.com";

export async function seedAuditFixtures(log = console.log) {
  const user = await findUserByEmail(CRAFT_LOADED_EMAIL);
  if (!user) throw new Error(`craft-loaded account not found (${CRAFT_LOADED_EMAIL}) — run the harness once to create it`);
  const userId = user.id;

  // 1 ─ Craft hub source (Blooming Daisy, 12 parts).
  log("• craft hub source (Blooming Daisy, 12 parts)");
  const existingHub = await patternIdByTitlePrefix(userId, "Blooming Daisy");
  if (existingHub) {
    log(`  already present (${existingHub})`);
  } else {
    const id = await clonePattern(CRAFT_HUB_SOURCE_ID, userId);
    // The prod source is soft-deleted (status='deleted'); clone inherits it,
    // which the app's status=neq.deleted library fetch would drop (→ redirect
    // to My Wovely). Force active so the clone is a live, viewable pattern.
    await setPatternFields(id, { status: "active" });
    log(`  cloned ${CRAFT_HUB_SOURCE_ID} → ${id} (status→active)`);
  }

  // 2 ─ Arcoiris MCAL collection with chart-bearing clue children.
  log(`• ${MKAL_COLLECTION_NAME} (mkal collection, ${MKAL_CLUE_COUNT} chart clues)`);
  const existingMkal = await mkalCollectionId(userId);
  if (existingMkal) {
    log(`  already present (${existingMkal})`);
  } else {
    const collectionId = await createCollectionRow(userId, {
      name: MKAL_COLLECTION_NAME,
      collection_type: "mkal",
      part_label: "Clue",
      expected_part_count: MKAL_CLUE_COUNT,
    });
    log(`  collection ${collectionId}`);
    for (let i = 1; i <= MKAL_CLUE_COUNT; i++) {
      const clueId = await clonePattern(MKAL_CLUE_SOURCE_ID, userId);
      await setPatternFields(clueId, {
        title: `Clue #${i}`,
        collection_id: collectionId,
        is_collection_part: true,
        collection_order: i, // MKAL clue order is 1-based (see utils/collections.js)
      });
      log(`    clue #${i} → ${clueId}`);
    }
  }

  log("Audit fixtures ready.");
}

// Allow standalone execution (cross-platform: match on script basename).
if ((process.argv[1] || "").replace(/\\/g, "/").endsWith("screenshots/seed-audit.mjs")) {
  seedAuditFixtures().catch((e) => { console.error("\nFatal:", e.message); process.exit(1); });
}
