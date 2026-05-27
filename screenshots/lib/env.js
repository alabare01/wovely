// Environment loading for the screenshot harness.
//
// Sources, in order of precedence, for each value:
//   1. process.env (e.g. CI / shell export)
//   2. wovely/.env.local
//   3. (service role key only) Vercel production env, pulled on demand into a
//      gitignored cache file. This keeps the secret out of the repo while
//      matching the project convention of storing it in Vercel — see
//      screenshots/README.md.
//
// Nothing here ever logs a secret value.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");

// Minimal .env parser — no dependency on dotenv. Handles KEY=VALUE, comments,
// blank lines, and surrounding single/double quotes.
function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const localEnv = parseEnvFile(path.join(REPO_ROOT, ".env.local"));

function fromAnySource(key) {
  return process.env[key] || localEnv[key] || null;
}

// Pull the service role key from Vercel production env exactly once, caching it
// in a gitignored file so repeat runs don't re-pull. Requires the Vercel CLI to
// be installed and authenticated (it is, for this project).
let _serviceKeyCache;
function resolveServiceRoleKey() {
  if (_serviceKeyCache !== undefined) return _serviceKeyCache;

  const direct = fromAnySource("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return (_serviceKeyCache = direct);

  const cacheFile = path.join(REPO_ROOT, "screenshots", ".env.vercel.local");
  const cached = parseEnvFile(cacheFile);
  if (cached.SUPABASE_SERVICE_ROLE_KEY) {
    return (_serviceKeyCache = cached.SUPABASE_SERVICE_ROLE_KEY);
  }

  console.log("  ↪ sourcing SUPABASE_SERVICE_ROLE_KEY from Vercel production env…");
  try {
    execSync(
      `npx --no-install vercel env pull "${cacheFile}" --environment=production --yes`,
      { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "inherit"] }
    );
  } catch (e) {
    throw new Error(
      "Could not pull env from Vercel. Make sure the Vercel CLI is installed and " +
      "authenticated (`vercel login`), or set SUPABASE_SERVICE_ROLE_KEY in .env.local.\n" +
      (e?.message || "")
    );
  }
  const pulled = parseEnvFile(cacheFile);
  if (!pulled.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not found in pulled Vercel env.");
  }
  return (_serviceKeyCache = pulled.SUPABASE_SERVICE_ROLE_KEY);
}

function required(key, value) {
  if (!value) {
    throw new Error(
      `Missing required env var ${key}. Add it to wovely/.env.local.`
    );
  }
  return value;
}

export const env = {
  SUPABASE_URL: required("VITE_SUPABASE_URL", fromAnySource("VITE_SUPABASE_URL")),
  SUPABASE_ANON_KEY: required("VITE_SUPABASE_ANON_KEY", fromAnySource("VITE_SUPABASE_ANON_KEY")),
  TEST_PASSWORD: required("PLAYWRIGHT_TEST_PASSWORD", fromAnySource("PLAYWRIGHT_TEST_PASSWORD")),
  // Lazily resolved so commands that don't need admin (none currently) don't pull.
  get SERVICE_ROLE_KEY() {
    return required("SUPABASE_SERVICE_ROLE_KEY", resolveServiceRoleKey());
  },
};

// Project ref parsed from the Supabase URL, e.g. https://<ref>.supabase.co
export const SUPABASE_PROJECT_REF = new URL(env.SUPABASE_URL).hostname.split(".")[0];
