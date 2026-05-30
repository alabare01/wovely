#!/usr/bin/env node
// S76 PDF-coverage diagnostic (standing QA). Read-only. For a completed pdf
// import_job, it diffs the source raw_text against what extraction captured,
// PER PART, and flags the failure mode that broke pass 2: a row-able stitch
// instruction that ended up in `body` (prose) instead of `rows` (checkable),
// or got dropped entirely.
//
// This is the guardrail that would have caught both the source_file_url
// regression and the row-cannibalization regression before they shipped.
//
// Usage:
//   node scripts/coverage-diagnostic.mjs --title=Blooming      # by title substring
//   node scripts/coverage-diagnostic.mjs --job=<import_job_id>  # by id
//   node scripts/coverage-diagnostic.mjs                        # scan all multi-part jobs
//
// Secrets: env / .env.local, falling back to a one-time `vercel env pull`
// (matching scripts/repair-empty-materials.mjs).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { looksLikeRowInstruction } from "../src/utils/docType.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// ─── Env ─────────────────────────────────────────────────────────────────────
function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
const localEnv = parseEnvFile(path.join(REPO_ROOT, ".env.local"));
let vercelCache;
function getSecret(key) {
  if (process.env[key]) return process.env[key];
  if (localEnv[key]) return localEnv[key];
  if (!vercelCache) {
    const cacheFile = path.join(REPO_ROOT, "scripts", ".env.vercel.local");
    vercelCache = parseEnvFile(cacheFile);
    if (!vercelCache.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("  ↪ sourcing SUPABASE_SERVICE_ROLE_KEY from Vercel production env…");
      try {
        execSync(`npx --no-install vercel env pull "${cacheFile}" --environment=production --yes`, { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "inherit"] });
        vercelCache = parseEnvFile(cacheFile);
      } catch (e) {
        throw new Error("Could not pull env from Vercel. Authenticate the Vercel CLI or set keys in .env.local.\n" + (e?.message || ""));
      }
    }
  }
  return vercelCache[key] || null;
}
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || localEnv.VITE_SUPABASE_URL || "https://vbtsdyxvqqwxjzpuseaf.supabase.co";
const SERVICE_KEY = getSecret("SUPABASE_SERVICE_ROLE_KEY");
if (!SERVICE_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

async function rest(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${pathAndQuery} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Instruction-line detection is the shared, unit-tested helper from docType.js
// so the diagnostic and the test suite agree on what counts as a row.
const countInstrLines = (text) =>
  (typeof text === "string" ? text.split(/\r?\n/) : []).filter(looksLikeRowInstruction).length;

const nonBlankRows = (rows) => (Array.isArray(rows) ? rows.filter((r) => (r?.text || "").trim()) : []);

// ─── Report one job ──────────────────────────────────────────────────────────
function reportJob(job) {
  const data = job.extracted_data || {};
  const comps = Array.isArray(data.components) ? data.components : [];
  const title = (data.title || job.pdf_metadata_title || "(untitled)").trim();
  const sourceInstr = countInstrLines(job.raw_text || "");
  const totalRows = comps.reduce((s, c) => s + nonBlankRows(c.rows).length, 0);

  console.log(`\n=== ${title}  (job ${job.id}) ===`);
  console.log(`source instruction-like lines: ${sourceInstr}   |   extracted rows total: ${totalRows}   |   parts: ${comps.length}`);
  console.log(`${"part".padEnd(42)} rows  body  body-instr`);
  console.log("-".repeat(70));

  let partsWithInstrInBody = 0;
  for (const c of comps) {
    const rows = nonBlankRows(c.rows).length;
    const bodyLen = typeof c.body === "string" ? c.body.length : 0;
    const bodyInstr = countInstrLines(c.body || "");
    if (bodyInstr > 0) partsWithInstrInBody++;
    const flag = bodyInstr > 0 ? `  ⚠ ${bodyInstr} instruction line(s) trapped in body` : "";
    const name = (c.name || "Part").slice(0, 40).padEnd(42);
    console.log(`${name} ${String(rows).padStart(4)}  ${String(bodyLen).padStart(4)}  ${String(bodyInstr).padStart(9)}${flag}`);
  }

  const coverage = sourceInstr > 0 ? Math.round((totalRows / sourceInstr) * 100) : null;
  console.log("-".repeat(70));
  console.log(`row coverage vs source: ${coverage == null ? "n/a" : coverage + "%"}`);
  const verdict = partsWithInstrInBody === 0 ? "PASS — no instructions trapped in body" : `FAIL — ${partsWithInstrInBody} part(s) have instructions in body`;
  console.log(`verdict: ${verdict}`);
  return partsWithInstrInBody === 0;
}

// ─── Entry ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const jobArg = args.find((a) => a.startsWith("--job="));
  const titleArg = args.find((a) => a.startsWith("--title="));

  let jobs;
  if (jobArg) {
    jobs = await rest(`import_jobs?id=eq.${jobArg.split("=")[1]}&select=id,raw_text,extracted_data,pdf_metadata_title`);
  } else {
    const rows = await rest(`import_jobs?status=eq.completed&file_type=eq.pdf&raw_text=not.is.null&select=id,raw_text,extracted_data,pdf_metadata_title&order=created_at.desc&limit=200`);
    jobs = (Array.isArray(rows) ? rows : []).filter((j) => {
      const comps = j.extracted_data?.components;
      if (!Array.isArray(comps) || comps.length <= 1) return false;
      if (titleArg) {
        const sub = titleArg.split("=")[1].toLowerCase();
        const t = ((j.extracted_data?.title || j.pdf_metadata_title || "")).toLowerCase();
        return t.includes(sub);
      }
      return true;
    });
  }

  if (!Array.isArray(jobs) || jobs.length === 0) {
    console.log("No matching multi-part completed pdf jobs found.");
    return;
  }
  let allPass = true;
  for (const job of jobs) allPass = reportJob(job) && allPass;
  console.log(`\nOverall: ${allPass ? "PASS" : "FAIL"} across ${jobs.length} job(s).`);
}

main().catch((e) => { console.error("Error:", e.message || e); process.exit(1); });
