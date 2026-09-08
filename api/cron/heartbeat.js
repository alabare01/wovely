// api/cron/heartbeat.js
// Hourly, from vercel.json crons. The digest half of the monitor.
//
// Two behaviours in one job, and the difference matters:
//   - EVERY HOUR: send a summary only if somebody was actually on the site.
//     A "0 visitors" email 24 times a day trains Adam to delete the channel,
//     and a deleted channel is worse than no channel.
//   - ONCE A DAY at 08:00 America/New_York: send the 24 hour roll-up WHATEVER
//     the number is, including zero. That message is the proof the monitor is
//     alive, so silence never has to be interpreted. A monitor that only
//     speaks when there is news is indistinguishable from a broken one.
//
// Auth: same CRON_SECRET the queue worker uses. Vercel sends it on scheduled
// invocations.
//
// Kill switch: MONITOR_HEARTBEAT_ENABLED=0, or MONITOR_ENABLED=0 for all of it.

import { runHeartbeat } from '../_monitor.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    console.warn('[heartbeat] CRON_SECRET not set — endpoint is unauthenticated');
  }

  const result = await runHeartbeat({
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  console.log('[heartbeat]', JSON.stringify(result));
  return res.status(200).json({ ok: true, ...result });
}
