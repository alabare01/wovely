// scripts/probe-pdf-import.mjs
// The end-to-end proof the PDF import path was missing until 2026-09-15.
//
// WHY THIS EXISTS. Dani's upload sat on "Reading the source" for an hour on
// 2026-09-15. The last import_jobs row on the whole app before that was hers,
// on 2026-08-22. Nothing had exercised the path for 24 days and nothing
// would have told us if it broke. Every other probe checks that a page
// renders; this one checks that a real PDF picked from a phone-sized browser
// becomes an import_jobs row on the server, which is the only fact that
// matters to a person holding a pattern.
//
//   node scripts/probe-pdf-import.mjs                    against http://localhost:4173
//   QC_BASE=https://wovely.app node scripts/probe-pdf-import.mjs
//
// Exit 0: a job row existed within the window. Anything else is a failure
// with the reason printed. Creates and deletes its own user; the job row it
// leaves is under that deleted user and is cleaned up here too.

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const BASE = process.env.QC_BASE || 'http://localhost:4173';
const WINDOW_MS = Number(process.env.PROBE_WINDOW_MS || 90_000);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('NO_BROWSER'); process.exit(2); }

const wait = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

// A small but real multi-object PDF with text pdf.js can read. Written to a
// temp file so the file chooser has something to pick.
const pdfPath = path.join(process.env.TEMP || '.', `wovely-probe-${Date.now()}.pdf`);
const pdfBody = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj',
  '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  '5 0 obj<</Length 120>>stream',
  'BT /F1 14 Tf 20 260 Td (Probe Beanie) Tj 0 -24 Td (Materials: worsted yarn, 5mm hook) Tj 0 -24 Td (Round 1: 6 sc in magic ring (6)) Tj ET',
  'endstream',
  'endobj',
  'trailer<</Root 1 0 R>>',
  '%%EOF',
].join('\n');
fs.writeFileSync(pdfPath, pdfBody);

const TEST_EMAIL = `probe-pdf-import@wovely.app`;
const TEST_PW = 'Pr!' + Math.random().toString(36).slice(2) + 'A9';
let userId = null, session = null, browser = null, ok = false, reason = '';

const cleanup = async () => {
  try { if (browser) await browser.close(); } catch {}
  try { fs.unlinkSync(pdfPath); } catch {}
  if (userId) {
    try { await fetch(`${URL_}/rest/v1/import_jobs?user_id=eq.${userId}`, { method: 'DELETE', headers: svcH }); } catch {}
    try { await fetch(`${URL_}/rest/v1/patterns?user_id=eq.${userId}`, { method: 'DELETE', headers: svcH }); } catch {}
    try {
      const l = await fetch(`${URL_}/storage/v1/object/list/pattern-files`, { method: 'POST', headers: { ...svcH, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: userId, limit: 100 }) });
      const objs = await l.json();
      if (Array.isArray(objs) && objs.length) await fetch(`${URL_}/storage/v1/object/pattern-files`, { method: 'DELETE', headers: { ...svcH, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: objs.map(o => `${userId}/${o.name}`) }) });
    } catch {}
    try { await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svcH }); } catch {}
  }
};

try {
  // throwaway user
  const ex = await (await fetch(`${URL_}/auth/v1/admin/users?email=${encodeURIComponent(TEST_EMAIL)}`, { headers: svcH })).json();
  for (const u of (ex.users || []).filter(u => u.email === TEST_EMAIL)) await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: svcH });
  const cr = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: { ...svcH, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PW, email_confirm: true }) });
  const u = await cr.json(); userId = u.id;
  if (!userId) throw new Error('user create failed ' + cr.status + ' ' + JSON.stringify(u).slice(0, 200));
  const t = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PW }) });
  session = await t.json();
  if (!session.access_token) throw new Error('sign-in failed ' + t.status);
  console.log(stamp(), 'user', userId);

  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  // iPhone 15 class viewport; the failure was reported from a phone.
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  const log = [];
  page.on('console', m => { const s = m.text(); if (/\[Wovely\]/.test(s) || m.type() === 'error') { log.push(s.slice(0, 200)); console.log(stamp(), 'console:', s.slice(0, 160)); } });
  page.on('pageerror', e => console.log(stamp(), 'PAGEERROR', e.message));
  await page.evaluateOnNewDocument((s, uid) => { localStorage.setItem('yh_session', JSON.stringify(s)); }, session, userId);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60_000 });
  await wait(1500);

  // The PDF input is hidden inside the Add Pattern modal, behind the method
  // picker. Walk the same taps a person makes: the Add pattern button (the
  // header FAB on a phone, or the first-run fork on an empty collection),
  // then "Upload a PDF".
  await page.waitForFunction(() => document.body.innerText.length > 200, { timeout: 30_000 }).catch(() => {});
  await wait(2500);
  const clickText = async (re) => {
    const els = await page.$$('button, [role=button], label, div[onclick], a');
    for (const b of els) {
      const txt = (await page.evaluate(el => ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).trim().replace(/\s+/g, ' '), b)).toLowerCase();
      if (re.test(txt) && txt.length < 120) { await b.click().catch(() => {}); await wait(900); return txt; }
    }
    return null;
  };
  let input = await page.$('input[type=file][accept*="pdf"]');
  if (!input) {
    const hit = await clickText(/^add pattern$|^add pattern|import your own|import a pattern|bring your own|\+ add/);
    console.log(stamp(), 'opened via', hit || '(nothing matched)');
    input = await page.$('input[type=file][accept*="pdf"]');
  }
  if (!input) {
    const hit = await clickText(/upload a pdf/);
    console.log(stamp(), 'method via', hit || '(nothing matched)');
    input = await page.$('input[type=file][accept*="pdf"]');
  }
  if (!input) console.log('body text:', (await page.evaluate(() => document.body.innerText)).slice(0, 600).replace(/[\r\n]+/g, ' | '));
  if (!input) throw new Error('no PDF file input found on ' + BASE);
  const t0 = Date.now();
  await input.uploadFile(pdfPath);
  console.log(stamp(), 'file picked, watching for the server row');

  // The proof is server-side: a job row for this user inside the window.
  while (Date.now() - t0 < WINDOW_MS) {
    const r = await fetch(`${URL_}/rest/v1/import_jobs?select=id,status,current_phase,created_at,error_message&user_id=eq.${userId}&order=created_at.desc&limit=1`, { headers: svcH });
    const rows = await r.json();
    if (Array.isArray(rows) && rows[0]) {
      console.log(stamp(), 'JOB', JSON.stringify(rows[0]), `after ${Date.now() - t0}ms`);
      ok = true; break;
    }
    await wait(2000);
  }
  if (!ok) {
    reason = `no import_jobs row within ${WINDOW_MS}ms`;
    const shot = path.join(process.env.TEMP || '.', 'wovely-probe-fail.png');
    await page.screenshot({ path: shot });
    console.log(stamp(), 'screenshot', shot);
    console.log('client log:\n  ' + log.join('\n  '));
  }
} catch (e) {
  reason = e.message;
} finally {
  await cleanup();
}
console.log(ok ? 'PROBE_OK pdf import reached the server' : 'PROBE_FAIL ' + reason);
process.exit(ok ? 0 : 1);
