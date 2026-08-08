import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// WHY THIS FILE EXISTS (2026-08-08): Adam was demoing Wovely live and stitch
// markers never appeared. STITCH_DICT carried only the abbreviations PM and SM,
// but real patterns overwhelmingly spell markers out, so the single instruction
// a beginner most needs help with was the one the app stayed silent about.
//
// These tests read the SHIPPING source rather than a retyped copy, so they fail
// if someone trims the dictionary or changes the dedupe rule.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, "..", "src", "RowManager.jsx"), "utf8");

// ── rebuild the real matcher from the real source ──────────────────────────
const dictBlock = SRC.slice(SRC.indexOf("const STITCH_DICT"), SRC.indexOf("const ABBR_PATTERN"));
const DICT = {};
for (const m of dictBlock.matchAll(/"([^"]+)"\s*:\s*\{\s*full:\s*"([^"]+)"(?:\s*,\s*show:\s*"([^"]+)")?\s*\}/g)) {
  DICT[m[1]] = { full: m[2], ...(m[3] ? { show: m[3] } : {}) };
}

const ABBR_PATTERN = new RegExp(
  "\\b(" + Object.keys(DICT).sort((a, b) => b.length - a.length).map(k => k.replace(/\s+/g, "\\s+")).join("|") + ")\\b",
  "gi"
);

// Mirrors findNewAbbr in RowManager.jsx, including the concept-level dedupe.
const findNewAbbr = (text, seen) => {
  const found = [];
  const re = new RegExp(ABBR_PATTERN.source, "gi");
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0].toUpperCase().replace(/\s+/g, " ");
    const info = DICT[raw];
    if (!info) continue;
    if (seen.has(info.full)) continue;
    seen.add(info.full);
    found.push({ ...info, raw: info.show || raw });
  }
  return found;
};

const pills = (text) => findNewAbbr(text, new Set()).map(a => a.raw);

// ── the bug that was demoed ────────────────────────────────────────────────
const SPELLED_OUT = [
  "Rnd 2: place marker in the first stitch",
  "Round 3: Place a stitch marker here",
  "Rnd 4: inc in each st around, move marker up",
  "Rnd 5: sc around, slip marker",
  "Rnd 6: work to the marker",
  "Rnd 7: place a marker in this st",
];

for (const row of SPELLED_OUT) {
  test(`a spelled-out marker still teaches one: ${row.slice(0, 42)}`, () => {
    const got = pills(row);
    assert.ok(
      got.some(p => p === "PM" || p === "SM"),
      `expected a PM or SM pill from "${row}", got [${got.join(", ")}]`
    );
  });
}

test("the abbreviated forms still work", () => {
  assert.deepEqual(pills("R6: 2 sc, PM, 4 sc"), ["SC", "PM"]);
  assert.ok(pills("Rnd 9: sm, then sc around").includes("SM"));
});

// ── the dedupe rule, which is what keeps the fix from being noisy ──────────
test("one concept teaches once, even under two spellings", () => {
  // "pm" and "place marker" are the same instruction. Two pills would teach
  // the same thing twice under two names, which is worse than staying quiet.
  const seen = new Set();
  const first = findNewAbbr("Rnd 1: pm in first st", seen);
  const second = findNewAbbr("Rnd 2: place marker again", seen);
  assert.equal(first.length, 1);
  assert.equal(second.length, 0, "the same concept taught twice");
});

test("slip stitch does not teach twice as SS and SL ST", () => {
  // Pre-existing bug in the same class, fixed by the same dedupe.
  const seen = new Set();
  findNewAbbr("Rnd 1: sl st to join", seen);
  const again = findNewAbbr("Rnd 2: ss in next st", seen);
  assert.equal(again.length, 0, "Slip Stitch taught twice under two spellings");
});

test("longest phrase wins, so 'marker' does not eat 'place a stitch marker'", () => {
  const got = findNewAbbr("Round 3: Place a stitch marker here", new Set());
  assert.equal(got.length, 1);
  assert.equal(got[0].full, "Place Marker");
});

// ── guards against the dictionary quietly regressing ───────────────────────
test("the dictionary still carries spelled-out marker language", () => {
  const keys = Object.keys(DICT);
  for (const needed of ["PLACE MARKER", "SLIP MARKER", "STITCH MARKER", "MARKER"]) {
    assert.ok(keys.includes(needed), `STITCH_DICT lost "${needed}"`);
  }
});

test("every spelled-out entry displays an abbreviation, not the phrase", () => {
  // The pill is a teaching device: hitting "place marker" should show "PM",
  // because PM is what the rest of the pattern will say.
  for (const [k, v] of Object.entries(DICT)) {
    if (k.includes(" ") && /marker/i.test(k)) {
      assert.ok(v.show, `"${k}" has no show value, the pill would print the whole phrase`);
      assert.ok(v.show.length <= 3, `"${k}" shows "${v.show}", expected a short abbreviation`);
    }
  }
});

test("the source really does dedupe on concept, not spelling", () => {
  assert.ok(
    /seenAbbr\.has\(info\.full\)/.test(SRC),
    "findNewAbbr no longer dedupes on info.full; the two-pills-for-one-stitch bug is back"
  );
});
