// Proves the password-recovery route is alive, against production: a stranger
// who opens /reset-password (the path every recovery email lands on) gets the
// reset screen with an email field and a "Send me a reset link" button, not
// the not-found page; and an unknown path still gets the not-found page with
// a rendered noindex, so the soft-404 fix is not undone by this one.
//
// Why this exists: from 2026-09-16 to 2026-09-19 the not-found gate in
// App.jsx did not know /reset-password and rendered "Bev looked, and that page
// is not here" to everyone who clicked a recovery link. Nothing measured the
// route, so nothing said so. Same driver as the other probes (puppeteer-core
// on the installed Chrome); exit 0 on PROBE_OK, 1 on PROBE_FAIL. No user, no
// writes, no email sent.
//   $env:QC_BASE="https://wovely.app"; node scripts/probe-reset-password.mjs [--shots <dir>]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE = (process.env.QC_BASE || 'https://wovely.app').replace(/\/$/, '');
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('NO_BROWSER'); process.exit(2); }
const fails = [];
const must = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const read = (page) => page.evaluate(() => ({
  title: document.title,
  robots: document.querySelector('meta[name="robots"]')?.content || '',
  h1: (document.querySelector('h1')?.textContent || '').trim(),
  emailInput: !!document.querySelector('input[type="email"][aria-label="Email address"]'),
  sendBtn: [...document.querySelectorAll('button')].some(b => /send me a reset link/i.test(b.textContent || '')),
  notFound: /that page is not here/i.test(document.body.innerText || ''),
}));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
try {
  for (const [w, h, tag] of [[390, 844, 'phone'], [1440, 900, 'desktop']]) {
    const page = await browser.newPage(); await page.setViewport({ width: w, height: h });
    const errs = []; page.on('pageerror', e => errs.push(e.message));

    // 1. The recovery landing, as the email link opens it (signed out).
    const r = await page.goto(BASE + '/reset-password', { waitUntil: 'networkidle0', timeout: 60000 }); await wait(800);
    let s = await read(page);
    must(r.status() === 200, `${tag} /reset-password answers 200 (got ${r.status()})`);
    must(!s.notFound, `${tag} /reset-password is not the not-found page`);
    must(s.emailInput, `${tag} /reset-password shows the email field`);
    must(s.sendBtn, `${tag} /reset-password shows "Send me a reset link"`);
    await shot(page, `reset-${tag}`);

    // 2. A dead path still gets the honest page with a rendered noindex.
    await page.goto(BASE + '/nope-probe-' + Date.now(), { waitUntil: 'networkidle0', timeout: 60000 }); await wait(800);
    s = await read(page);
    must(s.notFound, `${tag} unknown path renders the not-found page`);
    must(/page not found/i.test(s.title), `${tag} unknown path titled Page not found (got ${JSON.stringify(s.title)})`);
    must(/noindex/.test(s.robots), `${tag} unknown path carries noindex`);

    must(errs.length === 0, `${tag} no page errors${errs.length ? ' (' + errs[0].slice(0, 80) + ')' : ''}`);
    await page.close();
  }
} finally { await browser.close(); }
if (fails.length) { console.log('PROBE_FAIL ' + fails.length + ' miss(es): ' + fails.join(' | ')); process.exit(1); }
console.log('PROBE_OK password recovery route is live at ' + BASE);
