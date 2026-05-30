#!/usr/bin/env node
// Backfill repair for import_jobs whose materials (and/or abbreviations) came out
// empty even though the source raw_text clearly contains those sections. This is
// the offline counterpart to the in-extraction recovery pass in
// runSmartChunkedExtraction — it heals HISTORICAL jobs that were extracted before
// that pass existed, then propagates recovered materials to the linked pattern.
//
// It reuses the EXACT same focused-recovery prompts, section-keyword regexes, and
// union/dedupe helpers as the live pipeline (imported from ../api/extract-pattern.js)
// so a repaired job is indistinguishable from one that recovered at extraction time.
//
// ── What gets written ────────────────────────────────────────────────────────
//   import_jobs.extracted_data : recovered materials AND (with --abbr) abbreviations.
//   patterns.materials         : recovered materials, unioned into the linked row.
//
//   Abbreviations are NOT propagated to `patterns` — that table has no
//   abbreviations / abbreviations_map column (verified against the live schema),
//   so there is nowhere to put them. They live only in import_jobs.extracted_data.
//
// ── How patterns are linked to a job ─────────────────────────────────────────
//   There is no FK. Both tables carry the uploaded file URL, so we join on
//   (patterns.user_id, patterns.source_file_url) = (import_jobs.user_id, file_url).
//   If a job links to 0 patterns → nothing to propagate. If it links to MORE THAN
//   ONE (e.g. a collection import split into per-component patterns), the linkage
//   is ambiguous: we REPORT and SKIP rather than guess which row to touch.
//
// Usage:
//   node scripts/repair-empty-materials.mjs --dry-run            # default: scan + preview, no AI, no writes
//   node scripts/repair-empty-materials.mjs --apply              # heal import_jobs + propagate to patterns
//   node scripts/repair-empty-materials.mjs --apply --limit=20   # cap how many jobs are processed
//   node scripts/repair-empty-materials.mjs --apply --abbr       # also recover empty abbreviations (import_jobs only)
//
// Secrets are sourced from the environment / .env.local, falling back to a one-time
// `vercel env pull` of production env into a gitignored cache (matching env.js).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  recoverMaterials,
  recoverAbbreviations,
  mergeMaterials,
  mergeAbbreviationLists,
  MATERIALS_SECTION_KEYWORDS,
  ABBREVIATIONS_SECTION_KEYWORDS,
} from '../api/extract-pattern.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ─── Env loading (no dotenv dep) ─────────────────────────────────────────────
function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    out[key] = val;
  }
  return out;
}

const localEnv = parseEnvFile(path.join(REPO_ROOT, '.env.local'));
let vercelCache;
function loadVercelCache() {
  if (vercelCache) return vercelCache;
  const cacheFile = path.join(REPO_ROOT, 'scripts', '.env.vercel.local');
  let cached = parseEnvFile(cacheFile);
  if (!cached.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('  ↪ sourcing secrets from Vercel production env…');
    try {
      execSync(`npx --no-install vercel env pull "${cacheFile}" --environment=production --yes`, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      cached = parseEnvFile(cacheFile);
    } catch (e) {
      throw new Error(
        'Could not pull env from Vercel. Install + authenticate the Vercel CLI (`vercel login`), ' +
        'or set the keys in .env.local.\n' + (e?.message || '')
      );
    }
  }
  return (vercelCache = cached);
}

function getSecret(key) {
  if (process.env[key]) return process.env[key];
  if (localEnv[key]) return localEnv[key];
  return loadVercelCache()[key] || null;
}

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || localEnv.VITE_SUPABASE_URL || 'https://vbtsdyxvqqwxjzpuseaf.supabase.co';
const SERVICE_KEY = getSecret('SUPABASE_SERVICE_ROLE_KEY');
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

// AI keys are resolved lazily — a read-only dry-run never needs them.
let _aiKeys;
function aiKeys() {
  if (_aiKeys) return _aiKeys;
  const geminiKey = getSecret('GEMINI_API_KEY');
  const anthropicKey = getSecret('ANTHROPIC_API_KEY');
  if (!geminiKey && !anthropicKey) {
    throw new Error('Missing GEMINI_API_KEY and ANTHROPIC_API_KEY (need at least one for --apply)');
  }
  return (_aiKeys = { geminiKey, anthropicKey });
}

// ─── Supabase REST ───────────────────────────────────────────────────────────
const supaHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(pathAndQuery, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: prefer ? { ...supaHeaders, Prefer: prefer } : supaHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${method} ${pathAndQuery} → ${res.status}: ${text.slice(0, 300)}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

// ─── Candidate detection ─────────────────────────────────────────────────────
const nonBlankMaterials = (d) =>
  (Array.isArray(d?.materials) ? d.materials.filter(m => (m?.name || '').trim()) : []);
const nonBlankAbbrs = (d) =>
  (Array.isArray(d?.abbreviations) ? d.abbreviations.filter(a => (a?.abbr || '').trim()) : []);

// Same predicate the live recovery pass uses, so dry-run counts predict --apply.
function classifyJob(job, alsoAbbr) {
  const text = job.raw_text || '';
  const data = job.extracted_data || {};
  const wantMaterials = nonBlankMaterials(data).length === 0 && MATERIALS_SECTION_KEYWORDS.test(text);
  const wantAbbrs = alsoAbbr && nonBlankAbbrs(data).length === 0 && ABBREVIATIONS_SECTION_KEYWORDS.test(text);
  return { wantMaterials, wantAbbrs };
}

const jobTitle = (job) =>
  (job.extracted_data?.title || '').trim() || (job.pdf_metadata_title || '').trim() || '(untitled)';

// Scan ALL completed pdf jobs with raw_text and return the candidates.
async function scanCandidates(alsoAbbr) {
  const PAGE = 200;
  const candidates = [];
  let offset = 0;
  for (;;) {
    const rows = await rest(
      `import_jobs?status=eq.completed&file_type=eq.pdf&raw_text=not.is.null&select=id,user_id,file_url,raw_text,extracted_data,pdf_metadata_title&order=created_at.desc&limit=${PAGE}&offset=${offset}`
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const job of rows) {
      const { wantMaterials, wantAbbrs } = classifyJob(job, alsoAbbr);
      if (wantMaterials || wantAbbrs) candidates.push({ job, wantMaterials, wantAbbrs });
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return candidates;
}

// ─── Patterns linkage ────────────────────────────────────────────────────────
// Find the pattern row(s) that came from this job, joined on the uploaded file
// URL within the same user. Empty file_url → no linkage possible.
async function findLinkedPatterns(job) {
  if (!job.file_url) return [];
  const rows = await rest(
    `patterns?user_id=eq.${job.user_id}&source_file_url=eq.${encodeURIComponent(job.file_url)}&status=neq.deleted&select=id,title,materials`
  );
  return Array.isArray(rows) ? rows : [];
}

// Map recovered materials ({name,amount,notes}) into the patterns row shape
// ({id,name,amount,yardage,notes}), continuing numeric ids past the existing max
// so keys stay unique. Union/dedupe drops any whose name already exists.
function shapeForPattern(recovered, existing) {
  let maxId = 0;
  for (const m of (existing || [])) {
    const n = Number(m?.id);
    if (Number.isFinite(n) && n > maxId) maxId = n;
  }
  return (recovered || []).map((m, i) => ({
    id: maxId + i + 1,
    name: m.name || '',
    amount: m.amount || '',
    yardage: 0,
    notes: m.notes || '',
  }));
}

// Propagate a set of materials into the single linked pattern. Returns a status
// describing what happened (or would happen, when apply=false).
async function propagateMaterials(job, materials, apply) {
  const linked = await findLinkedPatterns(job);
  if (linked.length === 0) return { status: 'no_pattern' };
  if (linked.length > 1) return { status: 'ambiguous', count: linked.length, ids: linked.map(p => p.id) };

  const pat = linked[0];
  const before = nonBlankMaterials(pat).length;
  const shaped = shapeForPattern(materials, pat.materials);
  const merged = mergeMaterials(pat.materials, shaped);
  const after = merged.filter(m => (m?.name || '').trim()).length;
  if (after === before) return { status: 'noop', patternId: pat.id, title: pat.title, before, after };

  if (apply) {
    await rest(`patterns?id=eq.${pat.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { materials: merged, updated_at: new Date().toISOString() },
    });
  }
  return { status: apply ? 'patched' : 'would_patch', patternId: pat.id, title: pat.title, before, after };
}

// ─── Heal one job (AI) ───────────────────────────────────────────────────────
async function healJob({ job, wantMaterials, wantAbbrs }) {
  const { geminiKey, anthropicKey } = aiKeys();
  const data = { ...(job.extracted_data || {}) };
  const result = { id: job.id, materials_added: 0, abbrs_added: 0, errors: [] };

  if (wantMaterials) {
    try {
      const rec = await recoverMaterials({ pdfText: job.raw_text, geminiKey, anthropicKey });
      if (rec.materials.length) {
        const before = nonBlankMaterials(data).length;
        data.materials = mergeMaterials(data.materials, rec.materials);
        result.materials_added = nonBlankMaterials(data).length - before;
        if ((!data.yarn_weight || !String(data.yarn_weight).trim()) && rec.yarn_weight) data.yarn_weight = rec.yarn_weight;
        if ((!data.hook_size || !String(data.hook_size).trim()) && rec.hook_size) data.hook_size = rec.hook_size;
      }
    } catch (e) {
      result.errors.push(`materials: ${e.message}`);
    }
  }

  if (wantAbbrs) {
    try {
      const rec = await recoverAbbreviations({ pdfText: job.raw_text, geminiKey, anthropicKey });
      if (rec.abbreviations.length || Object.keys(rec.abbreviations_map).length) {
        const before = nonBlankAbbrs(data).length;
        data.abbreviations = mergeAbbreviationLists(data.abbreviations, rec.abbreviations);
        result.abbrs_added = nonBlankAbbrs(data).length - before;
        data.abbreviations_map = { ...rec.abbreviations_map, ...(data.abbreviations_map || {}) };
      }
    } catch (e) {
      result.errors.push(`abbreviations: ${e.message}`);
    }
  }

  if (result.materials_added > 0 || result.abbrs_added > 0) {
    await rest(`import_jobs?id=eq.${job.id}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { extracted_data: data },
    });
  }
  return { result, data };
}

// ─── Entry ───────────────────────────────────────────────────────────────────
function usage() {
  console.log(`Usage:
  node scripts/repair-empty-materials.mjs --dry-run [--abbr] [--limit=N]
  node scripts/repair-empty-materials.mjs --apply   [--abbr] [--limit=N]`);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const alsoAbbr = args.includes('--abbr');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 50) : 50;
  if (!apply && !args.includes('--dry-run')) { usage(); return; }

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'} | abbreviations: ${alsoAbbr ? 'yes' : 'no'} | limit: ${limit}`);
  console.log('Scanning completed pdf import_jobs for empty-section candidates…\n');

  const all = await scanCandidates(alsoAbbr);
  const matCandidates = all.filter(c => c.wantMaterials);
  const abbrCandidates = all.filter(c => c.wantAbbrs);
  console.log(`Candidates: ${all.length} job(s) — ${matCandidates.length} empty-materials, ${abbrCandidates.length} empty-abbreviations\n`);

  // Preview linkage for every candidate (read-only).
  for (const c of all) {
    const tags = [c.wantMaterials && 'materials', c.wantAbbrs && 'abbreviations'].filter(Boolean).join(' + ');
    let linkNote = '';
    if (c.wantMaterials) {
      const linked = await findLinkedPatterns(c.job);
      linkNote = linked.length === 0 ? ' | patterns: none linked'
        : linked.length > 1 ? ` | patterns: AMBIGUOUS (${linked.length} linked → will skip)`
        : ` | patterns: 1 linked (${linked[0].id}, ${nonBlankMaterials(linked[0]).length} materials now)`;
    }
    console.log(`  - ${c.job.id} "${jobTitle(c.job)}" → recover ${tags} | raw ${c.job.raw_text.length} chars${linkNote}`);
  }

  if (!apply) {
    console.log(`\nDry-run only. Re-run with --apply to recover + patch.`);
    if (abbrCandidates.length) {
      console.log(`Note: abbreviations are healed into import_jobs only — \`patterns\` has no abbreviations column.`);
    }
    return;
  }
  if (all.length === 0) return;

  const toProcess = all.slice(0, limit);
  if (toProcess.length < all.length) console.log(`\n(limit=${limit}: processing ${toProcess.length} of ${all.length})`);
  console.log(`\nApplying recovery (this makes real AI calls)…\n`);

  let jobsPatched = 0, jobsSkipped = 0, jobsFailed = 0, patsPatched = 0, patsAmbiguous = 0, patsNone = 0;
  let matsTotal = 0, abbrsTotal = 0, patMatsTotal = 0;

  for (const c of toProcess) {
    let healed;
    try {
      healed = await healJob(c);
    } catch (e) {
      jobsFailed++;
      console.log(`  ✗ ${c.job.id} → HEAL FAILED: ${e.message}`);
      continue;
    }
    const { result, data } = healed;
    matsTotal += result.materials_added;
    abbrsTotal += result.abbrs_added;
    const errSuffix = result.errors.length ? ` (errors: ${result.errors.join('; ')})` : '';

    if (result.materials_added > 0 || result.abbrs_added > 0) {
      jobsPatched++;
      console.log(`  ✓ job ${c.job.id} → +${result.materials_added} materials, +${result.abbrs_added} abbreviations${errSuffix}`);
    } else {
      jobsSkipped++;
      console.log(`  · job ${c.job.id} → nothing recovered${errSuffix}`);
    }

    // Propagate recovered materials to the linked pattern (materials only).
    if (result.materials_added > 0) {
      try {
        const prop = await propagateMaterials(c.job, data.materials, true);
        if (prop.status === 'patched') {
          patsPatched++;
          patMatsTotal += (prop.after - prop.before);
          console.log(`      → pattern ${prop.patternId} "${prop.title}" materials ${prop.before} → ${prop.after}`);
        } else if (prop.status === 'ambiguous') {
          patsAmbiguous++;
          console.log(`      → AMBIGUOUS: ${prop.count} patterns linked (${prop.ids.join(', ')}) — skipped, resolve manually`);
        } else if (prop.status === 'no_pattern') {
          patsNone++;
          console.log(`      → no linked pattern (job never saved, or deleted) — nothing to propagate`);
        } else if (prop.status === 'noop') {
          console.log(`      → pattern ${prop.patternId} already had these materials — no change`);
        }
      } catch (e) {
        console.log(`      → pattern propagation FAILED: ${e.message}`);
      }
    }
  }

  console.log(`\nDone.`);
  console.log(`  import_jobs: patched=${jobsPatched} skipped=${jobsSkipped} failed=${jobsFailed} | +${matsTotal} materials, +${abbrsTotal} abbreviations`);
  console.log(`  patterns:    patched=${patsPatched} ambiguous=${patsAmbiguous} none-linked=${patsNone} | +${patMatsTotal} materials`);
  if (abbrsTotal > 0) {
    console.log(`  Note: abbreviations were written to import_jobs only — \`patterns\` has no abbreviations column.`);
  }
}

main().catch((e) => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
