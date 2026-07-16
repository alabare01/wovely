// api/notify-signup.js
// Called by Supabase webhook on new user signup — sends email notification to Adam
// Env vars: WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL, RESEND_API_KEY

import { createClient } from '@supabase/supabase-js';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const _url = process.env.VITE_SUPABASE_URL;
  const _key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const _t0 = Date.now();

  // Verify webhook secret
  const secret = req.headers['x-webhook-secret'];
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    console.error('[notify-signup] Invalid or missing webhook secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Env var checks
  if (!process.env.VITE_SUPABASE_URL) {
    console.error('[notify-signup] Missing VITE_SUPABASE_URL');
    return res.status(500).json({ error: 'Missing VITE_SUPABASE_URL' });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[notify-signup] Missing SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('[notify-signup] Missing RESEND_API_KEY');
    return res.status(500).json({ error: 'Missing RESEND_API_KEY' });
  }

  try {
    const record = req.body?.record || req.body;
    const { id, email, created_at } = record;

    // Guest sessions INSERT an anonymous auth.users row (no email) — that is
    // normal, not an error. The real signup arrives later as the UPDATE that
    // sets the email (see the "notify-signup-email-set" trigger on auth.users).
    if (id && !email) {
      return res.status(200).json({ success: true, skipped: 'anonymous user, no email yet' });
    }
    if (!id || !email) {
      console.error('[notify-signup] Missing id or email in payload:', JSON.stringify(req.body));
      return res.status(400).json({ error: 'Missing id or email' });
    }

    const supabase = getSupabase();

    // Get total user count
    let userCount = '?';
    try {
      const { count, error: countError } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .abortSignal(AbortSignal.timeout(5000));

      if (countError) {
        // Fallback: try querying auth.users via RPC or just log
        console.error('[notify-signup] Count query error:', countError.message);
      } else {
        userCount = count;
      }
    } catch (countErr) {
      console.error('[notify-signup] Count query exception:', countErr.message);
    }

    // Format date nicely
    const signedUp = created_at
      ? new Date(created_at).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
      : 'just now';

    // Send email notification
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Wovely App <support@wovely.app>',
        to: 'adam@wovely.app',
        subject: `🎉 New Wovely signup: ${email}`,
        text: `New user just signed up for Wovely!\n\nEmail: ${email}\nUser ID: ${id}\nSigned up: ${signedUp}\n\nYou now have ${userCount} users.\n\n— Wovely`
      })
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error('[notify-signup] Resend error:', emailRes.status, errBody);
    }

    console.log('[notify-signup] Notification sent for:', email);
    if (_url && _key) {
      await fetch(`${_url}/rest/v1/vercel_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: `POST /api/notify-signup → 200 (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/notify-signup', request_method: 'POST', status_code: 200, project_id: 'wovely' })
      }).catch(() => {});
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[notify-signup] Unexpected error:', err);
    if (_url && _key) {
      await fetch(`${_url}/rest/v1/vercel_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: `[notify-signup] error: ${err.message} (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/notify-signup', request_method: 'POST', status_code: 500, project_id: 'wovely' })
      }).catch(() => {});
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}

