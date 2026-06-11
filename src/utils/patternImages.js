// Pattern image data layer — Supabase REST helpers + client-side lazy
// renderer. Server-side classification (api/extract-pattern.js mode=
// extract-images) inserts rows with cloudinary_url=null. The Craft-tier
// PatternDetail view calls renderAndUploadPendingImages on mount which
// rasterizes each pending page via pdf.js, uploads to Cloudinary, and
// PATCHes the row. Subsequent visits hit the cached Cloudinary URL.

import { SUPABASE_URL, SUPABASE_ANON_KEY, getSession } from "../supabase.js";
import { reportClientError } from "./errorReporter.js";

const CLOUDINARY_CLOUD = "dmaupzhcx";
const CLOUDINARY_PRESET = "yarnhive_patterns";
const CLOUDINARY_FOLDER = "charts";

const headers = () => {
  const s = getSession();
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${s?.access_token || ""}`,
    "Content-Type": "application/json",
  };
};

// All images for a pattern, ordered by sort_order so the UI grid matches the
// order the classifier saw the pages in.
export const fetchPatternImages = async (patternId) => {
  if (!patternId) return { data: [] };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pattern_images?pattern_id=eq.${patternId}&order=sort_order.asc,page_number.asc`,
      { headers: headers() },
    );
    if (!res.ok) return { error: await res.text() };
    return { data: await res.json() };
  } catch (e) { return { error: e.message }; }
};

// All images across a set of patterns (a collection's clues), including rows
// that are classified but not yet rendered (null cloudinary_url). The caller
// displays the rendered ones and kicks off rendering for the pending ones.
// Used by the collection-detail hero carousel.
export const fetchPatternImagesForPatterns = async (patternIds) => {
  const ids = (patternIds || []).filter(Boolean);
  if (ids.length === 0) return { data: [] };
  try {
    const inList = ids.join(",");
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pattern_images?pattern_id=in.(${inList})&order=sort_order.asc`,
      { headers: headers() },
    );
    if (!res.ok) return { error: await res.text() };
    return { data: await res.json() };
  } catch (e) { return { error: e.message }; }
};

// Count-only query for the locked nudge on Pro/Free tiers — avoids pulling
// row bodies the locked UI never renders. Excludes `photo` rows so the count
// matches what ChartStripView would actually display (chart/cover/diagram/
// glossary). Without this, a photo-only pattern shows a "Bev found N charts"
// nudge over empty frames (S76 bug 5).
export const getPatternImageCount = async (patternId) => {
  if (!patternId) return { data: 0 };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pattern_images?pattern_id=eq.${patternId}&image_type=neq.photo&select=id`,
      { headers: { ...headers(), "Prefer": "count=exact" } },
    );
    if (!res.ok) return { error: await res.text() };
    // count returned in Content-Range: 0-N/total
    const range = res.headers.get("Content-Range") || "";
    const total = parseInt(range.split("/")[1] || "0", 10);
    return { data: Number.isFinite(total) ? total : 0 };
  } catch (e) { return { error: e.message }; }
};

// PATCH a single row's cloudinary_url once the client has rendered + uploaded.
export const updatePatternImageUrl = async (imageId, cloudinaryUrl) => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pattern_images?id=eq.${imageId}`, {
      method: "PATCH",
      headers: { ...headers(), "Prefer": "return=minimal" },
      body: JSON.stringify({ cloudinary_url: cloudinaryUrl }),
    });
    if (!res.ok) return { error: await res.text() };
    return { data: true };
  } catch (e) { return { error: e.message }; }
};

// Cache the parsed pdf.js document per source URL so multiple image
// renders for the same pattern don't re-fetch + re-parse the PDF.
const pdfDocCache = new Map();

const ensurePdfJsLoaded = async () => {
  if (typeof window === "undefined") throw new Error("pdf.js requires a browser");
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("pdf.js load failed"));
    document.head.appendChild(script);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
};

const loadPdfDoc = async (sourceUrl) => {
  if (pdfDocCache.has(sourceUrl)) return pdfDocCache.get(sourceUrl);
  const pdfjs = await ensurePdfJsLoaded();
  const promise = (async () => {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`PDF fetch ${res.status}`);
    const buf = await res.arrayBuffer();
    return pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  })();
  pdfDocCache.set(sourceUrl, promise);
  return promise;
};

// Render a single page to a JPEG data URL. Scale tuned for ~1200px-wide
// chart legibility on retina screens without ballooning Cloudinary uploads.
const renderPageToDataUrl = async (pdfDoc, pageNumber) => {
  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const targetWidth = 1200;
  const scale = Math.min(2.5, targetWidth / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
};

const uploadDataUrlToCloudinary = async (dataUrl, publicId) => {
  const fd = new FormData();
  fd.append("file", dataUrl);
  fd.append("upload_preset", CLOUDINARY_PRESET);
  fd.append("folder", CLOUDINARY_FOLDER);
  if (publicId) fd.append("public_id", publicId);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(`Cloudinary upload ${res.status}`);
  const data = await res.json();
  if (!data.secure_url) throw new Error("Cloudinary returned no URL");
  return data.secure_url;
};

// Walk a list of pattern_image rows, render+upload any with null
// cloudinary_url, fire onProgress as each row resolves. Errors per-row are
// swallowed so one bad page doesn't tank the whole batch. Returns the updated
// list. Safe to call repeatedly — already-resolved rows are skipped.
export const renderAndUploadPendingImages = async ({ images, sourceFileUrl, onProgress, onError }) => {
  if (!Array.isArray(images) || images.length === 0) return [];
  const pending = images.filter(i => !i.cloudinary_url);
  if (pending.length === 0) return images;
  const patternId = images[0]?.pattern_id || null;

  // INSTRUMENTATION (S78): this render path used to swallow every failure with a
  // console.warn, so a stuck render (cloudinary_url stays null) was invisible.
  // `note` makes each failure observable — which STAGE, which PAGE, which
  // PATTERN — via /api/client-error (persisted) + console.error (devtools), and
  // surfaces a non-blocking notice to the caller via onError. The render logic
  // itself is unchanged; this only adds reporting.
  const note = (stage, detail = {}) => {
    const msg = `[patternImages] render failed at "${stage}" (pattern=${patternId}${detail.pageNumber != null ? `, page=${detail.pageNumber}` : ""})`;
    console.error(msg, detail);
    reportClientError(msg, { source: `patternImages:${stage}`, stage, patternId, ...detail });
    onError?.({ stage, patternId, ...detail });
  };

  if (!sourceFileUrl) {
    note("no_source_url", { pending: pending.length });
    return images;
  }

  let pdfDoc;
  try {
    pdfDoc = await loadPdfDoc(sourceFileUrl);
  } catch (e) {
    note("pdf_load", { message: e?.message || String(e), sourceFileUrl });
    return images;
  }

  const updated = [...images];
  for (const row of pending) {
    if (!row.page_number || row.page_number < 1 || row.page_number > pdfDoc.numPages) {
      note("page_out_of_range", { imageId: row.id, pageNumber: row.page_number ?? null, numPages: pdfDoc.numPages });
      continue;
    }
    try {
      const dataUrl = await renderPageToDataUrl(pdfDoc, row.page_number);
      const publicId = `${row.pattern_id}_p${row.page_number}`;
      const cloudUrl = await uploadDataUrlToCloudinary(dataUrl, publicId);
      const { error } = await updatePatternImageUrl(row.id, cloudUrl);
      if (error) {
        note("db_patch", { imageId: row.id, pageNumber: row.page_number, message: String(error).slice(0, 200) });
        continue;
      }
      const idx = updated.findIndex(u => u.id === row.id);
      if (idx >= 0) updated[idx] = { ...updated[idx], cloudinary_url: cloudUrl };
      onProgress?.(updated[idx]);
    } catch (e) {
      note("render_upload", { imageId: row.id, pageNumber: row.page_number, message: e?.message || String(e) });
    }
  }
  return updated;
};

// ── Live-population pending marker (S83 ribbon fix) ─────────────────────────
// fireImageExtraction (App.jsx) stamps this key when it kicks the server-side
// page classification; the detail ribbon polls while the key is fresh so the
// strip populates live instead of staying blank until a remount. The key ages
// out after 3 minutes — a classification that hasn't landed by then isn't
// coming (extract-images runs in seconds), so the ribbon goes back to
// rendering nothing for genuinely asset-free patterns.
const IMG_PENDING_TTL_MS = 3 * 60 * 1000;
const imgPendingKey = (patternId) => `wovely_img_pending_${patternId}`;

export const markImagesPending = (patternId) => {
  if (!patternId) return;
  try { sessionStorage.setItem(imgPendingKey(patternId), String(Date.now())); } catch {}
};

export const isImagesPending = (patternId) => {
  if (!patternId) return false;
  try {
    const v = sessionStorage.getItem(imgPendingKey(patternId));
    if (!v) return false;
    const ts = parseInt(v, 10);
    if (!Number.isFinite(ts) || Date.now() - ts > IMG_PENDING_TTL_MS) {
      sessionStorage.removeItem(imgPendingKey(patternId));
      return false;
    }
    return true;
  } catch { return false; }
};

export const clearImagesPending = (patternId) => {
  if (!patternId) return;
  try { sessionStorage.removeItem(imgPendingKey(patternId)); } catch {}
};

// ── Section scoping (S83 ribbon fix, Part B) ────────────────────────────────
// Ported from normalizeComponentLabel in api/extract-pattern.js (the
// extract-images classifier) so the ribbon scopes assets with the SAME
// semantics used to assign them: exact normalized match first, then
// substring either way. "Clue #1" → "clue 1", "Body chart" → "body chart".
export const normalizeComponentLabel = (s) => {
  if (!s || typeof s !== "string") return "";
  return s.toLowerCase().replace(/[#:_\-]/g, " ").replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
};

export const componentLabelsMatch = (a, b) => {
  const na = normalizeComponentLabel(a), nb = normalizeComponentLabel(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

// User-facing pill label per image type. Stays short so the pill fits
// inside the card without wrapping.
export const imageTypeLabel = (type) => ({
  chart: "CHART",
  cover: "COVER",
  diagram: "DIAGRAM",
  photo: "PHOTO",
  glossary: "GLOSSARY",
}[type] || "IMAGE");
