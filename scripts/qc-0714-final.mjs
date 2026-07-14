// scripts/qc-0714-final.mjs - launch-day QC render pass, guest + logged-in.
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const OUT = 'C:/Users/alaba/second-brain/Personal/Projects/Wovely Vault/90 Screenshots/2026-07-14-final';
fs.mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  fs.readFileSync('C:/Users/alaba/wovely/.env.local', 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
const URL = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('NO_BROWSER'); process.exit(1); }

const BASE = process.env.QC_BASE || 'http://localhost:5173';
const TEST_EMAIL = `qc-launch-0714@wovely.app`;
const TEST_PW = 'Qc!' + Math.random().toString(36).slice(2) + 'A9';
const wait = ms => new Promise(r => setTimeout(r, ms));
const errs = [];

// --- create a throwaway test user (deleted at the end) ---
let userId = null, session = null;
try {
  const del = await fetch(`${URL}/auth/v1/admin/users?email=${encodeURIComponent(TEST_EMAIL)}`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  const existing = await del.json();
  const prior = (existing.users || []).find(u => u.email === TEST_EMAIL);
  if (prior) await fetch(`${URL}/auth/v1/admin/users/${prior.id}`, { method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });

  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PW, email_confirm: true }),
  });
  const u = await r.json();
  userId = u.id;
  console.log('TESTUSER', r.status, userId);

  const t = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PW }),
  });
  session = await t.json();
  console.log('SESSION', t.status, session.access_token ? 'OK' : JSON.stringify(session).slice(0, 200));
} catch (e) { console.log('AUTH_SETUP_FAIL', e.message); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

const newPage = async (withSession) => {
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 980 });
  p.on('pageerror', e => { errs.push(`PAGEERROR ${e.message}`); console.log('PAGEERROR:', e.message); });
  p.on('console', m => { if (m.type() === 'error') { const t = m.text().slice(0, 160); errs.push(`CONSOLE ${t}`); console.log('CONSOLE_ERR:', t); } });
  if (withSession && session?.access_token) {
    await p.evaluateOnNewDocument((s) => { localStorage.setItem('yh_session', JSON.stringify(s)); }, session);
  }
  return p;
};

const shot = async (p, path, name) => {
  await p.goto(BASE + path, { waitUntil: 'networkidle2' }).catch(e => console.log('NAV_FAIL', path, e.message));
  await wait(2000);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  const body = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 260));
  console.log(`SHOT ${name} :: ${p.url()} :: ${body}`);
};

// ---------- GUEST ----------
const g = await newPage(false);
await shot(g, '/', 'G01-landing');
// footer check: does the word "founders" appear anywhere?
const founders = await g.evaluate(() => ({
  bodyHasFounders: /founder/i.test(document.body.innerText),
  links: [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(Boolean).join(' | '),
}));
console.log('FOUNDERS_IN_LANDING_TEXT:', founders.bodyHasFounders);
console.log('LANDING_LINKS:', founders.links);
await shot(g, '/founders', 'G02-founders-route');
const f2 = await g.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
console.log('FOUNDERS_ROUTE_RENDERS:', f2);
await shot(g, '/hive-vision', 'G03-hive-vision');
await shot(g, '/circle', 'G04-yarn-circle');
await shot(g, '/pricing', 'G05-pricing');
await g.close();

// ---------- LOGGED IN ----------
const a = await newPage(true);
await shot(a, '/', 'A01-my-wovely');
await shot(a, '/circle', 'A02-yarn-circle-authed');
await shot(a, '/hive-vision', 'A03-snap-and-stitch-authed');
await shot(a, '/profile', 'A04-profile');

// Add-pattern hub: click the + button
await a.goto(BASE + '/', { waitUntil: 'networkidle2' }); await wait(1500);
const clicked = await a.evaluate(() => {
  const els = [...document.querySelectorAll('button,a')];
  const el = els.find(e => (e.getAttribute('aria-label') || '').toLowerCase().includes('add'))
          || els.find(e => (e.innerText || '').trim() === '+');
  if (!el) return false; el.click(); return true;
});
await wait(2200);
await a.screenshot({ path: `${OUT}/A05-add-hub.png` });
const addTxt = await a.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
console.log('ADD_HUB clicked=', clicked, '::', addTxt);

// Upgrade / pricing modal: look for the Craft card copy
await a.goto(BASE + '/?upgrade=1', { waitUntil: 'networkidle2' }); await wait(1500);
const craftCopy = await a.evaluate(() => {
  const t = document.body.innerText;
  return { has100: /Up to 100 patterns/i.test(t), has3pm: /3 per month/i.test(t), hasLargeLib: /a large library/i.test(t) };
});
console.log('CRAFT_COPY_ON_SCREEN:', JSON.stringify(craftCopy));
await a.screenshot({ path: `${OUT}/A06-craft-card.png` });
await a.close();

// ---------- cleanup ----------
if (userId) {
  const d = await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
  console.log('TESTUSER_DELETED', d.status);
}
await browser.close();
console.log('=== ERROR SUMMARY ===');
console.log(errs.length ? [...new Set(errs)].join('\n') : 'NO PAGE ERRORS, NO CONSOLE ERRORS');
