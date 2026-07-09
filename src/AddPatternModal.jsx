import { useState, useRef, useEffect } from "react";
import { T, useBreakpoint, Field } from "./theme.jsx";
import { PILL } from "./constants.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseAuth, getSession } from "./supabase.js";
import { CHECK_ICON, extractFirstRowNumber } from "./StitchCheck.jsx";
import BevGauge, { deriveState, sentenceCase, checkTier } from "./components/BevGauge.jsx";
import ScanGauge, { ProcSteps } from "./components/ScanGauge.jsx";
import { setActiveImportJob } from "./components/ImportPill.jsx";
import { useImportJobPolling } from "./hooks/useImportJobPolling.js";
import { PHASE_COPY_POOLS, REASSURANCE_LINE, pickPhaseCopy } from "./utils/importPhaseCopy.js";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// Strip authoring-tool file extensions left on extracted titles (e.g. ".cdr"
// from CorelDraw exports). Mirrors sanitizeTitle in api/extract-pattern.js;
// duplicated here so the client bundle doesn't pull from api/.
const sanitizeTitle = (raw) => typeof raw === 'string'
  ? raw.replace(/\.(cdr|pdf|docx|doc|ai|psd|jpg|jpeg|png)$/i, '').trim()
  : raw;

// ─── CATEGORY IMAGES (for cover picker in PDF review) ─────────────────────
const CAT_IMG = {
  "Amigurumi":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405272/duiwkpuwzctq42zjox9x.png",
  "Blankets":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405430/u1evbmu4nccpiyg8fc7a.png",
  "Wearables":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405433/yrcitmgukrik0owg1typ.png",
  "Accessories":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405436/uq692cchkcsjowpgu2le.png",
  "Home Décor":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405438/moqrjnlupspgoxt9v4wb.png",
  "Uncategorized":"https://res.cloudinary.com/dmaupzhcx/image/upload/v1774405441/ggzvsrbeeetyiabs55sn.png",
};
const ALL_CAT_ENTRIES = Object.entries(CAT_IMG);

const uploadPatternFile = async (file, onProgress) => {
  const isPdf=file.type==="application/pdf"||file.name?.toLowerCase().endsWith(".pdf");
  if(onProgress) onProgress("uploading");
  try {
    if(isPdf){
      // PDFs → Supabase Storage (public bucket, no ACL issues)
      const session=getSession();
      const user=supabaseAuth.getUser();
      if(!session?.access_token||!user) throw new Error("Not authenticated");
      const filePath=`${user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const res=await fetch(`${SUPABASE_URL}/storage/v1/object/pattern-files/${filePath}`,{
        method:"POST",
        headers:{"Authorization":`Bearer ${session.access_token}`,"Content-Type":file.type},
        body:file,
      });
      if(!res.ok) throw new Error("Supabase upload failed: "+res.status);
      const publicUrl=`${SUPABASE_URL}/storage/v1/object/public/pattern-files/${filePath}`;
      if(onProgress) onProgress("done");
      return { url: publicUrl, filename: file.name, type: file.type };
    } else {
      // Images → Cloudinary (transformations, CDN)
      const formData=new FormData();
      formData.append("file",file);
      formData.append("upload_preset","yarnhive_patterns");
      const res=await fetch("https://api.cloudinary.com/v1_1/dmaupzhcx/auto/upload",{method:"POST",body:formData});
      if(!res.ok) throw new Error("Upload failed: "+res.status);
      const data=await res.json();
      if(onProgress) onProgress("done");
      return { url: data.secure_url, filename: data.original_filename+"."+(data.format||"jpg"), type: file.type };
    }
  } catch (e) {
    if(onProgress) onProgress("error");
    console.error("[Wovely] File upload error:", e);
    return null;
  }
};

// Extract pattern data from PDF/image using Gemini
// Convert File to base64 (used for images only, not PDFs)
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(",")[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// Extract text + embedded metadata title from PDF using pdf.js. The metadata
// title (pdf.getMetadata().info.Title) is a free fallback when the model
// returns an empty title — common on chunked PDFs whose title page is
// image-only. Returned as { text, metadataTitle } so the caller can forward
// metadataTitle through /api/import-job without re-parsing the file.
// Exported (S83): the starter pick in App.jsx runs this same extraction on
// the starter PDF so its import-job body is identical to a user upload's.
export const extractTextFromPDF = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = res; script.onerror = rej;
            document.head.appendChild(script);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;
        console.log("[Wovely] PDF loaded, pages:", pdf.numPages);
        let metadataTitle = null;
        try {
          const meta = await pdf.getMetadata();
          const raw = meta?.info?.Title;
          if (raw && typeof raw === "string") {
            const trimmed = raw.trim();
            if (trimmed && trimmed.toLowerCase() !== "untitled") metadataTitle = trimmed;
          }
        } catch (metaErr) {
          // getMetadata is best-effort; the rest of extraction is still useful.
          console.warn("[Wovely] pdf.getMetadata failed:", metaErr?.message);
        }
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(" ");
          fullText += `\n--- PAGE ${i} ---\n${pageText}`;
        }
        console.log("[Wovely] PDF text extracted, chars:", fullText.length, "metaTitle:", metadataTitle || "(none)");
        resolve({ text: fullText, metadataTitle });
      } catch (err) {
        console.error("[Wovely] pdf.js text extraction failed:", err);
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Render page 1 of PDF to canvas — local cover image, no Cloudinary plan required
const renderPDFCoverImage = async (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = res; script.onerror = rej;
            document.head.appendChild(script);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        console.log("[Wovely] PDF page 1 rendered for cover, size:", dataUrl.length);
        resolve(dataUrl);
      } catch (err) {
        console.warn("[Wovely] PDF cover render failed:", err);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file);
  });
};

const extractPatternFromPDF = async (textOrBase64, filename, mimeType, isTextMode) => {
  console.log("[Wovely] Gemini extraction starting, mode:", isTextMode ? "text" : "base64", "mime:", mimeType);
  if (!GEMINI_API_KEY) { console.error("[Wovely] No Gemini API key"); throw new Error("Gemini API key not configured"); }

  const prompt = `You are a crochet pattern extraction specialist. You will analyze this pattern using a strict 4-step process. Return ONLY valid JSON with no markdown, no backticks, no explanation.

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

NEVER SKIP ROUNDS: Even if consecutive rounds have identical instructions, each must be its own entry. A round that says "sc in each st around (40)" repeated 8 times means 8 separate row entries.

═══ STEP 4 — CONFIDENCE ═══
After extraction, assess quality:
• If fewer than 3 rounds/rows were extracted OR title is missing, set "confidence": "low"
• If all major sections were found and 10+ rounds extracted, set "confidence": "high"
• Otherwise set "confidence": "medium"

═══ OUTPUT FORMAT ═══
Return this exact JSON structure:
{"title":"string","designer":"string","source_url":null,"finished_size":"string","difficulty":"Beginner or Intermediate or Advanced","yarn_weight":"string","hook_size":"string","gauge":"string or null","confidence":"low or medium or high","materials":[{"name":"string","amount":"string","notes":"string"}],"abbreviations":[{"abbr":"string","meaning":"string"}],"abbreviations_map":{"mr":"magic ring","sc":"single crochet"},"suggested_resources":[{"label":"string","url":"string"}],"pattern_notes":"string","components":[{"name":"string","make_count":1,"independent":false,"rows":[{"id":"rnd-1","label":"RND 1","text":"full instruction text with all references resolved","stitch_count":null,"action_item":false,"repeat_brackets":[{"sequence":"string","count":2}]}]}],"assembly_notes":"string","image_description":"string"}

COMPONENT RULES:
• For components like 'FLIPPER (MAKE 2)', set make_count: 2. Default 1 if not specified.
• Set independent: true ONLY when the pattern explicitly says a component can be made separately — e.g. "make 2 separately", "work independently". Default false.
• After all construction components, extract assembly/finishing as a final component named 'ASSEMBLY & FINISHING' with label: 'STEP' and action_item: true for all rows.

PATTERN NOTES: Extract as a single string containing all special technique notes, tension guidance, construction tips, size variations, and open-ended repeat instructions.

SUGGESTED RESOURCES: Extract {label, url} objects from any "Tutorials", "Resources", or hyperlink sections. Default to [] if none found.

Be thorough — extract every component, every round, every material. Ensure the JSON is complete and valid. Do not truncate.`;

  // Text mode: send extracted text directly (PDFs) — tiny payload, fast, reliable
  // Base64 mode: send raw file data (images like jpg/png)
  const parts = isTextMode
    ? [{ text: prompt + "\n\nPATTERN TEXT:\n" + textOrBase64 }]
    : [{ text: prompt }, { inline_data: { mime_type: mimeType || "image/jpeg", data: textOrBase64 } }];

  const body = {
    contents: [{ parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
  };

  const geminiCall = async (model, requestBody) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return r;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  const parseGeminiResponse = async (r) => {
    const rawText = await r.text();
    console.log("[Wovely] Gemini raw response body:", rawText.substring(0, 500));
    if (!r.ok) throw new Error("Gemini API error: " + r.status);
    const data = JSON.parse(rawText);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  };

  // Attempt 1: full structured prompt
  console.log("[Wovely] Sending Gemini request, parts:", body.contents[0].parts.length, "model: gemini-1.5-flash");
  try {
    const res = await geminiCall("gemini-1.5-flash", body);
    const parsed = await parseGeminiResponse(res);
    console.log("[Wovely] Extraction successful:", parsed.title, "—", (parsed.components||[]).length, "components");
    return parsed;
  } catch (e) {
    console.error("[Wovely] Gemini first attempt failed:", e.name === "AbortError" ? "timeout (45s)" : e.message);
  }

  // Attempt 2: simplified prompt — flat rows, no components, faster response
  console.log("[Wovely] Retrying with simplified prompt...");
  const simplePrompt = `Extract this crochet pattern. Return ONLY valid JSON, no markdown, no backticks.
{"title":"string","hook_size":"string","yarn_weight":"string","difficulty":"string","designer":"string","materials":[{"name":"string","amount":"string"}],"components":[{"name":"Main","make_count":1,"independent":false,"rows":[{"id":"row-1","label":"ROW 1","text":"instruction text","stitch_count":null,"action_item":false,"repeat_brackets":[]}]}],"pattern_notes":"string","assembly_notes":"string","confidence":"low"}
Extract every row/round as its own entry. Keep instruction text exactly as written. Do not truncate.`;
  const simpleParts = isTextMode
    ? [{ text: simplePrompt + "\n\nPATTERN TEXT:\n" + textOrBase64 }]
    : [{ text: simplePrompt }, { inline_data: { mime_type: mimeType || "image/jpeg", data: textOrBase64 } }];
  const simpleBody = {
    contents: [{ parts: simpleParts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 32768 }
  };
  try {
    const res2 = await geminiCall("gemini-1.5-flash", simpleBody);
    const parsed2 = await parseGeminiResponse(res2);
    console.log("[Wovely] Simplified extraction successful:", parsed2.title);
    return parsed2;
  } catch (e2) {
    console.error("[Wovely] Simplified retry also failed:", e2.name === "AbortError" ? "timeout (45s)" : e2.message);
    throw new Error("Pattern extraction failed after 2 attempts");
  }
};

// Build rows array from extracted components
const buildRowsFromComponents = (components) => {
  const rows = [];
  let rowId = 1;
  (components || []).forEach(comp => {
    const makeCount = comp.make_count || 1;
    const label = comp.name + (makeCount > 1 ? ` (MAKE ${makeCount})` : "");
    rows.push({ id: "header-" + (comp.name || rowId).toLowerCase().replace(/\s+/g, "-"), text: "── " + label.toUpperCase() + " ──", isHeader: true, done: false, note: "", componentName: comp.name, makeCount, independent: !!comp.independent, body: comp.body || null });
    (comp.rows || []).forEach(r => {
      const isAction = !!r.action_item;
      const prefix = isAction ? "📌 " : "";
      const labelText = r.label ? r.label + ": " : "";
      const stitchSuffix = r.stitch_count ? " (" + r.stitch_count + ")" : "";
      rows.push({ id: "row-" + rowId++, text: prefix + labelText + r.text + stitchSuffix, done: false, note: r.note || "", isAction, componentName: comp.name, repeat_brackets: r.repeat_brackets || [] });
    });
  });
  return rows;
};
const GEMINI_PROMPT = `You are an expert crochet pattern designer with deep knowledge of amigurumi, garment construction, blankets, and all crochet techniques. Analyze this photograph of a finished crochet object.

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

const callGeminiVision = async (base64Image) => {
  const mediaType=base64Image.split(";")[0].split(":")[1]||"image/jpeg";
  const imageData=base64Image.split(",")[1];
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key="+GEMINI_API_KEY,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({contents:[{parts:[{text:GEMINI_PROMPT},{inline_data:{mime_type:mediaType,data:imageData}}]}],generationConfig:{temperature:0.1,maxOutputTokens:8192}})
  });
  if(!response.ok) throw new Error("Gemini API error: "+response.status);
  const data=await response.json();
  const text=data.candidates?.[0]?.content?.parts?.[0]?.text||"";
  return JSON.parse(text.replace(/```json|```/g,"").trim());
};

const calculateConfidence = (analysis) => {
  if(!analysis?.components) return 30;
  const comps=analysis.components;
  const avgConf=comps.reduce((s,c)=>s+(c.confidence||50),0)/comps.length;
  let score=avgConf;
  comps.forEach(c=>{
    if(c.primitive_type==="unknown") score-=8;
    if(c.role==="unknown"||c.role==="detail") score-=5;
    if(c.confidence<60) score-=5;
    if(c.construction?.increase_to>0) score+=3;
  });
  if(analysis.object_category==="unknown") score-=10;
  if(!analysis.object_name||analysis.object_name==="unknown") score-=5;
  return Math.min(97,Math.max(30,Math.round(score)));
};

const confidenceLabel = (score) => {
  if(score>=90) return{text:"Strong match — we're confident in this pattern",color:T.sage,emoji:"✅"};
  if(score>=75) return{text:"Good match — review highlighted components",color:T.terra,emoji:"🎯"};
  if(score>=60) return{text:"Partial match — a few pieces need your input",color:T.gold,emoji:"⚠️"};
  return{text:"Rough estimate — use this as a starting point and adjust",color:T.ink3,emoji:"🔍"};
};

const buildComponentRows = (comp,rowIdStart) => {
  const rows=[]; let id=rowIdStart;
  const c=comp.construction||{}, label=comp.label||comp.role||"Part", color=comp.color?" — "+comp.color+" yarn":"";
  const technique=c.technique||"worked_in_the_round", stitch=c.stitch||"single_crochet";
  const stitchAbbr=stitch==="single_crochet"?"sc":stitch==="half_double_crochet"?"hdc":stitch==="double_crochet"?"dc":"sc";
  const incTo=c.increase_to||24, evenRnds=c.even_rounds||6, decFrom=c.decrease_from||incTo, finalSts=c.final_sts||6, stuffed=c.stuffed!==false;
  rows.push({id:id++,text:"━━━ "+label.toUpperCase()+color+" ━━━",done:false,note:c.notes||""});
  if(technique==="worked_in_the_round"){
    if(c.start==="chain_ring") rows.push({id:id++,text:"Ch 4, sl st to form ring. Rnd 1: 6 "+stitchAbbr+" in ring. (6)",done:false,note:""});
    else rows.push({id:id++,text:"Magic ring, 6 "+stitchAbbr+". (6)",done:false,note:""});
    const startSts=6, incRoundsNeeded=Math.ceil((incTo-startSts)/6);
    if(incRoundsNeeded>=1) rows.push({id:id++,text:"Rnd 2: 2 "+stitchAbbr+" in each st. ("+(startSts*2)+")",done:false,note:""});
    if(incRoundsNeeded>=2){
      let prev=startSts*2;
      for(let r=2;r<=incRoundsNeeded&&prev<incTo;r++){
        const next=Math.min(prev+6,incTo), evenStr=(r-1)===1?"sc":(r-1)+" sc";
        rows.push({id:id++,text:`Rnd ${r+1}: [${evenStr}, 2 sc in next] x6. (${next})`,done:false,note:""}); prev=next;
      }
    }
    if(evenRnds>0) rows.push({id:id++,text:"Rnds "+(incRoundsNeeded+2)+"–"+(incRoundsNeeded+1+evenRnds)+": "+stitchAbbr+" in each st around. ("+incTo+")",done:false,note:""});
    if(stuffed&&decFrom>12) rows.push({id:id++,text:"Stuff "+label.toLowerCase()+" firmly before closing.",done:false,note:""});
    if(decFrom>finalSts){
      let cur=decFrom;
      for(let r=0;r<Math.ceil((decFrom-finalSts)/6)&&cur>finalSts;r++){
        const next=Math.max(cur-6,finalSts);
        if(next<=6) rows.push({id:id++,text:"Final dec: [sc2tog] x"+(cur/2)+". ("+next+") — fasten off, leave tail.",done:false,note:""});
        else rows.push({id:id++,text:"Dec rnd "+(r+1)+": ["+(cur/6-1)+" sc, sc2tog] x6. ("+next+")",done:false,note:""});
        cur=next;
      }
    } else rows.push({id:id++,text:"Fasten off, leave long tail for sewing.",done:false,note:""});
  } else if(technique==="worked_flat"){
    const chainLen=c.chain_length||incTo||20, rowCount=c.row_count||evenRnds||10;
    rows.push({id:id++,text:"Foundation: Ch "+chainLen+".",done:false,note:""});
    rows.push({id:id++,text:"Row 1: "+stitchAbbr.toUpperCase()+" in 2nd ch from hook and across. ("+(chainLen-1)+" sts)",done:false,note:""});
    rows.push({id:id++,text:"Rows 2–"+rowCount+": Ch 1, turn, "+stitchAbbr+" across. ("+(chainLen-1)+" sts)",done:false,note:""});
    rows.push({id:id++,text:"Fasten off, weave in ends.",done:false,note:""});
  }
  return{rows,nextId:id};
};

const buildStarterPattern = (analysis) => {
  if(!analysis?.components?.length) return {title:"Snap & Stitch — Review Needed",hook:"5.0mm",weight:"Worsted",yardage:200,notes:"Pattern needs more information. Try a clearer photo.",materials:[{id:1,name:"Worsted weight yarn",amount:"~200 yds",yardage:200},{id:2,name:"5.0mm crochet hook",amount:"1"}],rows:[{id:1,text:"Retake photo with better lighting for best results.",done:false,note:""}]};
  const components=analysis.components, isAmigurumi=analysis.object_category==="amigurumi";
  const objectName=analysis.object_name||analysis.object_category||"Crochet Object";
  const colorInfo=analysis.color_structure?.primary_color||"your chosen color";
  const colorCount=analysis.color_structure?.color_count||1;
  const assemblyOrder=analysis.assembly_order?.length?analysis.assembly_order:components.map(c=>c.id||c.role);
  const ordered=assemblyOrder.map(id=>components.find(c=>(c.id||c.role)===id)).filter(Boolean).concat(components.filter(c=>!assemblyOrder.includes(c.id||c.role)));
  const allRows=[]; let rowId=1;
  ordered.forEach(comp=>{ if(!comp) return; const result=buildComponentRows(comp,rowId); allRows.push(...result.rows); rowId=result.nextId; });
  allRows.push({id:rowId++,text:"━━━ ASSEMBLY ━━━",done:false,note:""});
  if(analysis.assembly_notes){ analysis.assembly_notes.split(/[.!]/).filter(s=>s.trim().length>10).forEach(step=>allRows.push({id:rowId++,text:step.trim()+".",done:false,note:""})); }
  else { ordered.forEach(comp=>{ if(comp.join_to&&comp.join_method) allRows.push({id:rowId++,text:(comp.label||comp.role)+": "+comp.join_method.replace(/_/g," ")+" to "+comp.join_to+".",done:false,note:""}); }); if(isAmigurumi) allRows.push({id:rowId++,text:"Sew all pieces firmly. Weave in all ends. Add safety eyes if not already attached.",done:false,note:""}); }
  const totalYards=components.reduce((sum,c)=>{ const i=c.construction?.increase_to||24, e=c.construction?.even_rounds||6; return sum+Math.round(i*(e+i/6)*0.025); },0);
  const colorMap={}; components.forEach(c=>{ const col=c.color||colorInfo; if(!colorMap[col]) colorMap[col]=0; colorMap[col]+=Math.round((c.construction?.increase_to||24)*((c.construction?.even_rounds||6)+4)*0.025); });
  const yarnMaterials=Object.entries(colorMap).map(([color,yds],i)=>({id:i+1,name:"Worsted yarn — "+color,amount:"~"+Math.max(20,yds)+" yds",yardage:Math.max(20,yds)}));
  const materials=[...yarnMaterials,{id:yarnMaterials.length+1,name:"5.0mm crochet hook",amount:"1"},{id:yarnMaterials.length+2,name:"Yarn needle",amount:"1"},...(isAmigurumi?[{id:yarnMaterials.length+3,name:"Safety eyes (9mm)",amount:"2"},{id:yarnMaterials.length+4,name:"Polyfill stuffing",amount:"small bag"}]:[])];
  return {title:"Snap & Stitch — "+objectName.charAt(0).toUpperCase()+objectName.slice(1),hook:"5.0mm",weight:"Worsted",yardage:Math.max(150,totalYards),notes:["Scanned from photo of a "+objectName+".",colorCount>1?colorCount+" colors: "+(analysis.color_structure?.accent_colors||[]).concat([colorInfo]).join(", ")+".":"Primary color: "+colorInfo+".","Stitch counts estimated from photo proportions — adjust to match your gauge.",components.length+" components identified."].join(" "),materials,rows:allRows};
};

const useSnapProgress = (active) => {
  const [progress,setProgress]=useState(0),[phase,setPhase]=useState("");
  const intervalRef=useRef(null),stageRef=useRef(0);
  const PHASES=[{label:"Preparing image…",target:20},{label:"Sending to Snap & Stitch…",target:35},{label:"Identifying components…",target:70},{label:"Calculating stitch math…",target:88},{label:"Assembling pattern…",target:96}];
  useEffect(()=>{
    if(!active){clearInterval(intervalRef.current);return;}
    stageRef.current=0; setProgress(0); setPhase(PHASES[0].label);
    const tick=()=>setProgress(prev=>{
      const stage=stageRef.current; if(stage>=PHASES.length) return prev;
      const target=PHASES[stage].target;
      if(prev>=target){stageRef.current=Math.min(stage+1,PHASES.length-1); if(stageRef.current<PHASES.length) setPhase(PHASES[stageRef.current].label); return prev;}
      return Math.min(prev+0.8,target);
    });
    intervalRef.current=setInterval(tick,80);
    return ()=>clearInterval(intervalRef.current);
  },[active]);
  const complete=()=>{clearInterval(intervalRef.current);setPhase("Pattern ready!");setProgress(100);};
  return{progress,phase,complete};
};

const HiveVisionForm = ({onSave,Btn,Bar,WireframeViewer}) => {
  const [file,setFile]=useState(null),[imgSrc,setImgSrc]=useState(null),[loading,setLoading]=useState(false);
  const [analysis,setAnalysis]=useState(null),[confidence,setConfidence]=useState(null),[preview,setPreview]=useState(null);
  const [error,setError]=useState(null),[wireframeMode,setWireframeMode]=useState("labeled"),[lightbox,setLightbox]=useState(null);
  const{progress,phase,complete}=useSnapProgress(loading);
  const handleFile=async(e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    setFile(f);setError(null);setAnalysis(null);setPreview(null);
    const reader=new FileReader();
    reader.onload=async(ev)=>{
      const src=ev.target.result; setImgSrc(src); setLoading(true);
      try{
        const result=await callGeminiVision(src);
        const conf=calculateConfidence(result), pattern=buildStarterPattern(result);
        complete(); await new Promise(r=>setTimeout(r,400));
        setAnalysis(result);setConfidence(conf);setPreview(pattern);
      }catch(err){setError("Couldn't read the photo clearly. Try better lighting or a closer shot.");console.error(err);}
      finally{setLoading(false);}
    };
    reader.readAsDataURL(f);
  };
  const reset=()=>{setFile(null);setImgSrc(null);setAnalysis(null);setPreview(null);setError(null);setConfidence(null);};
  const confInfo=confidence?confidenceLabel(confidence):null;
  return (
    <div style={{paddingBottom:8}}>
      {lightbox&&(
        <div style={{position:"fixed",inset:0,zIndex:999,background:"rgba(0,0,0,.92)",display:"flex",flexDirection:"column"}} onClick={()=>setLightbox(null)}>
          <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
            <div style={{fontSize:13,color:"rgba(255,255,255,.7)",fontWeight:500}}>{lightbox==="photo"?(analysis?.object_name||"Source Photo"):"3D Component Map"}</div>
            <button onClick={()=>setLightbox(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:99,width:32,height:32,color:"#fff",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px 32px"}} onClick={e=>e.stopPropagation()}>
            {lightbox==="photo"?<img src={imgSrc} alt="source" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:12}}/>
              :<div style={{width:"100%",maxWidth:600,height:"70vh"}}><WireframeViewer components={analysis?.components} labeled={wireframeMode==="labeled"} height={window.innerHeight*0.65}/></div>}
          </div>
          {lightbox==="wireframe"&&<div style={{textAlign:"center",paddingBottom:24,fontSize:12,color:"rgba(255,255,255,.5)"}}>⟳ drag to rotate · scroll/pinch to zoom</div>}
        </div>
      )}
      <div style={{background:`linear-gradient(135deg,${T.terraLt},#FFF8F5)`,borderRadius:12,padding:"12px 14px",marginBottom:14,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:12,color:T.terra,fontWeight:600,marginBottom:3}}>✨ Snap & Stitch — 3 free scans/month</div>
        <div style={{fontSize:12,color:T.ink2,lineHeight:1.6}}>Photograph any finished crochet object. We identify the components and build a starter pattern to recreate it.</div>
      </div>
      {!file&&(
        <label style={{display:"block",cursor:"pointer"}}>
          <div style={{border:`2px dashed ${T.border}`,borderRadius:16,padding:"36px 20px",textAlign:"center",background:T.linen}}>
            <div style={{fontSize:44,marginBottom:10}}>📸</div>
            <div style={{fontFamily:T.serif,fontSize:17,color:T.ink,marginBottom:6}}>Point, Click, Stitch!</div>
            <div style={{fontSize:13,color:T.ink3,marginBottom:14}}>Take a photo or choose from your library</div>
            <div style={{background:T.terra,color:"#fff",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:600,display:"inline-block"}}>Take Photo or Choose from Library</div>
          </div>
          <input type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
        </label>
      )}
      {imgSrc&&loading&&(
        <div>
          <div style={{width:"100%",height:160,borderRadius:14,overflow:"hidden",marginBottom:16,position:"relative"}}>
            <img src={imgSrc} alt="analyzing" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            <div style={{position:"absolute",inset:0,background:"rgba(28,23,20,.5)",backdropFilter:"blur(2px)"}}/>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:13,color:"#fff",fontWeight:600,marginBottom:4}}>{phase}</div><div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Analyzing stitch structure…</div></div>
            </div>
          </div>
          <div style={{padding:"0 2px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:12,color:T.ink2,fontWeight:500}}>{phase}</div>
              <div style={{fontSize:12,color:T.terra,fontWeight:700}}>{Math.round(progress)}%</div>
            </div>
            <div style={{background:T.border,borderRadius:99,height:6,overflow:"hidden",marginBottom:6}}>
              <div className="progress-bar-fill" style={{width:progress+"%",height:6,borderRadius:99,transition:"width .3s ease"}}/>
            </div>
            <div style={{fontSize:11,color:T.ink3,textAlign:"center"}}>
              {progress<35&&"Reading image data…"}{progress>=35&&progress<70&&"Snap & Stitch is identifying components…"}{progress>=70&&progress<90&&"Running stitch count math…"}{progress>=90&&"Finalizing your pattern…"}
            </div>
          </div>
        </div>
      )}
      {error&&(
        <div style={{background:"#FFF0EE",borderRadius:12,padding:"14px 16px",marginBottom:14,border:"1px solid #F5C6BB"}}>
          <div style={{fontSize:13,color:"#C2564A",fontWeight:600,marginBottom:4}}>Couldn't read this photo</div>
          <div style={{fontSize:12,color:T.ink2,lineHeight:1.6}}>{error}</div>
          <div style={{marginTop:10}}><Btn variant="secondary" onClick={reset} small full={false}>Try again</Btn></div>
        </div>
      )}
      {analysis&&preview&&!loading&&(
        <div className="fu">
          <div className="conf-pop" style={{background:T.surface,borderRadius:14,border:`2px solid ${confInfo?.color||T.border}`,padding:"16px",marginBottom:14,textAlign:"center"}}>
            <div style={{fontSize:11,color:T.ink3,textTransform:"uppercase",letterSpacing:".09em",marginBottom:6}}>Pattern Confidence</div>
            <div style={{fontFamily:T.serif,fontSize:52,fontWeight:700,color:confInfo?.color,lineHeight:1,marginBottom:4}}>{confidence}%</div>
            <div style={{fontSize:12,color:T.ink2,marginBottom:10}}>{confInfo?.emoji} {confInfo?.text}</div>
            <Bar val={confidence} color={confInfo?.color} h={5}/>
            <div style={{fontSize:11,color:T.ink3,marginTop:8,lineHeight:1.5}}>Tap either panel to view fullscreen. Stitch counts are estimated — adjust after saving.</div>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
              <div style={{flex:1,fontSize:12,fontWeight:600,color:T.ink2,textAlign:"center"}}>Your Photo</div>
              <div style={{width:1,height:16,background:T.border}}/>
              <div style={{flex:1,fontSize:12,fontWeight:600,color:T.ink2,textAlign:"center"}}>3D Component Map</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <div onClick={()=>setLightbox("photo")} style={{position:"relative",borderRadius:12,overflow:"hidden",border:`1px solid ${T.border}`,height:240,background:T.linen,cursor:"zoom-in"}}>
                <img src={imgSrc} alt="source" style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top",display:"block"}}/>
                <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(28,23,20,.75) 0%,transparent 60%)"}}/>
                <div style={{position:"absolute",bottom:8,left:10,right:10,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.85)"}}>{analysis.object_name?(analysis.object_name.charAt(0).toUpperCase()+analysis.object_name.slice(1)):"Source"}</div>
                  <div style={{background:"rgba(0,0,0,.4)",borderRadius:6,padding:"2px 7px",fontSize:9,color:"rgba(255,255,255,.8)"}}>⤢ expand</div>
                </div>
              </div>
              <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${T.border}`,height:240,background:"#F5F2FF",position:"relative",cursor:"zoom-in"}} onClick={()=>setLightbox("wireframe")}>
                <WireframeViewer components={analysis.components} labeled={wireframeMode==="labeled"} height={240}/>
                <div style={{position:"absolute",bottom:8,right:10,background:"rgba(0,0,0,.35)",borderRadius:6,padding:"2px 7px",fontSize:9,color:"rgba(255,255,255,.8)",pointerEvents:"none"}}>⤢ expand</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:8,justifyContent:"center",alignItems:"center"}}>
              <span style={{fontSize:11,color:T.ink3,marginRight:4}}>Component labels:</span>
              {[["labeled","On"],["clean","Off"]].map(([mode,label])=>(
                <button key={mode} onClick={()=>setWireframeMode(mode)} style={{background:wireframeMode===mode?T.terra:T.linen,color:wireframeMode===mode?"#fff":T.ink3,border:`1px solid ${wireframeMode===mode?T.terra:T.border}`,borderRadius:8,padding:"5px 14px",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .15s"}}>{label}</button>
              ))}
            </div>
            <div style={{marginTop:10,background:T.surface,borderRadius:10,border:`1px solid ${T.border}`,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:T.ink3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8,fontWeight:600}}>Build Order · {analysis.components?.length} Components</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {analysis.components?.map((c,i)=>{
                  const conf=c.confidence>=75, label=c.label||c.role||c.primitive_type||"part";
                  const notes=c.construction?.notes||[c.construction?.technique?.replace(/_/g," "),c.construction?.increase_to?"~"+c.construction.increase_to+" sts":null,c.construction?.even_rounds?c.construction.even_rounds+" rnds":null,c.color?c.color+" yarn":null].filter(Boolean).join(" · ");
                  return (
                    <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 10px",background:conf?T.sageLt:T.terraLt,borderRadius:8,border:`1px solid ${conf?"rgba(92,122,94,.2)":"rgba(123,106,212,.2)"}`}}>
                      <div style={{width:22,height:22,borderRadius:99,background:conf?T.sage:T.terra,color:"#fff",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:700,color:conf?T.sage:T.terra,textTransform:"uppercase",marginBottom:2}}>{label} <span style={{fontWeight:400,opacity:.6}}>({c.primitive_type})</span></div>
                        <div style={{fontSize:11,color:T.ink2,lineHeight:1.5}}>{notes||"—"}</div>
                        {c.join_to&&<div style={{fontSize:10,color:T.ink3,marginTop:2}}>→ Joins to: {c.join_to}</div>}
                      </div>
                      <div style={{fontSize:10,color:T.ink3,flexShrink:0,marginTop:1}}>{c.confidence}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{background:T.linen,borderRadius:12,border:`1px solid ${T.border}`,padding:"14px",marginBottom:14}}>
            <div style={{fontFamily:T.serif,fontSize:16,color:T.ink,marginBottom:4}}>{preview.title}</div>
            <div style={{fontSize:12,color:T.ink3,marginBottom:10}}>Hook {preview.hook} · {preview.weight} · ~{preview.yardage} yds · {preview.rows.length} steps</div>
            <div style={{fontSize:12,color:T.ink2,lineHeight:1.6,marginBottom:12}}>{preview.notes}</div>
            <div style={{fontSize:11,color:T.ink3,fontStyle:"italic",marginBottom:12}}>Review the steps after saving — adjust stitch counts to match your gauge and yarn weight.</div>
            <Btn onClick={()=>onSave({id:Date.now(),photo:imgSrc||PILL[0],source:"Snap & Stitch",cat:analysis.object_category==="amigurumi"?"Amigurumi":"Uncategorized",rating:0,skeins:2,skeinYards:200,gauge:{stitches:16,rows:20,size:4},dimensions:{width:20,height:20},snapConfidence:confidence,snapComponents:analysis.components||[],snapObjectName:analysis.object_name||"",...preview})}>Save to My Wovely</Btn>
            <div style={{marginTop:8}}><Btn variant="ghost" onClick={reset}>Try different photo</Btn></div>
          </div>
        </div>
      )}
    </div>
  );
};

const ManualEntryForm = ({onSave,Btn}) => {
  const [title,setTitle]=useState(""),[cat,setCat]=useState("Blankets"),[hook,setHook]=useState(""),[weight,setWeight]=useState(""),[source,setSource]=useState(""),[notes,setNotes]=useState(""),[yardage,setYardage]=useState(""),[rowText,setRowText]=useState(""),[rows,setRows]=useState([]),[matName,setMatName]=useState(""),[matAmt,setMatAmt]=useState(""),[materials,setMaterials]=useState([]);
  const [fileUrl,setFileUrl]=useState(""),[fileName,setFileName]=useState(""),[fileType,setFileType]=useState(""),[fileUploading,setFileUploading]=useState(false);
  const fileRef=useRef(null);
  const handleFileUpload=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    setFileUploading(true);
    const result=await uploadPatternFile(file);
    setFileUploading(false);
    if(result){setFileUrl(result.url);setFileName(result.filename);setFileType(result.type);}
  };
  const addRow=()=>{if(!rowText.trim())return;setRows(p=>[...p,{id:Date.now(),text:rowText.trim(),done:false,note:""}]);setRowText("");};
  const addMat=()=>{if(!matName.trim())return;setMaterials(p=>[...p,{id:Date.now(),name:matName.trim(),amount:matAmt.trim()}]);setMatName("");setMatAmt("");};
  const save=()=>{if(!title.trim())return;onSave({id:Date.now(),photo:PILL[Math.floor(Math.random()*PILL.length)],title,source:source||"My Pattern",cat,hook,weight,notes,rating:0,yardage:parseInt(yardage)||0,skeins:0,skeinYards:200,gauge:{stitches:12,rows:16,size:4},dimensions:{width:50,height:60},materials,rows,source_file_url:fileUrl||undefined,source_file_name:fileName||undefined,source_file_type:fileType||undefined});};
  return (
    <div style={{paddingBottom:8}}>
      <Field label="Pattern Title *" placeholder="e.g. Cozy Weekend Blanket" value={title} onChange={e=>setTitle(e.target.value)}/>
      <div style={{display:"flex",gap:10,marginBottom:14}}>
        <div style={{flex:1}}><div style={{fontSize:11,color:T.ink3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Category</div><select value={cat} onChange={e=>setCat(e.target.value)} style={{width:"100%",padding:"12px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:12,color:T.ink,fontSize:14}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}>{["Blankets","Wearables","Accessories","Amigurumi","Home Décor"].map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={{flex:1}}><Field label="Hook Size" placeholder="5.0mm" value={hook} onChange={e=>setHook(e.target.value)}/></div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1}}><Field label="Yarn Weight" placeholder="Worsted…" value={weight} onChange={e=>setWeight(e.target.value)}/></div>
        <div style={{flex:1}}><Field label="Total Yardage" placeholder="800" value={yardage} onChange={e=>setYardage(e.target.value)}/></div>
      </div>
      <Field label="Source" placeholder="ravelry.com" value={source} onChange={e=>setSource(e.target.value)}/>
      <Field label="Notes" placeholder="Special notes…" value={notes} onChange={e=>setNotes(e.target.value)} rows={2}/>
      <div style={{fontSize:11,color:T.ink3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Materials</div>
      {materials.map((m,i)=>(
        <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
          <div style={{width:5,height:5,borderRadius:99,background:T.terra,flexShrink:0}}/>
          <span style={{flex:1,fontSize:13,color:T.ink2}}>{m.name}</span><span style={{fontSize:12,color:T.ink3}}>{m.amount}</span>
          <button onClick={()=>setMaterials(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:T.ink3,cursor:"pointer",fontSize:15}}>x</button>
        </div>
      ))}
      <div style={{display:"flex",gap:8,marginTop:8,marginBottom:18}}>
        <input value={matName} onChange={e=>setMatName(e.target.value)} placeholder="Material name" style={{flex:1,padding:"9px 12px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:9,fontSize:13,color:T.ink,outline:"none"}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/>
        <input value={matAmt} onChange={e=>setMatAmt(e.target.value)} placeholder="Amt" style={{width:70,padding:"9px 10px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:9,fontSize:13,color:T.ink,outline:"none"}}/>
        <button onClick={addMat} style={{background:T.terra,color:"#fff",border:"none",borderRadius:9,padding:"9px 14px",cursor:"pointer",fontSize:18,lineHeight:1}}>+</button>
      </div>
      <div style={{fontSize:11,color:T.ink3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Rows / Steps</div>
      {rows.map((r,i)=>(
        <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,color:T.ink3,minWidth:20,textAlign:"center",fontWeight:600}}>{i+1}</div>
          <span style={{flex:1,fontSize:13,color:T.ink2}}>{r.text}</span>
          <button onClick={()=>setRows(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:T.ink3,cursor:"pointer",fontSize:15}}>x</button>
        </div>
      ))}
      <div style={{display:"flex",gap:8,marginTop:8,marginBottom:20}}>
        <input value={rowText} onChange={e=>setRowText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addRow()} placeholder="Row 1: Ch 120, sc across…" style={{flex:1,padding:"9px 12px",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:9,fontSize:13,color:T.ink,outline:"none"}} onFocus={e=>e.target.style.borderColor=T.terra} onBlur={e=>e.target.style.borderColor=T.border}/>
        <button onClick={addRow} style={{background:T.terra,color:"#fff",border:"none",borderRadius:9,padding:"9px 14px",cursor:"pointer",fontSize:18,lineHeight:1}}>+</button>
      </div>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:11,color:T.ink3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>Attach source pattern (optional)</div>
        <div style={{fontSize:12,color:T.ink3,marginBottom:8}}>PDF, JPG, or PNG — we'll keep it handy while you build</div>
        {fileUrl?(
          <div style={{display:"flex",alignItems:"center",gap:8,background:T.linen,borderRadius:10,padding:"10px 14px",border:`1px solid ${T.border}`}}>
            <span style={{color:T.sage,fontSize:14}}>✓</span>
            <span style={{flex:1,fontSize:13,color:T.ink2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fileName}</span>
            <button onClick={()=>{setFileUrl("");setFileName("");setFileType("");}} style={{background:"none",border:"none",color:T.ink3,cursor:"pointer",fontSize:16}}>×</button>
          </div>
        ):(
          <>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} style={{display:"none"}}/>
            <button onClick={()=>fileRef.current?.click()} disabled={fileUploading} style={{background:T.linen,border:`1.5px dashed ${T.border}`,borderRadius:10,padding:"12px 16px",cursor:"pointer",fontSize:13,color:T.ink2,width:"100%",fontWeight:500,opacity:fileUploading?.6:1}}>{fileUploading?"Uploading…":"📎 Choose file"}</button>
          </>
        )}
      </div>
      <Btn onClick={save} disabled={!title.trim()}>Save Pattern</Btn>
    </div>
  );
};

const URLImportForm = ({onSave,Btn,Photo,initialUrl,onExtractionStart,onExtractionEnd,onBevCheckActive,onReviewActive,onPdfHandoff}) => {
  const [url,setUrl]=useState(initialUrl||""),[loading,setLoading]=useState(false),[stageText,setStageText]=useState(""),[preview,setPreview]=useState(null),[error,setError]=useState(null);
  const [validating,setValidating]=useState(false),[validationReport,setValidationReport]=useState(null);
  const [bevCheckFailed,setBevCheckFailed]=useState(false);
  useEffect(()=>{onBevCheckActive?.(!!validationReport||bevCheckFailed);},[validationReport,bevCheckFailed]);
  useEffect(()=>{onReviewActive?.(!!preview);},[preview]);
  const autoTriggered=useRef(false);
  const doImport=async()=>{
    if(!url.trim()) return;
    setLoading(true);onExtractionStart?.();setError(null);setPreview(null);setValidationReport(null);setBevCheckFailed(false);setValidating(false);
    const MSGS=["Fetching pattern page...","Reading and extracting...","Structuring your pattern...","Almost there..."];
    let msgIdx=0;setStageText(MSGS[0]);
    const msgIntv=setInterval(()=>{msgIdx=(msgIdx+1)%MSGS.length;setStageText(MSGS[msgIdx]);},6000);
    // ── PDF URL detection ──────────────────────────────────────────
    const trimmedUrl = url.trim();
    const looksLikePdf = trimmedUrl.toLowerCase().endsWith('.pdf') || trimmedUrl.toLowerCase().includes('.pdf?');

    if (looksLikePdf) {
      setStageText("Downloading PDF...");
      let pdfBlob;
      try {
        const proxyRes = await fetch('/api/fetch-pattern', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmedUrl, mode: 'proxy_pdf' })
        });
        if (!proxyRes.ok) throw new Error('Could not download PDF');
        pdfBlob = await proxyRes.blob();
      } catch (err) {
        clearInterval(msgIntv);
        onExtractionEnd?.();
        setError("Couldn't download that PDF. Try saving it and uploading directly.");
        setLoading(false);
        return;
      }

      const pdfFile = new File([pdfBlob], 'pattern.pdf', { type: 'application/pdf' });
      setStageText("Extracting pattern from PDF...");

      let extractedText, pdfMetadataTitle = null;
      try {
        const r = await extractTextFromPDF(pdfFile);
        extractedText = r.text;
        pdfMetadataTitle = r.metadataTitle;
      } catch (err) {
        clearInterval(msgIntv);
        onExtractionEnd?.();
        setError("Couldn't read that PDF. Try uploading the file directly.");
        setLoading(false);
        return;
      }

      if (!extractedText || extractedText.trim().length < 50) {
        clearInterval(msgIntv);
        onExtractionEnd?.();
        setError("This PDF doesn't appear to contain readable text. Try uploading it directly.");
        setLoading(false);
        return;
      }

      setStageText("Structuring your pattern...");
      let pdfData;
      try {
        const extractRes = await fetch('/api/extract-pattern', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfText: extractedText, pageCount: 4, pdfMetadataTitle })
        });
        if (!extractRes.ok) throw new Error('Server extraction failed');
        pdfData = await extractRes.json();
        if (pdfData.error) throw new Error(pdfData.error);
      } catch (err) {
        clearInterval(msgIntv);
        onExtractionEnd?.();
        setError("Couldn't extract pattern from that PDF. Try uploading the file directly.");
        setLoading(false);
        return;
      }

      clearInterval(msgIntv);
      setLoading(false);
      onExtractionEnd?.();

      // Hand off to PDFUploadForm review stage — same experience as direct PDF upload
      if (onPdfHandoff) {
        let sourceHost = '';
        try { sourceHost = new URL(trimmedUrl).hostname.replace('www.', ''); } catch(e) {}
        // Inject source URL into extracted data so it saves correctly
        pdfData.source_url = trimmedUrl;
        pdfData.source = sourceHost;
        onPdfHandoff({
          extracted: pdfData,
          pdfText: extractedText,
          fileInfo: {
            url: trimmedUrl,
            name: 'pattern.pdf',
            type: 'application/pdf',
            coverUrl: null
          },
          coverUrl: null
        });
      }
      return;
    }
    // ── end PDF URL detection ──────────────────────────────────────

    let data;
    try{
      const res=await fetch("/api/fetch-pattern",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url.trim()})});
      data=await res.json();
      if(!res.ok||data.error) throw new Error(data.error||"Could not read that page");
    }catch(err){clearInterval(msgIntv);onExtractionEnd?.();setError("Couldn't read that pattern. Try a different URL or use Manual Entry.");setLoading(false);return;}
    clearInterval(msgIntv);
    const rows=(data.rows||[]).map((r,i)=>({id:Date.now()+i,text:r.text||"",done:false,note:r.note||""}));
    const estimatedYardage=data.yardage>0?data.yardage:(data.materials||[]).reduce((sum,m)=>{if(m.yardage>0)return sum+m.yardage;const t=((m.name||"")+" "+(m.amount||"")).toLowerCase();const b=t.match(/(\d+)\s*ball/),s=t.match(/(\d+)\s*skein/);if(b)return sum+parseInt(b[1])*200;if(s)return sum+parseInt(s[1])*200;return sum;},0);
    const missing=[];if(!data.hook)missing.push("hook size");if(!data.weight)missing.push("yarn weight");if(!(data.yardage>0)&&!(estimatedYardage>0))missing.push("yardage");if(!(data.materials||[]).length)missing.push("materials list");
    setPreview({title:data.title||"",source:data.source||"",source_url:url.trim(),cat:data.cat||"Uncategorized",hook:data.hook||"",weight:data.weight||"",notes:data.notes||"",materials:data.materials||[],rows,yardage:estimatedYardage||data.yardage||0,photo:data.thumbnail_url||PILL[Math.floor(Math.random()*PILL.length)],cover_image_url:data.thumbnail_url||null,smartNote:rows.length+" steps extracted and ready to track.",qualityNote:missing.length===0?null:"Not found on source page: "+missing.join(", ")+". Pattern quality depends on the source."});
    setLoading(false);onExtractionEnd?.();    // Run BevCheck in background — same as PDF import
    const pageText=rows.map(r=>r.text).join("\n");
    if(pageText){
      setValidating(true);
      const valText=pageText.length>20000?pageText.slice(0,pageText.lastIndexOf("\n",20000)||20000):pageText;
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),90000);
      const bevCheckPromise=fetch("/api/extract-pattern",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"bevcheck",patternText:valText}),signal:controller.signal})
        .then(vr=>vr.json().then(data=>({ok:vr.ok,data})))
        .then(({ok,data})=>{
          if(ok&&!data.error){setValidationReport(data);}else{console.warn("[Wovely] URL BevCheck API error:",data.message);setBevCheckFailed(true);}
        })
        .catch(e=>{console.warn("[Wovely] URL BevCheck failed:",e);setBevCheckFailed(true);})
        .finally(()=>{clearTimeout(timeout);setValidating(false);});
    }
  };
  useEffect(()=>{if(initialUrl&&!autoTriggered.current){autoTriggered.current=true;doImport();}},[]);
  if(loading) return (
    <div style={{padding:"48px 20px 36px",textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",position:"relative"}}>
      {/* X removed in S1.5.3 — backdrop click or route nav dismisses. */}
      <style>{`@keyframes spinLoader{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}@keyframes fadeInMsg{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{width:60,height:60,borderRadius:"50%",border:"4px solid transparent",borderTopColor:"#7B6AD4",animation:"spinLoader 1s linear infinite",marginBottom:24}}/>
      <div style={{fontFamily:"'Fredoka',serif",fontSize:20,fontWeight:600,color:"#2E2748",marginBottom:8}}>Reading pattern page...</div>
      <div key={stageText} style={{fontSize:13,fontFamily:"Nunito,sans-serif",color:"#7B6AD4",animation:"fadeInMsg .4s ease both"}}>{stageText}</div>
    </div>
  );
  return (
    <div style={{paddingBottom:8}}>
      <div style={{fontSize:13,color:T.ink2,lineHeight:1.7,marginBottom:14}}>Paste any crochet pattern URL. We read the page and extract every step automatically.</div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <div style={{flex:1,display:"flex",alignItems:"center",background:T.linen,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"11px 14px",gap:10}}>
          <span style={{color:T.ink3}}>🔗</span>
          <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doImport()} placeholder="https://www.allfreecrochet.com/…" style={{border:"none",background:"transparent",flex:1,fontSize:14,color:T.ink,outline:"none"}}/>
        </div>
        <button onClick={doImport} disabled={!url.trim()} style={{background:T.terra,color:"#fff",border:"none",borderRadius:12,padding:"0 18px",fontWeight:600,fontSize:14,cursor:"pointer",boxShadow:"0 4px 14px rgba(123,106,212,.3)",opacity:!url.trim()?0.6:1}}>Go</button>
      </div>
      {error&&<div style={{background:"#FFF0EE",borderRadius:12,padding:"14px 16px",marginBottom:14,border:"1px solid #F5C6BB"}}><div style={{fontSize:13,color:"#C2564A",fontWeight:600,marginBottom:4}}>Couldn't read this URL</div><div style={{fontSize:12,color:T.ink2,lineHeight:1.6}}>{error}</div></div>}
      {preview&&(
        <div className="fu" style={{background:T.linen,borderRadius:16,overflow:"hidden",border:`1px solid ${T.border}`}}>
          <div style={{height:100,position:"relative"}}><Photo src={preview.photo} alt="pattern" style={{width:"100%",height:"100%"}}/></div>
          <div style={{padding:"14px"}}>
            <div style={{fontSize:10,color:T.ink3,marginBottom:4}}>{preview.source}</div>
            <div style={{fontFamily:T.serif,fontSize:18,color:T.ink,marginBottom:4}}>{preview.title}</div>
            <div style={{fontSize:12,color:T.ink3,marginBottom:8}}>{[preview.hook&&"Hook "+preview.hook,preview.weight,preview.yardage>0&&"~"+preview.yardage+" yds"].filter(Boolean).join(" · ")}</div>
            {preview.smartNote&&<div style={{background:T.sageLt,borderRadius:8,padding:"8px 12px",marginBottom:10,display:"flex",gap:8}}><span>✨</span><span style={{fontSize:12,color:T.sage}}>{preview.smartNote}</span></div>}
            {preview.qualityNote&&<div style={{background:"#FFF8EC",borderRadius:8,padding:"8px 12px",marginBottom:12,border:"1px solid #F0D9A8",display:"flex",gap:8,alignItems:"flex-start"}}><span style={{fontSize:13,flexShrink:0}}>⚠️</span><span style={{fontSize:11,color:"#8B6914",lineHeight:1.6}}>{preview.qualityNote}</span></div>}
            {validating&&<div style={{background:T.card,borderRadius:10,padding:"12px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}><div className="spinner" style={{width:16,height:16,border:`2px solid ${T.border}`,borderTopColor:T.terra,borderRadius:"50%",flexShrink:0}}/><span style={{fontSize:12,color:T.ink2}}>Running BevCheck...</span></div>}
            {validationReport&&<div style={{background:T.sageLt,borderRadius:10,padding:"10px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:14}}>{(validationReport.checks||[]).every(c=>c.status==="pass")?"✅":"⚠️"}</span><span style={{fontSize:12,fontWeight:600,color:T.sage}}>BevCheck: {deriveState(validationReport)==="pass"?"Looks good":deriveState(validationReport)==="issues"?"Issues found":"Heads up"}</span></div>}
            {preview.rows?.length>0&&<div style={{background:T.surface,borderRadius:10,padding:"10px 12px",marginBottom:12,maxHeight:160,overflowY:"auto",border:`1px solid ${T.border}`}}><div style={{fontSize:10,color:T.ink3,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8,fontWeight:600}}>Preview — {preview.rows.length} steps</div>{preview.rows.slice(0,5).map((r,i)=><div key={i} style={{fontSize:12,color:T.ink2,padding:"4px 0",borderBottom:i<4?`1px solid ${T.border}`:"none",lineHeight:1.5}}>{r.text}</div>)}{preview.rows.length>5&&<div style={{fontSize:11,color:T.ink3,marginTop:6}}>+{preview.rows.length-5} more steps…</div>}</div>}
            <Btn onClick={()=>onSave({id:Date.now(),rating:0,skeins:0,skeinYards:200,gauge:{stitches:12,rows:16,size:4},dimensions:{width:50,height:60},...preview,source_file_type:'url',validation_report:validationReport||null})}>Save to My Wovely</Btn>
            <div style={{marginTop:8}}><Btn variant="ghost" onClick={()=>{setPreview(null);setUrl("");setValidationReport(null);}}>Try different URL</Btn></div>
          </div>
        </div>
      )}
      {!preview&&<div style={{marginTop:14,background:T.linen,borderRadius:12,padding:"12px 14px"}}><div style={{fontSize:11,color:T.ink3,fontWeight:600,marginBottom:4}}>Works great with</div><div style={{fontSize:12,color:T.ink2,lineHeight:1.8}}>AllFreeCrochet · Drops Design · Yarnspirations · LoveCrafts · Sarah Maker · WordPress pattern blogs</div></div>}
    </div>
  );
};

const PDFUploadForm = ({onSave,onClose,Btn,isPro,onUpgrade,onExtractionStart,onExtractionEnd,onBevCheckActive,onReviewActive,initialExtracted,initialValidationReport,initialPollingJobId,isCollectionImport=false,isStarterImport=false}) => {
  // initialPollingJobId (S1.5.3): when the ImportPill re-opens the modal
  // mid-import, land directly in the extracting stage and let polling
  // resume against the existing job_id. The hook computes totalElapsed
  // from job.created_at, so the elapsed counter continues without reset.
  const [stage,setStage]=useState(initialExtracted?"review":(initialPollingJobId?"extracting":"pick"));
  const [progress,setProgress]=useState(initialExtracted?100:(initialPollingJobId?40:0));
  const [stageText,setStageText]=useState("");
  const [extracted,setExtracted]=useState(initialExtracted?.extracted||null);
  const [fileInfo,setFileInfo]=useState(initialExtracted?.fileInfo||null);
  const [errorMsg,setErrorMsg]=useState("");
  const [errorType,setErrorType]=useState(""); // 'server_hiccup' | 'extraction_failed' | ''
  const lastFileRef=useRef(null);
  const [autoRetried,setAutoRetried]=useState(false);
  const [editTitle,setEditTitle]=useState(initialExtracted?.extracted?.title||"");
  const [editDesigner,setEditDesigner]=useState(initialExtracted?.extracted?.designer||"");
  const [editHook,setEditHook]=useState(initialExtracted?.extracted?.hook_size||"");
  const [editWeight,setEditWeight]=useState(initialExtracted?.extracted?.yarn_weight||"");
  const [coverTab,setCoverTab]=useState("photo");
  const [coverUrl,setCoverUrl]=useState(initialExtracted?.coverUrl||null);
  const [coverFailed,setCoverFailed]=useState(false);
  const [coverUploading,setCoverUploading]=useState(false);
  const [complexity,setComplexity]=useState(null); // null | "simple" | "detailed" | "complex"
  const [complexityStats,setComplexityStats]=useState(null); // {pages, textLen}
  const [validationFlags,setValidationFlags]=useState([]);
  const [flagsDismissed,setFlagsDismissed]=useState(false);
  // initialValidationReport arrives from the pill → modal handoff path (queue
  // completed; worker already wrote validation_report into the row). On the
  // URL-import handoff path (still sync) it's null and the useEffect below
  // calls /api/extract-pattern?mode=bevcheck client-side. Pure-queue path
  // gets the report from the polling hook instead (see effect further down).
  const [validationReport,setValidationReport]=useState(initialValidationReport||null);
  const [validating,setValidating]=useState(false);
  const [bevCheckFailed,setBevCheckFailed]=useState(false);
  const bevCheckTextRef=useRef(null);
  useEffect(()=>{onBevCheckActive?.(!!validationReport||bevCheckFailed);},[validationReport,bevCheckFailed]);
  useEffect(()=>{onReviewActive?.(!!extracted);},[extracted]);

  // ── In-modal queue polling — now via shared hook (S66) ───────────────────
  // pollingJobId is set after POST /api/import-job succeeds. When the hook
  // reports completed/failed we flip stage in place; if the user navigates
  // away during processing the unmount cleanup hands off to ImportPill.
  const [pollingJobId,setPollingJobId]=useState(initialPollingJobId||null);
  const pollingJobIdRef=useRef(initialPollingJobId||null);
  useEffect(()=>{pollingJobIdRef.current=pollingJobId;},[pollingJobId]);
  // Pill-resume mount: announce extracting so the modal's backdrop logic
  // knows we're in the loading state right away, before any in-modal upload.
  useEffect(()=>{if(initialPollingJobId)onExtractionStart?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const intv2Ref=useRef(null);
  const polling=useImportJobPolling(pollingJobId);
  // Stage 1.5.3: phase-driven copy from worker. Stays stable within a
  // phase, transitions once per phase change. Same source as ImportPill,
  // so big modal and compact pill speak with one voice.
  const lastPickedPhaseRef=useRef(null);
  useEffect(()=>{
    if(!polling.currentPhase) return;
    if(polling.currentPhase===lastPickedPhaseRef.current) return;
    const next=pickPhaseCopy(polling.currentPhase);
    if(next) setStageText(next);
    lastPickedPhaseRef.current=polling.currentPhase;
  },[polling.currentPhase]);
  useEffect(()=>{
    if(!pollingJobId) return;
    if(polling.isComplete){
      if(intv2Ref.current){clearInterval(intv2Ref.current);intv2Ref.current=null;}
      const result=polling.extractedData||{};
      setExtracted(result);
      setEditTitle(sanitizeTitle(result.title)||"");setEditDesigner(result.designer||"");
      setEditHook(result.hook_size||"");setEditWeight(result.yarn_weight||"");
      if(polling.coverImageUrl) setCoverUrl(polling.coverImageUrl);
      // Thread the queue job's file_url into fileInfo so the saved pattern keeps
      // source_file_url. The pill-RESUME path mounts with no initialFileInfo, so
      // without this fileInfo stays null and handleSave persists an empty
      // source_file_url — which silently skips Bev's image classification (and
      // "View Source"). `prev||` so we never clobber a live-upload/review fileInfo.
      if(polling.fileUrl) setFileInfo(prev=>prev||{url:polling.fileUrl,name:(polling.fileUrl.split("/").pop()||"pattern.pdf"),type:"application/pdf",coverUrl:polling.coverImageUrl||null});
      // Server-side BevCheck result (S66). When validation_report has an
      // error key, surface failure UI; otherwise drop it into state for the
      // review panel. {skipped:true} (no text to validate) reads as no
      // report — same display as the legacy null case.
      if(polling.validationReport){
        if(polling.validationReport.error){ setBevCheckFailed(true); }
        else if(!polling.validationReport.skipped){ setValidationReport(polling.validationReport); }
      }
      const allRows=(result.components||[]).flatMap(c=>(c.rows||[]));
      const flags=[];
      if(allRows.length<3) flags.push("Fewer than 3 rows extracted");
      const rndNums=allRows.map(r=>{const m=(r.label||"").match(/\d+/);return m?parseInt(m[0]):null;}).filter(Boolean);
      for(let i=1;i<rndNums.length;i++){if(rndNums[i]-rndNums[i-1]>2) flags.push("Gap detected between round "+rndNums[i-1]+" and "+rndNums[i]);}
      setValidationFlags(flags);
      setProgress(100);setStage("review");
      setPollingJobId(null);
      onExtractionEnd?.();
    } else if(polling.isFailed){
      if(intv2Ref.current){clearInterval(intv2Ref.current);intv2Ref.current=null;}
      setStage("error");setErrorType("extraction_failed");
      setErrorMsg(polling.errorMessage||"Bev got tangled — try again.");
      setPollingJobId(null);
      onExtractionEnd?.();
    }
  },[pollingJobId,polling.isComplete,polling.isFailed]);
  // Unmount-only: if we still have an active polling job (user navigated
  // away during extraction), hand off to ImportPill so the import survives.
  useEffect(()=>{
    return ()=>{
      if(pollingJobIdRef.current){
        setActiveImportJob(pollingJobIdRef.current);
        if(intv2Ref.current) clearInterval(intv2Ref.current);
      }
    };
  },[]);
  const [showFullReport,setShowFullReport]=useState(false);
  const [matExpanded,setMatExpanded]=useState(false);
  const [compExpanded,setCompExpanded]=useState({});
  const coverFileRef=useRef(null);
  useEffect(()=>{
    if(stage==='error'&&errorType==='server_hiccup'&&!autoRetried&&lastFileRef.current){
      setAutoRetried(true);
      setStage('extracting');
      setStageText("Bev's untangling a few stitches...");
      setProgress(20);
      setTimeout(()=>{handleFile(lastFileRef.current);},1500);
    }
  },[stage,errorType,autoRetried]);
  useEffect(()=>{
    // Only fires on the URL-import handoff path: pdfText is non-empty (URL
    // flow forwards the fetched PDF text) AND no validation_report came in
    // from the queue. The queue path arrives via the pill with
    // initialValidationReport already populated by the worker, so we skip.
    if(!initialExtracted||!initialExtracted.pdfText) return;
    if(validationReport) return;
    setValidating(true);
    const valText=initialExtracted.pdfText.length>20000
      ?initialExtracted.pdfText.slice(0,initialExtracted.pdfText.lastIndexOf("\n",20000)||20000)
      :initialExtracted.pdfText;
    bevCheckTextRef.current=valText;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),90000);
    fetch("/api/extract-pattern",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"bevcheck",patternText:valText}),signal:controller.signal})
      .then(vr=>vr.json().then(data=>({ok:vr.ok,data})))
      .then(({ok,data})=>{if(ok&&!data.error){setValidationReport(data);}else{setBevCheckFailed(true);}})
      .catch(()=>setBevCheckFailed(true))
      .finally(()=>{clearTimeout(timeout);setValidating(false);});
  },[initialExtracted]);
  const handleFile=async(e)=>{
    const f=e.target?.files?.[0]||e;if(!f)return;
    lastFileRef.current=f;
    setAutoRetried(false);
    onExtractionStart?.();
    // Size check before anything
    if(f.size>50*1024*1024){onExtractionEnd?.();setStage("error");setErrorMsg("Pattern file is too large (max 50MB). Try a smaller file.");return;}
    try{
      const fileMime=f.type||"application/pdf";
      const isPDF=fileMime==="application/pdf"||f.name.toLowerCase().endsWith(".pdf");
      console.log("[Wovely] File:", f.name, f.type, (f.size/1024).toFixed(0)+"KB", "isPDF:", isPDF);
      // Stage 1: Upload to Cloudinary + render cover (parallel)
      setStage("uploading");setStageText("Uploading your pattern...");setProgress(10);      const intv1=setInterval(()=>setProgress(p=>Math.min(p+3,30)),200);
      // Run upload and cover render in parallel
      const [uploaded, pdfCoverDataUrl] = await Promise.all([
        uploadPatternFile(f),
        isPDF ? renderPDFCoverImage(f) : Promise.resolve(null)
      ]);
      clearInterval(intv1);
      if(!uploaded){onExtractionEnd?.();setStage("error");setErrorMsg("Upload failed — check your connection and try again.");return;}
      // Upload PDF cover image to Cloudinary using yarnhive_patterns preset
      let coverCloudinaryUrl=null;
      if(pdfCoverDataUrl){
        console.log("[Wovely] PDF cover dataUrl length:", pdfCoverDataUrl.length, "starts:", pdfCoverDataUrl.substring(0,40));
        try{
          const coverFd=new FormData();
          coverFd.append("file", pdfCoverDataUrl);
          coverFd.append("upload_preset","yarnhive_patterns");
          coverFd.append("folder","covers");
          const coverRes=await fetch("https://api.cloudinary.com/v1_1/dmaupzhcx/image/upload",{method:"POST",body:coverFd});
          if(coverRes.ok){const cd=await coverRes.json();coverCloudinaryUrl=cd.secure_url;console.log("[Wovely] PDF cover uploaded:",coverCloudinaryUrl);}
          else{const errBody=await coverRes.text().catch(()=>"");console.warn("[Wovely] Cover upload failed:",coverRes.status,errBody);}
        }catch(e){console.warn("[Wovely] Cover upload failed:",e);}
      } else {
        console.warn("[Wovely] renderPDFCoverImage returned null — canvas render likely failed");
      }
      setFileInfo({url:uploaded.url,name:uploaded.filename,type:uploaded.type,coverUrl:coverCloudinaryUrl});setProgress(33);
      // Stage 2: Extract — stageText is now rewritten in place by the
      // phase-change effect above (driven by polling.currentPhase). The
      // initial value covers the brief pre-claim window and the legacy
      // sync path which never starts polling. The old 4-string EXTRACT_MSGS
      // rotation was removed in S1.5.3 so the modal and ImportPill never
      // disagree about what the worker is doing.
      setStage("extracting");setStageText("Reading your pattern...");
      const intv2=setInterval(()=>setProgress(p=>Math.min(p+1,62)),300);
      intv2Ref.current=intv2;
      let result;let extractedText=null;
      try{
        if(isPDF){
          console.log("[Wovely] Using pdf.js text extraction for PDF...");
          const {text:pdfText,metadataTitle:pdfMetaTitle}=await extractTextFromPDF(f);extractedText=pdfText;

          // Queue path (S65 Task 2): post the job, keep this modal mounted,
          // and poll job-status from the in-modal effect above. On completion
          // the form flips to its review stage in place. If the user
          // navigates away mid-import the unmount-only cleanup hands off to
          // ImportPill. The PILL is the navigate-away fallback, not the
          // default handoff. TODO(S66): remove inline extract-pattern path
          // entirely once queue path is the only one in use.
          {
            const session = getSession();
            const userToken = session?.access_token;
            if (userToken && uploaded?.url) {
              try {
                const jobRes = await fetch('/api/import-job', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
                  body: JSON.stringify({ file_url: uploaded.url, file_type: 'pdf', raw_text: pdfText, cover_image_url: coverCloudinaryUrl || null, pdf_metadata_title: pdfMetaTitle || null }),
                });
                if (jobRes.ok) {
                  const { job_id } = await jobRes.json();
                  setPollingJobId(job_id);
                  return; // intervals + stage="extracting" stay running; polling effect transitions to review
                }
                const errBody = await jobRes.json().catch(() => ({}));
                console.error('[Wovely] Queue POST failed:', jobRes.status, errBody);
                clearInterval(intv2);intv2Ref.current=null;
                onExtractionEnd?.();
                setStage('error');
                // 402 from the chunked-import tier gate gets its own
                // errorType so the error stage renders the upgrade nudge
                // instead of the generic "stumped" retry copy.
                if (jobRes.status === 402 && errBody.error === 'chunked_import_requires_paid_tier') {
                  setErrorType('tier_gated_chunked');
                  setErrorMsg(errBody.message || 'This pattern is a big one. Craft members get full support for complex patterns.');
                } else {
                  setErrorType('extraction_failed');
                  setErrorMsg(errBody.error || 'We couldn’t start your import. Try again.');
                }
                return;
              } catch (queueErr) {
                console.error('[Wovely] Queue POST exception:', queueErr.message);
                clearInterval(intv2);intv2Ref.current=null;
                onExtractionEnd?.();
                setStage('error');
                setErrorType('server_hiccup');
                setErrorMsg('We couldn’t reach the import service. Try again.');
                return;
              }
            }
            // Falls through to inline extraction below if no session / no upload URL —
            // shouldn't happen in normal flow, kept as deprecated safety net.
          }

          // Detect complexity from page count + text density
          const pageMatches=(pdfText.match(/--- PAGE \d+ ---/g)||[]).length;
          const textLen=pdfText.replace(/--- PAGE \d+ ---/g,"").replace(/\s+/g," ").trim().length;
          const avgTextPerPage=pageMatches>0?textLen/pageMatches:textLen;

          // Classify PDF by text density
          // < 300 avg chars/page = image-heavy (scanned, chart-based, photo PDFs) → vision path
          // 300-1200 avg chars/page = mixed (some text, some images) → vision path (Gemini sees everything)
          // > 1200 avg chars/page = text-rich → text/chunked path
          const isImageHeavy = avgTextPerPage < 300;
          const isMixed = avgTextPerPage >= 300 && avgTextPerPage < 1200;
          const useVision = isImageHeavy || isMixed;

          let lvl="simple";
          if(pageMatches>=20||avgTextPerPage<300) lvl="complex";
          else if(pageMatches>=8||avgTextPerPage<800) lvl="detailed";
          console.log("[Wovely] Complexity:",lvl,"pages:",pageMatches,"avgText/page:",Math.round(avgTextPerPage),"routing:",useVision?"VISION":"TEXT");
          setComplexity(lvl);setComplexityStats({pages:pageMatches,textLen});

          if(useVision){
            // Vision path — send PDF directly to Gemini via server (handles image-heavy AND mixed PDFs)
            console.log("[Wovely] Vision path:",isImageHeavy?"image-heavy":"mixed","avgText/page:",Math.round(avgTextPerPage));
            let usedUrlApproach=false;
            if(uploaded?.url){
              console.log("[Wovely] Vision: trying URL-based approach for:",f.name);
              try{
                const urlRes=await fetch("/api/extract-pattern-vision",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pdfUrl:uploaded.url,filename:f.name})});
                if(urlRes.ok){result=await urlRes.json();usedUrlApproach=true;console.log("[Wovely] Vision: URL approach succeeded");}
                else{console.warn("[Wovely] Vision: URL approach returned",urlRes.status,"— falling back");}
              }catch(urlErr){console.warn("[Wovely] Vision: URL approach failed, using canvas fallback:",urlErr);}
            }
            // FALLBACK: client-side canvas rendering (mobile/upload-failed cases)
            if(!usedUrlApproach){
              console.log("[Wovely] Vision: URL approach failed, using canvas fallback");
              const pageImages=[];
              const arrayBuf=await f.arrayBuffer();
              const typedArr=new Uint8Array(arrayBuf);
              const pdfDoc=await window.pdfjsLib.getDocument({data:typedArr}).promise;
              for(let pi=1;pi<=pdfDoc.numPages;pi++){
                const pg=await pdfDoc.getPage(pi);
                const vp=pg.getViewport({scale:2});
                const cvs=document.createElement("canvas");
                cvs.width=vp.width;cvs.height=vp.height;
                await pg.render({canvasContext:cvs.getContext("2d"),viewport:vp}).promise;
                pageImages.push(cvs.toDataURL("image/jpeg",0.85));
              }
              console.log("[Wovely] Rendered",pageImages.length,"PDF pages as images, sending to /api/extract-pattern-vision");
              const extractRes=await fetch("/api/extract-pattern-vision",{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({images:pageImages,pageCount:pageMatches,fileName:f.name}),
              });
              if(!extractRes.ok){const errBody=await extractRes.json().catch(()=>({}));const err=new Error(errBody.error||"Server extraction failed: "+extractRes.status);err.httpStatus=extractRes.status;throw err;}
              result=await extractRes.json();
            }
          } else {
            // Text path — rich text PDF, use chunked extraction
            console.log("[Wovely] Text path: text-rich PDF, chars:",pdfText.length,"pages:",pageMatches);
            const extractController=new AbortController();
            const extractTimeout=setTimeout(()=>extractController.abort(),270000);
            let extractRes;
            try{
              extractRes=await fetch("/api/extract-pattern",{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({pdfText,pageCount:pageMatches,pdfMetadataTitle:pdfMetaTitle||null}),
                signal:extractController.signal,
              });
            }catch(fetchErr){
              clearTimeout(extractTimeout);
              if(fetchErr.name==="AbortError"){const err=new Error("Server extraction failed: timeout");err.httpStatus=504;throw err;}
              throw fetchErr;
            }
            clearTimeout(extractTimeout);
            if(!extractRes.ok){const errBody=await extractRes.json().catch(()=>({}));const err=new Error(errBody.error||"Server extraction failed: "+extractRes.status);err.httpStatus=extractRes.status;throw err;}
            result=await extractRes.json();
          }
        } else {
          console.log("[Wovely] Using base64 extraction for image...");
          const base64Data=await fileToBase64(f);
          result=await extractPatternFromPDF(base64Data,f.name,fileMime,false);
        }
      }
      catch(ex){clearInterval(intv2);console.error("[Wovely] Extraction failed:",ex);onExtractionEnd?.();const isHiccup=(ex.httpStatus&&(ex.httpStatus>=500))||ex.message?.includes("UNAVAILABLE")||ex.message?.includes("Server extraction failed");setErrorType(isHiccup?"server_hiccup":"extraction_failed");setStage("error");setErrorMsg(isHiccup?"server_hiccup":"We couldn't read this pattern automatically.");setExtracted({title:f.name.replace(/\.(pdf|jpg|png|jpeg)$/i,"").replace(/[-_]/g," "),components:[],materials:[],pattern_notes:"",hook_size:"",yarn_weight:"",designer:"",difficulty:"",assembly_notes:""});return;}
      clearInterval(intv2);setProgress(66);
      setStage("building");setStageText("Building your workspace...");
      await new Promise(r=>setTimeout(r,600));setProgress(100);
      setExtracted(result);setEditTitle(sanitizeTitle(result.title)||"");setEditDesigner(result.designer||"");setEditHook(result.hook_size||"");setEditWeight(result.yarn_weight||"");
      // Import failsafe: lightweight validation flags
      const allRows=(result.components||[]).flatMap(c=>(c.rows||[]));
      const flags=[];
      if(allRows.length<3) flags.push("Fewer than 3 rows extracted");
      const rndNums=allRows.map(r=>{const m=(r.label||"").match(/\d+/);return m?parseInt(m[0]):null;}).filter(Boolean);
      for(let i=1;i<rndNums.length;i++){if(rndNums[i]-rndNums[i-1]>2) flags.push("Gap detected between round "+rndNums[i-1]+" and "+rndNums[i]);}
      if(complexityStats&&complexityStats.pages>=5&&allRows.length<10) flags.push("Only "+allRows.length+" rows from a "+complexityStats.pages+"-page pattern");
      setValidationFlags(flags);
      // Client-side BevCheck removed in S66. The queue path returned early
      // above on success; if it didn't fail the worker runs BevCheck and
      // writes validation_report into the row before status flips to
      // completed. The polling effect reads it from the job-status payload.
      // The deprecated vision/text fallback below this comment is the only
      // way to reach here — kept as a safety net but no longer validated.
      await new Promise(r=>setTimeout(r,400));setStage("review");onExtractionEnd?.();    }catch(ex){console.error("[Wovely] PDF import error:",ex);onExtractionEnd?.();const isHiccup=(ex.httpStatus&&(ex.httpStatus>=500))||ex.message?.includes("UNAVAILABLE")||ex.message?.includes("Server extraction failed");setErrorType(isHiccup?"server_hiccup":"extraction_failed");setStage("error");setErrorMsg(isHiccup?"server_hiccup":"Something went wrong. Try again or use manual entry.");}
  };
  const handleSave=()=>{
    const rows=buildRowsFromComponents(extracted.components);
    const mats=(extracted.materials||[]).map((m,i)=>({id:i+1,name:m.name||"",amount:m.amount||"",yardage:0,notes:m.notes||""}));
    const finalCover=coverUrl||fileInfo?.coverUrl||null;
    onSave({id:Date.now(),title:editTitle||"Imported Pattern",source:editDesigner||"PDF Import",cat:"Uncategorized",hook:editHook||"",weight:editWeight||"",notes:"",pattern_notes:extracted.pattern_notes||"",yardage:0,rating:0,skeins:0,skeinYards:200,gauge:{stitches:12,rows:16,size:4},dimensions:{width:50,height:60},materials:mats,rows,photo:finalCover||PILL[Math.floor(Math.random()*PILL.length)],cover_image_url:finalCover,source_file_url:fileInfo?.url||"",source_url:extracted?.source_url||fileInfo?.url||"",source_file_name:fileInfo?.name||"",source_file_type:fileInfo?.type||"",extracted_by_ai:true,components:extracted.components||[],assembly_notes:extracted.assembly_notes||"",difficulty:extracted.difficulty||"",abbreviations_map:extracted.abbreviations_map||{},suggested_resources:extracted.suggested_resources||[],validation_flags:validationFlags.length>0?validationFlags:null,validation_report:isPro&&validationReport?validationReport:null,
      // S76 document type from the planner — handleAddPattern routes on this.
      document_type: extracted.document_type || null,
      // Multi-part detection fields from the planning pass — passed
      // through to App.jsx so handleAddPattern can branch on them
      // (auto-create a collection, show the "want to collect this?"
      // prompt, or surface the contextual upgrade banner).
      _multiPart: (extracted.collection_name || extracted.collection_type) ? {
        collection_name: extracted.collection_name || null,
        collection_type: extracted.collection_type || null,
        part_label: extracted.part_label || null,
        expected_part_count: typeof extracted.expected_part_count === "number" ? extracted.expected_part_count : null,
        current_part_number: typeof extracted.current_part_number === "number" ? extracted.current_part_number : null,
      } : null,
      // S83: starter pick rides the real import pipeline end to end; this flag
      // is the only divergence — handleAddPattern maps it to is_starter so the
      // row is excluded from caps/stats and shows the Free Starter badge.
      isStarter: !!isStarterImport,
    });
  };
  const handleFallbackSave=()=>{onSave({id:Date.now(),title:extracted?.title||"Imported Pattern",source:"PDF Import",cat:"Uncategorized",hook:"",weight:"",notes:"",yardage:0,rating:0,skeins:0,skeinYards:200,gauge:{stitches:12,rows:16,size:4},dimensions:{width:50,height:60},materials:[],rows:[],photo:fileInfo?.coverUrl||PILL[Math.floor(Math.random()*PILL.length)],cover_image_url:fileInfo?.coverUrl||null,source_file_url:fileInfo?.url||"",source_file_name:fileInfo?.name||"",source_file_type:fileInfo?.type||""});};
  const handleRetry=()=>{setStage("pick");setProgress(0);setErrorMsg("");setErrorType("");setComplexity(null);setComplexityStats(null);setAutoRetried(false);if(lastFileRef.current){const f=lastFileRef.current;setTimeout(()=>handleFile(f),100);}};
  if(stage==="pick") {
    // Collection-aware copy. When the user came from the "Start a
    // Collection" surface (or "Import Next Clue" inside an existing
    // collection), the language shifts to "your first clue" / collection
    // framing so the flow reads as one continuous collection workflow.
    const intro = isCollectionImport
      ? "Upload your first clue — PDF or photo. Bev will read it and set up your collection."
      : "Upload your pattern — PDF or photo. We'll read it and set up your workspace.";
    const dropHeadline = isCollectionImport ? "Upload your first clue" : "Upload your pattern";
    const dropSub = isCollectionImport
      ? "PDF or photo — Bev will read it and set up your collection"
      : "PDF or photo — we'll read it and set up your workspace";
    return (
      <div style={{paddingBottom:8}}>
        <div style={{fontSize:13,color:T.ink2,lineHeight:1.7,marginBottom:14}}>{intro}</div>
        <label style={{display:"block",cursor:"pointer"}}><div style={{border:`2px dashed ${T.border}`,borderRadius:16,padding:"36px 20px",textAlign:"center",background:T.linen,transition:"border-color .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.terra} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}><div style={{fontSize:40,marginBottom:10}}>📄</div><div style={{fontFamily:T.serif,fontSize:17,color:T.ink,marginBottom:6}}>{dropHeadline}</div><div style={{fontSize:13,color:T.ink3,marginBottom:14}}>{dropSub}</div><div style={{background:T.terra,color:"#fff",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:600,display:"inline-block"}}>Choose File</div></div><input type="file" accept=".pdf,application/pdf" onChange={handleFile} style={{display:"none"}}/></label>
      </div>
    );
  }
  // Complexity-aware loading messages. Headline pulls from stageText —
  // which the phase effect rewrites as the worker advances — so the modal
  // tracks the worker. Subtitle is the navigate-away reassurance line
  // while extracting; complexity hints take precedence when set.
  const complexityMsg = complexity==="complex"
    ? {emoji:"🧶🧶🧶", headline:"Big pattern. Bev is going all in.", sub:`${complexityStats?.pages||"Many"} pages of pure craft. Every round, every stitch, every note. Grab your hook — this might take a minute.`, barSpeed:80}
    : complexity==="detailed"
    ? {emoji:"🧶🧶", headline:"This one's detailed.", sub:`Reading carefully through ${complexityStats?.pages||"all"} pages. Hang tight — about 30–60 seconds.`, barSpeed:200}
    : {emoji:"🔎", headline:stageText, sub:stage==="extracting"?REASSURANCE_LINE:null, barSpeed:300};
  const loadingInfo = (stage==="extracting"&&complexity) ? complexityMsg : {emoji:stage==="building"?"✓":"🔎", headline:stageText, sub:stage==="extracting"?REASSURANCE_LINE:null, barSpeed:300};
  if(stage==="uploading"||stage==="extracting"||stage==="building") {
    // Elapsed shown only when polling is driving — same totalElapsed value
    // and format the ImportPill uses (computed from job.created_at), so
    // closing the modal mid-import and tapping the pill resumes the count
    // without resetting. Hidden on the legacy synchronous path where no
    // job_id exists.
    const elapsedLabel = pollingJobId
      ? (polling.totalElapsed >= 60
          ? `${Math.floor(polling.totalElapsed / 60)}m ${polling.totalElapsed % 60}s`
          : `${polling.totalElapsed}s`)
      : null;
    // 2b "Bev's reading your pattern" screen (Wovely App 2b.dc.html #importing):
    // bobbing Bev, the live BevCheck gauge (ScanGauge), and a 4-step progress
    // list. Steps ride the REAL worker phase when the queue is driving
    // (polling.currentPhase), falling back to the local stage on the legacy
    // synchronous path. Gauge resolves to the real BevCheck score the moment
    // validation_report lands — never an invented number.
    const PHASE_STEP = { reading:0, extracting:1, validating:2, finalizing:3 };
    const STEP_STAGE = { uploading:0, extracting:1, building:2 };
    const activeStep = (pollingJobId && polling.currentPhase != null)
      ? (PHASE_STEP[polling.currentPhase] ?? 0)
      : (STEP_STAGE[stage] ?? 0);
    const STEPS = ["Reading the source","Finding parts, rows & materials","BevCheck — validating accuracy","Tucking the original into your Vault"];
    const gaugeScore = typeof validationReport?.score === "number" ? validationReport.score : null;
    const gaugePhase = validationReport ? "done" : (bevCheckFailed ? "idle" : (activeStep >= 2 ? "checking" : "idle"));
    const gaugeNote = validationReport
      ? (gaugeScore != null ? "Stitch counts verified, row by row" : "Bev finished her once-over")
      : bevCheckFailed ? "Bev got tangled on the check — she'll retry after import"
      : activeStep >= 2 ? "Checking every row's stitch counts…" : "Warming up the needle…";
    return (
    <div style={{padding:"18px 20px 28px",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",maxWidth:480,margin:"0 auto",position:"relative"}}>
      <style>{`@keyframes bevbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}@keyframes fadeInMsg{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <img src="/bev-hero.png" alt="Bev reading your pattern" style={{width:96,filter:"drop-shadow(0 12px 18px rgba(90,66,160,.32))",animation:"bevbob 2.2s ease-in-out infinite"}}/>
      <div key={loadingInfo.headline} style={{fontFamily:"'Fredoka','Segoe UI',sans-serif",fontSize:26,fontWeight:600,color:"#2E2748",marginTop:18,lineHeight:1.15,animation:"fadeInMsg .4s ease both"}}>Bev's reading your pattern…</div>
      <div style={{fontWeight:700,fontSize:14.5,color:"#726A92",marginTop:6}}>{elapsedLabel ? `Under a minute — we'll keep your place. · ${elapsedLabel}` : "Under a minute — we'll keep your place."}</div>
      <div style={{width:"100%",maxWidth:390,marginTop:22,display:"flex",justifyContent:"center"}}>
        <ScanGauge phase={gaugePhase} score={gaugeScore} state={validationReport?deriveState(validationReport):null} note={gaugeNote}/>
      </div>
      <ProcSteps steps={STEPS} activeStep={activeStep}/>
    </div>
  );
  }
  if(stage==="error") {
    const isHiccup=errorType==="server_hiccup";
    const isTierGated=errorType==="tier_gated_chunked";
    if(isTierGated) {
      // Free user hit the chunked-import gate. Friendly headline +
      // upgrade CTA, no retry button (retry would just fail again).
      return (
        <div style={{padding:"24px 0 12px"}}>
          <div style={{fontSize:36,textAlign:"center",marginBottom:12}}>🧶</div>
          <div style={{fontFamily:T.serif,fontSize:17,color:T.ink,textAlign:"center",marginBottom:6}}>This pattern is a big one</div>
          <div style={{fontSize:13,color:T.ink2,textAlign:"center",lineHeight:1.7,marginBottom:20,padding:"0 8px"}}>
            {errorMsg||"Craft members get full support for complex patterns. Bev handles everything from setup to finishing."}
          </div>
          {onUpgrade && (
            <div style={{marginBottom:8}}>
              <Btn onClick={onUpgrade}>See plans</Btn>
            </div>
          )}
          <div style={{textAlign:"center",fontSize:11,color:T.ink3,opacity:0.7,marginTop:4}}>Or try a shorter pattern.</div>
        </div>
      );
    }
    return (
      <div style={{padding:"24px 0"}}>
        <div style={{fontSize:36,textAlign:"center",marginBottom:12}}>🧶</div>
        <div style={{fontFamily:T.serif,fontSize:17,color:T.ink,textAlign:"center",marginBottom:6}}>
          {isHiccup?"Bev got a little tangled":"This one stumped us"}
        </div>
        <div style={{fontSize:13,color:T.ink2,textAlign:"center",lineHeight:1.7,marginBottom:20}}>
          {isHiccup
            ?"The server hiccuped mid-import. It happens! Give it another go — it usually works on the second try."
            :(fileInfo?"We saved your file. Tap below to start building — your PDF will be right there as you go.":"We had trouble reading this pattern. Try another file or enter your rows manually.")}
        </div>
        {isHiccup&&<div style={{marginBottom:8}}><Btn onClick={handleRetry}>Try again →</Btn></div>}
        {!isHiccup&&fileInfo&&(
          <div style={{background:T.sageLt,borderRadius:14,padding:"16px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:20}}>📎</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:T.sage,marginBottom:2}}>Pattern saved with file attached</div>
              <div style={{fontSize:12,color:T.ink2}}>You can view it anytime while building your rows</div>
            </div>
          </div>
        )}
        {!isHiccup&&fileInfo&&<Btn onClick={handleFallbackSave}>Start building — view PDF as I go</Btn>}
        <div style={{marginTop:8}}><Btn variant="ghost" onClick={()=>{setStage("pick");setProgress(0);setErrorMsg("");setErrorType("");setComplexity(null);setComplexityStats(null);setAutoRetried(false);}}>Try a different file</Btn></div>
      </div>
    );
  }
  const totalRows=(extracted?.components||[]).reduce((s,c)=>(s+(c.rows||[]).length),0);
  const heroImg=coverUrl||fileInfo?.coverUrl||null;
  const matList=(extracted?.materials||[]);
  const matSummary=matList.length>3?matList.slice(0,2).map(m=>m.name).join(", ")+" +"+( matList.length-2)+" more":matList.map(m=>m.name).join(", ");
  return (
    <div style={{paddingBottom:8,background:"#FFFFFF",margin:"-0px -22px -40px",padding:"0 22px 40px"}}>
      <input ref={coverFileRef} type="file" accept="image/*" onChange={async(e)=>{
        const f=e.target.files?.[0];if(!f)return;setCoverUploading(true);
        const fd=new FormData();fd.append("file",f);fd.append("upload_preset","yarnhive_patterns");fd.append("transformation","c_fill,g_auto,ar_16:9");
        try{const res=await fetch("https://api.cloudinary.com/v1_1/dmaupzhcx/image/upload",{method:"POST",body:fd});if(res.ok){const d=await res.json();setCoverUrl(d.secure_url);}}catch{}
        setCoverUploading(false);
      }} style={{display:"none"}}/>
      {/* ── HERO ZONE ── */}
      <div style={{position:"relative",height:200,margin:"0 -22px",overflow:"hidden",background:"#2E2748"}}>
        {heroImg&&<><img src={heroImg} alt="" style={{position:"absolute",width:"100%",height:"100%",objectFit:"cover",filter:"blur(20px) saturate(1.2) brightness(0.6)",transform:"scale(1.1)",pointerEvents:"none"}}/>
        <img src={heroImg} alt={editTitle} style={{position:"absolute",left:"50%",transform:"translateX(-50%)",height:"100%",width:"auto",objectFit:"contain",zIndex:1}}/></>}
        {!heroImg&&<div style={{position:"absolute",inset:0,background:`linear-gradient(135deg,${T.terra},#6B2A10)`}}/>}
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(20,14,10,.85) 0%,rgba(20,14,10,.15) 60%)",zIndex:2}}/>
        <div style={{position:"absolute",bottom:16,left:22,right:80,zIndex:3}}>
          <div style={{fontFamily:T.serif,fontSize:22,fontWeight:700,color:"#fff",lineHeight:1.15,textShadow:"0 2px 8px rgba(0,0,0,.4)",marginBottom:4}}>{editTitle||"Untitled Pattern"}</div>
          {editDesigner&&<div style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>{editDesigner}</div>}
        </div>
        <button onClick={handleSave} style={{position:"absolute",top:14,right:22,zIndex:3,background:"rgba(255,255,255,.2)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.25)",borderRadius:99,padding:"7px 16px",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Looks good ✓</button>
        <button onClick={()=>coverFileRef.current?.click()} style={{position:"absolute",top:14,left:22,zIndex:3,background:"rgba(255,255,255,.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.2)",borderRadius:99,padding:"5px 12px",color:"rgba(255,255,255,.8)",fontSize:11,cursor:"pointer"}}>📷 Change Cover</button>
      </div>
      {/* ── CONTENT ZONE: two columns ── */}
      <div style={{display:"flex",gap:24,marginTop:20}}>
        {/* LEFT 58% */}
        <div style={{flex:"0 0 58%",minWidth:0}}>
          {/* Ghost input fields */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:T.ink3,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Pattern Title</div>
            <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} placeholder="Pattern name" style={{width:"100%",padding:"6px 0",border:"none",borderBottom:"1px solid transparent",background:"transparent",fontSize:16,fontWeight:600,fontFamily:T.serif,color:T.ink,outline:"none"}} onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor="transparent"}/>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:9,color:T.ink3,textTransform:"uppercase",letterSpacing:".1em",marginBottom:4}}>Designer</div>
            <input value={editDesigner} onChange={e=>setEditDesigner(e.target.value)} placeholder="Designer name" style={{width:"100%",padding:"6px 0",border:"none",borderBottom:"1px solid transparent",background:"transparent",fontSize:13,color:T.ink2,outline:"none"}} onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor="transparent"}/>
          </div>
          {/* Pill badges */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            {editHook&&<span style={{background:T.terraLt,color:T.terra,borderRadius:99,padding:"4px 10px",fontSize:10,fontWeight:600}}>Hook {editHook}</span>}
            {editWeight&&<span style={{background:T.sageLt,color:T.sage,borderRadius:99,padding:"4px 10px",fontSize:10,fontWeight:600}}>{editWeight}</span>}
            {totalRows>0&&<span style={{background:T.linen,color:T.ink2,borderRadius:99,padding:"4px 10px",fontSize:10,fontWeight:500}}>{totalRows} rows</span>}
          </div>
          {/* Materials — collapsible single line */}
          {matList.length>0&&<div style={{marginBottom:16}}>
            <div style={{fontSize:9,color:T.ink3,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6}}>Materials</div>
            {matExpanded?<div>{matList.map((m,i)=><div key={i} style={{fontSize:12,color:T.ink2,padding:"3px 0"}}>{m.name}{m.amount?" — "+m.amount:""}</div>)}<button onClick={()=>setMatExpanded(false)} style={{background:"none",border:"none",color:T.terra,fontSize:11,cursor:"pointer",padding:0,marginTop:4}}>Show less</button></div>
            :<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,color:T.ink2,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{matSummary}</span>{matList.length>3&&<button onClick={()=>setMatExpanded(true)} style={{background:"none",border:"none",color:T.terra,fontSize:11,cursor:"pointer",padding:0,flexShrink:0}}>Show all</button>}</div>}
          </div>}
          {/* Components — accordion */}
          {(extracted?.components||[]).length>0&&<div style={{marginBottom:16}}>
            <div style={{fontSize:9,color:T.ink3,textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Components ({extracted.components.length})</div>
            {extracted.components.map((c,i)=>{const open=!!compExpanded[i];return(
              <div key={i} style={{marginBottom:6}}>
                <button onClick={()=>setCompExpanded(p=>({...p,[i]:!open}))} style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:open?"10px 10px 0 0":10,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,textAlign:"left"}}>
                  <span style={{fontSize:13,fontWeight:600,color:T.ink,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}{c.make_count>1?" × "+c.make_count:""}</span>
                  <span style={{fontSize:11,color:T.ink3,flexShrink:0,minWidth:80,textAlign:"right",whiteSpace:"nowrap"}}>{(c.rows||[]).length} rows {open?"▼":"▶"}</span>
                </button>
                {open&&<div style={{border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:"8px 14px",background:T.linen}}>
                  {(c.rows||[]).slice(0,5).map((r,j)=><div key={j} style={{fontSize:11,color:T.ink2,lineHeight:1.5,padding:"2px 0"}}>{r.label}: {r.text?.substring(0,60)}{r.text?.length>60?"…":""}</div>)}
                  {(c.rows||[]).length>5&&<div style={{fontSize:10,color:T.ink3,marginTop:4}}>+{(c.rows||[]).length-5} more</div>}
                </div>}
              </div>
            );})}
          </div>}
        </div>
        {/* RIGHT 42% — BevCheck */}
        <div style={{flex:"0 0 42%",minWidth:0}}>
          {validating?(
            <div style={{background:T.card,borderRadius:16,padding:"36px 20px",boxShadow:T.shadowLg,display:"flex",flexDirection:"column",alignItems:"center",gap:16,animation:"scCardPulse 2s ease-in-out infinite"}}>
              <style>{`@keyframes scCardPulse{0%,100%{opacity:1}50%{opacity:.85}}@keyframes scRingSpin{0%{stroke-dashoffset:${Math.round(2*Math.PI*36)}}50%{stroke-dashoffset:0}100%{stroke-dashoffset:${Math.round(2*Math.PI*36)}}}`}</style>
              <div style={{position:"relative",width:80,height:80}}>
                <svg width="80" height="80" viewBox="0 0 80 80" style={{transform:"rotate(-90deg)"}}>
                  <circle cx="40" cy="40" r="36" fill="none" stroke={T.linen} strokeWidth="4"/>
                  <circle cx="40" cy="40" r="36" fill="none" stroke={T.terra} strokeWidth="4" strokeLinecap="round" strokeDasharray={Math.round(2*Math.PI*36)} style={{animation:"scRingSpin 2.5s ease-in-out infinite"}}/>
                </svg>
                <img src="/bev_neutral.png" alt="Bev" style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:44,height:44,objectFit:"contain"}}/>
              </div>
              <div style={{fontSize:15,fontWeight:600,color:T.ink}}>Analyzing your pattern</div>
              <div style={{fontSize:12,color:T.sage,textAlign:"center",maxWidth:200,lineHeight:1.5}}>Checking stitch counts, round sequence and math errors before you start crocheting.</div>
            </div>
          ):bevCheckFailed?(
            <div style={{background:T.surface,borderRadius:16,padding:20,boxShadow:"0 4px 20px rgba(123,106,212,.08)",border:`1px solid ${T.border}`,textAlign:"center"}}>
              <div style={{fontSize:11,color:"#726A92",marginBottom:10}}>Bev couldn't check this one — try again</div>
              <button onClick={()=>{setBevCheckFailed(false);setValidating(true);const valText=bevCheckTextRef.current;if(!valText){setBevCheckFailed(true);setValidating(false);return;}(async()=>{try{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),90000);const vr=await fetch("/api/extract-pattern",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"bevcheck",patternText:valText}),signal:controller.signal});clearTimeout(timeout);const data=await vr.json();if(vr.ok&&!data.error){setValidationReport(data);}else{setBevCheckFailed(true);}}catch(e){console.warn("[Wovely] BevCheck retry failed:",e);setBevCheckFailed(true);}setValidating(false);})();}} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"6px 16px",fontSize:11,fontWeight:600,cursor:"pointer"}}>Retry BevCheck</button>
            </div>
          ):validationReport?(()=>{const scState=deriveState(validationReport);const allChecks=Array.isArray(validationReport.checks)?validationReport.checks:[];const scFailed=allChecks.filter(c=>c&&c.status&&c.status!=="pass").slice(0,3);
            // hasIssues drives the pill button's outline-vs-filled styling
            // (flagged reports get the outlined "look here" treatment).
            // Save lives only on the bottom modal CTA now — the BevCheck
            // pill button just opens the full report.
            const hasIssues=allChecks.some(c=>c&&(c.status==="fail"||c.status==="warning"||c.status==="warn"));
            return isPro?(
            <div style={{background:T.surface,borderRadius:16,padding:20,boxShadow:"0 4px 20px rgba(123,106,212,.08)",border:`1px solid ${T.border}`,textAlign:"center"}}>
              <BevGauge variant="compact" state={scState} />
              {scFailed.length>0&&<div style={{textAlign:"left",marginTop:8}}>{scFailed.map((c,i)=>(<div key={c.id||i} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:4}}><span style={{fontSize:11,color:c.status==="fail"?"#C0544A":"#C9A84C",flexShrink:0}}>{c.status==="fail"?"✕":"⚠"}</span><span style={{fontSize:11,color:"#726A92"}}>{sentenceCase(c.label||"Check")}</span></div>))}</div>}
              <button onClick={()=>setShowFullReport(true)} style={{marginTop:14,width:"100%",background:hasIssues?"#fff":T.terra,color:hasIssues?T.terra:"#fff",border:hasIssues?`1.5px solid ${T.terra}`:"none",borderRadius:99,padding:"12px",fontSize:13,fontWeight:600,cursor:"pointer",boxShadow:hasIssues?"none":"0 4px 16px rgba(123,106,212,.3)"}}>Full Report →</button>
            </div>
          ):(
            <div style={{background:T.surface,borderRadius:16,padding:20,boxShadow:"0 4px 20px rgba(123,106,212,.08)",border:`1px solid ${T.border}`,textAlign:"center"}}>
              <div style={{filter:"blur(6px)",WebkitFilter:"blur(6px)",userSelect:"none",pointerEvents:"none"}}>
                <BevGauge variant="compact" state={scState} />
              </div>
              <div style={{borderTop:`1px solid ${T.border}`,marginTop:8,paddingTop:8}}>
                <div style={{fontSize:10,color:T.ink3,marginBottom:6}}>🔒 Unlock full report</div>
                <button onClick={()=>onUpgrade&&onUpgrade()} style={{background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"6px 16px",fontSize:10,fontWeight:600,cursor:"pointer"}}>Upgrade to Craft</button>
              </div>
            </div>
          );})():(
            <div style={{background:T.surface,borderRadius:16,padding:20,boxShadow:"0 4px 20px rgba(123,106,212,.08)",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",minHeight:120,fontSize:11,color:T.ink3}}>BevCheck unavailable</div>
          )}
        </div>
      </div>
      {/* Full report overlay */}
      {showFullReport&&validationReport&&(
        <div style={{position:"fixed",inset:0,zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={()=>setShowFullReport(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)"}}/>
          <div style={{position:"relative",zIndex:1,background:"#FFFFFF",borderRadius:20,width:"100%",maxWidth:480,maxHeight:"85vh",overflow:"auto",padding:"24px 22px 32px"}}>
            <button onClick={()=>setShowFullReport(false)} style={{position:"absolute",top:14,right:16,background:T.linen,border:"none",borderRadius:99,width:30,height:30,cursor:"pointer",fontSize:16,color:T.ink3,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            <div style={{marginBottom:14}}><BevGauge
              variant="hero"
              score={typeof validationReport.score === "number" ? validationReport.score : undefined}
              state={typeof validationReport.score === "number" ? undefined : deriveState(validationReport)}
              issueCount={(validationReport.checks || []).filter(c => c.status === "fail" || c.status === "warning" || c.status === "warn").length}
            /></div>
            {(()=>{const allChecks=validationReport.checks||[];const coreC=allChecks.filter(c=>checkTier(c)==="core");const advC=allChecks.filter(c=>checkTier(c)==="advisory");const renderC=(c,op)=>{const isIssue=c.status==="fail"||c.status==="warning"||c.status==="warn";const checkRowNum=isIssue?extractFirstRowNumber(c.detail):null;return(
              <div key={c.id} onClick={isIssue?()=>{setShowFullReport(false);const rows=buildRowsFromComponents(extracted.components);const mats=(extracted.materials||[]).map((m,i)=>({id:i+1,name:m.name||"",amount:m.amount||"",yardage:0,notes:m.notes||""}));const finalCover=coverUrl||fileInfo?.coverUrl||null;onSave({id:Date.now(),title:editTitle||"Imported Pattern",source:editDesigner||"PDF Import",cat:"Uncategorized",hook:editHook||"",weight:editWeight||"",notes:"",pattern_notes:extracted.pattern_notes||"",yardage:0,rating:0,skeins:0,skeinYards:200,gauge:{stitches:12,rows:16,size:4},dimensions:{width:50,height:60},materials:mats,rows,photo:finalCover||PILL[Math.floor(Math.random()*PILL.length)],cover_image_url:finalCover,source_file_url:fileInfo?.url||"",source_file_name:fileInfo?.name||"",source_file_type:fileInfo?.type||"",extracted_by_ai:true,components:extracted.components||[],assembly_notes:extracted.assembly_notes||"",difficulty:extracted.difficulty||"",abbreviations_map:extracted.abbreviations_map||{},suggested_resources:extracted.suggested_resources||[],validation_flags:validationFlags.length>0?validationFlags:null,validation_report:isPro&&validationReport?{...validationReport,flaggedRows:(validationReport.checks||[]).filter(ch=>ch.status==="fail"||ch.status==="warning"||ch.status==="warn").map(ch=>({rowNumber:extractFirstRowNumber(ch.detail),status:ch.status==="warn"?"warning":ch.status})).filter(f=>f.rowNumber!=null).filter((f,idx,arr)=>arr.findIndex(x=>x.rowNumber===f.rowNumber)===idx)}:null,_reviewRowNumber:checkRowNum});}:undefined} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",marginBottom:6,display:"flex",gap:8,alignItems:"flex-start",cursor:isIssue?"pointer":"default",transition:"transform .1s",opacity:op||1}} onMouseEnter={isIssue?e=>{e.currentTarget.style.transform="translateY(-1px)";}:undefined} onMouseLeave={isIssue?e=>{e.currentTarget.style.transform="none";}:undefined}>
                <span style={{fontSize:14,flexShrink:0}}>{CHECK_ICON[c.status]||"❓"}</span>
                <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600,color:c.status==="fail"?"#C0544A":(c.status==="warning"||c.status==="warn")?"#C9A84C":T.ink,marginBottom:2}}>{sentenceCase(c.label)}</div><div style={{fontSize:11,color:T.ink2,lineHeight:1.5}}>{c.detail}</div></div>
                {isIssue&&<div style={{fontSize:11,color:"#7B6AD4",fontWeight:600,fontFamily:"'Nunito',sans-serif",flexShrink:0,alignSelf:"center"}}>{checkRowNum?"→ Go to row":"→ Go to rows"}</div>}
              </div>);};return <>{coreC.map(c=>renderC(c))}{advC.length>0&&<><div style={{borderTop:"0.5px solid #ECE6F8",margin:"10px 0"}}/><div style={{fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",color:"#7B6AD4",fontFamily:"'Nunito',sans-serif",marginBottom:8}}>Advisory</div>{advC.map(c=>renderC(c,0.85))}</>}</>;})()}

            {validationReport.summary&&<div style={{background:T.linen,borderRadius:12,padding:"12px 14px",marginTop:10,border:`1px solid ${T.border}`}}><div style={{fontSize:11,fontWeight:700,color:T.terra,marginBottom:4}}>Bev says:</div><div style={{fontSize:12,color:T.ink2,lineHeight:1.6}}>{validationReport.summary}</div></div>}
            {(()=>{const checks=validationReport.checks||[];const hasIssues=checks.some(c=>c.status==="fail"||c.status==="warning"||c.status==="warn");if(!hasIssues) return <button onClick={()=>{setShowFullReport(false);handleSave();}} style={{marginTop:14,width:"100%",background:T.terra,color:"#fff",border:"none",borderRadius:99,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(123,106,212,.3)"}}>Import Now</button>;const firstIssue=checks.find(c=>c.status==="fail"||c.status==="warning"||c.status==="warn");const rowNum=firstIssue?extractFirstRowNumber(firstIssue.detail):null;return <div style={{marginTop:14,display:"flex",gap:10}}><button onClick={()=>{setShowFullReport(false);handleSave();}} style={{flex:1,background:"#fff",color:T.terra,border:`1.5px solid ${T.terra}`,borderRadius:99,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer",minHeight:44}}>Import Now</button><button onClick={()=>{setShowFullReport(false);const rows=buildRowsFromComponents(extracted.components);const mats=(extracted.materials||[]).map((m,i)=>({id:i+1,name:m.name||"",amount:m.amount||"",yardage:0,notes:m.notes||""}));const finalCover=coverUrl||fileInfo?.coverUrl||null;onSave({id:Date.now(),title:editTitle||"Imported Pattern",source:editDesigner||"PDF Import",cat:"Uncategorized",hook:editHook||"",weight:editWeight||"",notes:"",pattern_notes:extracted.pattern_notes||"",yardage:0,rating:0,skeins:0,skeinYards:200,gauge:{stitches:12,rows:16,size:4},dimensions:{width:50,height:60},materials:mats,rows,photo:finalCover||PILL[Math.floor(Math.random()*PILL.length)],cover_image_url:finalCover,source_file_url:fileInfo?.url||"",source_file_name:fileInfo?.name||"",source_file_type:fileInfo?.type||"",extracted_by_ai:true,components:extracted.components||[],assembly_notes:extracted.assembly_notes||"",difficulty:extracted.difficulty||"",abbreviations_map:extracted.abbreviations_map||{},suggested_resources:extracted.suggested_resources||[],validation_flags:validationFlags.length>0?validationFlags:null,validation_report:isPro&&validationReport?{...validationReport,flaggedRows:(validationReport.checks||[]).filter(ch=>ch.status==="fail"||ch.status==="warning"||ch.status==="warn").map(ch=>({rowNumber:extractFirstRowNumber(ch.detail),status:ch.status==="warn"?"warning":ch.status})).filter(f=>f.rowNumber!=null).filter((f,idx,arr)=>arr.findIndex(x=>x.rowNumber===f.rowNumber)===idx)}:null,_reviewRowNumber:rowNum});}} style={{flex:1,background:"#7B6AD4",color:"#fff",border:"none",borderRadius:99,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer",boxShadow:"0 4px 16px rgba(123,106,212,.3)",minHeight:44}}>Review Issue →</button></div>;})()}
          </div>
        </div>
      )}
      {/* Section spacing */}
      <div style={{height:20}}/>
      {/* Accept/Save — full width terracotta */}
      <button onClick={handleSave} style={{width:"100%",background:`linear-gradient(135deg,${T.terra},#7B5FB5)`,color:"#fff",border:"none",borderRadius:99,padding:"15px",fontSize:15,fontWeight:600,cursor:"pointer",boxShadow:"0 8px 28px rgba(123,106,212,.5)",marginBottom:8}}>Looks good — save pattern</button>
      <button onClick={()=>{setStage("pick");setProgress(0);setExtracted(null);}} style={{width:"100%",background:"transparent",color:T.ink3,border:"none",borderRadius:99,padding:"10px",fontSize:13,cursor:"pointer"}}>Try a different file</button>
    </div>
  );
};

const BrowserImport = ({onSave,Btn,Photo}) => {
  const [active,setActive]=useState(null),[saving,setSaving]=useState(false);
  const SITES=[{name:"AllFreeCrochet",desc:"Thousands of free patterns",photo:PILL[4],note:"Full extraction supported"},{name:"Drops Design",desc:"Free international patterns",photo:PILL[0],note:"Full extraction supported"},{name:"Yarnspirations",desc:"Caron & Bernat free patterns",photo:PILL[3],note:"Most patterns extractable"},{name:"Sarah Maker",desc:"Modern beginner patterns",photo:PILL[2],note:"Full extraction supported"},{name:"Hopeful Honey",desc:"Whimsical amigurumi",photo:PILL[5],note:"Full extraction supported"},{name:"Ravelry",desc:"Requires login in-browser",photo:PILL[1],note:"Browse then copy URL to import"}];
  const doSave=(s)=>{setSaving(true);setTimeout(()=>{onSave({id:Date.now(),photo:s.photo,title:"Pattern from "+s.name,source:s.name,cat:"Uncategorized",hook:"",weight:"",rating:0,notes:"",materials:[],rows:[],yardage:0,skeins:0,skeinYards:200,gauge:{stitches:12,rows:16,size:4},dimensions:{width:50,height:60}});setSaving(false);setActive(null);},900);};
  if(active) return (
    <div style={{paddingBottom:8}}>
      <button onClick={()=>setActive(null)} style={{background:"none",border:"none",color:T.terra,cursor:"pointer",fontSize:14,fontWeight:600,marginBottom:14,padding:0}}>← All sites</button>
      <div style={{background:T.linen,borderRadius:16,overflow:"hidden",border:`1px solid ${T.border}`,marginBottom:14}}>
        <div style={{height:130,position:"relative"}}><Photo src={active.photo} alt={active.name} style={{width:"100%",height:"100%"}}/><div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(15,10,8,.6) 0%,transparent 50%)"}}/>
          <div style={{position:"absolute",bottom:14,left:16}}><div style={{fontFamily:T.serif,fontSize:20,color:"#fff",fontWeight:700}}>{active.name}</div></div>
        </div>
        <div style={{padding:"16px"}}>
          <div style={{background:T.sageLt,borderRadius:8,padding:"8px 12px",marginBottom:12,display:"flex",gap:8}}><span>ℹ️</span><span style={{fontSize:12,color:T.sage}}>{active.note}</span></div>
          <div style={{fontSize:13,color:T.ink2,lineHeight:1.7,marginBottom:14}}>In the full version, an in-app browser opens {active.name} directly. Browse and tap Save — we handle the rest.</div>
          <Btn onClick={()=>doSave(active)} disabled={saving}>{saving?"Saving…":"Save from "+active.name}</Btn>
        </div>
      </div>
    </div>
  );
  return (
    <div style={{paddingBottom:8}}>
      <div style={{fontSize:13,color:T.ink2,lineHeight:1.7,marginBottom:14}}>Browse curated pattern sites in-app. Find a pattern and tap Save.</div>
      <div style={{borderRadius:16,overflow:"hidden",border:`1px solid ${T.border}`}}>
        {SITES.map((s,i)=>(
          <div key={s.name} className="site-row" onClick={()=>setActive(s)} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 16px",background:T.surface,borderTop:i>0?`1px solid ${T.border}`:"none",cursor:"pointer",transition:"background .12s"}}>
            <div style={{width:44,height:44,borderRadius:10,overflow:"hidden",flexShrink:0}}><Photo src={s.photo} alt={s.name} style={{width:"100%",height:"100%"}}/></div>
            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500,color:T.ink,marginBottom:1}}>{s.name}</div><div style={{fontSize:12,color:T.ink3}}>{s.desc}</div></div>
            <span style={{color:T.ink3,fontSize:20}}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const AddPatternModal = ({onClose,onSave,isPro,patternCount,Btn,Photo,Bar,WireframeViewer,onUpgrade,initialMethod,initialUrl,initialExtracted,initialCoverUrl,initialFileUrl,initialValidationReport,initialPollingJobId,isCollectionImport=false,initialIsStarter=false}) => {
  // initialExtracted (from ImportPill queue completion) is wrapped into pdfHandoff
  // so PDFUploadForm lands directly on its review stage. initialCoverUrl is the
  // Cloudinary URL the client rendered & uploaded during the original upload
  // step, threaded back through import_jobs.cover_image_url so the cover
  // survives the modal-close → queue → pill → re-open round trip.
  // initialPollingJobId (S1.5.3) is set when the pill re-opens this modal
  // *during* processing — PDFUploadForm mounts directly into the extracting
  // stage with that job_id so polling resumes seamlessly.
  // On a pill→modal resume the original upload's fileInfo is gone, but the
  // import_job carries file_url. Rehydrate fileInfo from it so the saved
  // pattern keeps its source_file_url (needed for "View Source" AND for Bev's
  // image extraction, which is skipped when source_file_url is missing).
  const initialFileInfo = initialFileUrl
    ? { url: initialFileUrl, name: (initialFileUrl.split("/").pop() || "pattern.pdf"), type: "application/pdf", coverUrl: initialCoverUrl || null }
    : null;
  const initialHandoff = initialExtracted ? { extracted: initialExtracted, pdfText: "", fileInfo: initialFileInfo, coverUrl: initialCoverUrl || null } : null;
  const [method,setMethod]=useState((initialExtracted||initialPollingJobId)?"pdf":(initialMethod||null)),[closing,setClosing]=useState(false);
  const [pdfHandoff,setPdfHandoff]=useState(initialHandoff);
  const extractingRef=useRef(false);
  const bevCheckActiveRef=useRef(false);
  // True once a child form is showing an extracted/preview review state.
  // Backdrop click is blocked in that state — accidental click-outside would
  // strand the user with no in-UI path back to data that's already saved on
  // the import_jobs row (the pill self-dismisses when its tap opens review,
  // so it isn't a fallback re-open surface).
  const reviewActiveRef=useRef(!!initialExtracted);
  // Mirror the ref into state so render reacts to review-active changes —
  // refs alone don't trigger a re-render, so the X-button label wouldn't flip
  // from "×" to "Discard" without this.
  const [reviewActiveTick,setReviewActiveTick]=useState(!!initialExtracted);
  const{isDesktop}=useBreakpoint();
  const dismiss=()=>{setClosing(true);setTimeout(()=>{setClosing(false);onClose();},220);};
  // Backdrop click during loading state → dismiss. The unmount handler in
  // PDFUploadForm writes pollingJobIdRef → ImportPill via setActiveImportJob,
  // so the pill takes over without any extra wiring here. Review/BevCheck
  // states still block accidental dismissal.
  const backdropClick=()=>{if(bevCheckActiveRef.current||reviewActiveRef.current)return;dismiss();};
  // X-button discard confirm (S66). When the modal is showing review/BevCheck
  // content, a single tap on the dismiss X would lose access to the extracted
  // data even though the import_jobs row is still completed. Gate with an
  // explicit confirm.
  const [discardConfirmOpen,setDiscardConfirmOpen]=useState(false);
  const [bevCheckActiveTick,setBevCheckActiveTick]=useState(false);
  const hasRecoverableData=reviewActiveTick||bevCheckActiveTick;
  const requestDismiss=()=>{if(hasRecoverableData){setDiscardConfirmOpen(true);}else{dismiss();}};
  const handleSave=(p)=>{onSave(p);dismiss();};
  // 2b .impcard method cards (Wovely App 2b.dc.html import screen) — woven
  // SVG icons in soft-lavender squares, replacing the old emoji tiles.
  const IMP_ICON={
    manual:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 19.5l1-4L16.7 4.3a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L8.5 18.5z"/><path d="M14.5 6.5l3 3"/></svg>,
    url:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13.5a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1.2 1.2"/><path d="M14 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.2-1.2"/></svg>,
    pdf:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 3.5H7A1.5 1.5 0 005.5 5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8.5z"/><path d="M13.5 3.5v5h5"/><path d="M9 13h6M9 16.5h6"/></svg>,
    browser:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5z"/></svg>,
  };
  const METHODS=[
    {key:"manual",label:"Write it yourself",sub:"Type it in yourself"},
    {key:"url",label:"Paste a link",sub:"Paste any pattern link"},
    {key:"pdf",label:"Upload a file",sub:"Upload & extract"},
    {key:"browser",label:"Explore free patterns",sub:"AllFreeCrochet, Drops & more"},
  ];
  const MethodList=()=>(
    <>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        {METHODS.map(m=>(
          <div key={m.key} onClick={()=>setMethod(m.key)} style={{display:"flex",flexDirection:"column",gap:12,background:"#fff",border:`1.5px solid ${T.line}`,borderRadius:18,padding:"18px 18px 19px",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 16px 30px -20px rgba(90,66,160,.5)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.line;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
            <div style={{width:44,height:44,borderRadius:13,background:T.soft,color:T.accent,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{IMP_ICON[m.key]}</div>
            <div>
              <div style={{fontFamily:T.disp,fontWeight:600,fontSize:16,color:T.ink,marginBottom:3,lineHeight:1.15}}>{m.label}</div>
              <div style={{fontSize:12.5,fontWeight:700,color:T.muted,lineHeight:1.45}}>{m.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{background:`linear-gradient(135deg,${T.accent},${T.pink})`,borderRadius:18,padding:20,cursor:"not-allowed",position:"relative",overflow:"hidden",opacity:.45}}>
        <div style={{position:"absolute",top:10,right:12,background:"rgba(255,255,255,.25)",borderRadius:99,padding:"3px 10px",fontSize:10,fontWeight:800,color:"#fff"}}>Soon</div>
        <div style={{width:44,height:44,borderRadius:13,background:"rgba(255,255,255,.2)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 8.5A1.5 1.5 0 016 7h2l1.4-2h5.2L16 7h2a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0118 19H6a1.5 1.5 0 01-1.5-1.5z"/><circle cx="12" cy="13" r="3.4"/></svg>
        </div>
        <div style={{fontFamily:T.disp,fontWeight:600,fontSize:17,color:"#fff",marginBottom:4}}>Snap & Stitch — Point. Click. Stitch.</div>
        <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.85)",lineHeight:1.5}}>Photograph any finished object. Get the complete pattern instantly.</div>
      </div>
    </>
  );
  // ── STYLES ──
  // Single modal shape on each viewport. The medium "Expand" pill was removed
  // in S1.5.3 — the small ImportPill is now the only minimized surface, and
  // closing the modal mid-import hands off to it via the unmount cleanup.
  // Modal container — capped at 520px so it doesn't sprawl on wide
  // viewports. Padding lives on the header + content blocks (24px sides,
  // 16px from top edge to the back link, 24px bottom on content) so the
  // whole modal reads as 24px-inset content.
  const deskStyle = {position:"relative",background:T.surface,borderRadius:16,width:"calc(100% - 48px)",maxWidth:520,maxHeight:"85vh",display:"flex",flexDirection:"column",zIndex:1,boxShadow:"0 24px 64px rgba(28,23,20,.3)"};
  const mobStyle = {position:"relative",background:T.surface,borderRadius:"24px 24px 0 0",width:"100%",maxHeight:"92vh",display:"flex",flexDirection:"column",zIndex:1};
  const containerStyle = isDesktop ? deskStyle : mobStyle;
  const pad = isDesktop ? "0 24px 24px" : "0 22px 40px";
  const wrapStyle = isDesktop
    ? {position:"fixed",inset:0,zIndex:400,display:"flex",alignItems:"center",justifyContent:"center"}
    : {position:"fixed",inset:0,zIndex:400,display:"flex",alignItems:"flex-end"};
  const animClass = isDesktop ? (closing?"":"fu") : (closing?"":"su");

  // ── HEADER ──
  const deskHeader = (
    <div style={{flexShrink:0,padding:"16px 24px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        {method?<button onClick={()=>{setPdfHandoff(null);setMethod(null);}} style={{background:"none",border:"none",color:T.terra,cursor:"pointer",fontSize:14,fontWeight:600,padding:0}}>← Back</button>:<div style={{fontFamily:T.serif,fontSize:22,color:T.ink}}>What are you adding to your Wovely?</div>}
      </div>
      {method&&<div style={{fontSize:12,color:T.ink3,marginBottom:14,fontWeight:500}}>{METHODS.find(m=>m.key===method)?.icon} {METHODS.find(m=>m.key===method)?.label}</div>}
    </div>
  );
  const mobHeader = (
    <div style={{flexShrink:0,padding:"16px 22px 0"}}>
      <div style={{width:36,height:3,background:T.border,borderRadius:99,margin:"0 auto 18px"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        {method?<button onClick={()=>{setPdfHandoff(null);setMethod(null);}} style={{background:"none",border:"none",color:T.terra,cursor:"pointer",fontSize:14,fontWeight:600,padding:0}}>← Back</button>:<div style={{fontFamily:T.serif,fontSize:22,color:T.ink}}>Add Pattern</div>}
      </div>
      {method&&<div style={{fontSize:12,color:T.ink3,marginBottom:12,fontWeight:500}}>{METHODS.find(m=>m.key===method)?.icon} {METHODS.find(m=>m.key===method)?.label}</div>}
    </div>
  );
  const header = isDesktop ? deskHeader : mobHeader;
  // requestDismiss is still used by the review-state X (PDFUploadForm passes
  // it via onClose). hasRecoverableData controls the Discard-vs-X label.
  void requestDismiss; void hasRecoverableData;

  // ── CONTENT (single instance, never remounts) ──
  const content = (
    <div style={{flex:1,overflowY:"auto",padding:pad}}>
      {!method&&<MethodList/>}
      {method==="manual"&&<ManualEntryForm onSave={handleSave} Btn={Btn}/>}
      {method==="url"&&<URLImportForm onSave={handleSave} Btn={Btn} Photo={Photo} initialUrl={initialUrl} onExtractionStart={()=>{extractingRef.current=true;}} onExtractionEnd={()=>{extractingRef.current=false;}} onBevCheckActive={(v)=>{bevCheckActiveRef.current=v;setBevCheckActiveTick(v);}} onReviewActive={(v)=>{reviewActiveRef.current=v;setReviewActiveTick(v);}} onPdfHandoff={(handoffData)=>{setPdfHandoff(handoffData);setMethod('pdf');}}/>}
      {method==="pdf"&&<PDFUploadForm onSave={handleSave} onClose={dismiss} Btn={Btn} isPro={isPro} onUpgrade={()=>{if(onUpgrade){dismiss();onUpgrade();}}} onExtractionStart={()=>{extractingRef.current=true;}} onExtractionEnd={()=>{extractingRef.current=false;}} onBevCheckActive={(v)=>{bevCheckActiveRef.current=v;setBevCheckActiveTick(v);}} onReviewActive={(v)=>{reviewActiveRef.current=v;setReviewActiveTick(v);}} initialExtracted={pdfHandoff} initialValidationReport={initialValidationReport} initialPollingJobId={initialPollingJobId} isCollectionImport={isCollectionImport} isStarterImport={initialIsStarter}/>}
      {method==="browser"&&<BrowserImport onSave={handleSave} Btn={Btn} Photo={Photo}/>}
      {method==="snap"&&<HiveVisionForm onSave={handleSave} Btn={Btn} Bar={Bar} WireframeViewer={WireframeViewer}/>}
    </div>
  );

  // ── SINGLE RETURN — no early exits, no remounts ──
  return (
    <>
      <div style={wrapStyle}>
        <div className={closing?"dim-out":"dim-in"} onClick={backdropClick} style={{position:"absolute",inset:0,background:"rgba(28,23,20,.6)",backdropFilter:"blur(4px)"}}/>
        <div className={animClass} style={containerStyle} onClick={e=>e.stopPropagation()}>
          {header}{content}
        </div>
      </div>

      {discardConfirmOpen && (
        <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={()=>setDiscardConfirmOpen(false)} style={{position:"absolute",inset:0,background:"rgba(28,23,20,.65)",backdropFilter:"blur(4px)"}}/>
          <div style={{position:"relative",zIndex:1,background:"#FFFFFF",borderRadius:16,maxWidth:360,width:"100%",padding:"24px 22px",boxShadow:"0 24px 64px rgba(28,23,20,.3)",fontFamily:T.sans}}>
            <div style={{fontFamily:T.serif,fontSize:18,fontWeight:700,color:T.ink,marginBottom:8}}>Discard this import?</div>
            <div style={{fontSize:13,color:T.ink2,lineHeight:1.6,marginBottom:18}}>Bev's work won't be saved.</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setDiscardConfirmOpen(false)} style={{flex:1,background:T.linen,color:T.ink,border:"none",borderRadius:99,padding:"11px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Keep working</button>
              <button onClick={()=>{setDiscardConfirmOpen(false);dismiss();}} style={{flex:1,background:"#C0544A",color:"#fff",border:"none",borderRadius:99,padding:"11px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export { uploadPatternFile, buildRowsFromComponents };
export default AddPatternModal;
