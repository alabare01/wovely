// api/_mail.js
// One outbound mail path for the whole app. Everything that sends goes through
// sendMail() so there is a single place that knows the Resend key, the from
// addresses, and the unsubscribe headers.
//
// This does NOT invent a new transport. It is the same direct POST to
// https://api.resend.com/emails that api/notify-signup.js, api/send-feedback.js
// and api/stripe-webhook.js already make, lifted into one function so the three
// of them stop drifting apart.
//
// Sending domain: wovely.app. DKIM live, SPF verified on send.wovely.app,
// DMARC p=quarantine aligning on DKIM (verified 2026-09-08).
//
// Env: RESEND_API_KEY (required to send), WEBHOOK_SECRET (signs unsubscribe links).

import crypto from 'node:crypto';

// Adam's own inbox. This is the address that already receives every signup
// notification, so it is verified-live rather than assumed.
export const OWNER_INBOX = 'adam@wovely.app';

// The address a stranger may be told to reply to. send-feedback.js already
// delivers to support@wovely.app, so it is a monitored mailbox, but a welcome
// note signed by Adam should land back in Adam's own inbox and not a shared one.
export const HUMAN_REPLY_TO = 'adam@wovely.app';

export const FROM_APP = 'Wovely App <support@wovely.app>';
export const FROM_ADAM = 'Adam from Wovely <adam@wovely.app>';

export const SITE_ORIGIN = 'https://wovely.app';

/**
 * POST one message to Resend.
 * Never throws. Returns { ok, id, status, error } so a caller in a webhook or a
 * cron worker can log a failure without taking the request down with it.
 */
export async function sendMail({ from, to, subject, text, html, replyTo, headers, tags }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, status: 0, error: 'RESEND_API_KEY missing' };
  if (!to || !subject) return { ok: false, status: 0, error: 'to and subject are required' };

  const payload = {
    from: from || FROM_APP,
    to: Array.isArray(to) ? to : [to],
    subject,
  };
  if (text) payload.text = text;
  if (html) payload.html = html;
  if (replyTo) payload.reply_to = replyTo;
  if (headers && Object.keys(headers).length) payload.headers = headers;
  if (tags && tags.length) payload.tags = tags;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body?.message || body?.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, id: body?.id || null };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
}

// ── Unsubscribe links ────────────────────────────────────────────────────────
// Signed with WEBHOOK_SECRET, which is already set in the environment for the
// Supabase signup webhook. Deliberately no new secret to provision: the whole
// remaining step for turning welcome mail on is meant to be one env flag.

const UNSUB_SECRET = () => process.env.EMAIL_PREFS_SECRET || process.env.WEBHOOK_SECRET || '';

/** HMAC-SHA256 over the user id, hex, truncated to 32 chars to keep the URL short. */
export function unsubscribeToken(userId) {
  const secret = UNSUB_SECRET();
  if (!secret || !userId) return null;
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 32);
}

/** Constant-time check of a token against a user id. */
export function verifyUnsubscribeToken(userId, token) {
  const expected = unsubscribeToken(userId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Full unsubscribe URL, or null when no secret is configured. */
export function unsubscribeUrl(userId, origin = SITE_ORIGIN) {
  const token = unsubscribeToken(userId);
  if (!token) return null;
  return `${origin}/api/email-prefs?u=${encodeURIComponent(userId)}&t=${token}`;
}

/**
 * Has this user asked to be left alone? Reads user_metadata.email_opt_out,
 * which is what api/email-prefs.js writes. Fails open (returns false) rather
 * than blocking a legitimate send on a transient lookup error.
 */
export async function isOptedOut({ supabaseUrl, serviceKey, userId }) {
  if (!supabaseUrl || !serviceKey || !userId) return false;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const u = await res.json();
    return u?.user_metadata?.email_opt_out === true;
  } catch {
    return false;
  }
}

/**
 * RFC 8058 one-click unsubscribe headers plus a mailto fallback.
 * The mailto goes to Adam's real inbox, so the button works even if the
 * endpoint is ever down.
 */
export function unsubscribeHeaders(url) {
  const mailto = `mailto:${OWNER_INBOX}?subject=unsubscribe`;
  const value = url ? `<${url}>, <${mailto}>` : `<${mailto}>`;
  const headers = { 'List-Unsubscribe': value };
  if (url) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  return headers;
}
