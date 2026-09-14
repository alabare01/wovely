// scripts/waitlist-read.mjs
// The read side of the guest email ask (src/RowManager.jsx GuestEmailAsk).
//
// A guest leaves one email and it lands on their anonymous auth user as
// user_metadata.waitlist_email, with waitlist_at and signup_source (the ?s=
// channel they arrived through). No table was added. This lists every one,
// newest first, grouped by source, for the WOVELY desk's letter.
//
//   node scripts/waitlist-read.mjs            # table
//   node scripts/waitlist-read.mjs --json     # machine
//
// Reads .env.local (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Never sends.

import fs from 'node:fs';

const envFile = new URL('../.env.local', import.meta.url);
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SB = env.VITE_SUPABASE_URL, SVC = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !SVC) { console.error('missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(2); }

const headers = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const rows = [];
for (let page = 1; page <= 50; page++) {
  const r = await fetch(`${SB}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers });
  if (!r.ok) { console.error('admin/users', r.status, await r.text()); process.exit(1); }
  const { users = [] } = await r.json();
  for (const u of users) {
    const m = u.user_metadata || {};
    // The desk's own production walks leave product-desk-*@wovely.app behind.
    if (/^product-desk-.*@wovely\.app$/.test(String(m.waitlist_email || ''))) continue;
    if (m.waitlist_email) rows.push({
      email: m.waitlist_email,
      source: m.signup_source || 'direct',
      at: m.waitlist_at || u.updated_at,
      user_id: u.id,
      anonymous: !!u.is_anonymous,
      became_user: u.email || null,
    });
  }
  if (users.length < 1000) break;
}
rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
const readAt = new Date().toISOString();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ read_at: readAt, count: rows.length, rows }, null, 2));
} else {
  console.log(`waitlist emails: ${rows.length} (Supabase auth, read ${readAt})`);
  const bySource = {};
  for (const r of rows) bySource[r.source] = (bySource[r.source] || 0) + 1;
  for (const [s, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) console.log(`  ${s}: ${n}`);
  for (const r of rows) console.log(`${r.at}  ${r.email}  s=${r.source}${r.became_user ? '  (signed up as ' + r.became_user + ')' : ''}`);
}
