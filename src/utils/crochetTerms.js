// ─── UK ⇄ US CROCHET TERM ENGINE + ABBREVIATION REFERENCE ────────────────────
//
// Why this exists, and why it is a converter and not another chart:
//
// Every page ranking for "uk to us crochet terms" serves a static table and
// then tells the reader to "work through the pattern stitch by stitch and
// replace every UK abbreviation with its US equivalent." That instruction is a
// description of a find-and-replace, done by hand, on a document, by a person.
//
// It is also the one job a human is worst at, because the two dialects SHARE
// abbreviations with different meanings. UK "dc" is US "sc". US "dc" is UK
// "tr". A person doing this by hand with a chart converts "dc" to "sc", then
// reaches a "tr", converts it to "dc", and now the document contains two kinds
// of "dc": one already converted and one not. Sequential replacement corrupts
// the pattern. That is the actual failure mode, and it is why people give up.
//
// The fix is a SIMULTANEOUS single pass: every token is read once, mapped once,
// and written once. A converted token is never re-examined. That is what
// convertPattern does, and it is the entire reason software beats the chart.
//
// This module is deliberately pure (no React, no DOM, no network) so the
// mapping can be unit-tested. See test/crochetTerms.test.mjs.

// ─────────────────────────────────────────────────────────────────────────────
// THE MAPPING
//
// The UK and US ladders are offset by one rung. Reading up in height:
//   UK:  ss  → dc  → htr → tr  → dtr → trtr → quadtr
//   US:  sl st → sc  → hdc → dc  → tr  → dtr  → trtr
// Chain and slip stitch are the same in both. Everything taller is offset.
// ─────────────────────────────────────────────────────────────────────────────

/** The stitch ladder, tallest last. The single source of truth for both the
 *  conversion maps and the chart rendered on the page. */
export const STITCH_LADDER = [
  { us: "sl st", usName: "slip stitch",        uk: "ss",     ukName: "slip stitch",       same: true },
  { us: "ch",    usName: "chain",              uk: "ch",     ukName: "chain",             same: true },
  { us: "sc",    usName: "single crochet",     uk: "dc",     ukName: "double crochet" },
  { us: "hdc",   usName: "half double crochet",uk: "htr",    ukName: "half treble" },
  { us: "dc",    usName: "double crochet",     uk: "tr",     ukName: "treble" },
  { us: "tr",    usName: "treble crochet",     uk: "dtr",    ukName: "double treble" },
  { us: "dtr",   usName: "double treble",      uk: "trtr",   ukName: "triple treble" },
  { us: "trtr",  usName: "triple treble",      uk: "quadtr", ukName: "quadruple treble" },
];

/** Terms that are not stitches but still differ between the dialects. */
export const VOCAB_PAIRS = [
  { us: "yo",    usName: "yarn over",   uk: "yrh",     ukName: "yarn round hook" },
  { us: "sk",    usName: "skip",        uk: "miss",    ukName: "miss" },
  { us: "gauge", usName: "gauge",       uk: "tension", ukName: "tension" },
];

// Token maps. Keys and values are lowercase; case is restored at write time.
// Only ABBREVIATIONS and single whole words live here — multi-word phrases are
// handled by the phrase pass so the two passes can never collide.
const UK_TO_US_TOKENS = {
  // stitch ladder
  dc: "sc", htr: "hdc", tr: "dc", dtr: "tr", trtr: "dtr", ttr: "dtr",
  quadtr: "trtr", qtr: "trtr", ss: "sl st",
  // Bare "treble" with no "crochet" after it. UK treble is US double crochet.
  // The phrase pass has already consumed "treble crochet", "half treble",
  // "double treble" and "triple treble" by the time this map is consulted, so
  // anything reaching here is a genuinely bare treble. This entry was missing,
  // and its absence was silent: the word was left in the output while the page
  // reported a successful conversion.
  treble: "double crochet",
  // post stitches ride the same offset
  fpdc: "fpsc", bpdc: "bpsc",
  fphtr: "fphdc", bphtr: "bphdc",
  fptr: "fpdc", bptr: "bpdc",
  fpdtr: "fptr", bpdtr: "bptr",
  // vocabulary
  yrh: "yo", yoh: "yo",
  miss: "skip", misses: "skips", missed: "skipped", missing: "skipping",
  tension: "gauge",
};

const US_TO_UK_TOKENS = {
  // stitch ladder
  sc: "dc", hdc: "htr", dc: "tr", tr: "dtr", dtr: "trtr", trtr: "quadtr",
  // Bare "treble": US treble is UK double treble. Same reasoning as the UK map.
  treble: "double treble",
  // post stitches
  fpsc: "fpdc", bpsc: "bpdc",
  fphdc: "fphtr", bphdc: "bphtr",
  fpdc: "fptr", bpdc: "bptr",
  fptr: "fpdtr", bptr: "bpdtr",
  // vocabulary
  yo: "yrh", yoh: "yrh",
  skip: "miss", skips: "misses", skipped: "missed", skipping: "missing",
  sk: "miss",
  gauge: "tension",
};

// Multi-word phrases, LONGEST FIRST. JS alternation takes the first matching
// alternative at a position, so "double treble crochet" must be listed before
// "treble crochet" or the longer phrase never wins.
const UK_TO_US_PHRASES = [
  ["quadruple treble crochet", "triple treble crochet"],
  ["quadruple treble", "triple treble"],
  ["triple treble crochet", "double treble crochet"],
  ["triple treble", "double treble"],
  ["double treble crochet", "treble crochet"],
  ["double treble", "treble crochet"],
  ["half treble crochet", "half double crochet"],
  ["half treble", "half double crochet"],
  ["treble crochet", "double crochet"],
  ["double crochet", "single crochet"],
  ["yarn round hook", "yarn over"],
  ["yarn over hook", "yarn over"],
  ["uk terms", "US terms"],
  ["uk crochet terms", "US crochet terms"],
  ["british terms", "US terms"],
];

const US_TO_UK_PHRASES = [
  ["triple treble crochet", "quadruple treble crochet"],
  ["triple treble", "quadruple treble"],
  ["double treble crochet", "triple treble crochet"],
  ["double treble", "triple treble"],
  ["treble crochet", "double treble crochet"],
  ["half double crochet", "half treble crochet"],
  ["single crochet", "double crochet"],
  ["double crochet", "treble crochet"],
  ["yarn over hook", "yarn round hook"],
  ["yarn over", "yarn round hook"],
  ["us terms", "UK terms"],
  ["us crochet terms", "UK crochet terms"],
  ["american terms", "UK terms"],
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Patterns say "work 3 double trebles", so every phrase is matched with an
 *  optional trailing "s". Without it the phrase pass would miss "double
 *  trebles", the token pass would then find the bare word "trebles" inside it,
 *  and the output would read "double double crochets". */
const buildPhraseRe = (pairs) =>
  new RegExp("\\b(?:" + pairs.map(([from]) => escapeRe(from)).join("|") + ")s?\\b", "gi");

/** "miss" pluralises to "misses", not "misss". */
const pluralise = (word) => (/(?:s|sh|ch|x|z)$/i.test(word) ? word + "es" : word + "s");

const UK_TO_US_PHRASE_RE = buildPhraseRe(UK_TO_US_PHRASES);
const US_TO_UK_PHRASE_RE = buildPhraseRe(US_TO_UK_PHRASES);

const phraseLookup = (pairs) => {
  const m = Object.create(null);
  for (const [from, to] of pairs) m[from.toLowerCase()] = to;
  return m;
};
const UK_TO_US_PHRASE_MAP = phraseLookup(UK_TO_US_PHRASES);
const US_TO_UK_PHRASE_MAP = phraseLookup(US_TO_UK_PHRASES);

/** Restore the source token's capitalisation onto the replacement.
 *  "DC" → "SC", "Dc" → "Sc", "dc" → "sc". */
function matchCase(source, replacement) {
  if (source === source.toUpperCase() && /[A-Z]/.test(source)) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Convert a whole pattern between UK and US terminology in one simultaneous
 * pass. Returns segments (so the UI can highlight exactly what changed), a
 * per-term tally, and the plain output text.
 *
 * @param {string} text
 * @param {"uk-to-us"|"us-to-uk"} direction
 */
export function convertPattern(text, direction = "uk-to-us") {
  const ukToUs = direction !== "us-to-uk";
  const phraseRe = ukToUs ? UK_TO_US_PHRASE_RE : US_TO_UK_PHRASE_RE;
  const phraseMap = ukToUs ? UK_TO_US_PHRASE_MAP : US_TO_UK_PHRASE_MAP;
  const tokenMap = ukToUs ? UK_TO_US_TOKENS : US_TO_UK_TOKENS;

  const segments = [];
  const counts = new Map();

  const record = (from, to) => {
    // Separator is an escape sequence, never a literal control byte. A raw NUL
    // written into the source makes git treat the whole file as binary, so the
    // engine stops being reviewable in a diff.
    const key = from.toLowerCase() + " => " + to.toLowerCase();
    const prev = counts.get(key);
    if (prev) prev.n += 1;
    else counts.set(key, { from: from.toLowerCase(), to: to.toLowerCase(), n: 1 });
  };

  const push = (t, changed, from) => {
    if (!t) return;
    const last = segments[segments.length - 1];
    if (!changed && last && !last.changed) { last.text += t; return; }
    segments.push(changed ? { text: t, changed: true, from } : { text: t, changed: false });
  };

  // Pass 2 — every maximal run of letters is looked up exactly once. Splitting
  // on letter runs (rather than \b word boundaries) is what makes "2dc" and
  // "dc2tog" work: the digits are simply not part of the token, so "dc2tog"
  // becomes "sc" + "2tog" = "sc2tog" for free.
  const tokenPass = (chunk) => {
    let last = 0;
    const re = /[A-Za-z]+/g;
    let m;
    while ((m = re.exec(chunk)) !== null) {
      const word = m[0];
      const lower = word.toLowerCase();
      let hit = tokenMap[lower];
      // Plurals. Patterns really do say "3 dcs" and "work 6 trebles", and the
      // maps only hold singulars, so without this the plural form was left
      // untouched while the page still reported a clean conversion. Only a
      // trailing "s" is stripped, and only when the stem is a term we know:
      // every key in both maps is an abbreviation or a craft word, none of
      // which is the stem of an ordinary English plural.
      if (!hit && lower.length > 2 && lower.endsWith("s") && tokenMap[lower.slice(0, -1)]) {
        hit = pluralise(tokenMap[lower.slice(0, -1)]);
      }
      if (hit) {
        push(chunk.slice(last, m.index), false);
        push(matchCase(word, hit), true, word);
        record(word, hit);
        last = m.index + word.length;
      }
    }
    push(chunk.slice(last), false);
  };

  // Pass 1 — multi-word phrases. Runs first, and its OUTPUT is never re-read,
  // so a phrase can never be converted twice.
  let last = 0;
  let m;
  phraseRe.lastIndex = 0;
  while ((m = phraseRe.exec(text)) !== null) {
    const phrase = m[0];
    const key = phrase.toLowerCase();
    let hit = phraseMap[key];
    // The regex allows a trailing "s"; if the plural is what matched, look up
    // the singular and pluralise the replacement to match.
    if (!hit && key.endsWith("s") && phraseMap[key.slice(0, -1)]) {
      hit = pluralise(phraseMap[key.slice(0, -1)]);
    }
    if (!hit) continue;
    tokenPass(text.slice(last, m.index));
    push(matchCase(phrase, hit), true, phrase);
    record(phrase, hit);
    last = m.index + phrase.length;
  }
  tokenPass(text.slice(last));

  const outputText = segments.map((s) => s.text).join("");
  const changeList = [...counts.values()].sort((a, b) => b.n - a.n);
  const totalChanges = changeList.reduce((sum, c) => sum + c.n, 0);
  const unhandled = findResidual(segments, ukToUs);

  return { segments, changes: changeList, totalChanges, outputText, unhandled };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE RESIDUAL CHECK — the converter's own auditor
//
// The maps above are a list of things the engine knows. This list is a
// SEPARATE, independently maintained list of vocabulary that belongs to the
// source dialect and therefore must not survive a conversion. After the pass
// runs, the segments that were NOT changed are scanned against it.
//
// Two lists that have to agree is the point. A term missing from the maps used
// to leave the page announcing a successful conversion over a document that
// still contained an unconverted stitch name — exactly the silent corruption
// the page argues against. Now a gap between the two lists surfaces as a
// warning to the reader and fails a unit test, instead of passing quietly.
// ─────────────────────────────────────────────────────────────────────────────

const UK_RESIDUAL = [
  /\btrebles?\b/i, /\bhtrs?\b/i, /\bdtrs?\b/i, /\btrtrs?\b/i, /\bttrs?\b/i,
  /\bquadtrs?\b/i, /\bqtrs?\b/i, /\byrhs?\b/i,
  /\bmiss(?:es|ed|ing)?\b/i, /\btension\b/i,
];

const US_RESIDUAL = [
  /\bscs?\b/i, /\bhdcs?\b/i, /\bsingle crochets?\b/i, /\bhalf double crochets?\b/i,
  /\bgauge\b/i, /\bskip(?:s|ped|ping)?\b/i, /\bsks?\b/i, /\byos?\b/i,
];

/** Scan only the UNCHANGED segments: anything the pass rewrote is by definition
 *  handled, and its output legitimately contains target-dialect words.
 *  Exported so the mechanism itself can be tested. In normal running it finds
 *  nothing, because the maps and the residual list are kept in agreement by a
 *  unit test — it is a tripwire for the day they stop agreeing. */
export function findResidual(segments, ukToUs) {
  const list = ukToUs ? UK_RESIDUAL : US_RESIDUAL;
  const seen = new Map();
  for (const seg of segments) {
    if (seg.changed) continue;
    for (const re of list) {
      const g = new RegExp(re.source, "gi");
      let m;
      while ((m = g.exec(seg.text)) !== null) {
        const k = m[0].toLowerCase();
        seen.set(k, (seen.get(k) || 0) + 1);
      }
    }
  }
  return [...seen.entries()].map(([term, n]) => ({ term, n })).sort((a, b) => b.n - a.n);
}

// ─────────────────────────────────────────────────────────────────────────────
// DIALECT DETECTION
//
// Only UNAMBIGUOUS markers count. "dc" and "tr" appear in both dialects with
// different meanings, so they are evidence of nothing and are excluded. If a
// pattern contains only ambiguous tokens we say so rather than guess — a
// converter that silently picks the wrong direction destroys the pattern.
// ─────────────────────────────────────────────────────────────────────────────

const UK_MARKERS = [
  /\bhtr\b/i, /\bdtr\b/i, /\btrtr\b/i, /\bttr\b/i, /\byrh\b/i,
  /\bmiss(?:es|ed|ing)?\b/i, /\btension\b/i,
  /\bhalf treble\b/i, /\bdouble treble\b/i, /\btriple treble\b/i,
  /\btreble crochet\b/i, /\bUK terms?\b/i, /\bBritish\b/i,
];
// NOTE: no lookbehind anywhere in this file. A regex LITERAL is compiled when
// the module is parsed, so an unsupported `(?<!...)` throws a SyntaxError
// before a single line runs — which would blank the entire app, not just this
// page, on any engine that lacks it. `(^|[^a-z])` is the portable equivalent
// and costs nothing here.
const US_MARKERS = [
  /(^|[^a-z])sc([^a-z]|$)/i, /(^|[^a-z])hdc([^a-z]|$)/i, /\byo\b/i,
  /\bsk(?:ip|ips|ipped)?\b/i, /\bgauge\b/i,
  /\bsingle crochet\b/i, /\bhalf double crochet\b/i,
  /\bUS terms?\b/i, /\bAmerican\b/i, /\bmagic ring\b/i,
];
// Ambiguous tokens: present in both dialects, meaning different things.
const AMBIGUOUS = [/(^|[^a-z])dc([^a-z]|$)/i, /(^|[^a-z])tr([^a-z]|$)/i, /\bdouble crochet\b/i];

const countHits = (text, res) => {
  let n = 0;
  const found = [];
  for (const re of res) {
    const m = text.match(re);
    if (m) { n += 1; found.push(m[0].toLowerCase()); }
  }
  return { n, found };
};

/**
 * Guess which dialect a pattern is written in.
 * @returns {{dialect:"uk"|"us"|"unknown", ukHits:string[], usHits:string[], ambiguous:boolean, confident:boolean}}
 */
export function detectDialect(text) {
  if (!text || !text.trim()) {
    return { dialect: "unknown", ukHits: [], usHits: [], ambiguous: false, confident: false };
  }
  const uk = countHits(text, UK_MARKERS);
  const us = countHits(text, US_MARKERS);
  const ambiguous = AMBIGUOUS.some((re) => re.test(text));

  let dialect = "unknown";
  if (uk.n > us.n) dialect = "uk";
  else if (us.n > uk.n) dialect = "us";

  // Confident only when one dialect is clearly ahead and actually has evidence.
  const confident = dialect !== "unknown" && Math.max(uk.n, us.n) >= 2 && Math.min(uk.n, us.n) === 0;

  return { dialect, ukHits: uk.found, usHits: us.found, ambiguous, confident };
}

// ─────────────────────────────────────────────────────────────────────────────
// ABBREVIATION REFERENCE
//
// US abbreviation first (the dominant dialect in published patterns), with the
// UK equivalent alongside and a plain-English description of what your hands
// actually do. The description is the point: a bare chart tells you "sc2tog =
// single crochet 2 together", which is not an answer to anyone's question.
// ─────────────────────────────────────────────────────────────────────────────

export const ABBREVIATIONS = [
  // ── basic stitches ──
  { abbr: "ch", name: "chain", uk: "ch", group: "Stitches",
    what: "Yarn over and pull through the loop on your hook. Chains make the foundation row and the gaps in lace." },
  { abbr: "sl st", name: "slip stitch", uk: "ss", group: "Stitches",
    what: "Insert the hook, yarn over, and pull straight through everything on the hook. Adds almost no height; used to join a round or travel across stitches." },
  { abbr: "sc", name: "single crochet", uk: "dc (double crochet)", group: "Stitches",
    what: "Insert, yarn over, pull up a loop, yarn over, pull through both loops. The short dense stitch amigurumi is built from." },
  { abbr: "hdc", name: "half double crochet", uk: "htr (half treble)", group: "Stitches",
    what: "Yarn over BEFORE you insert, pull up a loop, then yarn over and pull through all three loops at once." },
  { abbr: "dc", name: "double crochet", uk: "tr (treble)", group: "Stitches",
    what: "Yarn over, insert, pull up a loop, then twice: yarn over and pull through two. The workhorse of blankets and garments." },
  { abbr: "tr", name: "treble (triple) crochet", uk: "dtr (double treble)", group: "Stitches",
    what: "Yarn over twice before inserting, then clear the loops two at a time, three times. Tall and open." },
  { abbr: "dtr", name: "double treble crochet", uk: "trtr (triple treble)", group: "Stitches",
    what: "Yarn over three times before inserting, then clear two loops at a time, four times." },

  // ── shaping ──
  { abbr: "inc", name: "increase", uk: "inc", group: "Shaping",
    what: "Two stitches worked into the same stitch below. Your count goes up by one each time." },
  { abbr: "dec", name: "decrease", uk: "dec", group: "Shaping",
    what: "Two stitches joined into one. Your count goes down by one each time." },
  { abbr: "sc2tog", name: "single crochet 2 together", uk: "dc2tog", group: "Shaping",
    what: "Pull up a loop in each of the next 2 stitches (3 loops on the hook), then yarn over and pull through all 3." },
  { abbr: "hdc2tog", name: "half double crochet 2 together", uk: "htr2tog", group: "Shaping",
    what: "Start an hdc in each of the next 2 stitches without finishing either, then yarn over and close all the loops together." },
  { abbr: "dc2tog", name: "double crochet 2 together", uk: "tr2tog", group: "Shaping",
    what: "Work a dc in each of the next 2 stitches but stop with the last 2 loops of each on the hook, then pull through all 3 at once." },
  { abbr: "dc3tog", name: "double crochet 3 together", uk: "tr3tog", group: "Shaping",
    what: "The same idea across 3 stitches. Turns 3 stitches into 1 and is often used to make a cluster." },
  { abbr: "inv dec", name: "invisible decrease", uk: "inv dec", group: "Shaping",
    what: "Amigurumi decrease worked through the FRONT loops only of the next 2 stitches, so the join does not leave a visible bump." },
  { abbr: "tog", name: "together", uk: "tog", group: "Shaping",
    what: "Work the named stitches and close them into a single stitch. Always appears attached to a number, as in 2tog or 3tog." },

  // ── post and placement ──
  { abbr: "fpdc", name: "front post double crochet", uk: "fptr", group: "Post & placement",
    what: "Work a dc around the vertical post of the stitch below, going in from the front. The stitch pops toward you, which is how ribbing and cables are made." },
  { abbr: "bpdc", name: "back post double crochet", uk: "bptr", group: "Post & placement",
    what: "The same, but the hook goes in from the back. The stitch pushes away from you. Alternate with fpdc for ribbing." },
  { abbr: "fpsc", name: "front post single crochet", uk: "fpdc", group: "Post & placement",
    what: "A single crochet worked around the post of the stitch below, from the front." },
  { abbr: "bpsc", name: "back post single crochet", uk: "bpdc", group: "Post & placement",
    what: "A single crochet worked around the post of the stitch below, from the back." },
  { abbr: "blo", name: "back loop only", uk: "blo", group: "Post & placement",
    what: "Work into just the far loop of the stitch top. Leaves a visible ridge on the near side and makes the fabric stretchier." },
  { abbr: "flo", name: "front loop only", uk: "flo", group: "Post & placement",
    what: "Work into just the near loop. The mirror of blo, and the loop the invisible decrease uses." },
  { abbr: "tbl", name: "through the back loop", uk: "tbl", group: "Post & placement",
    what: "Another way of writing back loop only. Same instruction." },
  { abbr: "ch-sp", name: "chain space", uk: "ch-sp", group: "Post & placement",
    what: "The gap a chain leaves in the previous row. You work into the hole itself, not into the individual chain stitches." },
  { abbr: "sp", name: "space", uk: "sp", group: "Post & placement",
    what: "Any gap you work into rather than a stitch, most often the hole left by a chain in the row below." },
  { abbr: "st / sts", name: "stitch / stitches", uk: "st / sts", group: "Post & placement",
    what: "A finished stitch in the row below. The count in brackets at the end of a row is how many you should have." },
  { abbr: "sk", name: "skip", uk: "miss", group: "Post & placement",
    what: "Pass over the named stitches without working into them. UK patterns say miss instead." },
  { abbr: "yo", name: "yarn over", uk: "yrh (yarn round hook)", group: "Post & placement",
    what: "Wrap the yarn over the hook from back to front. UK patterns write yrh." },

  // ── amigurumi ──
  { abbr: "MR", name: "magic ring", uk: "MR", group: "Amigurumi",
    what: "An adjustable loop you crochet into and then pull tight, so the center of a round closes with no hole. Also written magic circle, adjustable ring, MC or AR." },
  { abbr: "FO", name: "fasten off", uk: "FO", group: "Amigurumi",
    what: "Cut the yarn, pull the tail all the way through the last loop, and pull tight." },
  { abbr: "pm / sm", name: "place marker / slip marker", uk: "pm / sm", group: "Amigurumi",
    what: "Put a stitch marker in the stitch named, or move the marker you already have up to the current round. In a spiral this is the only way to find the start." },
  // Letter shorthand, common in Instagram, TikTok and translated amigurumi
  // patterns. r/CrochetHelp 2026-09-15: "I'm not sure if in row 19 the
  // (3X,V,3X) is on the same stitch or not." It is not; each letter is one
  // instruction, the brackets group a repeat.
  { abbr: "X", letter: true, name: "single crochet (letter shorthand)", uk: "X (dc)", group: "Amigurumi",
    what: "One single crochet. 3X means three single crochets in the next three stitches, one each. Brackets like (3X, V, 3X) are a sequence to work in order, not one stitch." },
  { abbr: "V", letter: true, name: "increase (letter shorthand)", uk: "V", group: "Amigurumi",
    what: "Two single crochets in the same stitch, the shape of a V. Same as inc. Your count goes up by one." },
  { abbr: "A", letter: true, name: "decrease (letter shorthand)", uk: "A", group: "Amigurumi",
    what: "Two stitches joined into one, the shape of an A. Same as dec or sc2tog, usually the invisible decrease in amigurumi. Your count goes down by one." },
  { abbr: "W", letter: true, name: "triple increase (letter shorthand)", uk: "W", group: "Amigurumi",
    what: "Three single crochets in the same stitch. Your count goes up by two." },
  { abbr: "M", letter: true, name: "triple decrease (letter shorthand)", uk: "M", group: "Amigurumi",
    what: "Three stitches joined into one. Your count goes down by two. Rare; most patterns use two A's instead." },

  // ── pattern shorthand ──
  { abbr: "rnd", name: "round", uk: "rnd", group: "Pattern shorthand",
    what: "A row worked in a circle. Rounds may spiral continuously or be joined and turned." },
  { abbr: "rep", name: "repeat", uk: "rep", group: "Pattern shorthand",
    what: "Work the named section again. Usually paired with brackets or an asterisk marking where to repeat from." },
  { abbr: "rem", name: "remaining", uk: "rem", group: "Pattern shorthand",
    what: "However many are left, rather than a fixed number." },
  { abbr: "beg", name: "beginning", uk: "beg", group: "Pattern shorthand",
    what: "The start of the row or round. Often paired with a stitch, as in beg ch-3, meaning the chain that starts the row." },
  { abbr: "foll", name: "following", uk: "foll", group: "Pattern shorthand",
    what: "The next one, or the ones that come after the row you are on. Common in UK-written garment patterns." },
  { abbr: "alt", name: "alternate", uk: "alt", group: "Pattern shorthand",
    what: "Every other one. Common in UK-written patterns." },
  { abbr: "cont", name: "continue", uk: "cont", group: "Pattern shorthand",
    what: "Keep working the established stitch pattern without further instruction until the pattern says otherwise." },
  { abbr: "patt", name: "pattern", uk: "patt", group: "Pattern shorthand",
    what: "The stitch pattern already established, rather than the document." },
  { abbr: "tch", name: "turning chain", uk: "tch", group: "Pattern shorthand",
    what: "The chains at the start of a row that bring the yarn up to the height of the stitch you are about to work." },
  { abbr: "RS / WS", name: "right side / wrong side", uk: "RS / WS", group: "Pattern shorthand",
    what: "Which face of the fabric is showing. The right side is the one that ends up on the outside." },
  { abbr: "ea", name: "each", uk: "ea", group: "Pattern shorthand",
    what: "Every one of the stitches named, as in dc in ea st around, meaning one double crochet into every stitch." },
  { abbr: "gauge", name: "gauge", uk: "tension", group: "Pattern shorthand",
    what: "How many stitches and rows you get in a measured square. UK patterns call it tension. It is the same measurement." },
];

/** Fast lookup for the row annotator, keyed on the bare token. */
const ABBR_INDEX = (() => {
  const idx = Object.create(null);
  for (const a of ABBREVIATIONS) {
    // The letter shorthand (X, V, A, W, M) is on the reference page but stays
    // out of the row annotator: the annotator is case-insensitive and would
    // read the "a" in "work a sc" as a decrease.
    if (a.letter) continue;
    for (const key of a.abbr.toLowerCase().split(/\s*\/\s*/)) {
      idx[key.replace(/\s+/g, " ").trim()] = a;
    }
  }
  // Common spellings the table does not list as its own row.
  idx["sts"] = ABBREVIATIONS.find((a) => a.abbr === "st / sts");
  idx["st"] = ABBREVIATIONS.find((a) => a.abbr === "st / sts");
  idx["mc"] = ABBREVIATIONS.find((a) => a.abbr === "MR");
  idx["ar"] = ABBREVIATIONS.find((a) => a.abbr === "MR");
  idx["magic ring"] = ABBREVIATIONS.find((a) => a.abbr === "MR");
  idx["ss"] = ABBREVIATIONS.find((a) => a.abbr === "sl st");
  idx["slst"] = ABBREVIATIONS.find((a) => a.abbr === "sl st");
  idx["skip"] = ABBREVIATIONS.find((a) => a.abbr === "sk");
  idx["rs"] = ABBREVIATIONS.find((a) => a.abbr === "RS / WS");
  idx["ws"] = ABBREVIATIONS.find((a) => a.abbr === "RS / WS");
  idx["pm"] = ABBREVIATIONS.find((a) => a.abbr === "pm / sm");
  idx["sm"] = ABBREVIATIONS.find((a) => a.abbr === "pm / sm");
  return idx;
})();

/** Look up one abbreviation. Handles the "2tog" family generically so dc4tog
 *  resolves even though the table only lists dc2tog and dc3tog. */
export function lookupAbbr(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (ABBR_INDEX[key]) return ABBR_INDEX[key];
  const tog = key.match(/^([a-z]+?)(\d+)tog$/);
  if (tog) {
    const base = ABBR_INDEX[tog[1]];
    if (base) {
      return {
        abbr: raw, name: `${base.name} ${tog[2]} together`, uk: base.uk, group: "Shaping",
        what: `Work ${tog[2]} ${base.abbr} stitches but stop before finishing each one, then close all the loops on your hook together. ${tog[2]} stitches become 1.`,
      };
    }
  }
  return null;
}

/** Split a written row into annotated chunks for the "explain this row" tool. */
export function annotateRow(text) {
  if (!text) return [];
  const out = [];
  // The generic "<stitch><n>tog" form goes FIRST, otherwise "dc4tog" (which the
  // table does not list) matches the bare "dc" key and gets annotated as a
  // plain double crochet. Then the literal keys, longest-first, so "sl st" and
  // "ch-sp" beat "st" and "ch".
  const keys = Object.keys(ABBR_INDEX).sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp("(?:[a-z]+\\d+tog|" + keys.join("|") + ")", "gi");
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    // Reject partial matches inside a longer word: "sc" inside "scarf".
    const before = text[m.index - 1], after = text[m.index + m[0].length];
    if ((before && /[A-Za-z]/.test(before)) || (after && /[A-Za-z]/.test(after))) continue;
    const info = lookupAbbr(m[0]);
    if (!info) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], info });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
// ─────────────────────────────────────────────────────────────────────────────
// STITCH COUNTER
//
// Reads ONE written round and reports two numbers: how many stitches it
// PRODUCES (the count you should have at the end) and how many it CONSUMES
// from the round below (the count you must have had at the start).
//
// The rule this rewrite exists to enforce: it answers only when it has
// understood every term in the round, and otherwise it answers with nothing.
//
// The first version did not do that. "sc in each st around" — the single most
// common round in crochet — came back as "1 stitch made" with a clean result
// panel, because the parser found the word "sc", found no number attached to
// it, and defaulted to one. "sc 6 in magic ring" came back as 1 for the same
// reason. Both are confident wrong answers, which is worse than no tool, and
// no amount of small print underneath repairs them.
//
// So the parser below is a strict grammar rather than a set of hopeful
// regexes. A term either matches a form it fully understands, or it is
// recorded as unread and the round returns no numbers at all. "Each stitch
// around" is not unread — it is DEPENDENT: the answer exists but requires the
// previous round's count, which the page asks for rather than assumes.
// ─────────────────────────────────────────────────────────────────────────────

// [produces, consumes] per worked stitch.
const STITCH_COST = {
  "sl st": [1, 1], slst: [1, 1], ss: [1, 1], "slip st": [1, 1],
  sc: [1, 1], hdc: [1, 1], dc: [1, 1], tr: [1, 1], dtr: [1, 1], trtr: [1, 1],
  htr: [1, 1], // UK input tolerated: a UK htr consumes and produces one either way
  "single crochet": [1, 1], "half double crochet": [1, 1], "double crochet": [1, 1],
  "treble crochet": [1, 1], "slip stitch": [1, 1],
  fpsc: [1, 1], bpsc: [1, 1], fphdc: [1, 1], bphdc: [1, 1],
  fpdc: [1, 1], bpdc: [1, 1], fptr: [1, 1], bptr: [1, 1],
  inc: [2, 1], "sc inc": [2, 1], increase: [2, 1],
  dec: [1, 2], "sc dec": [1, 2], "inv dec": [1, 2], invdec: [1, 2],
  "invisible dec": [1, 2], "invisible decrease": [1, 2], decrease: [1, 2],
};

const STITCH_KEYS = Object.keys(STITCH_COST).sort((a, b) => b.length - a.length);

// Instructions that appear inside a round and change no count. Kept
// deliberately short: anything not listed here falls through to "unread",
// which blocks the answer, and blocking is the safe direction to fail in.
const IGNORABLE = [
  /^turn$/, /^do not turn$/, /^dnt$/,
  /^fasten off$/, /^fo$/, /^cut (?:the )?yarn$/, /^weave in (?:the )?ends?$/,
  /^stuff(?: firmly| lightly)?$/, /^begin stuffing$/,
  /^pull (?:the )?(?:tail|yarn|ring|loop|magic ring)?\s*(?:tight|closed)(?:ly)?$/,
  /^close the (?:ring|circle|loop)$/,
  /\bjoin\b/,                       // a joining slip stitch is not counted in the round total
  /^(?:place|move|slip) (?:a |the )?marker$/, /^pm$/, /^sm$/,
  /^mark(?: the)? (?:first|last)(?: st)?$/,
  /^do not join$/, /^work in a spiral$/, /^continue in a spiral$/,
];

/** Loop-placement modifiers. They say WHERE in the stitch you work, never how
 *  many stitches you make, so they are removed before the grammar runs. */
const LOOP_MODIFIER =
  /\s*\b(?:in(?:to)?\s+)?(?:the\s+)?(?:blo|flo|tbl|back loops? only|front loops? only|third loop)\b/g;

function normalizeTerm(raw) {
  return String(raw)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[×]/g, "x")
    .replace(/\bstitches\b/g, "st")
    .replace(/\bstitch\b/g, "st")
    .replace(/\bsts\b/g, "st")
    .replace(/\bea\b/g, "each")
    .replace(/\brem\b/g, "remaining")
    .replace(/\s+/g, " ")
    .replace(/^[\s.;:,*]+/, "")
    .replace(/[\s.;:,]+$/, "")
    .trim();
}

/**
 * Where the stitch goes, which is what decides how much of the round below it
 * uses up. Returns null when the phrase is not one of the forms understood —
 * and null means the whole term is unread, never a guess.
 */
function parseTarget(rest) {
  let s = rest
    .replace(/^in(?:to)?\s+/, "")
    .replace(/^(?:the|a|an)\s+/, "")
    .trim();
  let m;

  // A magic ring or a bare loop is not a stitch of any previous round, so it
  // consumes nothing. This is the case the old parser got wrong twice over.
  if (/^(?:magic (?:ring|circle|loop)|mr|mc|ar|adjustable (?:ring|loop)|ring|loop)$/.test(s)) {
    return { kind: "free" };
  }
  // A chain space is a gap, not a stitch of the round below.
  if (/^(?:next\s+)?ch(?:ain)?[-\s]?\d*\s*(?:sp|space)$/.test(s)) return { kind: "free" };
  if (/^(?:next\s+)?(?:sp|space)$/.test(s)) return { kind: "free" };

  if ((m = s.match(/^each\s+of\s+the\s+next\s+(\d+)(?:\s+st)?$/))) return { kind: "across", n: Number(m[1]) };
  if ((m = s.match(/^next\s+(\d+)(?:\s+st)?$/))) return { kind: "across", n: Number(m[1]) };
  if ((m = s.match(/^(\d+)\s+st$/))) return { kind: "across", n: Number(m[1]) };

  // The dependent forms. The answer is knowable, but only from the round below.
  if (/^each\s+st(?:\s+(?:around|across|to (?:the )?end|to end))?$/.test(s)) return { kind: "dependent" };
  if (/^each\s+of\s+the\s+remaining\s+st$/.test(s)) return { kind: "dependent" };
  if (/^remaining\s+st$/.test(s)) return { kind: "dependent" };

  if (/^(?:next|same|first|last)(?:\s+st)?$/.test(s)) return { kind: "one" };
  return null;
}

/**
 * Parse a single comma-separated term.
 * @returns one of
 *   {kind:"stitch",  produces, consumes}
 *   {kind:"chain",   n}
 *   {kind:"dependent", perProduces, perConsumes}  needs the previous count
 *   {kind:"ignored"}
 *   {kind:"unread"}   the parser did not understand it — blocks the answer
 */
export function parseTerm(raw) {
  const label = String(raw).trim();
  let t = normalizeTerm(raw);
  if (!t) return null;

  if (IGNORABLE.some((re) => re.test(t))) return { kind: "ignored", label };

  let m;
  // Chains. Counted and reported separately: a chain is not a stitch of the
  // round in the sense the bracketed count means.
  if ((m = t.match(/^ch(?:ain)?s?\s*[x*]?\s*(\d+)$/))) return { kind: "chain", n: Number(m[1]), label };
  if ((m = t.match(/^(\d+)\s*ch(?:ain)?s?$/))) return { kind: "chain", n: Number(m[1]), label };
  if (/^ch(?:ain)?$/.test(t)) return { kind: "chain", n: 1, label };

  // Skips and misses: they use up the round below without producing anything.
  if ((m = t.match(/^(?:sk|skip|miss)\s*(?:the\s+)?(?:next\s+)?(\d+)?\s*(?:st|ch(?:ain)?s?)?$/))) {
    return { kind: "stitch", produces: 0, consumes: m[1] ? Number(m[1]) : 1, label };
  }

  t = t.replace(LOOP_MODIFIER, " ").replace(/\s+/g, " ").trim();

  // Leading multiplier: "2 dc", "6 sc".
  let n = null;
  if ((m = t.match(/^(\d+)\s*x?\s*(?=[a-z])/))) { n = Number(m[1]); t = t.slice(m[0].length); }

  // The stitch itself, either as "<stitch><N>tog" or as a listed key.
  let p, c, rest;
  const tog = t.match(/^([a-z]+?)(\d+)tog\b/);
  if (tog && STITCH_COST[tog[1]]) {
    p = 1; c = Number(tog[2]);
    rest = t.slice(tog[0].length).trim();
  } else {
    const key = STITCH_KEYS.find((k) => t === k || t.startsWith(k + " "));
    if (!key) return { kind: "unread", label };
    [p, c] = STITCH_COST[key];
    rest = t.slice(key.length).trim();
  }

  // Trailing multiplier: "sc 6", "dec x 6", "inc 4 times".
  if ((m = rest.match(/^x?\s*(\d+)\s*(?:more\s+)?(?:times)?\b/))) {
    if (n === null) n = Number(m[1]);
    rest = rest.slice(m[0].length).trim();
  }
  if (n === null) n = 1;
  rest = rest.replace(/^(?:times|more times)\b/, "").trim();

  let target = { kind: "each-own" };
  if (rest) {
    if (!/^in(?:to)?\b/.test(rest)) return { kind: "unread", label };
    target = parseTarget(rest);
    if (!target) return { kind: "unread", label };
  }

  switch (target.kind) {
    // No target named: N separate stitches, one per stitch below. "sc 6".
    case "each-own":
      return { kind: "stitch", produces: n * p, consumes: n * c, label };
    // N stitches worked into ONE stitch below. "2 dc in next st".
    case "one":
      return { kind: "stitch", produces: n * p, consumes: c, label };
    // Worked into a ring or a chain space: nothing of a previous round is used.
    case "free":
      return { kind: "stitch", produces: n * p, consumes: 0, label };
    // "in each of the next 6 sts": every one of the 6 is used exactly once.
    case "across":
      return { kind: "stitch", produces: target.n * n * p, consumes: target.n * c, label };
    // "in each st around": the count is the previous round's count.
    case "dependent":
      return { kind: "dependent", perProduces: n * p, perConsumes: c, label };
    default:
      return { kind: "unread", label };
  }
}

/** Split a pasted block into rounds. The free tool checks one round at a time,
 *  so it has to be able to tell when it has been handed more than one. */
export function splitRounds(text) {
  const byLine = String(text).split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length !== 1) return byLine;
  const parts = byLine[0]
    .split(/(?=\b(?:rnd|round|row)s?\s*\.?\s*\d+\s*[:.\-])/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : byLine;
}

const EMPTY_RESULT = {
  produces: 0, consumes: 0, chains: 0, stated: null, matchesStated: null,
  groups: [], unread: [], ignored: [], roundCount: 0,
  dependsOnPrevious: false, unresolvedRepeat: false, tooManyRounds: false,
  mixedDependent: false, needsPrevCount: false,
  confident: false, empty: true, blockers: [],
  // legacy aliases
  ok: false, unknown: [], unresolved: false,
};

/**
 * Count ONE written round.
 *
 * @param {string} text  e.g. "Rnd 6: (sc 4, inc) x 6 (36)"
 * @param {{prevCount?: number}} options  the previous round's stitch count,
 *        which is the only thing that can resolve "in each st around"
 * @returns {object} `confident` is the only field the UI may show numbers on.
 */
export function countRound(text, options = {}) {
  if (!text || !String(text).trim()) return { ...EMPTY_RESULT };

  const prevRaw = Number(options.prevCount);
  const prevCount = Number.isFinite(prevRaw) && prevRaw > 0 ? Math.floor(prevRaw) : null;

  const rounds = splitRounds(text);
  if (rounds.length > 1) {
    return {
      ...EMPTY_RESULT, empty: false, tooManyRounds: true,
      roundCount: rounds.length, blockers: ["too-many-rounds"],
    };
  }

  // Strip a leading round label: "Rnd 4:" / "Row 12."
  let body = String(text).replace(/^\s*(?:rnd|round|row|r)\s*\.?\s*\d+\s*[:.\-–]\s*/i, "");
  // Strip the stitch count the pattern already states: "(30)" / "[30 sts]"
  let stated = null;
  const statedM = body.match(/[([]\s*(\d+)\s*(?:sts?|stitches)?\s*[)\]]\s*\.?\s*$/i);
  if (statedM) { stated = Number(statedM[1]); body = body.slice(0, statedM.index); }

  const groups = [];
  const unread = [];
  const ignored = [];
  let chains = 0;
  let produces = 0, consumes = 0;
  let countingTerms = 0;
  let dependent = null;

  const applyTerm = (t, reps) => {
    if (!t) return { produces: 0, consumes: 0 };
    if (t.kind === "unread") { unread.push(t.label); return { produces: 0, consumes: 0 }; }
    if (t.kind === "ignored") { ignored.push(t.label); return { produces: 0, consumes: 0 }; }
    if (t.kind === "chain") { chains += t.n * (reps || 1); return { produces: 0, consumes: 0 }; }
    if (t.kind === "dependent") { countingTerms += 1; dependent = t; return { produces: 0, consumes: 0 }; }
    countingTerms += 1;
    return { produces: t.produces, consumes: t.consumes };
  };

  // Repeated groups: "(sc 4, inc) x 6", "[2 dc, ch 1] 8 times",
  // "*sc, inc; rep from * around" (repeat count unstated → unresolved).
  const groupRe =
    /(?:\(([^)]*)\)|\[([^\]]*)\]|\*([^*;]*?)(?:;|,)?\s*rep(?:eat)? from \*)\s*(?:[x×*]\s*)?(\d+)?\s*(?:times|more times|around)?/gi;

  let last = 0, m;
  const loose = [];
  while ((m = groupRe.exec(body)) !== null) {
    loose.push(body.slice(last, m.index));
    const inner = m[1] ?? m[2] ?? m[3] ?? "";
    const reps = m[4] ? Number(m[4]) : null;
    let gp = 0, gc = 0;
    for (const raw of inner.split(/[,;]/)) {
      if (!raw.trim()) continue;
      const t = parseTerm(raw);
      // A dependent term inside a repeated group cannot be resolved even with
      // the previous count, because the group divides that count in a way the
      // text does not state. Treat it as unread rather than inventing a split.
      if (t && t.kind === "dependent") { unread.push(t.label); continue; }
      const d = applyTerm(t, reps);
      gp += d.produces; gc += d.consumes;
    }
    groups.push({ inner: inner.trim(), reps, perRepeat: gp, consumesPerRepeat: gc, resolved: reps !== null });
    if (reps !== null) { produces += gp * reps; consumes += gc * reps; }
    last = m.index + m[0].length;
  }
  loose.push(body.slice(last));

  for (const chunk of loose) {
    for (const raw of chunk.split(/[,;]/)) {
      if (!raw.trim()) continue;
      const d = applyTerm(parseTerm(raw), 1);
      produces += d.produces; consumes += d.consumes;
    }
  }

  const unresolvedRepeat = groups.some((g) => !g.resolved);
  const dependsOnPrevious = dependent !== null;
  // A dependent term is only resolvable when it is the whole round. "sc in each
  // st around" over 36 is 36. "sc in each st around, inc" is not solvable from
  // the previous count alone, because the text never says how the round below
  // is divided between the two instructions.
  const mixedDependent = dependsOnPrevious && countingTerms > 1;

  if (dependsOnPrevious && !mixedDependent && prevCount !== null) {
    produces += prevCount * dependent.perProduces;
    consumes += prevCount * dependent.perConsumes;
  }

  const needsPrevCount = dependsOnPrevious && !mixedDependent && prevCount === null;
  // Chains alone are not a round. "ch 1, turn" is a true and useless answer of
  // zero, and a large green 0 reads as a verdict on a round that was never
  // given. It has to be at least one stitch instruction to be worth counting.
  const sawSomething = countingTerms > 0;

  const blockers = [];
  if (unread.length) blockers.push("unread-terms");
  if (unresolvedRepeat) blockers.push("unresolved-repeat");
  if (needsPrevCount) blockers.push("needs-previous-count");
  if (mixedDependent) blockers.push("mixed-dependent");
  if (!sawSomething && !blockers.length) blockers.push("nothing-countable");

  const confident = blockers.length === 0;

  return {
    produces, consumes, chains, stated,
    matchesStated: !confident || stated === null ? null : stated === produces,
    groups, unread, ignored, roundCount: 1,
    dependsOnPrevious, unresolvedRepeat, tooManyRounds: false, mixedDependent,
    needsPrevCount, prevCount, confident, empty: false, blockers,
    // legacy aliases, kept so nothing that imported the old shape breaks
    ok: confident, unknown: unread, unresolved: unresolvedRepeat,
  };
}
