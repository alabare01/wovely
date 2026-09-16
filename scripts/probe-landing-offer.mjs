// The landing carries the grand-opening offer in its first paint, and the
// letter's link lands on the letter's words. Same driver as probe-pdf-import
// (puppeteer-core on the installed Chrome). Exits 1 on any miss.
//   QC_BASE=https://wovely.app node scripts/probe-landing-offer.mjs [--shots <dir>]
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
const CLOSE = Date.parse('2026-12-01T04:59:59Z');
const inWindow = Date.now() < CLOSE;
const fails = [];
const must = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// 1. Raw HTML, no JavaScript: what a crawler and a slow phone see first.
const html = await (await fetch(BASE + '/', { headers: { 'user-agent': 'wovely-probe' } })).text();
const rootText = (html.match(/<div id="root">[\s\S]*$/)?.[0] || '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
if (inWindow) {
  must(/COZY/.test(rootText), 'raw HTML names the code');
  must(/half price/i.test(rootText), 'raw HTML says half price');
  must(/through November 30/.test(rootText), 'raw HTML names the close date');
  must(/hero-fall/.test(html), 'raw HTML carries the fall hero');
  const dollars = (rootText.match(/\$\d[\d.,]*/g) || []).filter(d => !/^\$(0|6\.99|54\.99|4\.58)$/.test(d));
  must(dollars.length === 0, `raw HTML shows no promo dollar figure before the Stripe read (${dollars.join(' ') || 'none beyond the canon prices'})`);
} else {
  must(!/COZY/.test(rootText), 'after the close: raw HTML carries no code');
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const text = page => page.evaluate(() => document.body.innerText);
try {
  for (const [w, h, tag] of [[390, 844, 'phone'], [1440, 900, 'desktop']]) {
    // 2. JavaScript off: first paint only.
    const p0 = await browser.newPage(); await p0.setViewport({ width: w, height: h }); await p0.setJavaScriptEnabled(false);
    await p0.goto(BASE + '/', { waitUntil: 'load' });
    const t0 = await text(p0);
    if (inWindow) must(/COZY/.test(t0) && /half price/i.test(t0), `${tag} js-off first paint shows the offer`);
    await shot(p0, `${tag}-js-off`); await p0.close();

    // 3. JavaScript on, the Stripe read done: the price clause arrives, nothing else moves.
    const p1 = await browser.newPage(); await p1.setViewport({ width: w, height: h });
    const errs = []; p1.on('pageerror', e => errs.push(e.message));
    await p1.goto(BASE + '/', { waitUntil: 'networkidle0' }); await wait(800);
    const t1 = await text(p1);
    if (inWindow) { must(/COZY/.test(t1), `${tag} js-on shows the code`); must(/takes 50% off \$\d/.test(t1), `${tag} js-on strip carries the Stripe price`); }
    const top = await p1.evaluate(() => { const el = [...document.querySelectorAll('.eyebrow, .sub')].find(e => /half price|COZY|doors are open/i.test(e.textContent)); return el ? el.getBoundingClientRect().top : null; });
    must(top !== null && top < h, `${tag} the offer sits above the fold (top=${top === null ? 'none' : Math.round(top)}px of ${h})`);
    await shot(p1, `${tag}-home`);
    must(errs.length === 0, `${tag} home: no page errors${errs.length ? ' (' + errs[0].slice(0, 80) + ')' : ''}`);
    await p1.close();

    // 4. The letter's landing.
    const p2 = await browser.newPage(); await p2.setViewport({ width: w, height: h });
    const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
    await p2.goto(BASE + '/?s=letter', { waitUntil: 'networkidle0' }); await wait(500);
    const t2 = await text(p2);
    must(/Bev kept your seat/i.test(t2), `${tag} ?s=letter says the letter's line`);
    must(/Pick up where you left off/.test(t2), `${tag} ?s=letter's first button is the letter's`);
    if (inWindow) must(/half price for your first three months/.test(t2), `${tag} ?s=letter repeats the offer`);
    await shot(p2, `${tag}-letter`);
    must(errs2.length === 0, `${tag} letter: no page errors`);
    await p2.close();
  }
} finally { await browser.close(); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall green');
process.exit(fails.length ? 1 : 0);
