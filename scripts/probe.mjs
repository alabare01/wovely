#!/usr/bin/env node
// scripts/probe.mjs
// The supported way to confirm the monitoring endpoints answer after a deploy.
//
// WHY THIS FILE EXISTS. On 2026-09-08 the two endpoints below were verified by
// hand with curl. Both probes were recorded as a real person hitting a real
// error, both woke Adam's phone and his inbox, and no real visitor has ever
// errored on wovely.app. The endpoints were fine. The health check was the
// outage. An alert channel that cries wolf gets muted, and a muted channel is
// worse than no channel at all.
//
// So this script sends the synthetic marker described in api/_monitor.js: a
// header whose value is a SHA-256 derived from CRON_SECRET. Marked requests are
// still written to vercel_logs, on the /internal/synthetic/ prefix, where no
// interrupt, no push and no heartbeat count can read them. An UNMARKED request
// is a real user, always, so forgetting the header pages Adam rather than
// silencing him, which is the direction this has to fail in.
//
// USAGE
//   npm run probe                              (defaults to https://wovely.app)
//   node scripts/probe.mjs https://wovely.app
//   node scripts/probe.mjs --token             (print the header value and exit)
//   node scripts/probe.mjs --force             (send the loud probe without the readback gate)
//
// IT PROBES IN ORDER, AND THE ORDER IS THE SAFETY PROPERTY. The first request
// is a DIGEST-ONLY `page_view`, which cannot page anybody even if the marker
// is ignored. It then reads Supabase back to prove the row landed on the
// synthetic prefix, i.e. that the CRON_SECRET on this machine matches the one
// on the Vercel project. ONLY THEN does it touch /api/client-error, which is
// the request that would otherwise wake Adam. A mismatched secret is the
// realistic way this goes wrong, and it is caught before it costs anybody a
// notification rather than after.
//
// CRON_SECRET is read from the environment or from .env.local. Without it the
// script refuses to send rather than sending unmarked traffic, because an
// unmarked probe is exactly the defect this replaces.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeToken, PROBE_HEADER } from '../api/_monitor.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readEnvLocal() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i < 1 || line.trim().startsWith('#')) continue;
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

const secret = process.env.CRON_SECRET || readEnvLocal().CRON_SECRET || '';
const token = probeToken(secret);

if (!token) {
  console.error('CRON_SECRET is not set, in the environment or in .env.local.');
  console.error('Refusing to probe unmarked: an unmarked probe is recorded as a real user error and pages Adam.');
  console.error('Read it from the Vercel project, then re-run.');
  process.exit(2);
}

if (process.argv.includes('--token')) {
  console.log(`${PROBE_HEADER}: ${token}`);
  process.exit(0);
}

const base = (process.argv[2] || 'https://wovely.app').replace(/\/+$/, '');
const headers = { 'Content-Type': 'application/json', [PROBE_HEADER]: token };
const env = readEnvLocal();
const SUPA_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || '';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
const force = process.argv.includes('--force');
const stamp = new Date().toISOString();
const sid = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

async function post(url, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    return { status: res.status };
  } catch (e) {
    return { status: 0, err: e?.message || 'exception' };
  }
}

/** Did the row land on the synthetic prefix, or on the one that pages Adam? */
async function whereDidItLand(kind, id) {
  if (!SUPA_URL || !SUPA_KEY) return { known: false, reason: 'no supabase credentials on this machine' };
  const q =
    `${SUPA_URL}/rest/v1/vercel_logs?request_path=in.(${encodeURIComponent(`"/internal/pulse/${kind}","/internal/synthetic/${kind}"`)})` +
    `&order=timestamp.desc&limit=20&select=request_path,context`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const res = await fetch(q, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }, signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const rows = await res.json();
        const hit = (Array.isArray(rows) ? rows : []).find((r) => r.context?.sid === id);
        if (hit) return { known: true, synthetic: hit.request_path.startsWith('/internal/synthetic/'), path: hit.request_path };
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { known: false, reason: 'row not found within 6s' };
}

// ── STEP ONE, and the order is the safety property ──────────────────────────
// The first probe uses `page_view`, which is DIGEST ONLY. Even if the marker
// is not honoured (a CRON_SECRET here that does not match the one in Vercel,
// which is the realistic way this goes wrong), the worst case is one extra
// line on an hourly summary. Nobody is paged.
const first = await post(`${base}/api/pulse`, { kind: 'page_view', path: '/', sid });
const okFirst = first.status === 204;
console.log(`${okFirst ? 'ok  ' : 'FAIL'}  POST /api/pulse  ${first.status || first.err}  (expected 204)`);
if (!okFirst) process.exit(1);

// ── STEP TWO: prove the marker was HONOURED before sending anything louder ──
const landed = await whereDidItLand('page_view', sid);
if (landed.known && landed.synthetic) {
  console.log(`ok    marker honoured, row landed on ${landed.path}`);
} else if (landed.known) {
  console.error(`FAIL  MARKER NOT HONOURED. The row landed on ${landed.path}, which the monitor reads as real traffic.`);
  console.error('      The CRON_SECRET here does not match the one on the Vercel project.');
  console.error('      Refusing to probe /api/client-error, because that one would page Adam.');
  process.exit(1);
} else if (!force) {
  console.error(`SKIP  cannot confirm the marker was honoured (${landed.reason}).`);
  console.error('      Refusing to probe /api/client-error unmarked-for-all-we-know. Re-run with --force to send it anyway.');
  process.exit(1);
}

// ── STEP THREE: the endpoint that actually broke ────────────────────────────
const second = await post(`${base}/api/client-error`, {
  message: `synthetic probe ${stamp}`,
  source: 'scripts/probe.mjs',
  context: { url: `${base}/`, sid },
});
const okSecond = second.status === 200;
console.log(`${okSecond ? 'ok  ' : 'FAIL'}  POST /api/client-error  ${second.status || second.err}  (expected 200)`);

const errLanded = await whereDidItLand('user_error', sid);
if (errLanded.known) {
  console.log(`${errLanded.synthetic ? 'ok  ' : 'FAIL'}  user_error row landed on ${errLanded.path}`);
}

if (okSecond && (!errLanded.known || errLanded.synthetic)) {
  console.log('Both endpoints answer. Rows landed on /internal/synthetic/, so nobody was paged.');
  process.exit(0);
}
process.exit(1);
