// scripts/review-shots.mjs — one-off visual capture for the 7/14 final review.
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const OUT = 'C:/Users/alaba/second-brain/Personal/Projects/Wovely Vault/90 Screenshots/2026-07-14';
fs.mkdirSync(OUT, { recursive: true });

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('NO_BROWSER'); process.exit(1); }

const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async (page, name) => { await wait(1400); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('SHOT', name); };
const dump = async (page, tag) => console.log(tag, '::', page.url(), '::', await page.evaluate(() =>
  [...document.querySelectorAll('button')].map(e => (e.innerText || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 25).join(' / ')));

const clickBtn = async (page, txt) => {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, a')];
    const el = els.find(e => (e.innerText || '').trim().replace(/\s+/g, ' ').toLowerCase() === t.toLowerCase())
            || els.find(e => (e.innerText || '').trim().toLowerCase().startsWith(t.toLowerCase()));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, txt);
  console.log(ok ? `CLICK ${txt}` : `MISS ${txt}`);
  await wait(1800);
  return ok;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 960 });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE_ERR:', m.text().slice(0, 200)); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
await shot(page, '01-landing');

await clickBtn(page, 'Try Wovely free');
await dump(page, 'TRY');
await shot(page, '02-try-screen');

if (!(await clickBtn(page, 'Import'))) await clickBtn(page, 'Pick');
await wait(2500);
await dump(page, 'IN_APP');
await shot(page, '03-my-wovely');

const go = async (path, name) => {
  await page.goto('http://localhost:5173' + path, { waitUntil: 'networkidle2' });
  await wait(2200);
  await shot(page, name);
  await dump(page, name);
};

await go('/circle', '04-yarn-circle');
await go('/stitch-check', '05-bevcheck');
await go('/hive-vision', '06-snap-and-stitch');

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
await wait(2000);
if (!(await clickBtn(page, 'Add Pattern'))) await clickBtn(page, 'Add a pattern');
await shot(page, '07-add-pattern');
await dump(page, 'ADD');

await browser.close();
console.log('DONE ->', OUT);
