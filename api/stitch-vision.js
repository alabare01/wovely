// api/stitch-vision.js
// Vercel serverless function — identifies crochet stitch from a photo via Gemini

export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: "10mb" } } };

// ── SNAP & STITCH: a photo of a finished piece in, a starter pattern out ────
// Consolidated here on 2026-09-15 rather than given its own file (CLAUDE.md:
// 17 functions, do not add). Until then AddPatternModal ran this prompt
// against Gemini straight from the browser with VITE_GEMINI_API_KEY, which
// Vite inlines into the public bundle, so the key sat in view-source on
// wovely.app for anyone to spend against. Same prompt, same output shape,
// the key stays here. Client contract: POST { mode: "snap", image: dataUrl }.
const SNAP_PROMPT = `You are an expert crochet pattern designer with deep knowledge of amigurumi, garment construction, blankets, and all crochet techniques. Analyze this photograph of a finished crochet object.

Your task: identify every distinct visible component, determine the exact crochet construction technique that produces each shape, and provide enough detail that a crocheter could recreate the object from scratch.

Return ONLY valid raw JSON. No markdown. No explanation. No backticks. Just the JSON object.

{
  "object_name": "the actual name of what this is",
  "object_category": "amigurumi or blanket or garment or accessory or home_goods or unknown",
  "confidence_overall": 85,
  "size_class": "tiny_under5cm or small_5to10cm or medium_10to20cm or large_over20cm",
  "color_structure": { "primary_color": "red", "accent_colors": ["cream","brown"], "color_count": 3 },
  "components": [
    {
      "id": "body", "role": "body", "label": "Body",
      "primitive_type": "cylinder or sphere or oval or cone or tapered_cylinder or flat_disc or flat_square or flat_circle",
      "size_relative": "dominant or large or medium or small",
      "size_ratio_to_dominant": 1.0, "color": "main color", "confidence": 90,
      "construction": { "technique": "worked_in_the_round or worked_flat or joined_granny_squares", "stitch": "single_crochet or half_double_crochet or double_crochet or bobble or ribbed", "start": "magic_ring or chain_foundation or chain_ring", "increase_to": 36, "even_rounds": 10, "decrease_from": 36, "final_sts": 6, "stuffed": true, "notes": "detailed note" },
      "join_to": "head", "join_method": "sew_flat_to_bottom_of_head or sew_side_to_body or worked_as_extension or no_join"
    }
  ],
  "assembly_order": ["list component ids in order"],
  "assembly_notes": "Specific assembly instructions"
}

CRITICAL RULES: Identify EVERY distinct visible part. Use real part names for role (hat, head, beard, body, arm, leg, ear, tail, nose, eye, base). size_ratio_to_dominant: body=1.0, head=0.7-0.9, arm=0.3, nose=0.08-0.15. Be specific with stitch counts.`;

async function handleSnap(req, res, key) {
  const image = String(req.body?.image || "");
  if (!image.startsWith("data:image/")) return res.status(400).json({ error: "image data URL required" });
  const mimeType = image.slice(5, image.indexOf(";")) || "image/jpeg";
  const data = image.slice(image.indexOf(",") + 1);
  if (!data || data.length > 9_000_000) return res.status(413).json({ error: "image too large" });
  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + key,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: SNAP_PROMPT }, { inline_data: { mime_type: mimeType, data } }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(110_000),
      }
    );
    if (!r.ok) {
      console.error("[snap] Gemini", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return res.status(502).json({ error: "Gemini API error: " + r.status });
    }
    const body = await r.json();
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) return res.status(502).json({ error: "Gemini returned no JSON" });
      parsed = JSON.parse(m[0]);
    }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("[snap] failed:", err?.message || err);
    return res.status(502).json({ error: "Snap failed: " + (err?.message || "unknown") });
  }
}

import sharp from "sharp";

// Global error catchers — log full details for any unhandled errors in this function
process.on("unhandledRejection", (reason) => {
  console.error("[STITCH-FULL-ERROR] Unhandled rejection:", reason);
  if (reason instanceof Error) console.error("[STITCH-FULL-ERROR] Stack:", reason.stack);
});
process.on("uncaughtException", (err) => {
  console.error("[STITCH-FULL-ERROR] Uncaught exception:", err);
  console.error("[STITCH-FULL-ERROR] Stack:", err.stack);
});

const PROMPT = `You are Bev, an expert crocheter helping identify what stitch is shown in a photo. A user likely saw this on social media and wants to make it themselves. Accuracy matters more than confidence.

You MUST follow this exact reasoning process. Do not skip steps. Do not reorder.

=== STEP 0: CONTENT CHECK (gate before anything else) ===

Before classifying, determine what kind of image this is. If the image is NOT a photo of crocheted fabric showing actual stitches, you MUST output the refusal response and stop.

Refuse with the structure below if ANY of these are true:
- The image shows a printed pattern page, PDF, book page, or written instructions (text-heavy, typeset, looks like a document)
- The image shows a crochet chart, graph, or symbol diagram (not actual yarn)
- The image shows a finished object from far away where individual stitches aren't visible
- The image shows something that isn't crochet at all (knitting, weaving, embroidery, random object)

If refusing, respond with ONLY this JSON:

{
  "not_stitch": true,
  "content_type": "printed_pattern" | "chart" | "too_far" | "not_crochet" | "other",
  "message": "One sentence explaining what you see and suggesting the next action (e.g. 'This looks like a printed pattern page — try importing it as a pattern instead.' or 'This looks like a knitting stitch, not crochet.')"
}

Only continue to Step 1 if the image clearly shows crocheted fabric with visible individual stitches.

=== STEP 1: OBSERVE (describe before you classify) ===

Before naming anything, describe what you literally see in the fabric. Write this into observation_notes. Include:
- Approximate stitch height vs. width (taller than wide? square? shorter than tall?)
- Shape of the tops of stitches (V-shape? tight loop? elongated?)
- Are there any horizontal dashes, gaps, or short horizontal lines visible between or above the V-shapes? (This is the single most important observation. Look carefully.)
- Is there a brick/offset pattern row to row, or do stitches stack directly?
- How many full rows are clearly visible in the photo?
- Any color changes, and do they reveal structure?

=== STEP 2: APPLY HARD REJECTION RULES ===

These are NOT guidelines. These are rules. You must apply them.

RULE A — THE CHEVRON TRAP:
A colorful blanket with peaks and valleys / zigzag / ripple pattern is MOST OFTEN linen stitch (also called moss, woven, or granite stitch) worked in a chevron arrangement — NOT double crochet chevron. The interlocking sc+ch+sc+ch structure creates V-shapes that LOOK tall but are actually short.

IF you see a multicolor zigzag/chevron blanket, THEN your default assumption must be "linen stitch in chevron arrangement." You may only classify it as double crochet chevron if you can affirmatively confirm BOTH: (1) no horizontal dashes/gaps between V's, AND (2) stitches are clearly taller than they are wide (roughly 2x height). State this explicitly in confidence_reasoning.

RULE B — HORIZONTAL DASHES = LINEN STITCH:
IF you observe any horizontal dashes, gaps, or short horizontal lines between stitches at the top of rows, THEN the stitch is almost certainly linen/moss/woven/granite stitch. These dashes are the chain-1 spaces. You cannot classify this as plain double crochet, single crochet, or half double crochet.

RULE C — HEIGHT SANITY CHECK:
IF the stitches are not meaningfully taller than they are wide, THEN it is NOT double crochet or treble crochet. Double crochet is roughly 2x the width of a single crochet in height. If stitches look square or brick-shaped, rule out dc and tr.

RULE D — CONFIDENCE CEILING ON CLOSE-UPS:
IF fewer than 2 full rows are clearly visible, OR the photo is too zoomed in to see stitch-to-stitch relationships, THEN confidence CANNOT be "High." Cap at "Medium" and note the limitation in confidence_reasoning.

=== STEP 3: CANDIDATE ELIMINATION ===

Before committing to an answer, list 2 or 3 plausible candidates in candidate_analysis. For each, write one sentence arguing AGAINST it based on your observations. The one you cannot argue against is your answer.

Example format:
"Candidate 1 — Double Crochet Chevron: Argued against because visible horizontal dashes between V-shapes indicate chain spaces, not plain dc.
Candidate 2 — Linen Stitch in Chevron: Cannot argue against; matches observed horizontal dashes and stitch height.
Committing to: Linen Stitch in Chevron arrangement."

=== STEP 4: CLASSIFY USING THREE DIMENSIONS ===

A crochet fabric has THREE independent properties. Do not conflate them.

1. STITCH TECHNIQUE — the individual stitch(es) used
   Examples: Single Crochet (sc), Half Double Crochet (hdc), Double Crochet (dc), Treble Crochet (tr), Linen/Moss/Woven Stitch, Granny Cluster, Bobble, Puff, Shell, V-Stitch, Cable, Cross Stitch, Front Post / Back Post variants

2. PATTERN ARRANGEMENT — how stitches are arranged across the fabric
   Examples: Solid/Plain, Chevron/Ripple, Stripes, Colorwork, Chart-based image, Mosaic, Tapestry

3. CONSTRUCTION METHOD — how the overall piece is built
   Examples: Worked in rows (flat), Worked in rounds, Granny Square, Hexagon motif, Join-as-you-go, C2C (corner-to-corner), Tunisian

Critical distinctions:
- "Chevron" is an ARRANGEMENT, never a stitch technique. A chevron can be made with sc, hdc, dc, linen stitch, or any base.
- "Granny Square" is a CONSTRUCTION METHOD, not a stitch. The stitch inside a granny square is typically dc clusters.
- "Ripple" is a synonym for chevron arrangement.

=== LINEN/MOSS STITCH VISUAL CUES (memorize these) ===

Linen stitch (aka moss, woven, granite stitch) creates:
- Short stitches, roughly square or shorter than tall (NOT elongated)
- Visible horizontal dashes between every V-shape (these are the ch-1 spaces)
- Brick-offset pattern — stitches in one row sit between stitches in the previous row
- When worked with color changes, colors appear to "weave" or alternate in tight bands
- In chevron arrangement: creates a wavy fabric with subtle peaks rather than sharp dc-chevron peaks

If you see these features, it is linen stitch. Not dc. Not sc alone. Linen stitch.

=== OUTPUT FORMAT ===

Respond with ONLY valid JSON. No markdown fences. No preamble. This exact shape:

{
  "observation_notes": "Step 1 observations in 2-4 sentences. Describe what you literally see before classifying.",
  "candidate_analysis": "Step 3 candidate elimination. 2-3 candidates with arguments against each, ending with your committed answer.",
  "stitch_technique": "The base stitch(es). E.g. 'Linen Stitch' or 'Double Crochet' or 'Single Crochet + Chain'",
  "pattern_arrangement": "How stitches are arranged. E.g. 'Chevron/Ripple' or 'Solid' or 'Stripes'. Use 'None' if not applicable.",
  "construction_method": "How the piece is built. E.g. 'Worked in rows' or 'Granny Square' or 'Worked in rounds'. Use 'Unknown' if not visible.",
  "primary_identifier": "The short human-readable name combining the above. E.g. 'Linen Stitch in Chevron arrangement' or 'Double Crochet Chevron' or 'Granny Square'",
  "stitch_name": "Mirror of primary_identifier for backward compatibility",
  "base_stitch": "Mirror of stitch_technique for backward compatibility",
  "also_known_as": ["Array of alternate names. For linen stitch include Moss Stitch, Woven Stitch, Granite Stitch. For chevron include Ripple Stitch, Zigzag Stitch, Wave Pattern."],
  "difficulty": "Beginner | Intermediate | Advanced",
  "confidence": "high | medium | low",
  "confidence_reasoning": "Cite specific observations from Step 1 that support the classification. Reference which rejection rules you applied. If confidence is capped by Rule D, say so explicitly.",
  "description": "2-3 sentence beginner-friendly explanation of how this fabric is made.",
  "common_uses": "1-2 sentence description of what this is typically used for."
}

Return ONLY the JSON object. No other text.`;

const NEEDS_CONVERSION = new Set([
  "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence",
  "image/avif", "image/tiff", "image/bmp", "image/x-ms-bmp",
]);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const _url = process.env.VITE_SUPABASE_URL;
  const _key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const _t0 = Date.now();

  // Snap & Stitch rides on this function; see handleSnap above.
  if (req.body?.mode === "snap") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: "API key not configured" });
    return handleSnap(req, res, key);
  }

  // ── STEP 1: Parse request body ──
  console.log("[STITCH-STEP-1] Parsing request body");
  let imageUrl;
  try {
    const body = req.body || {};
    imageUrl = body.imageUrl;
    console.log("[STITCH-STEP-1] imageUrl:", imageUrl ? imageUrl.substring(0, 120) + "..." : "MISSING");
    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
  } catch (err) {
    console.error("[STITCH-STEP-1] FAILED — body parse error:", err);
    console.error("[STITCH-STEP-1] Stack:", err.stack);
    return res.status(200).json({ error: true, message: "Invalid request. Please try again." });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    console.error("[STITCH-STEP-1] GEMINI_API_KEY not configured");
    return res.status(500).json({ error: "API key not configured" });
  }

  // ── STEP 2: Fetch image from storage URL ──
  console.log("[STITCH-STEP-2] Fetching image from:", imageUrl);
  let imgBuffer, mimeType, fileName;
  try {
    const imgRes = await fetch(imageUrl);
    console.log("[STITCH-STEP-2] Fetch response — status:", imgRes.status, "content-type:", imgRes.headers.get("content-type"), "content-length:", imgRes.headers.get("content-length"));

    if (!imgRes.ok) {
      let respBody = "";
      try { respBody = await imgRes.text(); } catch {}
      console.error("[STITCH-STEP-2] FAILED — non-ok status:", imgRes.status, "body:", respBody.substring(0, 500));
      return res.status(200).json({ error: true, message: "Could not load the uploaded image. Please try again." });
    }

    imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    mimeType = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    fileName = "unknown";
    try { fileName = new URL(imageUrl).pathname.split("/").pop() || "unknown"; } catch {}

    console.log("[STITCH-STEP-2] Success — file:", fileName, "size:", imgBuffer.byteLength, "bytes, mime:", mimeType, "buffer valid:", Buffer.isBuffer(imgBuffer));
  } catch (err) {
    console.error("[STITCH-STEP-2] FAILED — exception during image fetch:", err);
    console.error("[STITCH-STEP-2] Stack:", err.stack);
    return res.status(200).json({ error: true, message: "Could not load the uploaded image. Please try again." });
  }

  // ── STEP 3: Sharp conversion/resize ──
  console.log("[STITCH-STEP-3] Processing image — mime:", mimeType, "size:", imgBuffer.byteLength, "needs conversion:", NEEDS_CONVERSION.has(mimeType) || !mimeType.startsWith("image/"));
  try {
    // Normalize non-standard MIME types to JPEG
    if (NEEDS_CONVERSION.has(mimeType) || !mimeType.startsWith("image/")) {
      console.log("[STITCH-STEP-3] Converting", mimeType, "to JPEG via sharp");
      imgBuffer = await sharp(imgBuffer).jpeg({ quality: 85 }).toBuffer();
      mimeType = "image/jpeg";
      console.log("[STITCH-STEP-3] Converted — new size:", imgBuffer.byteLength, "bytes");
    }

    // Resize if over 4MB
    if (imgBuffer.byteLength > 4 * 1024 * 1024) {
      console.log("[STITCH-STEP-3] Resizing — image is", imgBuffer.byteLength, "bytes (over 4MB)");
      imgBuffer = await sharp(imgBuffer)
        .resize({ width: 1500, height: 1500, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      mimeType = "image/jpeg";
      console.log("[STITCH-STEP-3] Resized — new size:", imgBuffer.byteLength, "bytes");
    }

    console.log("[STITCH-STEP-3] Success — final size:", imgBuffer.byteLength, "bytes, mime:", mimeType);
  } catch (err) {
    console.error("[STITCH-STEP-3] FAILED — sharp processing error:", err);
    console.error("[STITCH-STEP-3] Stack:", err.stack);
    return res.status(200).json({ error: true, message: "Could not process this image. Try taking a screenshot and uploading that instead." });
  }

  // Helper: parse raw text into stitch result
  const parseStitchText = (text, tag) => {
    if (!text) return null;
    let toParse = text.trim();
    toParse = toParse.replace(/^```[\w]*\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    if (!toParse.startsWith("{")) {
      const match = toParse.match(/\{[\s\S]*\}/);
      toParse = match ? match[0] : toParse;
    }
    toParse = toParse.replace(/,\s*([\]}])/g, "$1").trim();
    try {
      return JSON.parse(toParse);
    } catch (parseErr) {
      console.error(`[${tag}] JSON.parse failed, attempting regex extraction. Raw text:`, toParse.substring(0, 500));
      const nameMatch = toParse.match(/"stitch_name"\s*:\s*"([^"]+)"/);
      const diffMatch = toParse.match(/"difficulty"\s*:\s*"([^"]+)"/);
      const descMatch = toParse.match(/"description"\s*:\s*"([^"]+)"/);
      const confMatch = toParse.match(/"confidence"\s*:\s*"([^"]+)"/);
      const usesMatch = toParse.match(/"common_uses"\s*:\s*"([^"]+)"/);
      const tutMatch  = toParse.match(/"tutorial_search"\s*:\s*"([^"]+)"/);
      if (nameMatch) {
        console.log(`[${tag}] Regex extraction succeeded — stitch_name:`, nameMatch[1]);
        return {
          stitch_name: nameMatch[1],
          difficulty: diffMatch?.[1] || "Intermediate",
          description: descMatch?.[1] || "",
          confidence: confMatch?.[1] || "low",
          common_uses: usesMatch?.[1] || "",
          tutorial_search: tutMatch?.[1] || nameMatch[1] + " crochet stitch tutorial",
          also_known_as: [],
          not_crochet: false,
        };
      }
      console.error(`[${tag}] Regex extraction also failed.`);
      return null;
    }
  };

  // ── STEP 4: Call Claude Haiku (primary) ──
  const imgBase64 = imgBuffer.toString("base64");
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  let result;

  if (ANTHROPIC_KEY) {
    console.log("[STITCH-STEP-4] Calling Haiku (primary) — base64 length:", imgBase64.length, "mime:", mimeType);
    try {
      const haikuRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: imgBase64 } },
            { type: "text", text: PROMPT },
          ] }],
        }),
      });
      console.log("[STITCH-STEP-4] Haiku response status:", haikuRes.status);
      if (haikuRes.ok) {
        const haikuData = await haikuRes.json();
        const haikuText = haikuData.content?.[0]?.text || "";
        console.log("[STITCH-STEP-4] Haiku text:", haikuText.substring(0, 500));
        if (haikuText) {
          result = parseStitchText(haikuText, "STITCH-STEP-4");
        } else {
          console.error("[STITCH-STEP-4] Empty response from Haiku — will try Gemini fallback");
        }
      } else {
        let haikuErr = "";
        try { haikuErr = await haikuRes.text(); } catch {}
        console.error("[STITCH-STEP-4] Haiku non-ok — status:", haikuRes.status, "body:", haikuErr.substring(0, 500));
        console.log("[STITCH-STEP-4] Haiku failed — trying Gemini fallback");
      }
    } catch (haikuErr) {
      console.error("[STITCH-STEP-4] FAILED — Haiku network error:", haikuErr.message);
      console.error("[STITCH-STEP-4] Stack:", haikuErr.stack);
    }
  } else {
    console.error("[STITCH-STEP-4] ANTHROPIC_API_KEY not configured — skipping Haiku primary, going straight to Gemini");
  }

  // ── STEP 4b: Gemini fallback if Haiku failed or returned no result ──
  if (!result) {
    console.log("[STITCH-STEP-4-GEMINI] Calling Gemini fallback — base64 length:", imgBase64.length, "mime:", mimeType);
    let geminiRes;
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: mimeType, data: imgBase64 } },
              { text: PROMPT },
            ] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      );
      console.log("[STITCH-STEP-4-GEMINI] Gemini response — status:", geminiRes.status);
    } catch (err) {
      console.error("[STITCH-STEP-4-GEMINI] FAILED — Gemini network error:", err);
      console.error("[STITCH-STEP-4-GEMINI] Network error:", err.message);
      console.error("[STITCH-STEP-4-GEMINI] Stack:", err.stack);
      geminiRes = null;
    }

    if (!geminiRes || !geminiRes.ok) {
      if (geminiRes) {
        let errBody = "";
        try { errBody = await geminiRes.text(); } catch {}
        console.error("[STITCH-STEP-4-GEMINI] Gemini non-ok — status:", geminiRes.status, "body:", errBody.substring(0, 500));
      }
      return res.status(200).json({ error: true, message: "Stitch identification failed. Please try again with a different photo." });
    }

    console.log("[STITCH-STEP-5] Parsing Gemini response");
    try {
      const data = await geminiRes.json();
      const finishReason = data.candidates?.[0]?.finishReason;
      const parts = data.candidates?.[0]?.content?.parts || [];
      console.log("[STITCH-STEP-5] Parts count:", parts.length, "finish reason:", finishReason);
      let text = "";
      for (const part of parts) {
        const t = part.text || "";
        console.log("[STITCH-STEP-5] Part type:", part.thought ? "thinking" : "output", "length:", t.length, "preview:", t.substring(0, 100));
        if (!part.thought && t.trim().length > 0) { text = t; break; }
      }
      if (!text && parts.length > 0) text = parts[parts.length - 1]?.text || "";
      console.log("[STITCH-STEP-5] Selected text:", text.substring(0, 500));

      if (!text) {
        console.error("[STITCH-STEP-5] Empty text — finishReason:", finishReason, "full response:", JSON.stringify(data).substring(0, 500));
      } else {
        result = parseStitchText(text, "STITCH-STEP-5");
      }
    } catch (err) {
      console.error("[STITCH-STEP-5] FAILED — parse error:", err);
      console.error("[STITCH-STEP-5] Stack:", err.stack);
    }
  }

  if (!result) {
    return res.status(200).json({ error: true, message: "Could not interpret the stitch analysis. Please try a clearer photo." });
  }
  console.log("[STITCH-STEP-5] Success — identified:", result.stitch_name, "confidence:", result.confidence);

  // inline log — direct, no utility dependency
  if (_url && _key) {
    await fetch(`${_url}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': _key,
        'Authorization': `Bearer ${_key}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `POST /api/stitch-vision → 200 (${Date.now() - _t0}ms)`,
        source: 'serverless',
        request_path: '/api/stitch-vision',
        request_method: 'POST',
        status_code: 200,
        project_id: 'wovely'
      })
    }).catch(() => {});
  }

  return res.status(200).json(result);
}

