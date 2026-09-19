// Proves "match the pattern" on the free gauge calculator, against production:
// the page carries the pattern-gauge inputs and the three new FAQ answers in
// its first paint, and typing a pattern gauge produces the right verdict and
// a next step in the three cases the boards keep asking (p-023 loose after a
// hook down, p-043 tight after a swatch that measured right, and a match).
// Same driver as the other probes (puppeteer-core on the installed Chrome);
// exit 0 on PROBE_OK, 1 on PROBE_FAIL. No user, no writes.
//   $env:QC_BASE="https://wovely.app"; node scripts/probe-gauge-next-step.mjs [--shots <dir>]
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
const PATH = '/crochet-gauge-calculator';

// 1. First paint, no JavaScript: the crawler's view.
const html = await (await fetch(BASE + PATH, { headers: { 'user-agent': 'wovely-probe' } })).text();
const plain = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
must(/match the pattern/i.test(plain), 'raw HTML carries the match-the-pattern box');
must(/still too big\. Now what/i.test(plain), 'raw HTML carries the hook-down FAQ (p-023)');
must(/sweater still came out tight/i.test(plain), 'raw HTML carries the tight-sweater FAQ (p-043)');
must(/every colour of the same yarn/i.test(plain), 'raw HTML carries the per-colour FAQ (p-040)');
must(!/\u2014/.test(plain), 'raw HTML carries no em dash');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
try {
  for (const [w, h, tag] of [[390, 844, 'phone'], [1440, 900, 'desktop']]) {
    const page = await browser.newPage(); await page.setViewport({ width: w, height: h });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + PATH, { waitUntil: 'networkidle0' }); await wait(500);
    const inputs = await page.$$('input');
    // Input renders its label as the div before the field, not a <label>.
    const labels = await page.evaluate(() => [...document.querySelectorAll('input')].map(i => (i.parentElement?.firstElementChild?.textContent || i.getAttribute('aria-label') || i.placeholder || '').trim().toLowerCase()));
    const idx = name => labels.findIndex(l => l.startsWith(name));
    const iSt = idx('stitches'), iSw = idx('swatch'), iPat = idx('pattern stitches');
    must(iSt >= 0 && iSw >= 0 && iPat >= 0, `${tag} inputs found (stitches=${iSt}, swatch=${iSw}, pattern stitches=${iPat})`);
    if (iPat < 0) { await page.close(); continue; }
    // A triple-click does not reliably select a type=number field; select it
    // in the page, clear it, then type, and read the value back.
    const type = async (i, v) => {
      await inputs[i].click(); await inputs[i].evaluate(el => el.select()); await page.keyboard.press('Backspace');
      await inputs[i].type(String(v)); await wait(60);
      const got = await inputs[i].evaluate(el => el.value);
      if (got !== String(v)) console.log(`     (typed ${v} into input ${i}, field reads ${JSON.stringify(got)})`);
    };
    const verdict = () => page.evaluate(() => document.querySelector('[data-gauge-verdict]')?.getAttribute('data-gauge-verdict') || 'none');
    const noteText = () => page.evaluate(() => document.querySelector('[data-gauge-verdict]')?.innerText || '');

    // p-023: the pattern says 16 stitches make 4 in; hers make 5 in. Over her 5 in
    // window that is 16 of hers against 20 of the pattern's. Loose, three steps.
    await type(iSt, 16); await type(iSw, 5); await type(iPat, 20); await wait(150);
    must((await verdict()) === 'loose', `${tag} p-023 shape reads loose`);
    must(/go down about 3 hook sizes/.test(await noteText()), `${tag} p-023 says about 3 hook sizes`);
    must(/Scale tab/.test(await noteText()), `${tag} p-023 points past two steps at the Scale tab`);
    await shot(page, `gauge-loose-${tag}`);

    // p-043: 18 over 4 in when the pattern wants 16. Tight, two steps.
    await type(iSw, 4); await type(iSt, 18); await type(iPat, 16); await wait(150);
    must((await verdict()) === 'tight', `${tag} p-043 shape reads tight`);
    must(/go up about 2 hook sizes/.test(await noteText()), `${tag} p-043 says about 2 hook sizes`);
    must(/in the round/.test(await noteText()), `${tag} p-043 names the in-the-round cause`);
    await shot(page, `gauge-tight-${tag}`);

    // A match: 16 over 4 against 16.
    await type(iSt, 16); await wait(150);
    must((await verdict()) === 'match', `${tag} equal gauges read match`);
    must(/You match/.test(await noteText()), `${tag} match says so`);

    // Empty pattern box: no verdict at all.
    await inputs[iPat].click(); await inputs[iPat].evaluate(el => el.select()); await page.keyboard.press('Backspace'); await wait(150);
    must((await verdict()) === 'none', `${tag} no pattern gauge, no verdict`);
    must(errs.length === 0, `${tag} no page errors${errs.length ? ' (' + errs[0].slice(0, 80) + ')' : ''}`);
    await page.close();
  }
} finally { await browser.close(); }
if (fails.length) { console.log('PROBE_FAIL ' + fails.length + ' miss(es): ' + fails.join(' | ')); process.exit(1); }
console.log('PROBE_OK gauge match-the-pattern is live at ' + BASE);
