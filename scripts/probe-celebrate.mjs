// The celebration path, exercised end to end without a sound. Posts a dry
// event through api/_celebrate.js (the exact code the app runs) to the live
// comms server behind comms.gognome.io with the shared secret from
// ~/.samm/wovely-celebrate.txt. Green means: the secret matches what Vercel
// holds, the route is up, and celebrate.mjs accepted the kind. It proves the
// wire, not the speaker; a real pattern from a real member proves the rest.
//
//   node scripts/probe-celebrate.mjs            all three kinds, dry
//   PROBE_KIND=pattern node scripts/probe-celebrate.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const file = path.join(os.homedir(), '.samm', 'wovely-celebrate.txt');
if (!fs.existsSync(file)) { console.log('FAIL no secret at ~/.samm/wovely-celebrate.txt'); process.exit(1); }
process.env.WOVELY_CELEBRATE_SECRET = fs.readFileSync(file, 'utf8').trim();
const { celebrate } = await import('../api/_celebrate.js');
const kinds = process.env.PROBE_KIND ? [process.env.PROBE_KIND] : ['pattern', 'member', 'sale'];
let bad = 0;
for (const kind of kinds) {
  const r = await celebrate({ kind, what: kind === 'sale' ? 'Wovely Pro' : 'probe pattern', who: 'a member', amount: kind === 'sale' ? 6.99 : undefined, id: 'probe:' + kind + ':' + Date.now(), dry: true });
  console.log(kind.padEnd(8), r.ok ? 'ok (dry, accepted)' : 'FAIL ' + r.why);
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);
