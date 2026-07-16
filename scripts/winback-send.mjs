// scripts/winback-send.mjs
// Win-back sender. DRY RUN BY DEFAULT. Sends nothing unless --send is passed.
//
//   node scripts/winback-send.mjs --email=1              # dry run, prints recipients
//   node scripts/winback-send.mjs --email=1 --send       # actually sends
//
// Cohort: every user EXCEPT Adam, Danielle (both accounts), and anyone who
// signed in within the last 7 days. Copy lives in the vault draft:
// 50 Growth/(C) Win-Back Sequence - DRAFT 2026-07-14.md
import fs from 'fs';

// Env comes from the repo's own .env.local, whatever machine this runs on
// (the old absolute C:/Users/alaba path only existed on one box). The script
// needs SUPABASE_SERVICE_ROLE_KEY and RESEND_API_KEY, which the checked-out
// .env.local may not carry - populate it first with:
//   vercel env pull .env.local --environment=production
const envFile = new URL('../.env.local', import.meta.url);
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8')
  .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const { VITE_SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SVC, RESEND_API_KEY: RK } = env;

const args = process.argv.slice(2);
const SEND = args.includes('--send');
const N = Number((args.find(a => a.startsWith('--email=')) || '').split('=')[1]);
if (![1, 2, 3].includes(N)) { console.error('Pass --email=1, --email=2 or --email=3'); process.exit(1); }

const EXCLUDE_IDS = new Set([
  '6e1a02d9-c210-4bc4-968e-dde3435565d1', // Adam
  'd6b18345-a85e-42bd-b7cb-f20efd4b2fe7', // Danielle (me.com)
  '038442a2-b13d-4abb-9960-24a360078f6c', // Danielle (gmail)
]);

const EMAILS = {
  1: { subject: 'We rebuilt Wovely', body: (n) => `Hi ${n},

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
Founder, Wovely` },
  2: { subject: 'The part I think you will actually care about', body: (n) => `Hi ${n},

Short one.

The single feature I would have wanted back when I was the one squinting at a badly written pattern at eleven at night is BevCheck.

You hand Bev a pattern. Before you cast on, she reads it and tells you whether the stitch counts add up, whether a round is broken, whether the designer skipped a step. She gives it a score. If the pattern is bad, you find out in ten seconds instead of four hours.

That is the whole pitch. Fewer frogged projects. Fewer nights lost to somebody else's arithmetic.

It is in the app right now, and your account still works.

https://wovely.app

Adam` },
  3: { subject: 'Last note from me', body: (n) => `Hi ${n},

This is the last email I will send about the rebuild, so I will keep it to two things.

One. Wovely is live and it is good now. Patterns read and checked, your place kept row by row, your yarn and hooks tracked, and a Circle of makers sharing finished work. Free to use, and your account is still sitting there.

https://wovely.app

Two. If you are not coming back, I would rather know why than wonder. Hit reply and tell me what was missing. One line is plenty. I read every one of these myself, and the people who told me what was wrong the first time are the reason the second version is better.

Either way, thank you for taking a chance on the early version.

Adam
Founder, Wovely` },
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

// Greeting name. Only trust a real profile name; a name derived from the
// email local-part produces "Hi Stinkyswife," / "Hi A," / the wrong half of
// "mackay.amanda" - an automation tell in a letter that is supposed to read
// human. No profile name -> "there" ("Hi there,").
const firstName = (u) => {
  const profileName = u.user_metadata?.full_name || u.user_metadata?.name;
  if (!profileName) return 'there';
  return profileName.split(/[\s.]+/)[0].replace(/^./, c => c.toUpperCase());
};

console.log(`TOTAL USERS: ${users.length}`);
console.log(`COHORT (lapsed, excluding Adam/Danielle/last-7-day actives): ${cohort.length}`);
console.log(`EMAIL ${N}: "${EMAILS[N].subject}"`);
console.log('---');
cohort.forEach(u => console.log(`  ${u.email}  (${firstName(u)})  last_sign_in=${u.last_sign_in_at || 'never'}`));
console.log('---');

if (!SEND) {
  console.log('DRY RUN. Nothing was sent. Re-run with --send to actually send.');
  process.exit(0);
}

for (const u of cohort) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Adam at Wovely <support@wovely.app>',
      reply_to: 'adam@wovely.app',
      to: u.email,
      subject: EMAILS[N].subject,
      text: EMAILS[N].body(firstName(u)),
    }),
  });
  console.log(res.ok ? `SENT ${u.email}` : `FAIL ${u.email} ${res.status} ${await res.text()}`);
  await new Promise(r => setTimeout(r, 600));
}
console.log('DONE.');
