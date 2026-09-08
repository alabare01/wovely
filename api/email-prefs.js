// api/email-prefs.js
// The unsubscribe route that every Wovely email links to.
//
// GET  /api/email-prefs?u=<user_id>&t=<token>   human clicks the footer link
// POST /api/email-prefs?u=<user_id>&t=<token>   RFC 8058 one-click, sent by
//                                               Gmail and Apple Mail
//
// The opt-out is recorded on the auth user's user_metadata (email_opt_out).
// Deliberately NOT a new table: a migration would be a step Adam has to run
// before any of this works, and the whole point of the build is that turning
// welcome mail on is one env flag and nothing else.
//
// Env: WEBHOOK_SECRET (signs the link, already set), VITE_SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY.

import { verifyUnsubscribeToken } from './_mail.js';

function page(title, body, status) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;background:#f8f6f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2D3A7C;">
<div style="max-width:520px;margin:12vh auto;padding:40px 32px;background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(45,58,124,.06);text-align:center;">
<h1 style="font-family:Georgia,serif;font-size:24px;margin:0 0 12px;">${title}</h1>
<p style="font-size:16px;line-height:1.65;color:#3a3a4a;margin:0 0 20px;">${body}</p>
<a href="https://wovely.app" style="color:#9B7EC8;text-decoration:none;font-weight:600;">wovely.app</a>
</div></body></html>`;
}

export default async function handler(req, res) {
  const isPost = req.method === 'POST';
  if (req.method !== 'GET' && !isPost) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel gives req.query; fall back to parsing the URL for safety.
  const q = req.query || Object.fromEntries(new URL(req.url, 'https://wovely.app').searchParams);
  const userId = q.u || q.user || '';
  const token = q.t || q.token || '';

  const fail = (msg) => {
    if (isPost) return res.status(400).json({ error: msg });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(page('That link did not work', `${msg} Reply to any Wovely email and Adam will take you off the list by hand.`));
  };

  if (!userId || !token) return fail('The unsubscribe link was missing part of its address.');
  if (!verifyUnsubscribeToken(userId, token)) return fail('The unsubscribe link could not be verified.');

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[email-prefs] Supabase env missing');
    return fail('Wovely could not reach its records just now.');
  }

  const authHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // Merge rather than replace: user_metadata carries other things.
    let existing = {};
    const getRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(6000),
    });
    if (getRes.ok) {
      const u = await getRes.json();
      existing = u?.user_metadata || {};
    } else if (getRes.status === 404) {
      return fail('That account is no longer on file, so there is nothing left to unsubscribe.');
    }

    const putRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        user_metadata: { ...existing, email_opt_out: true, email_opt_out_at: new Date().toISOString() },
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!putRes.ok) {
      const body = await putRes.text();
      console.error('[email-prefs] opt-out write failed:', putRes.status, body.substring(0, 200));
      return fail('Wovely could not save that just now.');
    }

    console.log('[email-prefs] opt-out recorded for', userId);

    if (isPost) return res.status(200).json({ ok: true });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res
      .status(200)
      .send(
        page(
          'You are unsubscribed',
          'Wovely will not email you again. Your account and your patterns are untouched, and you can sign in whenever you want.'
        )
      );
  } catch (err) {
    console.error('[email-prefs] unexpected error:', err?.message || err);
    return fail('Something went wrong on our side.');
  }
}
