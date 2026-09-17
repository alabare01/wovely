// scripts/probe-voice-counter.mjs
// Proves the voice counter is on the page a guest lands on, at phone and desktop
// width, against whatever QC_BASE points at. Same shape as the other probes:
// puppeteer-core on the installed Chrome, exit 0 on PROBE_OK, 1 on PROBE_FAIL.
//
//   $env:QC_BASE="https://wovely.app"; node scripts/probe-voice-counter.mjs
//
// End to end: a guest reaches the starter pattern, the round counter renders
// with the mic button, the mic tap changes state (Listening, or the hook's own
// "cannot listen" line where the browser has the API but no service; never a
// silent nothing), and the tap counter still counts. Shots land in
// _shots/<date>/voice-counter-<width>[-on].png.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = (process.env.QC_BASE || 'https://wovely.app').replace(/\/$/, '');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('NO_BROWSER'); process.exit(2); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const day = new Date().toISOString().slice(0, 10);
const outDir = path.join('_shots', day);
fs.mkdirSync(outDir, { recursive: true });
const fails = [];
const must = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage();
    const mobile = width < 600;
    await page.setViewport({ width, height: mobile ? 844 : 900, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
    if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60_000 });
    await wait(1500);
    // Deepest element whose own text matches; React buttons are often divs with an onClick.
    const clickText = async (re) => {
      const src = re.source;
      const hit = await page.evaluate((src) => {
        const re = new RegExp(src, 'i');
        const all = Array.from(document.querySelectorAll('button, [role=button], a, label, div, span'));
        const cands = all.filter(el => { const t = ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).trim().replace(/s+/g, ' '); return t.length < 120 && re.test(t) && el.offsetParent !== null; });
        const deepest = cands.find(el => !cands.some(o => o !== el && el.contains(o)));
        if (!deepest) return null;
        deepest.scrollIntoView({ block: 'center' }); deepest.click();
        return ((deepest.innerText || '') + ' ' + (deepest.getAttribute('aria-label') || '')).trim().replace(/s+/g, ' ').toLowerCase();
      }, src);
      if (hit) await wait(1200);
      return hit;
    };
    const bodyText = async () => page.evaluate(() => document.body.innerText);
    // The guest door on the landing, then the starter on the first-run fork.
    const door = await clickText(/try (it )?free|try wovely|try the demo|try it now|start free|as a guest|guest/);
    must(!!door, `${width}: guest door on the landing (${door || 'none matched'})`);
    await page.waitForFunction(() => /open the demo|starter|start with|try this one/i.test(document.body.innerText), { timeout: 30_000 }).catch(() => {});
    const starter = await clickText(/open the demo|starter|start with this|try this one|use this pattern|open the starter/);
    must(!!starter, `${width}: starter pick (${starter || 'none matched'})`);
    // The demo counter: the rows are aria-pressed buttons and the header reads "Round n of 8".
    await page.waitForFunction(() => /Round \d+ of \d+/.test(document.body.innerText) && !!document.querySelector('button[aria-pressed]'), { timeout: 45_000 }).catch(() => {});
    const hasCounter = await page.$('button[aria-pressed="false"]');
    must(!!hasCounter, `${width}: the round counter rendered`);
    if (!hasCounter) { console.log('body:', (await bodyText()).slice(0, 500).replace(/[\r\n]+/g, ' | ')); await page.close(); continue; }
    const mic = await page.$('button[aria-label="Count by voice"]');
    const sr = await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
    must(!!mic, `${width}: the mic button is on the counter (SpeechRecognition in this browser: ${sr})`);
    if (mic) await page.evaluate(el => el.scrollIntoView({ block: 'center' }), mic);
    await page.screenshot({ path: path.join(outDir, `voice-counter-${width}.png`) });
    if (mic) {
      await mic.click();
      await wait(2500);
      const status = await page.evaluate(() => (document.querySelector('[role=status]') || {}).textContent || '');
      const pressed = await page.evaluate(() => { const b = document.querySelector('button[aria-label="Stop listening"], button[aria-label="Count by voice"]'); return b ? b.getAttribute('aria-pressed') : null; });
      must(!!status || pressed === 'true', `${width}: the mic tap changed state (status "${status.slice(0, 70)}", pressed ${pressed})`);
      await page.screenshot({ path: path.join(outDir, `voice-counter-${width}-on.png`) });
    }
    // The tap counter still counts after the mic was touched.
    const before = await page.evaluate(() => (document.body.innerText.match(/Round (\d+) of/) || [])[1]);
    await page.evaluate(() => { const rows = Array.from(document.querySelectorAll('button[aria-pressed]')).filter(b => b.getAttribute('aria-label') === null); rows[0] && rows[0].click(); });
    await wait(700);
    const after = await page.evaluate(() => (document.body.innerText.match(/Round (\d+) of/) || [])[1]);
    must(Number(after) === Number(before) + 1, `${width}: a tap still counts a round (${before} to ${after})`);
    must(errors.length === 0, `${width}: no page errors${errors.length ? ' (' + errors[0].slice(0, 120) + ')' : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
}
if (fails.length) { console.log('PROBE_FAIL ' + fails[0]); process.exit(1); }
console.log('PROBE_OK voice counter renders at 390 and 1440 and the tap counter still counts');
