// api/extract-pattern.js
// Vercel serverless function — extracts crochet pattern from PDF text via Gemini/Claude
// Supports mode: "extract" (default) and mode: "bevcheck" (pattern validation)
//
// Also exports runPdfExtraction(...) for direct invocation from the queue worker.
// Both the HTTP handler and the worker share the same extraction logic via this export.

import { getPreferredProvider } from './_providerRouter.js';

export const config = { maxDuration: 300 };

const GEMINI_MODEL = 'gemini-2.5-flash';

// ─── Chunking helpers ────────────────────────────────────────────────────────

function splitIntoChunks(text, maxChunkSize = 14000, overlapSize = 500) {
  const pageMarkerRegex = /(?=--- PAGE \d+ ---)/g;
  const pages = text.split(pageMarkerRegex).filter(p => p.trim());

  const chunks = [];
  let currentChunk = '';
  let currentOverlap = '';

  for (const page of pages) {
    if (currentChunk.length + page.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentOverlap = currentChunk.slice(-overlapSize);
      currentChunk = currentOverlap + page;
    } else {
      currentChunk += page;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk);

  if (chunks.length === 0) {
    let pos = 0;
    while (pos < text.length) {
      const end = Math.min(pos + maxChunkSize, text.length);
      chunks.push(text.slice(pos, end));
      pos += maxChunkSize - overlapSize;
    }
  }
  return chunks;
}

// Top-level metadata fields that the chunked prompt explicitly tells later
// chunks to leave empty ("metadata already captured from chunk 1"). The pre-S66
// merger only deep-merged components/notes/abbreviations and left the rest at
// results[0]; that lost materials/hook_size/yarn_weight/etc. whenever the
// first chunk didn't include them (e.g. title-page-only chunk 1). Fix:
// first-non-empty wins, later non-empty overrides if it's "more complete"
// (longer string for text fields). Materials is handled separately below
// because it's an array and commonly split across pages.
const SCALAR_METADATA_KEYS = [
  'title', 'designer', 'source_url', 'finished_size', 'difficulty',
  'yarn_weight', 'hook_size', 'gauge', 'image_description',
];

const isEmptyish = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

// ─── Section detectors (shared) ──────────────────────────────────────────────
// Heading-oriented keyword sets used to answer one question: "does the SOURCE
// text contain a materials / abbreviations section?" Deliberately anchored on
// section-header vocabulary (not bare "yarn"/"hook", which appear inside every
// pattern row) so they signal a real section rather than firing constantly.
//
// Three consumers share these exact regexes so the heuristic can never drift:
//   1. the recovery pass in runSmartChunkedExtraction (below)
//   2. the Layer 3 validator post-check in api/cron/process-queue.js
//   3. the offline repair script in scripts/repair-empty-materials.mjs
export const MATERIALS_SECTION_KEYWORDS = /\b(materials|supplies|notions|you(?:'ll| will) need|what you(?:'ll| will)? need|hook size|yarn weight)\b/i;
export const ABBREVIATIONS_SECTION_KEYWORDS = /\b(abbreviations?|stitch (?:key|guide|glossary|abbreviations)|glossary|legend|key to (?:symbols|abbreviations))\b/i;

// Union/dedupe two materials arrays by lowercased+trimmed name. Existing entries
// win on collision (we only ADD names not already present); blank/nameless items
// are dropped. Shared by the recovery pass and the legacy mergeChunkResults so
// both have identical semantics.
export function mergeMaterials(existing, incoming) {
  const base = Array.isArray(existing) ? existing.filter(m => (m?.name || '').trim()) : [];
  const seen = new Set(base.map(m => m.name.toLowerCase().trim()));
  const add = (Array.isArray(incoming) ? incoming : []).filter(m => {
    const key = (m?.name || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...base, ...add];
}

// Union/dedupe two abbreviation arrays by lowercased+trimmed abbr. Existing wins.
export function mergeAbbreviationLists(existing, incoming) {
  const base = Array.isArray(existing) ? existing.filter(a => (a?.abbr || '').trim()) : [];
  const seen = new Set(base.map(a => a.abbr.toLowerCase().trim()));
  const add = (Array.isArray(incoming) ? incoming : []).filter(a => {
    const key = (a?.abbr || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...base, ...add];
}

function mergeChunkResults(results) {
  if (!results || results.length === 0) return null;
  if (results.length === 1) return results[0];

  const merged = { ...results[0] };

  for (let i = 1; i < results.length; i++) {
    const chunk = results[i];
    if (!chunk) continue;

    // Scalar metadata: fill empties, prefer longer/more-complete strings
    for (const key of SCALAR_METADATA_KEYS) {
      const incoming = chunk[key];
      if (isEmptyish(incoming)) continue;
      const existing = merged[key];
      if (isEmptyish(existing)) {
        merged[key] = incoming;
      } else if (typeof existing === 'string' && typeof incoming === 'string' && incoming.length > existing.length) {
        merged[key] = incoming;
      }
    }

    // Materials: union/dedupe by lowercased name via the shared helper. Many
    // real patterns list yarn/hook/notions across multiple pages — first-wins
    // would drop them.
    if (Array.isArray(chunk.materials) && chunk.materials.length) {
      merged.materials = mergeMaterials(merged.materials, chunk.materials);
    }

    if (Array.isArray(chunk.suggested_resources) && chunk.suggested_resources.length) {
      const existingRes = Array.isArray(merged.suggested_resources) ? merged.suggested_resources : [];
      const seenUrls = new Set(existingRes.map(r => (r?.url || '').toLowerCase()).filter(Boolean));
      const newRes = chunk.suggested_resources.filter(r => {
        const url = (r?.url || '').toLowerCase();
        if (!url || seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      });
      merged.suggested_resources = [...existingRes, ...newRes];
    }

    if (Array.isArray(chunk.components)) {
      for (const incomingComponent of chunk.components) {
        const existing = merged.components?.find(
          c => c.name?.toLowerCase().trim() === incomingComponent.name?.toLowerCase().trim()
        );
        if (existing) {
          const existingLabels = new Set(existing.rows?.map(r => r.label) || []);
          const newRows = (incomingComponent.rows || []).filter(r => !existingLabels.has(r.label));
          existing.rows = [...(existing.rows || []), ...newRows];
        } else {
          if (!merged.components) merged.components = [];
          merged.components.push(incomingComponent);
        }
      }
    }
    if (chunk.pattern_notes && chunk.pattern_notes !== merged.pattern_notes) {
      merged.pattern_notes = [merged.pattern_notes, chunk.pattern_notes].filter(Boolean).join(' ');
    }
    if (chunk.assembly_notes && chunk.assembly_notes !== merged.assembly_notes) {
      merged.assembly_notes = [merged.assembly_notes, chunk.assembly_notes].filter(Boolean).join(' ');
    }
    if (chunk.abbreviations?.length) {
      merged.abbreviations = mergeAbbreviationLists(merged.abbreviations, chunk.abbreviations);
    }
    if (chunk.abbreviations_map) {
      merged.abbreviations_map = { ...(merged.abbreviations_map || {}), ...chunk.abbreviations_map };
    }
  }

  const totalRows = (merged.components || []).reduce((sum, c) => sum + (c.rows?.length || 0), 0);
  merged.confidence = totalRows >= 10 ? 'high' : totalRows >= 3 ? 'medium' : 'low';
  return merged;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const fullPrompt = `You are a crochet pattern extraction specialist. You will analyze this pattern using a strict 4-step process. Return ONLY valid JSON with no markdown, no backticks, no explanation.

═══ STEP 1 — STRUCTURE ANALYSIS ═══
Before extracting anything, silently determine:
• Is this pattern round-based (worked in the round) or row-based (worked flat)? Or mixed per component?
• Does it contain an abbreviations table, legend, or definition section?
• Are there cross-references like "Repeat R32", "work same as Round 5", or "work into ch3 on R9"?
• Are there branching instructions by size, color variation, or optional sections?
• How many distinct components exist (e.g. body, head, arms, border)?
Use these answers to guide the remaining steps. Do not output this analysis — it is internal context only.

═══ STEP 2 — ABBREVIATIONS FIRST ═══
Extract the COMPLETE abbreviations map from any table, legend, glossary, or definition section BEFORE touching pattern instructions.
• Populate abbreviations_map as a flat key-value object: {"mr":"magic ring","sc":"single crochet","inc":"increase","dec":"invisible decrease","fpdc":"front post double crochet"}
• Include EVERY abbreviation defined in the pattern, even uncommon ones
• If the pattern defines no abbreviations, use standard crochet abbreviations found in the instructions: sc, dc, hdc, tr, sl st, ch, inc, dec, mr, fo, blo, flo, yo, pm, sm, sc2tog
• This map is your reference for all subsequent extraction — use it to interpret shorthand in round/row instructions

═══ STEP 2.5 — MATERIALS, YARN, HOOK ═══
Materials/yarn/hook may appear under headings like "Materials", "Supplies", "You will need", "Tools", "What you need", or as inline prose without any heading at all. Scan the entire document — not only sections labeled "Materials". If no explicit Materials section exists, extract from the gauge section or pattern body.

YARN WEIGHT — set yarn_weight as the closest canonical name. Match by named keyword first, then infer from meterage:
• Lace / Cobweb (≥600 m per 100g)
• Fingering / Sock / 4-ply (~350–500 m per 100g)
• Sport (~280–350 m per 100g)
• DK / Light Worsted (~200–280 m per 100g)
• Worsted / Aran / Medium (~140–200 m per 100g)
• Bulky / Chunky (~80–140 m per 100g)
• Super Bulky (<80 m per 100g)
If the pattern gives meterage like "160 m / 50 g" or "270 m / 100 g", normalize to per-100g (160 m/50g = 320 m/100g → Sport; 270 m/100g → DK) and pick the closest canonical name. If yarn is named by brand+line (e.g. "Yarn Art Jeans", "Alize Baby Cotton") without an explicit weight word, use the meterage. Multiple yarns of different weights → list the primary first ("Sport/DK").

HOOK SIZE — any "<number> mm" (e.g. "2.25 mm", "5.0 mm") or "US <letter>" (B/1 through S/19) anywhere in the document, including inline prose like "2.25 mm crochet hook" or "I used a 5 mm hook". If multiple sizes are listed (one per yarn weight or technique), include them all in hook_size, primary first.

MATERIALS list — extract every distinct yarn, hook, notion, and assembly tool found anywhere, even when listed as run-on prose instead of bullets. Each item gets {name, amount, notes}. Yarn entries should preserve brand+line in name and colorways/quantities in amount or notes. Include notions: stitch markers, scissors, tapestry/yarn needle, stuffing, fishing line, glue gun, safety eyes, etc.

═══ STEP 3 — ROUND/ROW EXTRACTION ═══
Extract every round or row as its own entry. Apply these rules strictly:

LABEL PREFIX: Use 'RND' for rounds (worked in the round) or 'ROW' for rows (worked flat). Detect from context which applies per component.

EXPAND RANGES: For any instruction covering multiple rounds like 'RND 10-23: sc in each st (40)' or 'Rows 5-12: repeat Row 4', expand into individual entries: RND 10, RND 11, RND 12... each with the same instruction text. Never leave a range as a single row. Every round the user needs to complete must be its own checkable row.

EXPAND CROSS-REFERENCES INLINE: If a round says "Repeat R32" or "Work same as Round 5", look up what Round 5 / R32 actually says and output the FULL instruction text for that round. Never output "Repeat R32" as a row — always resolve the reference to the actual stitch instructions.

PRESERVE BRACKET NOTATION: Keep bracket/parenthetical repeats exactly as written in the pattern. Examples: "(sc, inc) x 6", "[dc5, (ch1, skip 1) x 3] x 10", "*(2 sc, inc)* repeat 6 times". Do not simplify or expand these — the app tracks them as sub-counters.

EXTRACT repeat_brackets: For each row/round, extract bracket repeat patterns into repeat_brackets array. Example: "Round 16: (6 sc, inc) x 2 -- 16 sts" produces repeat_brackets: [{"sequence":"6 sc, inc","count":2}]. Match patterns like (sequence) x N, [sequence] x N, *sequence* repeat N times. If no bracket repeats, set repeat_brackets: [].

OPEN-ENDED REPEATS: For instructions like "repeat rounds X-Y until desired length" or "work even for as many rounds as you want", extract the repeating block ONCE as individual rounds, then add a note in pattern_notes explaining the open-ended nature. Do not generate infinite rounds.

SIZE/COLOR BRANCHING: If the pattern offers multiple sizes or color variations, extract the primary/default version as the main rows. Note all variations (stitch count differences, alternate colors) in pattern_notes.

ACTION ITEMS: For mid-pattern instructions that are not stitch rows (examples: 'Place the eyes now', 'Begin stuffing', 'Change to Color B', 'See page 7 for details') — include these as rows with label 'NOTE' and set action_item: true.

NOTES AND TIPS: Notes, tips, and instructional comments that accompany a specific row should be attached to that row as the 'note' field, NOT created as a separate row entry. A row should look like: {"id":"rnd-5","label":"RND 5","text":"(sc, inc) x 6 (12)","stitch_count":12,"note":"Use a stitch marker here","action_item":false}. Never create a standalone row where the instruction text starts with 'Note:', 'Tip:', or 'Remember:' — instead attach that text as the note field of the adjacent stitch row it refers to.

INLINE TIPS: If a row instruction contains an inline tip, note, or parenthetical explanation that is not part of the stitch counts or stitch abbreviations — extract it and place it in the row's note field instead, cleaning the instruction text to remove it. The instruction text field should contain only the actual stitch sequence and stitch count. Tips, explanations, and clarifications go in the note field. Example: 'RND 5: 2bpdc into next st (tip: work around the post, not through the top) (12)' should become text: '2bpdc into next st (12)', note: 'Work around the post, not through the top'.

NEVER SKIP ROUNDS: Even if consecutive rounds have identical instructions, each must be its own entry. A round that says "sc in each st around (40)" repeated 8 times means 8 separate row entries.

═══ STEP 4 — CONFIDENCE ═══
After extraction, assess quality:
• If fewer than 3 rounds/rows were extracted OR title is missing, set "confidence": "low"
• If all major sections were found and 10+ rounds extracted, set "confidence": "high"
• Otherwise set "confidence": "medium"

═══ STEP 5 — MULTI-PART DETECTION (orthogonal to component identification above) ═══
This step is INDEPENDENT of component identification. Components from Step 3 must still be extracted in full — including every clue or part as its own component when this document contains multiple. This step only adds collection-level metadata about the broader project.

Determine whether this document belongs to a larger multi-part project (MKAL, MCAL, mystery knit/crochet along, a series of sequential clues, or a book of related patterns).

• collection_name: name of the overall project (e.g. "Arcoiris 2026 Mystery Crochet Along"). Strip any clue/part suffix from the title — "Lemon MKAL Clue 3" → collection_name "Lemon MKAL". Null if this is a single standalone pattern with no broader project.
• collection_type: "mkal" when parts are sequential/ordered (MKALs, MCALs, mystery alongs, sequential clue/part builds), "general" when patterns are independent companions (a book of doll outfits, a designer bundle). Null if standalone.
• part_label: what the project calls its sub-sections — "Clue", "Part", "Section", "Chapter", "Pattern", "Module", "Block". Return the SINGULAR form. Default "Part" if it's multi-part but the label is unclear. Null if standalone.
• expected_part_count: total number of parts in the overall project if stated anywhere in the PDF. Null if not stated.
• current_part_number: ONLY set when THIS PDF represents one specific part of a larger multi-PDF series (e.g. this file is Clue 3, and Clues 1, 2, 4–12 are separate PDFs). If this single PDF contains ALL the clues/parts of the project, set current_part_number to null. Null if standalone.

═══ OUTPUT FORMAT ═══
Return this exact JSON structure:
{"title":"string","designer":"string","source_url":null,"finished_size":"string","difficulty":"Beginner or Intermediate or Advanced","yarn_weight":"string","hook_size":"string","gauge":"string or null","confidence":"low or medium or high","materials":[{"name":"string","amount":"string","notes":"string"}],"abbreviations":[{"abbr":"string","meaning":"string"}],"abbreviations_map":{"mr":"magic ring","sc":"single crochet"},"suggested_resources":[{"label":"string","url":"string"}],"pattern_notes":"string","components":[{"name":"string","make_count":1,"independent":false,"rows":[{"id":"rnd-1","label":"RND 1","text":"full instruction text with all references resolved","stitch_count":null,"note":null,"action_item":false,"repeat_brackets":[{"sequence":"string","count":2}]}]}],"assembly_notes":"string","image_description":"string","collection_name":"string or null","collection_type":"mkal or general or null","part_label":"string or null","expected_part_count":"number or null","current_part_number":"number or null"}

COMPONENT RULES:
• For components like 'FLIPPER (MAKE 2)', set make_count: 2. Default 1 if not specified.
• Set independent: true ONLY when the pattern explicitly says a component can be made separately — e.g. "make 2 separately", "work independently". Default false.
• MULTI-CLUE / MULTI-PART PATTERNS: when a document contains multiple clues, parts, sections, or chapters as distinct construction sections (e.g. "Clue #1", "Clue #2", "Clue #3", "Clue #4"), EACH ONE IS ITS OWN COMPONENT — list every one of them. Never collapse multiple clues/parts into a single component. The Step 5 collection metadata is orthogonal to this and does not change component identification.
• After all construction components, extract assembly/finishing as a final component named 'ASSEMBLY & FINISHING' with label: 'STEP' and action_item: true for all rows.

PATTERN NOTES: Extract as a single string containing all special technique notes, tension guidance, construction tips, size variations, and open-ended repeat instructions.

SUGGESTED RESOURCES: Extract {label, url} objects from any "Tutorials", "Resources", or hyperlink sections. Default to [] if none found.

Be thorough — extract every component, every round, every material. Ensure the JSON is complete and valid. Do not truncate.`;

// ─── Provider call helpers (top-level, take keys as params) ──────────────────

async function callGeminiExtract({ prompt, pdfText, geminiKey, maxTokens }) {
  const controller = new AbortController();
  const geminiTimeout = setTimeout(() => controller.abort(), 4000);
  let r;
  try {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt + "\n\nPATTERN TEXT:\n" + pdfText }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: controller.signal,
      }
    );
  } catch (fetchErr) {
    clearTimeout(geminiTimeout);
    if (fetchErr.name === "AbortError") throw new Error("Gemini timeout after 4s");
    throw fetchErr;
  }
  clearTimeout(geminiTimeout);
  if (!r.ok) {
    const errBody = await r.text();
    throw new Error(`Gemini API error ${r.status}: ${errBody.substring(0, 300)}`);
  }
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason || "unknown";
    throw new Error("Gemini returned empty response, finishReason: " + finishReason);
  }
  const cleaned = text.replace(/^[\s\S]*?```(?:json|JSON)?\s*\n?/i, "").replace(/\n?\s*```[\s\S]*$/, "").trim();
  const toParse = cleaned.startsWith("{") || cleaned.startsWith("[") ? cleaned : text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(toParse); } catch (parseErr) {
    throw new Error("Gemini JSON parse failed: " + parseErr.message);
  }
}

async function callClaudeExtract({ pdfText, anthropicKey }) {
  if (!anthropicKey) throw new Error("Anthropic API key not configured");
  const CLAUDE_TEXT_LIMIT = 20000;
  let truncatedText = pdfText;
  if (pdfText.length > CLAUDE_TEXT_LIMIT) {
    const lastNl = pdfText.lastIndexOf("\n", CLAUDE_TEXT_LIMIT);
    truncatedText = pdfText.slice(0, lastNl > 0 ? lastNl : CLAUDE_TEXT_LIMIT);
  }
  const claudePrompt = `You are a crochet pattern extraction specialist. Extract the pattern below into structured JSON.

Return ONLY valid JSON with no markdown, no backticks, no explanation. Use this exact structure:
{"title":"string","designer":"string","source_url":null,"finished_size":"string","difficulty":"Beginner or Intermediate or Advanced","yarn_weight":"string","hook_size":"string","gauge":"string or null","confidence":"low or medium or high","materials":[{"name":"string","amount":"string","notes":"string"}],"abbreviations":[{"abbr":"string","meaning":"string"}],"abbreviations_map":{},"suggested_resources":[],"pattern_notes":"string","components":[{"name":"string","make_count":1,"independent":false,"rows":[{"id":"rnd-1","label":"RND 1","text":"full instruction text","stitch_count":null,"note":null,"action_item":false,"repeat_brackets":[]}]}],"assembly_notes":"string","image_description":"string"}

Rules:
- Extract EVERY round/row as its own entry — never skip or collapse ranges
- Use RND for rounds worked in the round, ROW for flat rows
- Expand ranges like "RND 10-23" into individual entries RND 10, RND 11... each with the same instruction
- Keep bracket notation exactly as written: (sc, inc) x 6
- Set confidence: "high" if 10+ rounds extracted, "medium" otherwise
- Extract all materials, hook size, yarn weight

PATTERN TEXT:
${truncatedText}`;

  const controller = new AbortController();
  const claudeTimeout = setTimeout(() => controller.abort(), 55000);
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 32000,
        messages: [{ role: "user", content: claudePrompt }],
      }),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(claudeTimeout);
    if (fetchErr.name === "AbortError") throw new Error("Claude timeout after 55s");
    throw fetchErr;
  }
  clearTimeout(claudeTimeout);
  if (!r.ok) {
    const errBody = await r.text();
    throw new Error(`Claude API error ${r.status}: ${errBody.substring(0, 200)}`);
  }
  const data = await r.json();
  const rawText = data.content?.[0]?.text || "";
  if (!rawText) throw new Error("Claude returned empty response, stop_reason=" + data.stop_reason);

  const jsonStart = rawText.indexOf("{");
  let toParse = jsonStart >= 0 ? rawText.slice(jsonStart) : rawText.trim();
  if (data.stop_reason === "max_tokens") {
    toParse = toParse.replace(/,\s*"[^"]*$/, "").replace(/,\s*$/, "").replace(/:\s*"[^"]*$/, ': ""');
    let openBraces = 0, openBrackets = 0;
    for (const ch of toParse) {
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces--;
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets--;
    }
    toParse += "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));
  } else {
    const jsonEnd = toParse.lastIndexOf("}");
    toParse = jsonEnd >= 0 ? toParse.slice(0, jsonEnd + 1) : toParse;
  }
  try { return JSON.parse(toParse); } catch (parseErr) {
    throw new Error("Claude JSON parse failed: " + parseErr.message);
  }
}

async function callClaudeChunkExtract({ chunkText, chunkIndex, totalChunks, isFirstChunk, anthropicKey }) {
  if (!anthropicKey) throw new Error("Anthropic API key not configured");

  const chunkPrompt = isFirstChunk
    ? `You are a crochet pattern extraction specialist. This is chunk ${chunkIndex + 1} of ${totalChunks} from a long pattern PDF. Extract ALL available information from this section.

Return ONLY valid JSON with no markdown, no backticks, no explanation. Use this exact structure:
{"title":"string","designer":"string","source_url":null,"finished_size":"string","difficulty":"Beginner or Intermediate or Advanced","yarn_weight":"string","hook_size":"string","gauge":"string or null","confidence":"low or medium or high","materials":[{"name":"string","amount":"string","notes":"string"}],"abbreviations":[{"abbr":"string","meaning":"string"}],"abbreviations_map":{},"suggested_resources":[],"pattern_notes":"string","components":[{"name":"string","make_count":1,"independent":false,"rows":[{"id":"rnd-1","label":"RND 1","text":"full instruction text","stitch_count":null,"note":null,"action_item":false,"repeat_brackets":[]}]}],"assembly_notes":"string","image_description":"string"}

Rules:
- Extract EVERY round/row as its own entry — never skip or collapse ranges
- Use RND for rounds worked in the round, ROW for flat rows
- Expand ranges like "RND 10-23" into individual entries RND 10, RND 11... each with the same instruction
- Keep bracket notation exactly as written: (sc, inc) x 6
- For components like "FLIPPER (MAKE 2)", set make_count: 2
- Extract title, designer, materials, hook size, yarn weight, abbreviations from this section if present
- If a component starts in this chunk but appears incomplete, extract what is here — subsequent chunks will continue it

Materials/yarn/hook may appear under headings like "Materials", "Supplies", "You will need", "Tools", or as inline prose with NO heading at all. Scan the whole chunk, not only sections labeled "Materials". If no explicit section exists, infer from gauge or pattern body.

yarn_weight: closest canonical name — Lace, Fingering/Sock, Sport, DK, Worsted/Aran, Bulky, Super Bulky. If pattern gives meterage like "160 m / 50 g" or "270 m / 100 g", normalize to per-100g (160/50g = 320 m/100g → Sport; 270 m/100g → DK) and pick the closest. If yarn is named only by brand+line (e.g. "Yarn Art Jeans", "Alize Baby Cotton"), use the meterage. Multiple weights → primary first ("Sport/DK").

hook_size: any "<number> mm" (e.g. "2.25 mm", "5.0 mm") or "US <letter>" (B/1 through S/19) anywhere in the chunk, even inline like "2.25 mm crochet hook". Multiple sizes → list all, primary first.

materials[]: every distinct yarn (preserve brand+line in name, colorways/quantities in amount or notes), hook, and notion (stitch markers, scissors, tapestry needle, stuffing, fishing line, glue gun, safety eyes, etc.) — even when listed as run-on prose instead of bullets.

PATTERN SECTION:
${chunkText}`
    : `You are a crochet pattern extraction specialist. This is chunk ${chunkIndex + 1} of ${totalChunks} from a long pattern PDF. The beginning of this chunk may overlap with the previous chunk — skip any rows/rounds you see repeated from earlier.

Return ONLY valid JSON with no markdown, no backticks, no explanation. Use this exact structure (metadata fields can be empty strings if not in this section):
{"title":"","designer":"","source_url":null,"finished_size":"","difficulty":"","yarn_weight":"","hook_size":"","gauge":null,"confidence":"medium","materials":[],"abbreviations":[],"abbreviations_map":{},"suggested_resources":[],"pattern_notes":"string","components":[{"name":"string","make_count":1,"independent":false,"rows":[{"id":"rnd-1","label":"RND 1","text":"full instruction text","stitch_count":null,"note":null,"action_item":false,"repeat_brackets":[]}]}],"assembly_notes":"string","image_description":""}

Rules:
- Extract EVERY round/row visible in this section — never skip or collapse ranges
- Use RND for rounds worked in the round, ROW for flat rows
- Expand ranges like "RND 10-23" into individual entries RND 10, RND 11...
- Keep bracket notation exactly as written: (sc, inc) x 6
- For components like "FLIPPER (MAKE 2)", set make_count: 2
- Focus only on pattern rows/components in this section — metadata already captured from chunk 1
- If a component continues from previous chunk, use the same component name so it merges correctly

PATTERN SECTION:
${chunkText}`;

  const controller = new AbortController();
  const claudeTimeout = setTimeout(() => controller.abort(), 55000);
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 32000,
        messages: [{ role: "user", content: chunkPrompt }],
      }),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(claudeTimeout);
    if (fetchErr.name === "AbortError") throw new Error(`Claude chunk ${chunkIndex + 1} timeout after 55s`);
    throw fetchErr;
  }
  clearTimeout(claudeTimeout);
  if (!r.ok) {
    const errBody = await r.text();
    throw new Error(`Claude chunk ${chunkIndex + 1} API error ${r.status}: ${errBody.substring(0, 200)}`);
  }
  const data = await r.json();
  const rawText = data.content?.[0]?.text || "";
  if (!rawText) throw new Error(`Claude chunk ${chunkIndex + 1} empty response`);

  const jsonStart = rawText.indexOf("{");
  let toParse = jsonStart >= 0 ? rawText.slice(jsonStart) : rawText.trim();
  if (data.stop_reason === "max_tokens") {
    toParse = toParse.replace(/,\s*"[^"]*$/, "").replace(/,\s*$/, "").replace(/:\s*"[^"]*$/, ': ""');
    let openBraces = 0, openBrackets = 0;
    for (const ch of toParse) {
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces--;
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets--;
    }
    toParse += "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));
  } else {
    const jsonEnd = toParse.lastIndexOf("}");
    toParse = jsonEnd >= 0 ? toParse.slice(0, jsonEnd + 1) : toParse;
  }
  try { return JSON.parse(toParse); } catch (parseErr) {
    throw new Error(`Claude chunk ${chunkIndex + 1} JSON parse failed: ${parseErr.message}`);
  }
}

// ─── Smart chunked extraction (S2 — replaces the dumb char-based chunker) ───
// For patterns 15KB–150KB the model first plans the document into components,
// then we extract setup + each component separately. Each AI call stays well
// under its own 90s timeout and the merged result matches the single-shot
// output shape exactly — downstream (BevCheck, UI, save) sees no difference.

const TIER_SMALL_THRESHOLD = 15000;
const TIER_OVERSIZED_THRESHOLD = 150000;
const PER_CALL_TIMEOUT_MS = 90000;

// Shared-slice boundary fallback hardening. When neither the shared-context
// marker nor the first component's start marker can be located verbatim, the
// blind 25% slice often cuts a materials section that lives deeper in a large
// document. Above this size we instead locate the materials section by keyword
// and snap the boundary to include through it (plus a window).
const SHARED_FALLBACK_KEYWORD_MIN_CHARS = 50000;
const MATERIALS_SECTION_WINDOW_CHARS = 4000;

// S76 doc-type architecture: document_type is classified in this single planning
// prompt (classify-first ordering — Bev commits to the frame, then enumerates).
// S75 checkpoint: after ~10-15 real imports, revisit whether one prompt is enough.
// If multi_section_pattern vs pattern_book misclassification is high, split the
// classification into its own dedicated call.
const planningPrompt = `You are analyzing a crochet pattern document. First decide WHAT KIND of document it is, then identify the distinct construction sections so a downstream extractor can process them separately.

═══ DOCUMENT TYPE (decide this FIRST) ═══
Classify the document as exactly one of:
- single_pattern: one finished object, one continuous run of instructions.
- multi_section_pattern: ONE finished object assembled from multiple named parts present together in the document (e.g. a tieback = flower + leaves + band + ties). All parts shipped at once. NOT time-released.
- pattern_book: MULTIPLE independent finished objects in one document. Each could stand alone as its own pattern.
- mkal: ONE object revealed as time-released clues (Clue 1, Clue 2...).
The hardest call is multi_section_pattern vs pattern_book. Discriminator: do the parts assemble into ONE object (multi_section_pattern) or are they N separate objects (pattern_book)? When unsure, prefer keeping parts together (multi_section_pattern).

A "component" is a body part, shaped piece, OR pattern section the user crochets separately — Body, Head, Tentacle, Wing, Border, Assembly, etc. For MULTI-CLUE / MULTI-PART patterns where each clue or part is a distinct section IN THIS DOCUMENT, EACH CLUE OR PART IS ITS OWN COMPONENT — list every one of them (e.g. "Clue #1", "Clue #2", "Clue #3", "Clue #4" → four components, not one). Never collapse multiple clues or parts into a single component. CRITICAL: "Tentacle (make 8)" counts as ONE component repeated eight times — DO NOT list it eight times. Include the multiplier in the component name when present (e.g. "Tentacle (x8)", "Leg (x2)").

The "shared_context_end_marker" marks the boundary where the setup section (materials, abbreviations, gauge, designer notes) ends and the first construction component begins.

Markers (start_marker, end_marker, shared_context_end_marker) must be LITERAL substrings copied verbatim from the document — about 30 characters each, enough to be unique. If a marker isn't actually present in the text, the downstream slice will fail.

Return ONLY valid JSON, no markdown, no backticks, no commentary. document_type comes FIRST:
{
  "document_type": "single_pattern or multi_section_pattern or pattern_book or mkal",
  "pattern_name": "string",
  "component_count": number,
  "components": [
    {
      "name": "string",
      "start_marker": "string",
      "end_marker": "string",
      "estimated_rows": number
    }
  ],
  "shared_context_end_marker": "string",
  "collection_name": "string or null",
  "collection_type": "mkal or general or null",
  "part_label": "string or null",
  "expected_part_count": "number or null",
  "current_part_number": "number or null"
}

If the document has no construction components (rare — pure setup pages, error documents), return component_count: 0 and components: [].

═══ ADDITIONAL FIELDS — COLLECTION METADATA ═══
This is a SEPARATE, ORTHOGONAL question from component identification above. Components MUST still be identified per the rules above regardless of what you answer here. Treat the two tasks independently.

Determine whether this document belongs to a larger multi-part project (MKAL, MCAL, mystery knit/crochet along, a series of sequential clues, or a book of related patterns).

- collection_name: name of the overall project (e.g. "Arcoiris 2026 Mystery Crochet Along"). Strip clue/part suffix from the title — "Lemon MKAL Clue 3" → collection_name "Lemon MKAL". Null if this is a single standalone pattern with no broader project.
- collection_type: "mkal" if parts are sequential/ordered (MKALs, MCALs, mystery alongs, sequential clue/part builds), "general" if patterns are independent companions (a book of doll outfits, a designer bundle). Null if standalone.
- part_label: what the project calls its sub-sections — "Clue", "Part", "Section", "Chapter", "Pattern", "Module", "Block". Return the SINGULAR form. Default "Part" if it's multi-part but the label is unclear. Null if standalone.
- expected_part_count: total number of parts in the overall project if mentioned anywhere in the PDF (e.g. "This is a 12-part mystery along"). Null if not stated.
- current_part_number: ONLY set when THIS PDF represents one specific part of a larger multi-PDF series (e.g. this file is Clue 3, and Clues 1, 2, 4–12 are separate PDFs). If this single PDF contains ALL the clues/parts of the project, set current_part_number to null. Null if standalone.

DOCUMENT:
`;

// Locate a model-returned marker in the source text. Try exact match first,
// then a whitespace-normalized match. Returns the offset or -1.
function findMarker(text, marker) {
  if (!marker || typeof marker !== 'string') return -1;
  const direct = text.indexOf(marker);
  if (direct >= 0) return direct;
  // Whitespace tolerance: collapse runs in both haystack and needle, match
  // positions back into the original. Common when the model preserves spacing
  // it saw rendered but the raw text has different line breaks.
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const haystackNorm = norm(text);
  const needleNorm = norm(marker);
  if (!needleNorm) return -1;
  const normIdx = haystackNorm.indexOf(needleNorm);
  if (normIdx < 0) return -1;
  // Walk the original to find the same position (accounting for collapsed ws).
  // Cheap approximation: scan original, advance a parallel normalized-position
  // counter, and return the original offset where normalized counter == normIdx.
  let np = 0;
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    if (np === normIdx) return i;
    const c = text[i];
    if (/\s/.test(c)) {
      if (!lastWasSpace) { np++; lastWasSpace = true; }
    } else {
      np++; lastWasSpace = false;
    }
  }
  return -1;
}

// Strip JSON fences + thought blocks from a model response and parse.
function parseModelJson(text) {
  const cleaned = text.replace(/^[\s\S]*?```(?:json|JSON)?\s*\n?/i, '').replace(/\n?\s*```[\s\S]*$/, '').trim();
  const candidate = cleaned.startsWith('{') || cleaned.startsWith('[')
    ? cleaned
    : text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const jsonStart = candidate.indexOf('{');
  const jsonEnd = candidate.lastIndexOf('}');
  const slice = jsonStart >= 0 && jsonEnd > jsonStart ? candidate.slice(jsonStart, jsonEnd + 1) : candidate;
  return JSON.parse(slice);
}

async function callClaudeCompact({ prompt, anthropicKey, maxTokens, timeoutMs = PER_CALL_TIMEOUT_MS, label }) {
  if (!anthropicKey) throw new Error('Anthropic API key not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Claude ${label} ${r.status}: ${body.substring(0, 200)}`);
    }
    const data = await r.json();
    const text = data.content?.[0]?.text || '';
    if (!text) throw new Error(`Claude ${label} empty response, stop_reason=${data.stop_reason}`);
    return parseModelJson(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Claude ${label} timeout after ${Math.floor(timeoutMs / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiCompact({ prompt, geminiKey, maxTokens, timeoutMs = PER_CALL_TIMEOUT_MS, label }) {
  if (!geminiKey) throw new Error('Gemini API key not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: controller.signal,
      }
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Gemini ${label} ${r.status}: ${body.substring(0, 200)}`);
    }
    const data = await r.json();
    const parts = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought);
    const text = parts[0]?.text || data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      const fr = data.candidates?.[0]?.finishReason || 'unknown';
      throw new Error(`Gemini ${label} empty response, finishReason=${fr}`);
    }
    return parseModelJson(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Gemini ${label} timeout after ${Math.floor(timeoutMs / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Try Claude first, fall back to Gemini. Both return parsed JSON.
async function callPrimaryWithFallback({ prompt, maxTokens, geminiKey, anthropicKey, label, timeoutMs }) {
  try {
    return await callClaudeCompact({ prompt, anthropicKey, maxTokens, timeoutMs, label });
  } catch (e) {
    console.warn(`[smart-chunk] Claude ${label} failed (${e.message}); falling back to Gemini`);
    return await callGeminiCompact({ prompt, geminiKey, maxTokens, timeoutMs, label });
  }
}

const sharedContextPrompt = (text) => `You are a crochet pattern extraction specialist. Below is the setup/preamble portion of a pattern document — materials, abbreviations, gauge, designer notes — BEFORE any construction instructions. Extract metadata only. Do NOT invent rows or components; the construction sections are processed separately.

Return ONLY valid JSON, no markdown, no backticks. Shape (use empty string/array/null when the field is absent):
{"title":"string","designer":"string","source_url":null,"finished_size":"string","difficulty":"Beginner or Intermediate or Advanced","yarn_weight":"string","hook_size":"string","gauge":"string or null","materials":[{"name":"string","amount":"string","notes":"string"}],"abbreviations":[{"abbr":"string","meaning":"string"}],"abbreviations_map":{},"suggested_resources":[{"label":"string","url":"string"}],"pattern_notes":"string","image_description":"string"}

Materials/yarn/hook may appear under headings like "Materials", "Supplies", "You will need", "Tools", or as inline prose. Scan the whole section. yarn_weight: closest canonical name — Lace, Fingering/Sock, Sport, DK, Worsted/Aran, Bulky, Super Bulky. Infer from meterage (160 m/50g = 320 m/100g → Sport; 270 m/100g → DK) if not stated. hook_size: any "<n> mm" or "US <letter>" anywhere, inline included. abbreviations_map: flat key→value object (e.g. {"sc":"single crochet","mr":"magic ring"}).

SETUP SECTION:
${text}`;

const componentPrompt = ({ componentName, sharedAbbreviations, sharedAbbreviationsMap, patternName, text }) => `You are a crochet pattern extraction specialist. Below is the section for ONE component of a larger pattern. Extract just this component's rows/rounds. Metadata (title, materials, yarn, hook) is already captured separately — don't repeat it.

Pattern name: ${patternName || 'unknown'}
This component: ${componentName}
Known abbreviations: ${JSON.stringify(sharedAbbreviationsMap || {})}

Return ONLY valid JSON, no markdown, no backticks:
{"name":"${componentName}","make_count":1,"independent":false,"body":"","rows":[{"id":"rnd-1","label":"RND 1","text":"full instruction text","stitch_count":null,"note":null,"action_item":false,"repeat_brackets":[{"sequence":"string","count":2}]}]}

Rules:
- REFERENCE SECTIONS: if this section is narrative/reference prose with no checkable rows (e.g. an overview, sizing chart, gauge notes, finishing tips, a backing/lining note), put that prose into "body" as a plain string (preserve line breaks) and leave rows: []. Do NOT fabricate rows for prose. If the section is instructional, leave body: "" and extract rows as usual.
- Extract EVERY round/row visible as its own entry — never skip or collapse ranges.
- Use RND for rounds worked in the round, ROW for flat rows.
- Expand ranges like "RND 10-23" into individual entries RND 10, RND 11... each with the same instruction.
- Keep bracket notation exactly as written: (sc, inc) x 6.
- repeat_brackets: extract any (sequence) x N / [sequence] x N / *sequence* repeat N times patterns into the array.
- If the component name includes a multiplier like "Tentacle (x8)" or "Leg (make 2)", set make_count to that number.
- independent: true only if the pattern explicitly says this component is worked separately.
- If this is an assembly/finishing section, set every row's action_item: true.
- Notes/tips that accompany a row → attach as the row's note field, NOT a separate row.

COMPONENT SECTION:
${text}`;

async function planComponents({ pdfText, geminiKey, anthropicKey }) {
  // Planning sees the whole document at once. Big input, tiny output — under
  // 1500 tokens covers a ~20-component pattern comfortably.
  const prompt = planningPrompt + pdfText;
  return callPrimaryWithFallback({ prompt, maxTokens: 1500, geminiKey, anthropicKey, label: 'planning' });
}

async function extractSharedContextSection({ sectionText, geminiKey, anthropicKey }) {
  return callPrimaryWithFallback({
    prompt: sharedContextPrompt(sectionText),
    maxTokens: 4000,
    geminiKey,
    anthropicKey,
    label: 'shared-context',
  });
}

async function extractComponentSection({ componentName, sectionText, sharedContext, patternName, geminiKey, anthropicKey }) {
  return callPrimaryWithFallback({
    prompt: componentPrompt({
      componentName,
      sharedAbbreviations: sharedContext?.abbreviations || [],
      sharedAbbreviationsMap: sharedContext?.abbreviations_map || {},
      patternName,
      text: sectionText,
    }),
    maxTokens: 16000,
    geminiKey,
    anthropicKey,
    label: `component[${componentName}]`,
  });
}

// ─── Focused recovery (materials / abbreviations) ────────────────────────────
// When the primary pass returns an empty materials or abbreviations field even
// though the source clearly has the section, we re-run a tiny, focused
// extraction over the FULL document for just that field. The prompt builders are
// exported so the offline repair script (scripts/repair-empty-materials.mjs) can
// recover historical import_jobs with the EXACT same schema the live pass uses.

export const materialsRecoveryPrompt = (text) => `You are a crochet pattern extraction specialist. Extract ONLY the materials, yarn, hook, and notions from the document below. Ignore the round/row instructions entirely — another pass handles those.

Materials/yarn/hook may appear under headings like "Materials", "Supplies", "You will need", "Tools", "What you need", or as inline prose with NO heading at all. Scan the ENTIRE document, not only sections labeled "Materials". If no explicit section exists, infer from the gauge section or pattern body.

yarn_weight: closest canonical name — Lace, Fingering/Sock, Sport, DK, Worsted/Aran, Bulky, Super Bulky. If the pattern gives meterage like "160 m / 50 g" or "270 m / 100 g", normalize to per-100g (160 m/50g = 320 m/100g → Sport; 270 m/100g → DK) and pick the closest. If yarn is named only by brand+line (e.g. "Yarn Art Jeans", "Alize Baby Cotton"), use the meterage. Multiple weights → primary first ("Sport/DK").
hook_size: any "<number> mm" (e.g. "2.25 mm", "5.0 mm") or "US <letter>" (B/1 through S/19) anywhere, even inline like "2.25 mm crochet hook". Multiple sizes → list all, primary first.
materials[]: every distinct yarn (preserve brand+line in name, colorways/quantities in amount or notes), hook, and notion (stitch markers, scissors, tapestry needle, stuffing, fishing line, glue gun, safety eyes, etc.) — even when listed as run-on prose instead of bullets.

Return ONLY valid JSON, no markdown, no backticks:
{"yarn_weight":"string","hook_size":"string","materials":[{"name":"string","amount":"string","notes":"string"}]}

DOCUMENT:
${text}`;

export const abbreviationsRecoveryPrompt = (text) => `You are a crochet pattern extraction specialist. Extract ONLY the abbreviations / stitch glossary / legend from the document below. Ignore the round/row instructions entirely — another pass handles those.

Abbreviations may appear in a table, legend, glossary, or definition section under headings like "Abbreviations", "Stitch Guide", "Key", or "Glossary". Scan the ENTIRE document. Include EVERY abbreviation defined, even uncommon ones. If the document defines none explicitly, return empty arrays/objects — do NOT invent standard ones here.

Return ONLY valid JSON, no markdown, no backticks:
{"abbreviations":[{"abbr":"string","meaning":"string"}],"abbreviations_map":{"sc":"single crochet","mr":"magic ring"}}

DOCUMENT:
${text}`;

// Run focused materials recovery over the full document. Best-effort — callers
// MUST wrap in try/catch; a failure here can never fail an import. Always returns
// a normalized shape (materials is always an array).
export async function recoverMaterials({ pdfText, geminiKey, anthropicKey }) {
  const out = await callPrimaryWithFallback({
    prompt: materialsRecoveryPrompt(pdfText),
    maxTokens: 4000,
    geminiKey,
    anthropicKey,
    label: 'materials-recovery',
  });
  return {
    materials: Array.isArray(out?.materials) ? out.materials : [],
    yarn_weight: typeof out?.yarn_weight === 'string' ? out.yarn_weight : '',
    hook_size: typeof out?.hook_size === 'string' ? out.hook_size : '',
  };
}

export async function recoverAbbreviations({ pdfText, geminiKey, anthropicKey }) {
  const out = await callPrimaryWithFallback({
    prompt: abbreviationsRecoveryPrompt(pdfText),
    maxTokens: 4000,
    geminiKey,
    anthropicKey,
    label: 'abbreviations-recovery',
  });
  return {
    abbreviations: Array.isArray(out?.abbreviations) ? out.abbreviations : [],
    abbreviations_map: out?.abbreviations_map && typeof out.abbreviations_map === 'object' ? out.abbreviations_map : {},
  };
}

// Slice text from start_marker to end_marker. Falls back to a heuristic split
// when a marker can't be located so we never lose a whole component to a bad
// model marker. Returns { text, source } where source is 'markers' | 'fallback'.
function sliceByMarkers(text, startMarker, endMarker, hintStart, hintEnd) {
  const startIdx = findMarker(text, startMarker);
  if (startIdx < 0) {
    if (hintStart != null) {
      const safeEnd = hintEnd != null && hintEnd > hintStart ? hintEnd : text.length;
      return { text: text.slice(hintStart, safeEnd), source: 'fallback' };
    }
    return null;
  }
  let endIdx = findMarker(text.slice(startIdx + startMarker.length), endMarker);
  if (endIdx < 0) {
    const safeEnd = hintEnd != null && hintEnd > startIdx ? hintEnd : text.length;
    return { text: text.slice(startIdx, safeEnd), source: 'fallback' };
  }
  endIdx = startIdx + startMarker.length + endIdx + endMarker.length;
  return { text: text.slice(startIdx, endIdx), source: 'markers' };
}

// Compose the final extracted_data from the shared metadata + per-component
// results. Output shape matches the single-shot fullPrompt schema exactly so
// downstream (BevCheck, modal review, save) treats the chunked result as a
// drop-in replacement.
function assembleChunkedResult({ shared, componentResults, planning }) {
  const totalRows = (componentResults || []).reduce((sum, c) => sum + (c?.rows?.length || 0), 0);
  const confidence = totalRows >= 10 ? 'high' : totalRows >= 3 ? 'medium' : 'low';
  return {
    title: shared?.title || planning?.pattern_name || '',
    designer: shared?.designer || '',
    source_url: shared?.source_url || null,
    finished_size: shared?.finished_size || '',
    difficulty: shared?.difficulty || '',
    yarn_weight: shared?.yarn_weight || '',
    hook_size: shared?.hook_size || '',
    gauge: shared?.gauge || null,
    confidence,
    materials: Array.isArray(shared?.materials) ? shared.materials : [],
    abbreviations: Array.isArray(shared?.abbreviations) ? shared.abbreviations : [],
    abbreviations_map: shared?.abbreviations_map || {},
    suggested_resources: Array.isArray(shared?.suggested_resources) ? shared.suggested_resources : [],
    pattern_notes: shared?.pattern_notes || '',
    components: (componentResults || []).filter(Boolean).map(c => ({
      name: c.name || 'Component',
      make_count: typeof c.make_count === 'number' ? c.make_count : 1,
      independent: !!c.independent,
      // S76 additive: narrative/reference prose for no-row sections. Optional —
      // omitted (empty) for instructional sections and on the single-shot path.
      body: typeof c.body === 'string' ? c.body : '',
      rows: Array.isArray(c.rows) ? c.rows : [],
    })),
    assembly_notes: shared?.assembly_notes || '',
    image_description: shared?.image_description || '',
    // S76 document type from the planning pass. Drives import routing in the
    // client (App.jsx handleAddPattern). Null/undefined → router falls back to
    // the existing structural behavior, so this is safe on the single-shot path
    // (no planner) and on historical jobs.
    document_type: planning?.document_type || null,
    // Multi-part detection — passed straight through from the planning
    // pass. Null when the planner determined this is a standalone pattern.
    collection_name: planning?.collection_name || null,
    collection_type: planning?.collection_type || null,
    part_label: planning?.part_label || null,
    expected_part_count: typeof planning?.expected_part_count === 'number' ? planning.expected_part_count : null,
    current_part_number: typeof planning?.current_part_number === 'number' ? planning.current_part_number : null,
  };
}

// Detect "Tentacle (x8)" / "Tentacle (make 8)" → set make_count: 8 + strip
// the suffix from the name. Idempotent if the model already set make_count.
function normalizeComponentName(comp) {
  if (!comp || typeof comp.name !== 'string') return comp;
  const m = comp.name.match(/\s*\(\s*(?:x|make\s+)(\d+)\s*\)\s*$/i);
  if (!m) return comp;
  const n = parseInt(m[1], 10);
  if (Number.isFinite(n) && n > 0) {
    comp.name = comp.name.replace(m[0], '').trim();
    if (!comp.make_count || comp.make_count === 1) comp.make_count = n;
  }
  return comp;
}

async function runSmartChunkedExtraction({ pdfText, geminiKey, anthropicKey, pdfMetadataTitle, t0, onPathChange, onPlanned }) {
  // ── Phase 1: planning ──
  await onPathChange?.('chunked_planning');
  const phasePlanStart = Date.now();
  const planning = await planComponents({ pdfText, geminiKey, anthropicKey });
  console.log(`[smart-chunk] phase=planning components=${planning?.component_count || 0} names=${JSON.stringify((planning?.components || []).map(c => c?.name))} (${Date.now() - phasePlanStart}ms)`);
  await onPlanned?.(planning?.component_count || 0);

  // Edge case: planner found nothing. Treat as Tier 1 single-shot (the document
  // was probably mostly setup with no construction components).
  if (!planning || !Array.isArray(planning.components) || planning.components.length === 0) {
    console.warn('[smart-chunk] planner returned 0 components — falling through to single-shot');
    await onPathChange?.('single_shot');
    const data = await callGeminiExtract({ prompt: fullPrompt, pdfText, geminiKey, maxTokens: 65536 });
    const finalized = applyPdfMetadataTitleFallback(data, pdfMetadataTitle, 'pdf-text');
    return { data: finalized.data, extractionMethod: finalized.extractionMethod, providerUsed: 'gemini', durationMs: Date.now() - t0 };
  }

  // ── Phase 2: shared context (setup + materials + abbreviations) ──
  await onPathChange?.('chunked_extracting');
  const sharedEndIdx = findMarker(pdfText, planning.shared_context_end_marker);
  // If the marker isn't in the text, assume shared context = up to the first
  // component's start marker. If THAT fails too, take the first 25% of the
  // doc (heuristic minimum — every pattern has SOME preamble).
  let sharedEnd;
  if (sharedEndIdx >= 0) {
    sharedEnd = sharedEndIdx + (planning.shared_context_end_marker?.length || 0);
  } else {
    const firstCompStart = planning.components[0]?.start_marker ? findMarker(pdfText, planning.components[0].start_marker) : -1;
    if (firstCompStart >= 0) {
      sharedEnd = firstCompStart;
    } else {
      // Neither the shared-context marker nor the first component's start marker
      // matched verbatim. The blind 25% slice frequently cuts a materials section
      // that lives deeper in a large document. When the doc is large, locate the
      // materials section by keyword and snap the boundary to include through it
      // (plus a window) instead of guessing 25%.
      const pct25 = Math.floor(pdfText.length * 0.25);
      if (pdfText.length > SHARED_FALLBACK_KEYWORD_MIN_CHARS) {
        const m = pdfText.match(MATERIALS_SECTION_KEYWORDS);
        const kwIdx = m ? m.index : -1;
        sharedEnd = kwIdx >= 0
          ? Math.min(pdfText.length, Math.max(pct25, kwIdx + MATERIALS_SECTION_WINDOW_CHARS))
          : pct25;
        console.log(`[smart-chunk] shared-boundary fallback: doc=${pdfText.length} kwIdx=${kwIdx} sharedEnd=${sharedEnd}`);
      } else {
        sharedEnd = pct25;
      }
    }
  }
  const sharedSlice = pdfText.slice(0, sharedEnd);
  const phaseSharedStart = Date.now();
  const shared = await extractSharedContextSection({ sectionText: sharedSlice, geminiKey, anthropicKey });
  console.log(`[smart-chunk] phase=shared sliceLen=${sharedSlice.length} (${Date.now() - phaseSharedStart}ms)`);

  // ── Phase 3: per-component extraction, sequential, 1 retry per chunk ──
  // Pre-locate every component's start marker so each slice can fall back to a
  // positional window (previous start → next start) when its own markers can't
  // be found verbatim. Without these hints sliceByMarkers returns null on a
  // marker miss and the component is silently dropped — which was eating the
  // first clue (its start marker sits right at the shared-context boundary and
  // often fails to match exactly).
  const startIdxes = planning.components.map(c => findMarker(pdfText, c.start_marker));
  const componentResults = [];
  for (let i = 0; i < planning.components.length; i++) {
    const comp = planning.components[i];
    const phaseCompStart = Date.now();
    // hintStart: this component's located start, else the previous component's
    // start, else the end of shared context (for the first component).
    let hintStart = startIdxes[i];
    if (hintStart < 0) hintStart = (i === 0) ? sharedEnd : (startIdxes[i - 1] >= 0 ? startIdxes[i - 1] : sharedEnd);
    // hintEnd: the next locatable component's start, else end of document.
    let hintEnd = -1;
    for (let j = i + 1; j < startIdxes.length; j++) { if (startIdxes[j] >= 0) { hintEnd = startIdxes[j]; break; } }
    if (hintEnd < 0) hintEnd = pdfText.length;
    const slice = sliceByMarkers(pdfText, comp.start_marker, comp.end_marker, hintStart, hintEnd);
    if (!slice || !slice.text || slice.text.length < 20) {
      console.warn(`[smart-chunk] component[${i + 1}/${planning.components.length}] '${comp.name}' marker miss + fallback empty — skipping`);
      continue;
    }
    let attempt = 0;
    let extracted = null;
    let lastErr = null;
    while (attempt < 2 && !extracted) {
      attempt++;
      try {
        extracted = await extractComponentSection({
          componentName: comp.name,
          sectionText: slice.text,
          sharedContext: shared,
          patternName: planning.pattern_name,
          geminiKey,
          anthropicKey,
        });
      } catch (err) {
        lastErr = err;
        console.warn(`[smart-chunk] component[${i + 1}] '${comp.name}' attempt ${attempt} failed: ${err.message}`);
      }
    }
    if (!extracted) {
      throw new Error(`Smart chunked extraction failed at component '${comp.name}' (attempts=${attempt}): ${lastErr?.message || 'unknown'}`);
    }
    componentResults.push(normalizeComponentName(extracted));
    console.log(`[smart-chunk] phase=component[${i + 1}/${planning.components.length}] '${comp.name}' sliceLen=${slice.text.length} source=${slice.source} (${Date.now() - phaseCompStart}ms)`);
  }

  // ── Phase 4: merge (pure JS) ──
  await onPathChange?.('chunked_merging');
  const merged = assembleChunkedResult({ shared, componentResults, planning });

  // ── Phase 4.5: targeted recovery ──
  // The shared-context pass occasionally returns empty materials/abbreviations
  // even though the document clearly has them — usually because the slice
  // boundary cut the setup section short, or the model skipped the list. When a
  // field is empty AND its section keywords are present in the FULL text, run a
  // focused full-document recovery for just that field and union the result in.
  // Best-effort: a recovery failure never fails the import.
  const matsEmpty = !Array.isArray(merged.materials) || merged.materials.length === 0;
  if (matsEmpty && MATERIALS_SECTION_KEYWORDS.test(pdfText)) {
    try {
      const rec = await recoverMaterials({ pdfText, geminiKey, anthropicKey });
      if (rec.materials.length) {
        merged.materials = mergeMaterials(merged.materials, rec.materials);
        if (isEmptyish(merged.yarn_weight) && !isEmptyish(rec.yarn_weight)) merged.yarn_weight = rec.yarn_weight;
        if (isEmptyish(merged.hook_size) && !isEmptyish(rec.hook_size)) merged.hook_size = rec.hook_size;
      }
      console.log(`[smart-chunk] phase=recovery field=materials recovered=${rec.materials.length}`);
    } catch (e) {
      console.warn(`[smart-chunk] materials recovery failed: ${e.message}`);
    }
  }
  const abbrsEmpty = !Array.isArray(merged.abbreviations) || merged.abbreviations.length === 0;
  if (abbrsEmpty && ABBREVIATIONS_SECTION_KEYWORDS.test(pdfText)) {
    try {
      const rec = await recoverAbbreviations({ pdfText, geminiKey, anthropicKey });
      const recCount = rec.abbreviations.length + Object.keys(rec.abbreviations_map).length;
      if (recCount) {
        merged.abbreviations = mergeAbbreviationLists(merged.abbreviations, rec.abbreviations);
        // Existing (properly-sliced) map values win over recovered ones.
        merged.abbreviations_map = { ...rec.abbreviations_map, ...(merged.abbreviations_map || {}) };
      }
      console.log(`[smart-chunk] phase=recovery field=abbreviations recovered=${rec.abbreviations.length}`);
    } catch (e) {
      console.warn(`[smart-chunk] abbreviations recovery failed: ${e.message}`);
    }
  }

  const finalized = applyPdfMetadataTitleFallback(merged, pdfMetadataTitle, 'pdf-text-chunked');
  return { data: finalized.data, extractionMethod: finalized.extractionMethod, providerUsed: 'claude', durationMs: Date.now() - t0 };
}

// ─── EXPORTED: runPdfExtraction ──────────────────────────────────────────────
// Pure(ish) function called by both the HTTP handler below and the queue worker.
// Throws on hard failure. Caller decides how to log/persist.

// Strip authoring-tool file extensions (.cdr, .pdf, .docx, etc.) that some
// PDF authoring tools leave on the metadata title field (notably CorelDraw).
// Case-insensitive. Returns the trimmed cleaned title. Exported so the modal
// save paths can apply the same scrub at review time without re-importing the
// regex.
export function sanitizeTitle(raw) {
  if (typeof raw !== 'string') return raw;
  return raw
    .replace(/\.(cdr|pdf|docx|doc|ai|psd|jpg|jpeg|png)$/i, '')
    .trim();
}

// Applies the client-supplied PDF metadata title as a fallback when the
// model returned an empty/null title. Common cause: long PDFs where the
// title page is image-only and the chunked merger never sees a textual
// title. Suffix the method so we can measure how often this saves us.
function applyPdfMetadataTitleFallback(data, pdfMetadataTitle, baseMethod) {
  if (!data || typeof data !== 'object') return { data, extractionMethod: baseMethod };
  const currentTitle = data.title;
  const needsFallback = isEmptyish(currentTitle) && !isEmptyish(pdfMetadataTitle);
  if (!needsFallback) return { data, extractionMethod: baseMethod };
  return {
    data: { ...data, title: sanitizeTitle(pdfMetadataTitle) },
    extractionMethod: `${baseMethod}_with_pdf_meta_title`,
  };
}

export async function runPdfExtraction({ pdfText, pageCount, geminiKey, anthropicKey, pdfMetadataTitle, onPathChange, onPlanned }) {
  if (!pdfText) throw new Error("pdfText is required");
  if (!geminiKey) throw new Error("Gemini API key not configured");

  const t0 = Date.now();
  const textLen = pdfText.length;
  const isOversized = textLen > TIER_OVERSIZED_THRESHOLD;
  const useChunked = textLen >= TIER_SMALL_THRESHOLD;

  console.log(`[runPdfExtraction] textLen=${textLen} tier=${isOversized ? 'oversized' : useChunked ? 'smart-chunked' : 'single-shot'} pageCount=${pageCount || 'unknown'}`);

  // TIER 1: SHORT PATTERNS (<15KB) — Gemini → Claude cascade, unchanged.
  if (!useChunked) {
    await onPathChange?.('single_shot');
    const preferredProvider = await getPreferredProvider(geminiKey);
    console.log("[runPdfExtraction] Router selected:", preferredProvider);

    if (preferredProvider === 'gemini') {
      try {
        const data = await callGeminiExtract({ prompt: fullPrompt, pdfText, geminiKey, maxTokens: 65536 });
        const finalized = applyPdfMetadataTitleFallback(data, pdfMetadataTitle, 'pdf-text');
        return { data: finalized.data, extractionMethod: finalized.extractionMethod, providerUsed: 'gemini', durationMs: Date.now() - t0 };
      } catch (e) {
        console.error("[runPdfExtraction] Gemini attempt failed:", e.message);
      }
    }

    const elapsed = Date.now() - t0;
    if (elapsed > 40000) throw new Error(`Time budget exceeded (${elapsed}ms) before Claude attempt`);

    try {
      const data = await callClaudeExtract({ pdfText, anthropicKey });
      const finalized = applyPdfMetadataTitleFallback(data, pdfMetadataTitle, 'pdf-text');
      return { data: finalized.data, extractionMethod: finalized.extractionMethod, providerUsed: 'claude', durationMs: Date.now() - t0 };
    } catch (e2) {
      throw new Error(`PDF extraction failed: Gemini and Claude both failed. Last error: ${e2.message}`);
    }
  }

  // TIER 2/3: SMART CHUNKED EXTRACTION
  // - Planning pass discovers components
  // - Shared context extracts setup/metadata once
  // - Each component slice extracts independently (1 retry per slice)
  // - Pure-JS merge builds the standard extracted_data shape
  // Tier 3 (>150KB) just logs a warning and runs the same path — the outer
  // 300s budget either catches the result or the worker marks the job failed.
  if (isOversized) {
    console.warn(`[runPdfExtraction] OVERSIZED (${textLen} chars > ${TIER_OVERSIZED_THRESHOLD}) — attempting smart chunked anyway`);
  }
  try {
    return await runSmartChunkedExtraction({ pdfText, geminiKey, anthropicKey, pdfMetadataTitle, t0, onPathChange, onPlanned });
  } catch (chunkErr) {
    if (isOversized) {
      throw new Error(`This pattern is unusually large. Bev needs a moment — try again or contact support. (chunked: ${chunkErr.message})`);
    }
    throw chunkErr;
  }
}

// ─── HTTP handler (existing surface; thin wrapper around runPdfExtraction + bevcheck) ───

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const _url = process.env.VITE_SUPABASE_URL;
  const _key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const _t0 = Date.now();

  try {
    const { mode = "extract" } = req.body || {};
    if (mode === "bevcheck") return await handleBevCheck(req, res, _url, _key, _t0);
    if (mode === "extract-images") return await handleExtractImages(req, res, _url, _key, _t0);

    const { pdfText, pageCount, pdfMetadataTitle } = req.body || {};
    if (!pdfText) return res.status(400).json({ error: "pdfText required" });

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!GEMINI_KEY) return res.status(500).json({ error: "API key not configured on server" });

    const { data, providerUsed, chunksTotal, chunksFailed } = await runPdfExtraction({
      pdfText, pageCount, geminiKey: GEMINI_KEY, anthropicKey: ANTHROPIC_KEY, pdfMetadataTitle,
    });

    if (_url && _key) {
      const tag = chunksTotal ? `chunked/${chunksTotal}chunks/${chunksFailed}failed` : providerUsed;
      await fetch(`${_url}/rest/v1/vercel_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: `POST /api/extract-pattern → 200 ${tag} (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/extract-pattern', request_method: 'POST', status_code: 200, project_id: 'wovely' })
      }).catch(() => {});
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error("[extract-pattern] handler error:", err.message, err.stack);
    if (_url && _key) {
      await fetch(`${_url}/rest/v1/vercel_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: `[extract-pattern] ${err.message} (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/extract-pattern', request_method: 'POST', status_code: 500, project_id: 'wovely' })
      }).catch(() => {});
    }
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}

// ─── BevCheck — core logic shared by HTTP handler and queue worker ──────────

const BEVCHECK_PROMPT = `You are a crochet pattern validator. Analyze this pattern and return ONLY a JSON object with this exact structure — no markdown, no backticks, no explanation:
{
  "state": "pass" or "warning" or "issues",
  "checks": [
    { "id": "string", "label": "string", "tier": "core" or "advisory", "status": "pass" or "warning" or "fail", "detail": "string" }
  ],
  "summary": "string"
}

CATEGORY DEFINITIONS — use these exact IDs and tiers, always return all 6:
id: "sequence", label: "Sequential rounds/rows", tier: "core"
id: "stitch_math", label: "Stitch count math", tier: "core"
id: "duplicates", label: "Duplicate round numbers", tier: "core"
id: "cross_refs", label: "Cross-references", tier: "core"
id: "translation", label: "Translation artifacts", tier: "advisory"
id: "structure", label: "Component structure", tier: "advisory"

STATE RULES — derive "state" from core checks only:
Any core check with status "fail" → state: "issues".
No core fails but any warning exists → state: "warning".
All checks pass → state: "pass".
Advisory checks NEVER drive state to "issues". They can only contribute to "warning".

CROCHET STITCH MATH RULES:
"inc" = 2 stitches produced, consumes 1 from previous round.
"dec"/"sc2tog"/"inv dec" = 1 stitch produced, consumes 2.
"sc","hdc","dc","tr","sl st" = 1 produced, consumes 1.
"ch" inside a round adds 1 to count, does not consume from previous round.
Magic ring has 0 stitches before round 1.
Bracket repeats: "(sc, inc) x 6" = 6 × (1+2) = 18 produced, consuming 12.
Do NOT flag counts as wrong unless you have done the arithmetic yourself and confirmed a mismatch.

UNCERTAINTY RULE:
Confidently correct → "pass".
Confidently wrong → "fail".
Cannot verify due to ambiguity, unusual abbreviations, or complex construction → "warning" with brief explanation.
Never guess. Never silently pass something you cannot calculate with confidence.

IGNORE: PDF formatting artifacts, OCR typos in tip/intro sections, print-friendly page duplications at end of PDF.`;

// runBevCheck — exported core. Called both by the HTTP handler below
// (handleBevCheck) and directly by the queue worker after extraction so the
// validation report is committed to import_jobs.validation_report before
// status flips to 'completed'. Throws on hard failure; the worker swallows
// and stores `{error: ...}` to keep import success decoupled from BevCheck.
export async function runBevCheck({ patternText, geminiKey, anthropicKey }) {
  if (!patternText) throw new Error("patternText is required");
  if (!geminiKey && !anthropicKey) throw new Error("No API keys configured");

  const TEXT_LIMIT = 20000;
  const text = patternText.length > TEXT_LIMIT
    ? patternText.slice(0, patternText.lastIndexOf("\n", TEXT_LIMIT) || TEXT_LIMIT)
    : patternText;

  const callGemini = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let r;
    try {
      r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: BEVCHECK_PROMPT + "\n\nPATTERN TEXT:\n" + text }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 65536, thinkingConfig: { thinkingBudget: 0 } },
          }),
          signal: controller.signal,
        }
      );
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === "AbortError") throw new Error("Gemini timeout after 8s");
      throw fetchErr;
    }
    clearTimeout(timeout);
    if (!r.ok) {
      const errBody = await r.text();
      throw new Error(`Gemini API error ${r.status}: ${errBody.substring(0, 300)}`);
    }
    const data = await r.json();
    const raw = data.candidates?.[0]?.content?.parts?.filter(p => !p.thought)?.map(p => p.text)?.join("") || "";
    if (!raw) throw new Error("Gemini returned empty response");
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  };

  const callClaude = async () => {
    if (!anthropicKey) throw new Error("Anthropic API key not configured");
    const controller = new AbortController();
    const claudeTimeout = setTimeout(() => controller.abort(), 55000);
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          messages: [{ role: "user", content: BEVCHECK_PROMPT + "\n\nPATTERN TEXT:\n" + text }],
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(claudeTimeout);
      if (fetchErr.name === "AbortError") throw new Error("Claude timeout after 55s");
      throw fetchErr;
    }
    clearTimeout(claudeTimeout);
    if (!r.ok) {
      const errBody = await r.text();
      throw new Error(`Claude API error ${r.status}: ${errBody.substring(0, 200)}`);
    }
    const data = await r.json();
    const raw = data.content?.[0]?.text || "";
    if (!raw) throw new Error("Claude returned empty response");
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    try { return JSON.parse(cleaned); } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); }
        catch { throw new Error("Claude returned unparseable JSON: " + cleaned.substring(0, 200)); }
      }
      throw new Error("Claude returned no JSON object: " + cleaned.substring(0, 200));
    }
  };

  const t0 = Date.now();
  const preferredProvider = geminiKey ? await getPreferredProvider(geminiKey) : 'claude';

  if (preferredProvider === 'gemini' && geminiKey) {
    try {
      const result = await callGemini();
      return { ...result, provider: 'gemini' };
    } catch (e) {
      console.error("[runBevCheck] Gemini failed:", e.message);
    }
  }

  const elapsed = Date.now() - t0;
  if (elapsed > 40000) throw new Error("BevCheck time budget exceeded before Claude attempt");
  const result = await callClaude();
  return { ...result, provider: 'claude' };
}

async function handleBevCheck(req, res, _url, _key, _t0) {
  const { patternText } = req.body || {};
  if (!patternText) return res.status(400).json({ error: "patternText required" });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!GEMINI_KEY && !ANTHROPIC_KEY) return res.status(500).json({ error: "No API keys configured" });

  const logToSupabase = (level, message, status) => {
    if (!_url || !_key) return;
    fetch(`${_url}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ timestamp: new Date().toISOString(), level, message, source: 'serverless', request_path: '/api/extract-pattern?mode=bevcheck', request_method: 'POST', status_code: status, project_id: 'wovely' })
    }).catch(() => {});
  };

  try {
    const result = await runBevCheck({ patternText, geminiKey: GEMINI_KEY, anthropicKey: ANTHROPIC_KEY });
    logToSupabase('info', `POST /api/extract-pattern?mode=bevcheck → 200 ${result.provider} (${Date.now() - _t0}ms)`, 200);
    return res.status(200).json(result);
  } catch (e) {
    logToSupabase('error', `[bevcheck] failed: ${e.message} (${Date.now() - _t0}ms)`, 500);
    return res.status(500).json({ error: true, message: "bev_tangled", provider: "failed" });
  }
}

// ─── Image extraction (mode: "extract-images") ──────────────────────────────
// Fire-and-forget phase the client kicks off after `patterns.insert` succeeds.
// Sends the PDF to Gemini for per-page classification, then inserts a row in
// pattern_images for every meaningful page (chart/cover/diagram/photo/glossary).
// The actual rasterization happens client-side on first Craft-tier detail
// view — cloudinary_url is null until the page is rendered + uploaded. Keeps
// this endpoint free of native canvas dependencies that are unreliable in
// Vercel serverless.

const IMAGE_EXTRACTION_PAGE_CAP = 30;
const IMAGE_EXTRACTION_MAX_PDF_BYTES = 18 * 1024 * 1024; // Gemini inline cap is 20MB; leave headroom.

const IMAGE_CLASSIFICATION_PROMPT = `You are analyzing a crochet pattern PDF. Look at each page and classify it.

For every page, return one entry with type set to one of:
- "chart": a stitch chart or symbol grid (visual pattern diagram with symbols like +, x, o, T arranged in a grid)
- "cover": cover page with the pattern's main photo or title artwork
- "diagram": a schematic, assembly diagram, or construction illustration
- "photo": a photograph of the finished project or work-in-progress. ONLY use "photo" when the page clearly shows the finished crochet project. Social media graphics, designer branding/promo pages, collages of unrelated images, watermarks, and advertising belong in "decorative", not "photo".
- "glossary": an abbreviation table, stitch glossary, or reference key
- "text": a page that is primarily written instructions (no visual content worth keeping)
- "decorative": decorative/filler/promotional pages with no instructional content

For chart, cover, diagram, photo, glossary entries also provide:
- caption: a short sentence describing what the image shows
- component: which component/section of the pattern it belongs to (e.g. "Clue #1", "Body", "Border"), or null if it's a pattern-level image (cover, glossary)

For text and decorative entries set caption: null and component: null.

Process at most the first ${IMAGE_EXTRACTION_PAGE_CAP} pages. Return ONLY valid JSON, no markdown, no backticks:
{
  "pages": [
    { "page": 1, "type": "cover", "caption": "string or null", "component": "string or null" }
  ]
}`;

const MEANINGFUL_IMAGE_TYPES = new Set(['chart', 'cover', 'diagram', 'photo', 'glossary']);

async function classifyPdfPagesWithGemini({ pdfBase64, geminiKey }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
              { text: IMAGE_CLASSIFICATION_PROMPT },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: controller.signal,
      }
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`Gemini image-classify ${r.status}: ${body.substring(0, 300)}`);
    }
    const data = await r.json();
    const parts = (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought);
    const text = parts.map(p => p.text || '').join('') || data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      throw new Error(`Gemini image-classify empty response, finishReason=${data.candidates?.[0]?.finishReason || 'unknown'}`);
    }
    return parseModelJson(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Gemini image-classify timeout after 120s');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Normalize a component / page label for fuzzy matching. Strips punctuation,
// collapses whitespace, lowercases. "Clue #1" → "clue 1", "Body chart" → "body chart".
function normalizeComponentLabel(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().replace(/[#:_\-]/g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Pick which pattern a classified page belongs to. For a single-pattern import
// everything goes to that pattern. For a multi-pattern (split collection)
// import, charts/diagrams are routed to the pattern whose component_name best
// matches the page's component label; covers, glossaries, and unmatched pages
// fall to the first pattern (clue 1) so shared references live somewhere.
function assignPatternForPage(page, patterns) {
  if (patterns.length === 1) return patterns[0];
  const pageComp = normalizeComponentLabel(page.component);
  if (pageComp) {
    // Exact normalized match first, then substring either direction.
    let match = patterns.find(p => normalizeComponentLabel(p.component_name) === pageComp);
    if (match) return match;
    match = patterns.find(p => {
      const pc = normalizeComponentLabel(p.component_name);
      return pc && (pc.includes(pageComp) || pageComp.includes(pc));
    });
    if (match) return match;
  }
  return patterns[0];
}

async function handleExtractImages(req, res, supabaseUrl, serviceKey, t0) {
  const body = req.body || {};
  const { file_url, user_id } = body;
  // Accept either a single pattern_id (back-compat) or a patterns array of
  // { id, component_name } for split-collection imports that share one PDF.
  let patterns = [];
  if (Array.isArray(body.patterns) && body.patterns.length) {
    patterns = body.patterns
      .filter(p => p && p.id)
      .map(p => ({ id: p.id, component_name: p.component_name || null }));
  } else if (body.pattern_id) {
    patterns = [{ id: body.pattern_id, component_name: null }];
  }

  console.log(`[extract-images] request user=${user_id} patterns=${patterns.length} file=${file_url ? 'yes' : 'no'}`);

  if (patterns.length === 0 || !file_url || !user_id) {
    return res.status(400).json({ error: 'patterns (or pattern_id), file_url, and user_id are required' });
  }
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const firstId = patterns[0].id;
  const logFailure = (msg, status) => {
    if (!supabaseUrl || !serviceKey) return;
    fetch(`${supabaseUrl}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(), level: status >= 500 ? 'error' : 'warn',
        message: msg, source: 'serverless',
        request_path: '/api/extract-pattern?mode=extract-images',
        request_method: 'POST', status_code: status, project_id: 'wovely',
        user_id,
      }),
      keepalive: true,
    }).catch(() => {});
  };

  // Only PDF source files are classifiable here. Image-imports (.jpg/.png on
  // Cloudinary) are already user-uploaded photographs and don't need this pass.
  if (!file_url.toLowerCase().endsWith('.pdf')) {
    console.log(`[extract-images] pattern=${firstId} skipped — non-pdf source`);
    return res.status(200).json({ ok: true, skipped: 'non-pdf source', images_added: 0 });
  }

  let pdfBase64;
  try {
    const pdfRes = await fetch(file_url);
    if (!pdfRes.ok) throw new Error(`PDF fetch ${pdfRes.status}`);
    const buf = await pdfRes.arrayBuffer();
    if (buf.byteLength > IMAGE_EXTRACTION_MAX_PDF_BYTES) {
      logFailure(`[extract-images] pattern=${firstId} skipped — pdf too large (${buf.byteLength} bytes)`, 200);
      return res.status(200).json({ ok: true, skipped: 'pdf too large', images_added: 0 });
    }
    pdfBase64 = Buffer.from(buf).toString('base64');
    console.log(`[extract-images] pattern=${firstId} pdf fetched ${buf.byteLength} bytes`);
  } catch (fetchErr) {
    logFailure(`[extract-images] pattern=${firstId} pdf fetch failed: ${fetchErr.message}`, 500);
    return res.status(500).json({ error: 'pdf_fetch_failed', message: fetchErr.message });
  }

  let classification;
  try {
    classification = await classifyPdfPagesWithGemini({ pdfBase64, geminiKey });
  } catch (geminiErr) {
    logFailure(`[extract-images] pattern=${firstId} gemini failed: ${geminiErr.message}`, 500);
    return res.status(500).json({ error: 'classify_failed', message: geminiErr.message });
  }

  const pages = Array.isArray(classification?.pages) ? classification.pages : [];
  const meaningful = pages
    .filter(p => p && typeof p.page === 'number' && MEANINGFUL_IMAGE_TYPES.has(p.type))
    .slice(0, IMAGE_EXTRACTION_PAGE_CAP);
  console.log(`[extract-images] pattern=${firstId} classified ${pages.length} pages, ${meaningful.length} meaningful`);

  if (meaningful.length === 0) {
    return res.status(200).json({ ok: true, images_added: 0, total_pages: pages.length });
  }

  // Assign each page to a pattern, then number sort_order per pattern so each
  // pattern's grid is ordered independently.
  const perPatternCounter = {};
  const rows = meaningful.map((p) => {
    const target = assignPatternForPage(p, patterns);
    const sortOrder = (perPatternCounter[target.id] = (perPatternCounter[target.id] || 0)) ;
    perPatternCounter[target.id] = sortOrder + 1;
    return {
      pattern_id: target.id,
      user_id,
      cloudinary_url: null,
      image_type: p.type,
      page_number: p.page,
      sort_order: sortOrder,
      caption: p.caption ? String(p.caption).slice(0, 400) : null,
      component_name: p.component ? String(p.component).slice(0, 120) : null,
    };
  });

  try {
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/pattern_images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!insertRes.ok) {
      const errBody = await insertRes.text();
      throw new Error(`insert ${insertRes.status}: ${errBody.substring(0, 300)}`);
    }
  } catch (insertErr) {
    logFailure(`[extract-images] pattern=${firstId} insert failed: ${insertErr.message}`, 500);
    return res.status(500).json({ error: 'insert_failed', message: insertErr.message });
  }

  console.log(`[extract-images] pattern=${firstId} inserted ${rows.length} rows across ${patterns.length} pattern(s) (${Date.now() - t0}ms)`);
  if (supabaseUrl && serviceKey) {
    fetch(`${supabaseUrl}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(), level: 'info',
        message: `[extract-images] patterns=${patterns.length} images=${rows.length} pages=${pages.length} (${Date.now() - t0}ms)`,
        source: 'serverless',
        request_path: '/api/extract-pattern?mode=extract-images',
        request_method: 'POST', status_code: 200, project_id: 'wovely',
        user_id,
      }),
      keepalive: true,
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true, images_added: rows.length, total_pages: pages.length });
}
