import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'C:/Users/alaba/second-brain/Personal/Projects/Wovely Vault/90 Screenshots/2026-07-14-final';
const env = Object.fromEntries(fs.readFileSync('C:/Users/alaba/wovely/.env.local','utf8').split(/\r?\n/)
  .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
const { VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SVC } = env;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const BASE = process.env.QC_BASE || 'http://localhost:5173';
const EMAIL = 'qc-launch-0714b@wovely.app', PW = 'Qc!'+Math.random().toString(36).slice(2)+'A9';
const wait = ms => new Promise(r=>setTimeout(r,ms));
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type':'application/json' };

const cu = await fetch(`${URL}/auth/v1/admin/users`, { method:'POST', headers:H, body: JSON.stringify({ email: EMAIL, password: PW, email_confirm: true }) });
const user = await cu.json(); console.log('TESTUSER', cu.status, user.id);
const tk = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method:'POST', headers:{apikey:ANON,'Content-Type':'application/json'}, body: JSON.stringify({ email: EMAIL, password: PW }) });
const session = await tk.json(); console.log('SESSION', tk.status, session.access_token ? 'OK':'FAIL');

const b = await puppeteer.launch({ executablePath: CHROME, headless:'new', args:['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 1100 });
p.on('pageerror', e => console.log('PAGEERROR:', e.message));
await p.evaluateOnNewDocument(s => localStorage.setItem('yh_session', JSON.stringify(s)), session);

const click = async (t) => await p.evaluate((t)=>{
  const els=[...document.querySelectorAll('button,a,div')];
  const el=els.filter(e=>e.children.length<4).find(e=>(e.innerText||'').replace(/\s+/g,' ').trim().toLowerCase().startsWith(t.toLowerCase()));
  if(!el) return false; el.click(); return true; }, t);

await p.goto(BASE+'/', { waitUntil:'networkidle2' }); await wait(2500);
console.log('click Add Pattern:', await click('Add Pattern')); await wait(2500);
await p.screenshot({ path: `${OUT}/C01-add-hub.png` });
console.log('ADD HUB ::', await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,300)));

await p.goto(BASE+'/', { waitUntil:'networkidle2' }); await wait(2000);
console.log('click See plans:', await click('See plans')); await wait(2800);
await p.screenshot({ path: `${OUT}/C02-craft-plans.png` });
const t = await p.evaluate(()=>document.body.innerText);
console.log('CRAFT CARD :: "Up to 100 patterns"=', /Up to 100 patterns/i.test(t),
            '| "3 per month"=', /3 per month/i.test(t),
            '| "a large library"=', /a large library/i.test(t),
            '| "$54.99"=', /54\.99/.test(t), '| "unlimited"=', /unlimited/i.test(t));

await p.goto(BASE+'/circle', { waitUntil:'networkidle2' }); await wait(2500);
await p.screenshot({ path: `${OUT}/C03-yarn-circle.png` });
await p.goto(BASE+'/hive-vision', { waitUntil:'networkidle2' }); await wait(2500);
await p.screenshot({ path: `${OUT}/C04-snap-stitch.png` });
await b.close();
const d = await fetch(`${URL}/auth/v1/admin/users/${user.id}`, { method:'DELETE', headers:H });
console.log('TESTUSER_DELETED', d.status);
