// Hybrid pattern seeding.
//
//   pro-loaded / craft-loaded  → REAL upload pipeline. We run the app's exact
//       pdf.js text extraction inside a Chromium page, then call the same
//       endpoints the app calls (Storage upload → /api/import-job → poll
//       /api/job-status, which runs the live Gemini extraction). The only step
//       not driven through the literal modal UI is the final patterns-row
//       insert, which we replicate faithfully from the App.jsx save payload
//       (columns mapped 1:1). This is far more robust than driving the modal's
//       multi-screen review flow and exercises the identical extraction path.
//
//   free-loaded → DB clone of existing real, extracted patterns (chosen for
//       rich content). The big-PDF gate blocks free-tier real uploads, and a
//       clone of already-extracted content is indistinguishable on screen.
//
//   craft-loaded → additionally gets one chart-bearing pattern cloned in so the
//       chart lightbox always has content (craft is the only tier showing charts).
//
// Patterns persist between runs; seeding is skipped when an account already has
// enough, unless { reseed: true }.

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { env } from "./env.js";
import { BASE_URL, UPLOAD_PDFS, FREE_CLONE_SOURCE_IDS, CRAFT_CHART_SOURCE_ID, resolvePatternsDir } from "../config.js";
import { signIn } from "./session.js";
import {
  countPatterns, deletePatternsForUser, clonePattern, patternIdWithCharts, ensureCollection, firstCollectionId,
} from "./supabase-admin.js";

const PDF_EXTRACT_TIMEOUT_MS = 180_000; // generous: real extraction can take a while
const POLL_INTERVAL_MS = 2_000;

// ─── pdf.js extraction inside Chromium (mirrors AddPatternModal.extractTextFromPDF) ──
async function extractPdfInBrowser(page, filePath) {
  const bytes = fs.readFileSync(filePath);
  const b64 = bytes.toString("base64");
  return page.evaluate(async (b64) => {
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: arr }).promise;
    let metadataTitle = null;
    try {
      const meta = await pdf.getMetadata();
      const raw = meta?.info?.Title;
      if (raw && typeof raw === "string" && raw.trim() && raw.trim().toLowerCase() !== "untitled") {
        metadataTitle = raw.trim();
      }
    } catch {}
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const content = await pg.getTextContent();
      fullText += `\n--- PAGE ${i} ---\n` + content.items.map((it) => it.str).join(" ");
    }
    // Render page 1 → JPEG data URL for the cover (mirrors renderPDFCoverImage).
    let cover = null;
    try {
      const pg = await pdf.getPage(1);
      const viewport = pg.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await pg.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      cover = canvas.toDataURL("image/jpeg", 0.85);
    } catch {}
    return { text: fullText, metadataTitle, cover, pages: pdf.numPages };
  }, b64);
}

async function uploadCoverToCloudinary(dataUrl) {
  if (!dataUrl) return null;
  try {
    const form = new FormData();
    form.append("file", dataUrl);
    form.append("upload_preset", "yarnhive_patterns");
    const res = await fetch("https://api.cloudinary.com/v1_1/dmaupzhcx/auto/upload", { method: "POST", body: form });
    if (!res.ok) return null;
    const data = await res.json();
    return data.secure_url || null;
  } catch { return null; }
}

async function uploadToStorage(accessToken, userId, filePath) {
  const name = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${userId}/${Date.now()}_${name}`;
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/pattern-files/${objectPath}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/pdf" },
    body: fs.readFileSync(filePath),
  });
  if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return `${env.SUPABASE_URL}/storage/v1/object/public/pattern-files/${objectPath}`;
}

async function createImportJob(accessToken, userId, fileUrl, rawText, metaTitle, coverUrl) {
  const res = await fetch(`${BASE_URL}/api/import-job`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      user_id: userId, file_type: "pdf", file_url: fileUrl, raw_text: rawText,
      cover_image_url: coverUrl || null, pdf_metadata_title: metaTitle || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`import-job ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.job_id;
}

async function pollJob(accessToken, jobId, log) {
  const deadline = Date.now() + PDF_EXTRACT_TIMEOUT_MS;
  let lastPhase = "";
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE_URL}/api/job-status/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const job = await res.json();
      const phase = job.current_phase || job.status;
      if (phase && phase !== lastPhase) { log(`      …${phase}`); lastPhase = phase; }
      if (job.status === "completed") return job;
      if (job.status === "failed") throw new Error(`extraction failed: ${job.error_message || "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("extraction timed out");
}

// Flatten extracted components into pattern rows. Exact replica of
// buildRowsFromComponents in src/AddPatternModal.jsx — extraction returns
// `components` (each with its own rows), NOT a flat `rows` array.
export function buildRowsFromComponents(components) {
  const rows = [];
  let rowId = 1;
  (components || []).forEach((comp) => {
    const makeCount = comp.make_count || 1;
    const label = (comp.name || "") + (makeCount > 1 ? ` (MAKE ${makeCount})` : "");
    rows.push({
      id: "header-" + String(comp.name || rowId).toLowerCase().replace(/\s+/g, "-"),
      text: "── " + label.toUpperCase() + " ──",
      isHeader: true, done: false, note: "",
      componentName: comp.name, makeCount, independent: !!comp.independent,
    });
    (comp.rows || []).forEach((r) => {
      const isAction = !!r.action_item;
      const prefix = isAction ? "📌 " : "";
      const labelText = r.label ? r.label + ": " : "";
      const stitchSuffix = r.stitch_count ? " (" + r.stitch_count + ")" : "";
      rows.push({
        id: "row-" + rowId++,
        text: prefix + labelText + r.text + stitchSuffix,
        done: false, note: r.note || "", isAction,
        componentName: comp.name, repeat_brackets: r.repeat_brackets || [],
      });
    });
  });
  return rows;
}

// Map job-status extracted_data → a patterns row (columns + transforms per the
// app's save path in src/App.jsx / AddPatternModal.jsx).
export function buildPatternRow(userId, extracted, file, coverUrl) {
  const title = (extracted.title || file.metaTitle || file.name.replace(/\.pdf$/i, "")).trim();
  const rows = buildRowsFromComponents(extracted.components);
  const materials = (extracted.materials || []).map((m, i) => ({
    id: i + 1, name: m.name || "", amount: m.amount || "", yardage: 0, notes: m.notes || "",
  }));
  const finished = extracted.finished_size;
  const dimensions = finished && typeof finished === "object" && !Array.isArray(finished) ? finished : {};
  return {
    user_id: userId,
    title,
    cat: extracted.category || "Uncategorized",
    source: extracted.designer ? `PDF Import · ${extracted.designer}` : "PDF Import",
    source_url: extracted.source_url || null,
    notes: "",
    pattern_notes: extracted.pattern_notes || extracted.assembly_notes || null,
    difficulty: extracted.difficulty || "",
    yarn_weight: extracted.yarn_weight || "",
    hook_size: extracted.hook_size || "",
    gauge: extracted.gauge && typeof extracted.gauge === "object" ? extracted.gauge : {},
    is_ai_generated: true,
    extracted_by_ai: true,
    import_method: "pdf",
    status: "active",
    is_starter: false,
    cover_image_url: coverUrl || extracted.cover_image_url || null,
    row_count: rows.length,
    materials,
    rows,
    rating: 0,
    yardage: 0,
    skeins: 0,
    skein_yards: 200,
    dimensions,
    weight: extracted.yarn_weight || "",
    hook: extracted.hook_size || "",
    source_file_url: file.fileUrl,
    source_file_name: file.name,
    source_file_type: "application/pdf",
    components: extracted.components || null,
  };
}

async function insertPattern(row) {
  const key = env.SERVICE_ROLE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/patterns`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`patterns insert ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (Array.isArray(data) ? data[0] : data)?.id;
}

// Real upload pipeline for one PDF.
async function uploadOnePdf(page, account, filePath, log) {
  const name = path.basename(filePath);
  log(`    ⬆ ${name}`);
  const { text, metadataTitle, cover } = await extractPdfInBrowser(page, filePath);
  if (!text || text.length < 20) throw new Error("pdf.js returned no text");
  const session = account._session;
  const coverUrl = await uploadCoverToCloudinary(cover);
  const fileUrl = await uploadToStorage(session.access_token, account.userId, filePath);
  const jobId = await createImportJob(session.access_token, account.userId, fileUrl, text, metadataTitle, coverUrl);
  log(`      job ${jobId} queued`);
  const job = await pollJob(session.access_token, jobId, log);
  const extracted = job.extracted_data || {};
  const row = buildPatternRow(account.userId, extracted, { name, fileUrl, metaTitle: metadataTitle }, coverUrl || job.cover_image_url);
  const id = await insertPattern(row);
  log(`      ✓ saved "${row.title}" (${row.row_count} rows)`);
  return id;
}

// ─── Public entry ────────────────────────────────────────────────────────────
export async function seedPatterns(accountsMap, { reseed = false, log = console.log } = {}) {
  const free = accountsMap["free-loaded"];
  const pro = accountsMap["pro-loaded"];
  const craft = accountsMap["craft-loaded"];

  // Free-loaded: DB clone.
  log("• free-loaded (DB clone)");
  if (reseed) await deletePatternsForUser(free.userId);
  const freeCount = await countPatterns(free.userId);
  if (freeCount >= FREE_CLONE_SOURCE_IDS.length) {
    log(`  already has ${freeCount} patterns — skipping (use --reseed to redo)`);
  } else {
    for (const srcId of FREE_CLONE_SOURCE_IDS) {
      const id = await clonePattern(srcId, free.userId);
      log(`  cloned ${srcId} → ${id}`);
    }
  }

  // Pro/craft loaded: real upload pipeline.
  const patternsDir = resolvePatternsDir();
  const pdfPaths = UPLOAD_PDFS.map((f) => path.join(patternsDir, f));
  const missing = pdfPaths.filter((p) => !fs.existsSync(p));
  const browser = await chromium.launch();
  try {
    for (const acct of [pro, craft]) {
      log(`• ${acct.key} (real upload via Storage → /api/import-job → extraction)`);
      if (reseed) await deletePatternsForUser(acct.userId);
      const have = await countPatterns(acct.userId);
      if (have >= UPLOAD_PDFS.length && !reseed) {
        log(`  already has ${have} patterns — skipping (use --reseed to redo)`);
      } else if (missing.length === UPLOAD_PDFS.length) {
        log(`  ⚠ no PDFs found in ${patternsDir} — skipping uploads`);
      } else {
        acct._session = await signIn(acct.email, env.TEST_PASSWORD);
        const page = await browser.newPage();
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
        for (const p of pdfPaths) {
          if (!fs.existsSync(p)) { log(`  ⚠ missing ${path.basename(p)} — skip`); continue; }
          try { await uploadOnePdf(page, acct, p, log); }
          catch (e) { log(`  ✗ ${path.basename(p)}: ${e.message}`); }
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  // Craft-loaded: guarantee a chart-bearing pattern for the lightbox capture.
  log("• craft-loaded (ensure chart pattern for lightbox)");
  const existingChart = await patternIdWithCharts(craft.userId);
  if (existingChart && !reseed) {
    log(`  chart pattern already present (${existingChart})`);
  } else {
    const id = await clonePattern(CRAFT_CHART_SOURCE_ID, craft.userId);
    log(`  cloned chart pattern ${CRAFT_CHART_SOURCE_ID} → ${id}`);
  }

  // Craft-loaded: ensure a collection exists for the collection-detail capture.
  log("• craft-loaded (ensure collection for collection-detail)");
  const collId = await firstCollectionId(craft.userId);
  if (collId && !reseed) {
    log(`  collection already present (${collId})`);
  } else {
    const id = await ensureCollection(craft.userId, "Bev's Sampler");
    log(`  collection ready → ${id}`);
  }
}
