import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'C:/Users/alaba/second-brain/Personal/Projects/Wovely Vault/90 Screenshots/2026-07-14-final';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const BASE = process.env.QC_BASE || 'http://localhost:5173';
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 980 });
p.on('pageerror', e => console.log('PAGEERROR:', e.message));

const click = async (txt) => await p.evaluate((t) => {
  const els = [...document.querySelectorAll('button,a,div[role=button]')];
  const el = els.find(e => (e.innerText||'').replace(/\s+/g,' ').trim().toLowerCase().startsWith(t.toLowerCase()));
  if (!el) return false; el.click(); return true;
}, txt);

await p.goto(BASE + '/', { waitUntil: 'networkidle2' }); await wait(2500);
console.log('ADD_PATTERN clicked:', await click('Add Pattern')); await wait(2500);
await p.screenshot({ path: `${OUT}/B01-add-hub.png` });
console.log('ADD_HUB TEXT ::', await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,400)));

await p.goto(BASE + '/', { waitUntil: 'networkidle2' }); await wait(2000);
console.log('SEE PLANS clicked:', await click('See plans')); await wait(2500);
await p.screenshot({ path: `${OUT}/B02-see-plans.png`, fullPage: true });
const t = await p.evaluate(()=>document.body.innerText);
console.log('CRAFT COPY :: has "Up to 100 patterns":', /Up to 100 patterns/i.test(t),
            '| has "3 per month":', /3 per month/i.test(t),
            '| has "a large library":', /a large library/i.test(t),
            '| has "$54.99":', /54\.99/.test(t),
            '| has "unlimited":', /unlimited/i.test(t));
console.log('PLANS TEXT ::', t.replace(/\s+/g,' ').slice(0,700));

// BevCheck surface
await p.goto(BASE + '/bevcheck', { waitUntil: 'networkidle2' }); await wait(2500);
await p.screenshot({ path: `${OUT}/B03-bevcheck.png` });
console.log('BEVCHECK ::', p.url(), '::', await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,200)));
await b.close();
