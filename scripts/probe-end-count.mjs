// scripts/probe-end-count.mjs
// Proves the end-of-round count is on the real counter, against production:
// a signed-in maker with a pattern whose rounds print their counts opens it,
// the NOW card says what the current round ends on, a tap on "Round done"
// reads back the count they should be holding, and focus mode carries the
// same line. Same shape as the other probes: puppeteer-core on the installed
// Chrome, exit 0 on PROBE_OK, 1 on PROBE_FAIL. Its own user, its own pattern,
// both deleted at the end, so it never touches the PDF probe's user or lock.
//
//   $env:QC_BASE="https://wovely.app"; node scripts/probe-end-count.mjs
//
// From the boards: p-025, p-028, p-034, p-037 (the count was wrong and nobody
// knew until rounds later). Shots land in _shots/<date>/end-count-<width>.png.
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
const TEST_EMAIL = 'probe-endcount@wovely.app';
const TEST_PW = 'Probe-EndCount-' + Math.random().toString(36).slice(2, 10);

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

// A pattern the way the import writes one: a header row, then rounds whose
// text ends in the printed count. Round 3 carries no count on purpose, so the
// probe also proves the line stays quiet where the pattern printed nothing.
const ROWS = [
  { id: 'header-body', text: '── BODY ──', isHeader: true, makeCount: 1, independent: false, componentName: 'Body', done: false, note: '' },
  { id: 'row-1', label: 'RND 1', text: 'Make a magic ring with 6 sc (6)', stitch_count: 6, done: false, note: '', componentName: 'Body', repeat_brackets: [] },
  { id: 'row-2', label: 'RND 2', text: 'inc in each st around (12)', stitch_count: 12, done: false, note: '', componentName: 'Body', repeat_brackets: [] },
  { id: 'row-3', label: 'RND 3', text: 'sc in each st around', done: false, note: '', componentName: 'Body', repeat_brackets: [] },
  { id: 'row-4', label: 'RND 4', text: '(1 sc, inc) 6 times (18)', done: false, note: '', componentName: 'Body', repeat_brackets: [{ sequence: '1 sc, inc', count: 6 }] },
];

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
  const ins = await fetch(`${URL_}/rest/v1/patterns`, { method: 'POST', headers: { ...svcH, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ user_id: userId, title: 'Probe Beanie (end count)', status: 'wip', rows: ROWS, row_count: 4, import_method: 'probe' }) });
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
    // Ticks persist, so the second width starts from a fresh pattern.
    await fetch(`${URL_}/rest/v1/patterns?id=eq.${patternId}`, { method: 'PATCH', headers: { ...svcH, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ rows: ROWS }) });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('yh_session', JSON.stringify(s)); }, session);
    await page.goto(`${BASE}/pattern/${patternId}`, { waitUntil: 'networkidle2', timeout: 60_000 });
    await page.waitForFunction(() => /Instructions/.test(document.body.innerText), { timeout: 45_000 }).catch(() => {});
    // The pattern opens on Materials; the counter lives under Instructions.
    await page.evaluate(() => { const all = Array.from(document.querySelectorAll('button, [role=tab], div, span')); const t = all.filter(el => (el.innerText || '').trim() === 'Instructions' && el.offsetParent !== null); const deepest = t.find(el => !t.some(o => o !== el && el.contains(o))); deepest && deepest.click(); });
    await page.waitForFunction(() => /Now working/i.test(document.body.innerText), { timeout: 30_000 }).catch(() => {});
    await wait(1200);
    // Every round is fresh, so the pattern may open on Round 1 or on whatever
    // the app treats as the current round; read the line rather than assume.
    const ends = await page.evaluate(() => (document.querySelector('[data-count-line="ends"]') || {}).textContent || '');
    must(/ends on 6 stitches/i.test(ends), `${width}: the NOW card says what the round ends on ("${ends.slice(0, 80)}")`);
    if (!ends) { console.log('body:', (await page.evaluate(() => document.body.innerText)).slice(0, 500).replace(/[\r\n]+/g, ' | ')); await page.close(); continue; }
    await page.screenshot({ path: path.join(outDir, `end-count-${width}.png`) });
    // Tap Round done: the line reads back the count they should be holding and
    // names what the next round ends on.
    await page.evaluate(() => { const b = document.querySelector('button[aria-label="Mark round done"]'); b && b.click(); });
    await wait(600);
    const checked = await page.evaluate(() => (document.querySelector('[data-count-line="checked"]') || {}).textContent || '');
    must(/holding 6 stitches/i.test(checked) && /next round ends on 12/i.test(checked), `${width}: the tap reads back the count ("${checked.slice(0, 100)}")`);
    await page.screenshot({ path: path.join(outDir, `end-count-${width}-checked.png`) });
    // Two more taps land on Round 3, which printed no count: the line goes quiet.
    await page.evaluate(() => { const b = document.querySelector('button[aria-label="Mark round done"]'); b && b.click(); });
    await wait(6500);
    const quiet = await page.evaluate(() => !document.querySelector('[data-count-line]'));
    must(quiet, `${width}: a round with no printed count shows no count line`);
    // Focus mode carries the same line, big.
    await page.evaluate(() => { const b = document.querySelector('button[aria-label="Mark round done"]'); b && b.click(); });
    await wait(6500);
    const focusBtn = await page.evaluateHandle(() => Array.from(document.querySelectorAll('button')).find(b => /focus mode/i.test(b.innerText)));
    if (focusBtn && focusBtn.asElement()) { await focusBtn.asElement().click(); await wait(800); }
    const focusLine = await page.evaluate(() => { const els = document.querySelectorAll('[data-count-line="ends"]'); return els.length ? els[els.length - 1].textContent : ''; });
    must(/ends on 18 stitches/i.test(focusLine), `${width}: focus mode carries the line ("${focusLine.slice(0, 80)}")`);
    await page.screenshot({ path: path.join(outDir, `end-count-${width}-focus.png`) });
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
console.log('PROBE_OK end-of-round count on the NOW card, the tap read-back and focus mode at 390 and 1440');
