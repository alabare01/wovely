// scripts/probe-count-nudge.mjs
// Proves the count nudge on the real counter, against production: a signed-in
// maker with a pattern whose rounds print NO count taps five rounds done and
// the NOW card says "5 rounds in", the line stays quiet on the rounds between,
// and with the nudge set to never it stays quiet at five. Same shape as the
// other probes: puppeteer-core on the installed Chrome, exit 0 on PROBE_OK,
// 1 on PROBE_FAIL. Its own user and pattern, both deleted at the end.
//
//   $env:QC_BASE="https://wovely.app"; node scripts/probe-count-nudge.mjs
//
// From the boards: p-013 (Hooked sells reminders to count every few rows).
// Shots land in _shots/<date>/count-nudge-<width>.png.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const BASE = (process.env.QC_BASE || 'https://wovely.app').replace(/\/$/, '');
const TEST_EMAIL = 'probe-nudge@wovely.app';
const TEST_PW = 'Probe-Nudge-' + Math.random().toString(36).slice(2, 10);

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('NO_BROWSER'); process.exit(2); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const day = new Date().toISOString().slice(0, 10);
const outDir = path.join('_shots', day);
fs.mkdirSync(outDir, { recursive: true });
const fails = [];
const must = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

// A pattern whose rounds print no count, the way a hand-typed one reads.
const mk = (n) => ({ id: 'row-' + n, label: 'RND ' + n, text: 'sc in each st around', done: false, note: '', componentName: 'Body', repeat_brackets: [] });
const ROWS = [
  { id: 'header-body', text: '── BODY ──', isHeader: true, makeCount: 1, independent: false, componentName: 'Body', done: false, note: '' },
  ...Array.from({ length: 8 }, (_, i) => mk(i + 1)),
];
const tapDone = (page) => page.evaluate(() => { const b = document.querySelector('button[aria-label="Mark round done"]'); b && b.click(); });

let userId = null, patternId = null, browser = null;
const cleanup = async () => {
  try { if (browser) await browser.close(); } catch {}
  if (userId) {
    try { await fetch(`${URL_}/rest/v1/patterns?user_id=eq.${userId}`, { method: 'DELETE', headers: svcH }); } catch {}
    try { await fetch(`${URL_}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svcH }); } catch {}
  }
};

try {
  const ex = await (await fetch(`${URL_}/auth/v1/admin/users?email=${encodeURIComponent(TEST_EMAIL)}`, { headers: svcH })).json();
  for (const u of (ex.users || []).filter(u => u.email === TEST_EMAIL)) await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: svcH });
  const cr = await fetch(`${URL_}/auth/v1/admin/users`, { method: 'POST', headers: { ...svcH, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PW, email_confirm: true }) });
  const u = await cr.json(); userId = u.id;
  if (!userId) throw new Error('user create failed ' + cr.status + ' ' + JSON.stringify(u).slice(0, 200));
  const t = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PW }) });
  const session = await t.json();
  if (!session.access_token) throw new Error('sign-in failed ' + t.status);
  const ins = await fetch(`${URL_}/rest/v1/patterns`, { method: 'POST', headers: { ...svcH, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ user_id: userId, title: 'Probe Beanie (count nudge)', status: 'wip', rows: ROWS, row_count: 8, import_method: 'probe' }) });
  const inserted = await ins.json();
  patternId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : null;
  if (!patternId) throw new Error('pattern insert failed ' + ins.status + ' ' + JSON.stringify(inserted).slice(0, 200));
  console.log(stamp(), 'user', userId, 'pattern', patternId);

  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  for (const width of [390, 1440]) {
    const page = await browser.newPage();
    const mobile = width < 600;
    await page.setViewport({ width, height: mobile ? 844 : 900, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
    if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Ticks persist, so every width starts from a fresh pattern and a fresh device setting.
    await fetch(`${URL_}/rest/v1/patterns?id=eq.${patternId}`, { method: 'PATCH', headers: { ...svcH, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ rows: ROWS }) });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('yh_session', JSON.stringify(s)); localStorage.removeItem('wovely.countNudge'); }, session);
    await page.goto(`${BASE}/pattern/${patternId}`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await page.waitForFunction(() => /Instructions/.test(document.body.innerText), { timeout: 45_000 }).catch(() => {});
    // The pattern opens on Materials; the counter lives under Instructions.
    await page.evaluate(() => { const all = Array.from(document.querySelectorAll('button, [role=tab], div, span')); const t = all.filter(el => (el.innerText || '').trim() === 'Instructions' && el.offsetParent !== null); const deepest = t.find(el => !t.some(o => o !== el && el.contains(o))); deepest && deepest.click(); });
    await page.waitForFunction(() => /Now working/i.test(document.body.innerText), { timeout: 30_000 }).catch(() => {});
    await wait(1200);
    const sel = await page.evaluate(() => { const s = document.querySelector('select[data-nudge-every]'); return s ? s.value : null; });
    must(sel === '5', `${width}: the nudge control is on the strip and defaults to 5 (got ${sel})`);
    if (sel === null) { console.log('body:', (await page.evaluate(() => document.body.innerText)).slice(0, 500).replace(/[\r\n]+/g, ' | ')); await page.close(); continue; }
    // Four taps: rounds with no printed count, no line at all.
    for (let i = 0; i < 4; i++) { await tapDone(page); await wait(250); }
    const quiet4 = await page.evaluate(() => !document.querySelector('[data-count-line]'));
    must(quiet4, `${width}: four rounds in, no line (rounds print no count)`);
    // The fifth tap: the nudge.
    await tapDone(page); await wait(500);
    const nudge = await page.evaluate(() => (document.querySelector('[data-count-line="nudge"]') || {}).textContent || '');
    must(/5 rounds in/i.test(nudge), `${width}: the fifth tap nudges ("${nudge.slice(0, 80)}")`);
    await page.screenshot({ path: path.join(outDir, `count-nudge-${width}.png`) });
    // It clears itself.
    await wait(6500);
    const cleared = await page.evaluate(() => !document.querySelector('[data-count-line]'));
    must(cleared, `${width}: the nudge clears itself after a few seconds`);
    // Set to never, reset the rows, tap five: quiet.
    await page.select('select[data-nudge-every]', '0');
    const stored = await page.evaluate(() => localStorage.getItem('wovely.countNudge'));
    must(stored === '0', `${width}: never is remembered on the device (stored ${stored})`);
    for (let i = 0; i < 5; i++) { await page.evaluate(() => { const b = document.querySelector('button[aria-label="Undo last round"]'); b && b.click(); }); await wait(150); }
    for (let i = 0; i < 5; i++) { await tapDone(page); await wait(250); }
    const quietOff = await page.evaluate(() => !document.querySelector('[data-count-line="nudge"]'));
    must(quietOff, `${width}: set to never, five rounds in stays quiet`);
    must(errors.length === 0, `${width}: no page errors${errors.length ? ' (' + errors[0].slice(0, 120) + ')' : ''}`);
    await page.close();
  }
} catch (e) {
  fails.push(e.message);
  console.log(stamp(), 'ERROR', e.message);
} finally {
  await cleanup();
}
if (fails.length) { console.log('PROBE_FAIL ' + fails[0]); process.exit(1); }
console.log('PROBE_OK the count nudge at five rounds, quiet between and when set to never, at 390 and 1440');
