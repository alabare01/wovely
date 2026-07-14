import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = 'C:/Users/alaba/second-brain/Personal/Projects/Wovely Vault/90 Screenshots/2026-07-14-LIVE';
fs.mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(fs.readFileSync('C:/Users/alaba/wovely/.env.local','utf8').split(/\r?\n/)
  .filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
const { VITE_SUPABASE_URL: SB, VITE_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SVC } = env;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const BASE = 'https://wovely.app';
const wait = ms => new Promise(r=>setTimeout(r,ms));
const H = { apikey: SVC, Authorization:`Bearer ${SVC}`, 'Content-Type':'application/json' };
const EMAIL='qc-live-0714@wovely.app', PW='Qc!'+Math.random().toString(36).slice(2)+'A9';

const cu = await fetch(`${SB}/auth/v1/admin/users`, { method:'POST', headers:H, body: JSON.stringify({ email:EMAIL, password:PW, email_confirm:true }) });
const user = await cu.json(); console.log('TESTUSER', cu.status, user.id);
const tk = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method:'POST', headers:{apikey:ANON,'Content-Type':'application/json'}, body: JSON.stringify({ email:EMAIL, password:PW }) });
const session = await tk.json();

// ---- ANNUAL CHECKOUT: create a session, read the amount, do NOT pay ----
const co = await fetch(`${BASE}/api/stripe-checkout`, { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ userId: user.id, email: EMAIL, tier:'craft', cadence:'annual' }) });
const coj = await co.json();
console.log('ANNUAL_CHECKOUT_STATUS', co.status, JSON.stringify(coj).slice(0,300));

const b = await puppeteer.launch({ executablePath: CHROME, headless:'new', args:['--no-sandbox'] });

// ---- GUEST ----
const g = await b.newPage(); await g.setViewport({width:1440,height:1000});
const errs=[]; g.on('pageerror', e=>{errs.push(e.message); console.log('PAGEERROR:',e.message);});
g.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE_ERR:', m.text().slice(0,140)); });

await g.goto(BASE+'/', {waitUntil:'networkidle2'}); await wait(3000);
await g.screenshot({path:`${OUT}/L01-landing.png`});
const land = await g.evaluate(()=>({
  hasFounderText: /founder/i.test(document.body.innerText),
  links: [...document.querySelectorAll('a')].map(a=>a.getAttribute('href')).filter(Boolean),
  hasFacelift: /More making/i.test(document.body.innerText),
  has5499: /54\.99/.test(document.body.innerText),
}));
console.log('LANDING hasFounderText=', land.hasFounderText, '| hasFacelift=', land.hasFacelift, '| has$54.99=', land.has5499);
console.log('LANDING links:', land.links.join(' | '));
console.log('FOUNDERS LINK IN FOOTER:', land.links.some(h=>/founder/i.test(h)));

const r = await g.goto(BASE+'/founders', {waitUntil:'networkidle2'}); await wait(3000);
await g.screenshot({path:`${OUT}/L02-founders.png`});
const fnd = await g.evaluate(()=>({ txt: document.body.innerText.replace(/\s+/g,' ').slice(0,240),
  hasEmail: /@gmail|@me\.com|@icloud|MRR|Monthly Recurring/i.test(document.body.innerText) }));
console.log('=== /founders HTTP', r.status(), '| URL', g.url());
console.log('=== /founders LEAKS EMAILS OR MRR:', fnd.hasEmail);
console.log('=== /founders RENDERS:', fnd.txt);

// raw HTML bundle check: is Founders code even shipped?
const src = await (await fetch(BASE+'/')).text();
const jsMatch = [...src.matchAll(/src="(\/assets\/index-[^"]+\.js)"/g)].map(m=>m[1]);
for (const j of jsMatch) {
  const code = await (await fetch(BASE+j)).text();
  console.log(`BUNDLE ${j}: "Founders"=${/Founders/.test(code)} | "@gmail.com" literal=${/@gmail\.com/.test(code)} | "MRR"=${/MRR/.test(code)}`);
}

// ---- LOGGED IN ----
const p = await b.newPage(); await p.setViewport({width:1440,height:1100});
await p.evaluateOnNewDocument(s=>localStorage.setItem('yh_session', JSON.stringify(s)), session);
await p.goto(BASE+'/', {waitUntil:'networkidle2'}); await wait(3500);
await p.screenshot({path:`${OUT}/L03-my-wovely.png`});
const click = async (t)=>await p.evaluate((t)=>{const els=[...document.querySelectorAll('button,a,div')].filter(e=>e.children.length<4);
  const el=els.find(e=>(e.innerText||'').replace(/\s+/g,' ').trim().toLowerCase().startsWith(t.toLowerCase())); if(!el)return false; el.click(); return true;},t);
console.log('click See plans:', await click('See plans')); await wait(3000);
await p.screenshot({path:`${OUT}/L04-craft-card.png`});
const t2 = await p.evaluate(()=>document.body.innerText);
console.log('LIVE CRAFT CARD :: "Up to 100 patterns"=', /Up to 100 patterns/i.test(t2), '| "3 per month"=', /3 per month/i.test(t2), '| "$54.99"=', /54\.99/.test(t2));
await p.goto(BASE+'/circle', {waitUntil:'networkidle2'}); await wait(3000);
await p.screenshot({path:`${OUT}/L05-yarn-circle.png`});
await b.close();
const d = await fetch(`${SB}/auth/v1/admin/users/${user.id}`, {method:'DELETE', headers:H});
console.log('TESTUSER_DELETED', d.status);
console.log('PAGE ERRORS:', errs.length ? errs.join('; ') : 'NONE');
