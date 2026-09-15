// api/notify-signup.js
// Called by Supabase webhook on new user signup.
//
// TWO messages now leave this handler, and they are not the same thing:
//   1. the operator notification to Adam. Always on. Unchanged behaviour.
//   2. the WELCOME EMAIL to the person who just signed up. New, and gated
//      behind WELCOME_EMAIL_ENABLED, default OFF.
//
// Until 2026-09-08 only (1) existed, so 32 registered users had received
// exactly zero email from Wovely. A person signed up and heard nothing, ever.
//
// THE GATE. WELCOME_EMAIL_ENABLED must be one of 1/true/yes/on for a welcome
// note to go out. It is wired end to end otherwise: flipping that one env var
// on the Vercel project is the entire remaining step. It defaults off because
// nothing goes out under Adam's name that Adam has not read.
//
// ON THE SUBJECT LINE OF (1), which carries a real user's address:
// `to` is hardcoded to adam@wovely.app and the handler refuses any request
// without the shared x-webhook-secret, so that subject is only ever delivered
// to Adam's own inbox. Nothing in any response body echoes the address, and
// the vercel_logs rows written below carry no address either. Checked
// 2026-09-08: this is the only handler in api/ that reads a signup payload,
// and it is not reachable in any other context. The address stays.
//
// Env vars: WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL,
//           RESEND_API_KEY, WELCOME_EMAIL_ENABLED (default off)

import { createClient } from '@supabase/supabase-js';
import { celebrate } from './_celebrate.js';
import {
  sendMail,
  isOptedOut,
  unsubscribeUrl,
  unsubscribeHeaders,
  FROM_ADAM,
  FROM_APP,
  OWNER_INBOX,
  HUMAN_REPLY_TO,
  SITE_ORIGIN,
} from './_mail.js';
import { buildWelcomeEmail } from './_welcomeEmail.js';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
export function welcomeEmailEnabled(env = process.env) {
  return TRUTHY.has(String(env.WELCOME_EMAIL_ENABLED ?? '').trim().toLowerCase());
}

/** Header-safe subject. Resend JSON-encodes, but a CR/LF in a subject is never wanted. */
function safeSubject(s) {
  return String(s).replace(/[\r\n]+/g, ' ').slice(0, 200);
}

/**
 * A one-click sign-in link, so the button in the welcome email works on the
 * phone the person is reading it on and not only the browser they signed up in.
 * Best effort: any failure falls back to the plain site URL.
 */
async function mintCtaLink(supabase, email) {
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${SITE_ORIGIN}/` },
    });
    if (error) throw new Error(error.message || 'generateLink failed');
    return data?.properties?.action_link || SITE_ORIGIN;
  } catch (e) {
    console.warn('[notify-signup] magic link mint failed, using plain link:', e.message);
    return SITE_ORIGIN;
  }
}

/**
 * Send the welcome note. Never throws: a welcome that fails must not fail the
 * webhook, or Supabase retries the signup notification forever.
 */
async function sendWelcome({ supabase, supabaseUrl, serviceKey, id, email }) {
  if (!welcomeEmailEnabled()) {
    console.log('[notify-signup] welcome email wired but WELCOME_EMAIL_ENABLED is off, skipping');
    return { sent: false, reason: 'flag_off' };
  }
  try {
    if (await isOptedOut({ supabaseUrl, serviceKey, userId: id })) {
      return { sent: false, reason: 'opted_out' };
    }
    const ctaUrl = await mintCtaLink(supabase, email);
    const unsubUrl = unsubscribeUrl(id);
    const { subject, html, text } = buildWelcomeEmail({ ctaUrl, unsubUrl });
    const result = await sendMail({
      from: FROM_ADAM,
      to: email,
      subject,
      html,
      text,
      replyTo: HUMAN_REPLY_TO,
      headers: unsubscribeHeaders(unsubUrl),
      tags: [{ name: 'kind', value: 'welcome' }],
    });
    if (!result.ok) {
      console.error('[notify-signup] welcome send failed:', result.error);
      return { sent: false, reason: 'send_failed', error: result.error };
    }
    console.log('[notify-signup] welcome sent, resend id:', result.id);
    return { sent: true, id: result.id };
  } catch (err) {
    console.error('[notify-signup] welcome unexpected error:', err?.message || err);
    return { sent: false, reason: 'exception', error: err?.message || String(err) };
  }
}

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

    // 1. Operator notification to Adam. Same message, same addresses, now
    //    through the one shared mail path in api/_mail.js.
    const opsResult = await sendMail({
      from: FROM_APP,
      to: OWNER_INBOX,
      subject: safeSubject(`🎉 New Wovely signup: ${email}`),
      text: `New user just signed up for Wovely.\n\nEmail: ${email}\nUser ID: ${id}\nSigned up: ${signedUp}\n\nYou now have ${userCount} users.\n\nWovely`,
      tags: [{ name: 'kind', value: 'signup_ops' }],
    });
    if (!opsResult.ok) {
      console.error('[notify-signup] Resend error:', opsResult.status, opsResult.error);
    }

    // 1b. The office hears it. Adam, 2026-09-15: "Same for new members."
    //     The core-path probe creates and deletes a probe-*@wovely.app user
    //     every six hours; that is ours and never a member.
    const probeSignup = /^probe-[^@]*@wovely\.app$/i.test(String(email));
    await celebrate({ kind: 'member', what: 'a new member', who: 'a new member', id: 'user:' + id, synthetic: probeSignup });

    // 2. Welcome note to the person who just signed up. Gated, default off.
    const welcome = await sendWelcome({
      supabase,
      supabaseUrl: _url,
      serviceKey: _key,
      id,
      email,
    });

    console.log('[notify-signup] Notification sent for:', email, '| welcome:', welcome.sent ? 'sent' : welcome.reason);
    if (_url && _key) {
      await fetch(`${_url}/rest/v1/vercel_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: `POST /api/notify-signup → 200 (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/notify-signup', request_method: 'POST', status_code: 200, project_id: 'wovely' })
      }).catch(() => {});
    }
    return res.status(200).json({ success: true, welcome: welcome.sent ? 'sent' : welcome.reason });
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

