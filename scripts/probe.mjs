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
//   CRON_SECRET=... node scripts/probe.mjs                     (defaults to https://wovely.app)
//   CRON_SECRET=... node scripts/probe.mjs https://wovely.app
//   node scripts/probe.mjs --token                             (print the header value and exit)
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
const stamp = new Date().toISOString();

const checks = [
  {
    name: 'POST /api/client-error',
    url: `${base}/api/client-error`,
    expect: 200,
    body: { message: `synthetic probe ${stamp}`, source: 'scripts/probe.mjs', context: { url: `${base}/` } },
  },
  {
    name: 'POST /api/pulse',
    url: `${base}/api/pulse`,
    expect: 204,
    body: { kind: 'guest_arrived', path: '/', sid: 'aaaaaaaabbbbbbbb' },
  },
];

let failed = 0;
for (const c of checks) {
  let status = 0;
  let err = '';
  try {
    const res = await fetch(c.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(c.body),
      signal: AbortSignal.timeout(15000),
    });
    status = res.status;
  } catch (e) {
    err = e?.message || 'exception';
  }
  const ok = status === c.expect;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.name}  ${status || err}  (expected ${c.expect})`);
}

console.log(
  failed
    ? `${failed} of ${checks.length} checks failed.`
    : `${checks.length} of ${checks.length} checks passed. Rows landed on /internal/synthetic/, so nobody was paged.`
);
process.exit(failed ? 1 : 0);
