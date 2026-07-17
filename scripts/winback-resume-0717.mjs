// One-time resume for the interrupted 2026-07-17 email-1 send. Pulls the
// cohort with the exact winback-send.mjs filter, asks Resend which cohort
// members already received "We rebuilt Wovely", and sends ONLY the rest.
// Safe to re-run: the ledger diff makes it idempotent.
import fs from 'fs';

const envFile = new URL('../.env.local', import.meta.url);
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8')
  .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const { VITE_SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SVC, RESEND_API_KEY: RK } = env;

const SEND = process.argv.includes('--send');

const EXCLUDE_IDS = new Set([
  '6e1a02d9-c210-4bc4-968e-dde3435565d1',
  'd6b18345-a85e-42bd-b7cb-f20efd4b2fe7',
  '038442a2-b13d-4abb-9960-24a360078f6c',
]);

const FOOTER = `

--
Wovely LLC, 487 S Aberdeenshire Dr, Saint Johns, FL 32259
You are receiving this because you created a Wovely account. Reply with the word stop and you will not hear from me again.`;

const SUBJECT = 'We rebuilt Wovely';
const body = (n) => `Hi ${n},

You signed up for Wovely a while back, had a look, and did not come back. I want to be straight with you about why: it was not ready. It was slow in places, it was ugly in places, and the thing it promised, that it would keep your patterns organized and checked and out of your way, it did not really do yet.

That version is gone. We rebuilt it.

What is there now:

Bev reads your patterns properly. Hand her a PDF, photos of a paper pattern, a Ravelry link, or pasted text, and she reads it, checks every stitch count, and sets it up so you can track your place row by row.

BevCheck scores a pattern before you start, so an off-count or a broken round shows up before you have crocheted forty rows into it.

The Yarn Circle is new. Finished makes, shared, with a weekly theme.

And the whole thing looks and moves like something built by someone who actually crochets.

It is free to come back and look. Your account is still there.

https://wovely.app

Adam
Founder, Wovely${FOOTER}`;

const firstName = (u) => {
  const profileName = u.user_metadata?.full_name || u.user_metadata?.name;
  if (!profileName) return 'there';
  return profileName.split(/[\s.]+/)[0].replace(/^./, c => c.toUpperCase());
};

const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const r = await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: H });
const { users = [] } = await r.json();
const cutoff = Date.now() - 7 * 864e5;
const cohort = users.filter(u =>
  u.email && !EXCLUDE_IDS.has(u.id) && !u.is_anonymous &&
  !/^qc-/.test(u.email) && !u.email.endsWith('@wovely.app') &&
  !(u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() > cutoff)
);

const led = await fetch('https://api.resend.com/emails?limit=100', { headers: { Authorization: `Bearer ${RK}` } });
const ledger = (await led.json()).data || [];
const alreadySent = new Set(ledger.filter(e => e.subject === SUBJECT).flatMap(e => Array.isArray(e.to) ? e.to : [e.to]).map(e => e.toLowerCase()));

const remaining = cohort.filter(u => !alreadySent.has(u.email.toLowerCase()));
console.log(`COHORT: ${cohort.length}  ALREADY SENT: ${alreadySent.size}  REMAINING: ${remaining.length}`);
remaining.forEach(u => console.log(`  TODO ${u.email}`));

if (!SEND) { console.log('DRY RUN. Re-run with --send.'); process.exit(0); }

for (const u of remaining) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Adam at Wovely <support@wovely.app>',
      reply_to: 'adam@wovely.app',
      to: u.email,
      subject: SUBJECT,
      text: body(firstName(u)),
    }),
  });
  console.log(res.ok ? `SENT ${u.email}` : `FAIL ${u.email} ${res.status} ${await res.text()}`);
  await new Promise(r => setTimeout(r, 600));
}
console.log('DONE.');
