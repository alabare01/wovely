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

    // Materials: concatenate and dedupe by lowercased name. Many real patterns
    // list yarn/hook/notions across multiple pages — first-wins would drop them.
    if (Array.isArray(chunk.materials) && chunk.materials.length) {
      const existingMats = Array.isArray(merged.materials) ? merged.materials : [];
      const seen = new Set(existingMats.map(m => (m?.name || '').toLowerCase().trim()).filter(Boolean));
      const newMats = chunk.materials.filter(m => {
        const key = (m?.name || '').toLowerCase().trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      merged.materials = [...existingMats, ...newMats];
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
      const existingAbbrs = new Set(merged.abbreviations?.map(a => a.abbr) || []);
      const newAbbrs = chunk.abbreviations.filter(a => !existingAbbrs.has(a.abbr));
      merged.abbreviations = [...(merged.abbreviations || []), ...newAbbrs];
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

═══ OUTPUT FORMAT ═══
Return this exact JSON structure:
{"title":"string","designer":"string","source_url":null,"finished_size":"string","difficulty":"Beginner or Intermediate or Advanced","yarn_weight":"string","hook_size":"string","gauge":"string or null","confidence":"low or medium or high","materials":[{"name":"string","amount":"string","notes":"string"}],"abbreviations":[{"abbr":"string","meaning":"string"}],"abbreviations_map":{"mr":"magic ring","sc":"single crochet"},"suggested_resources":[{"label":"string","url":"string"}],"pattern_notes":"string","components":[{"name":"string","make_count":1,"independent":false,"rows":[{"id":"rnd-1","label":"RND 1","text":"full instruction text with all references resolved","stitch_count":null,"note":null,"action_item":false,"repeat_brackets":[{"sequence":"string","count":2}]}]}],"assembly_notes":"string","image_description":"string"}

COMPONENT RULES:
• For components like 'FLIPPER (MAKE 2)', set make_count: 2. Default 1 if not specified.
• Set independent: true ONLY when the pattern explicitly says a component can be made separately — e.g. "make 2 separately", "work independently". Default false.
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

export async function runPdfExtraction({ pdfText, pageCount, geminiKey, anthropicKey, pdfMetadataTitle }) {
  if (!pdfText) throw new Error("pdfText is required");
  if (!geminiKey) throw new Error("Gemini API key not configured");

  const t0 = Date.now();
  const CHUNK_THRESHOLD = 14000;
  const chunks = splitIntoChunks(pdfText, CHUNK_THRESHOLD, 500);
  const isChunked = chunks.length > 1;

  console.log(`[runPdfExtraction] textLen=${pdfText.length} chunks=${chunks.length} chunked=${isChunked} pageCount=${pageCount || 'unknown'}`);

  // SHORT PATTERNS: Gemini → Claude cascade
  if (!isChunked) {
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

  // LONG PATTERNS: chunked Claude
  console.log(`[runPdfExtraction] CHUNKED MODE: ${chunks.length} chunks`);
  const chunkResults = [];
  let chunksFailed = 0;
  for (let i = 0; i < chunks.length; i++) {
    const elapsed = Date.now() - t0;
    if (elapsed > 250000) {
      console.warn(`[runPdfExtraction] Time budget nearly exhausted at chunk ${i + 1}/${chunks.length} (${elapsed}ms) — stopping early`);
      break;
    }
    try {
      const result = await callClaudeChunkExtract({
        chunkText: chunks[i], chunkIndex: i, totalChunks: chunks.length, isFirstChunk: i === 0, anthropicKey
      });
      chunkResults.push(result);
    } catch (chunkErr) {
      console.error(`[runPdfExtraction] Chunk ${i + 1} failed: ${chunkErr.message}`);
      chunksFailed++;
    }
  }
  if (chunkResults.length === 0) {
    throw new Error(`PDF extraction failed: all ${chunks.length} chunks failed`);
  }
  const merged = mergeChunkResults(chunkResults);
  const finalized = applyPdfMetadataTitleFallback(merged, pdfMetadataTitle, 'pdf-text');
  return {
    data: finalized.data,
    extractionMethod: finalized.extractionMethod,
    providerUsed: 'claude',
    durationMs: Date.now() - t0,
    chunksTotal: chunks.length,
    chunksFailed,
  };
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
