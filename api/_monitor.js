// api/_monitor.js
// THE LIVE MONITOR. Makes the site audible.
//
// THE FACT THIS FILE EXISTS TO FIX: a signup emailed Adam within seconds, and
// everything else on wovely.app happened in total silence. At roughly 49
// visitors a month, the group who arrive and do NOT sign up is the entire
// business, and it was invisible. A stranger could land, open the demo, count
// eight rounds of a mushroom, hit the paywall and leave, and nobody would ever
// know they had been there.
//
// ── WHAT INTERRUPTS AND WHAT DIGESTS ────────────────────────────────────────
// "Every live interaction" taken seriously rather than literally. A message
// per click would be muted inside a day, and a muted channel is worse than no
// channel. So events split in two:
//
//   INTERRUPT — rare, and each one means something changed:
//     checkout_started, import_succeeded, paywall_hit, demo_started,
//     user_error, guest_arrived
//   DIGEST — the texture, carried on the hourly heartbeat:
//     visit, page_view, tool_used, demo_row, demo_converted, import_started,
//     import_failed, signup, checkout_completed
//
// ── WHERE THE SENDING HAPPENS, AND WHY NOT AT THE BEACON ────────────────────
// /api/pulse is public. Anything public that can send mail is an inbox someone
// else controls. So the beacon ONLY WRITES ROWS. Every decision to send is made
// here and called from the per-minute cron, which is authenticated by
// CRON_SECRET. The worst a flood at the beacon can do is write rows.
//
// ── THE THROTTLE, WHICH IS THE WHOLE DESIGN ─────────────────────────────────
// The same windowed digest api/_alert.js uses, per kind, with a hard global
// ceiling on top.
//   1. Each kind sends at most once per its own window.
//   2. One flush produces at most ONE email, covering every kind that is due.
//      So the ceiling is one message per cron tick, i.e. one per minute, never
//      one per event.
//   3. On top of that, MONITOR_MAX_INTERRUPTS_PER_DAY (default 40) counts
//      messages already sent since UTC midnight and stops. Past the cap
//      everything falls to the heartbeat, and the heartbeat says so.
//   4. No event is dropped by a throttle. A message covers everything since
//      the previous message for that kind, so a burst is one email listing the
//      burst rather than silence.
//
// AT 100x TRAFFIC: rule 2 caps the day at 40 messages no matter how many
// events land, and each one is a list rather than a single line. The failure
// mode of this design at scale is a longer email, never more email.
//
// ── LEDGER ──────────────────────────────────────────────────────────────────
// The existing vercel_logs table on reserved request_paths, exactly as
// _alert.js does it. No migration for Adam to run.
//
// ── SYNTHETIC TRAFFIC ───────────────────────────────────────────────────────
// A health probe must never wake a human. A request carrying the correct
// PROBE_HEADER token is still recorded, on SYNTHETIC_PATH_PREFIX, where no
// interrupt, no push and no heartbeat count reads it. UNMARKED TRAFFIC IS
// REAL, in every failure mode, without exception. Full reasoning at the
// marker itself, below. Probe with `npm run probe`, never with a bare curl.
//
// ── PRIVACY ─────────────────────────────────────────────────────────────────
// A path, a referring hostname, an opaque per-tab session id, and a Supabase
// uid. Nothing else crosses the wire from a browser: no user agent, no IP, no
// query string, no referrer path, and never one character of anybody's
// pattern. Strings are truncated on arrival, not on display, so a caller
// cannot smuggle content through in a meta field.
//
// Env: MONITOR_ENABLED (default on), MONITOR_INTERRUPTS_ENABLED (default on),
//      MONITOR_HEARTBEAT_ENABLED (default on),
//      MONITOR_MAX_INTERRUPTS_PER_DAY (default 40),
//      MONITOR_QUIET_HOURS (default off), MONITOR_TZ (default America/New_York)

import { createHash, timingSafeEqual } from 'node:crypto';
import { sendMail, FROM_APP, OWNER_INBOX } from './_mail.js';

// ── Reserved paths in vercel_logs. None of these is a real route. ───────────
export const PULSE_PATH_PREFIX = '/internal/pulse/';
/**
 * Where a MARKED HEALTH PROBE lands. A separate prefix, not a flag on the pulse
 * prefix, because every read path in this file selects on
 * `request_path=like./internal/pulse/*`. Putting synthetic rows somewhere else
 * entirely means no query has to remember to exclude them, and a future reader
 * added by somebody who never read this comment still cannot see them.
 */
export const SYNTHETIC_PATH_PREFIX = '/internal/synthetic/';
export const SENT_PATH_PREFIX = '/internal/monitor/sent/';
export const HEARTBEAT_MARKER_PATH = '/internal/monitor/heartbeat';
export const DAILY_MARKER_PATH = '/internal/monitor/daily';

// Never look back further than this when no marker exists. Without it a cold
// start would mail every event in the table.
export const MONITOR_MAX_LOOKBACK_MS = 60 * 60 * 1000;

// ── THE SYNTHETIC MARKER ────────────────────────────────────────────────────
//
// THE DEFECT THIS FIXES, on the record because it is the whole reason the
// mechanism exists. On 2026-09-08 an agent curled /api/client-error twice to
// confirm the endpoint had stopped returning 500:
//   {"kind":"user_error","detail":"deploy verification probe"} at 16:07 UTC
//   {"kind":"user_error","detail":"post-deploy probe"}         at 18:15 UTC
// Both were recorded as a real person hitting a real error. Both woke Adam's
// phone and his inbox. No real visitor has ever errored on wovely.app. A
// monitor that cannot tell its own health check from a customer will cry wolf,
// and a channel that cries wolf gets muted, which is strictly worse than
// having no channel at all.
//
// THE DESIGN, and the properties it has to have:
//
//   1. IT FAILS SAFE IN ONE DIRECTION ONLY. Unmarked traffic is REAL. A missing
//      header is a real user, an unverifiable header is a real user, a wrong
//      header is a real user. There is no input that turns an unmarked request
//      synthetic, which is the property that keeps a bug or an attacker from
//      silencing a genuine alert.
//
//   2. IT IS NOT A GUESSABLE HEADER NAME. Knowing `x-wovely-probe` exists buys
//      nothing; the value has to be right. The value is derived from
//      CRON_SECRET, which is already in the environment, so this ships with no
//      new credential for Adam to create, rotate or lose.
//
//   3. IT DERIVES RATHER THAN ECHOES. The header carries a SHA-256 of the
//      secret, never the secret. So the token is safe to put in a verification
//      script, a log line or a comment: it cannot be walked back to
//      CRON_SECRET, and it cannot be replayed against /api/cron/* which wants
//      the real bearer token.
//
//   4. THE WORST A LEAK DOES IS BOUNDED. Someone who learns the token can mark
//      their OWN requests synthetic. That silences alerts about themselves,
//      which is a thing they could already achieve by not sending the request.
//      It gives them no way to touch anybody else's traffic, and every real
//      visitor's browser keeps sending unmarked requests that keep alerting.
//
// A marked request is still WRITTEN to vercel_logs, on SYNTHETIC_PATH_PREFIX,
// because the point of a health probe is a record that the endpoint worked. It
// simply lands somewhere no interrupt, no push and no heartbeat count reads.

export const PROBE_HEADER = 'x-wovely-probe';

/**
 * The value a probe must send. One-way, so publishing the token never
 * publishes CRON_SECRET. Null when there is no secret to derive from.
 */
export function probeToken(secret) {
  const s = String(secret ?? '').trim();
  if (!s) return null;
  return createHash('sha256').update(`wovely-synthetic-probe:${s}`).digest('hex').slice(0, 32);
}

/** Headers arrive lowercased on Vercel, but not on every runtime, and a repeated header arrives as an array. */
function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  const v = direct !== undefined
    ? direct
    : Object.entries(headers).find(([k]) => String(k).toLowerCase() === name)?.[1];
  if (Array.isArray(v)) return String(v[0] ?? '');
  return v === undefined || v === null ? '' : String(v);
}

/**
 * THE FAIL-SAFE. Returns true ONLY for a request that carries the correct
 * derived token. Every other answer, including every error, is false, which
 * means "a real person did this".
 */
export function isSyntheticRequest(headers, env = process.env) {
  const supplied = headerValue(headers, PROBE_HEADER).trim();
  if (!supplied) return false;                    // unmarked is real, always
  const expected = probeToken(env?.CRON_SECRET);
  if (!expected) return false;                    // nothing to verify against is real
  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;        // wrong shape is real
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;                                 // anything thrown is real
  }
}

const MIN = 60 * 1000;

/**
 * The event vocabulary. `interrupt: true` earns a message of its own window;
 * everything else rides the heartbeat.
 *
 * `windowMs` is the minimum gap between two messages that mention this kind.
 * `priority` (lower is louder) decides which kind names the subject line when
 * a single flush covers several.
 */
export const EVENT_KINDS = {
  checkout_started: { interrupt: true, windowMs: 2 * MIN, priority: 1, label: 'started checkout' },
  email_captured: { interrupt: true, windowMs: 2 * MIN, priority: 2, label: 'left an email' },
  import_succeeded: { interrupt: true, windowMs: 5 * MIN, priority: 2, label: 'imported a pattern' },
  paywall_hit: { interrupt: true, windowMs: 10 * MIN, priority: 3, label: 'hit the wall' },
  demo_started: { interrupt: true, windowMs: 10 * MIN, priority: 4, label: 'started the demo' },
  user_error: { interrupt: true, windowMs: 15 * MIN, priority: 5, label: 'saw an error' },
  guest_arrived: { interrupt: true, windowMs: 20 * MIN, priority: 6, label: 'arrived' },

  visit: { interrupt: false, label: 'signed-in visit' },
  page_view: { interrupt: false, label: 'page view' },
  tool_used: { interrupt: false, label: 'used a calculator' },
  demo_row: { interrupt: false, label: 'counted a demo row' },
  demo_converted: { interrupt: false, label: 'left the demo for the app' },
  import_started: { interrupt: false, label: 'started an import' },
  import_failed: { interrupt: false, label: 'import failed' },
  signup: { interrupt: false, label: 'signed up' },
  checkout_completed: { interrupt: false, label: 'paid' },
};

export const INTERRUPT_KINDS = Object.keys(EVENT_KINDS).filter((k) => EVENT_KINDS[k].interrupt);

// ── Env reading, all in one place so the kill switches are greppable ────────

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

/** Default ON. Only an explicit off value turns it off. */
export function flagOn(raw, fallback = true) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === '') return fallback;
  if (FALSY.has(v)) return false;
  if (TRUTHY.has(v)) return true;
  return fallback;
}

export function monitorConfig(env = process.env) {
  const cap = Number.parseInt(env.MONITOR_MAX_INTERRUPTS_PER_DAY ?? '', 10);
  return {
    enabled: flagOn(env.MONITOR_ENABLED),
    interrupts: flagOn(env.MONITOR_INTERRUPTS_ENABLED),
    heartbeat: flagOn(env.MONITOR_HEARTBEAT_ENABLED),
    push: flagOn(env.MONITOR_PUSH_ENABLED),
    pushWebhook: String(env.WOVELY_ALERT_WEBHOOK_URL || '').trim(),
    pushTopic: String(env.WOVELY_NTFY_TOPIC || '').trim(),
    maxPerDay: Number.isFinite(cap) && cap >= 0 ? cap : 40,
    quietHours: parseQuietHours(env.MONITOR_QUIET_HOURS),
    tz: (env.MONITOR_TZ || 'America/New_York').trim(),
  };
}

// ── The push lane ───────────────────────────────────────────────────────────
// Email reaches Adam eventually. A phone reaches him now, and "is anyone on my
// site right now" is a question email answers badly.
//
// ntfy.sh is the channel the rest of his system already pages him on, it is
// already delivering (celebrate.mjs, push=ok on every fire since 2026-09-05),
// and it needs NO OAuth grant: authentication is knowing the topic name, which
// is a plain string in an env var. That satisfies the machine-bound rule a
// scheduled job has to obey.
//
// A SEPARATE TOPIC FROM HIS OTHERS, deliberately. An ntfy topic is readable by
// anyone who learns its name, so putting one in a Vercel environment variable
// copies that secret off his machine. A topic scoped to wovely.app leaks only
// wovely.app if it ever leaks.
//
// FOR THAT SAME REASON THE PUSH CARRIES NO IDENTIFIERS. A count and a label,
// nothing else. No email address, no user id, no session id, no path. The
// detail is in the email, which is addressed and private. Anyone who guesses
// the topic learns that somebody used a crochet app, and nothing more.
//
// Inert until one of its two env vars is set, so this ships with no credential.
//
// TWO WAYS IN, because the house already has a convention and inventing a
// second one is how these drift:
//   WOVELY_ALERT_WEBHOOK_URL — a full ntfy topic URL, the shape
//     CELEBRATION_WEBHOOK_URL uses in the 2ndbrain-site stripe-hook. When it
//     points at ntfy.sh the payload is the JSON ENVELOPE posted to the ntfy
//     ROOT with `topic` as a field. Posting that same JSON at the topic URL
//     instead makes the whole blob the message body, which arrives on a phone
//     as gibberish. That is the trap this branch exists to avoid.
//   WOVELY_NTFY_TOPIC — just the topic name, sent header-style to the topic
//     URL, which is what the local publishers on Marvin do.
// The webhook URL wins when both are set.
//
// NOT DUPLICATED HERE: a completed Wovely payment ALREADY reaches Adam's phone.
// One Stripe account serves both properties, so a Wovely checkout.session hits
// the 2ndbrain-site stripe-hook and fans out to ntfy today. That is why
// checkout_completed is digest-only below and checkout_started is not: the
// second is the half nobody is watching.

const NTFY_ROOT = 'https://ntfy.sh/';

/** ASCII-only, header-safe, short. ntfy headers reject anything else. */
export function pushHeaderSafe(s, max = 120) {
  return String(s ?? '').replace(/[^\x20-\x7E]/g, '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

/** The topic name out of a full ntfy URL, or null when it is not one. */
export function ntfyTopicFromUrl(url) {
  if (!/ntfy\.sh\//i.test(String(url ?? ''))) return null;
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean);
    return seg.length ? seg[seg.length - 1] : null;
  } catch {
    return null;
  }
}

/**
 * Push one line to Adam's phone. Never throws, and a failure never blocks the
 * email that carries the real detail.
 */
export async function pushAlert({ title, body, priority = 'default', config = monitorConfig() }) {
  if (!config.enabled || !config.push) return { ok: false, reason: 'push_disabled' };

  const common = { signal: AbortSignal.timeout(5000) };
  try {
    if (config.pushWebhook) {
      const topic = ntfyTopicFromUrl(config.pushWebhook);
      const payload = topic
        ? { topic, title: pushHeaderSafe(title), message: pushHeaderSafe(body, 300), priority, tags: ['yarn'], click: 'https://wovely.app' }
        : { title: pushHeaderSafe(title), message: pushHeaderSafe(body, 300), priority, source: 'wovely-monitor' };
      const res = await fetch(topic ? NTFY_ROOT : config.pushWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        ...common,
      });
      return res.ok ? { ok: true } : { ok: false, reason: `http_${res.status}` };
    }

    if (config.pushTopic) {
      const res = await fetch(`${NTFY_ROOT}${encodeURIComponent(config.pushTopic)}`, {
        method: 'POST',
        headers: {
          Title: pushHeaderSafe(title),
          Priority: priority,
          Tags: 'yarn',
          Click: 'https://wovely.app',
        },
        body: pushHeaderSafe(body, 300),
        ...common,
      });
      return res.ok ? { ok: true } : { ok: false, reason: `http_${res.status}` };
    }

    return { ok: false, reason: 'no_topic' };
  } catch (err) {
    return { ok: false, reason: err?.message || 'exception' };
  }
}

/**
 * What the phone is allowed to say.
 *
 * THE RULE, NARROWED RATHER THAN WIDENED, 2026-09-08. It used to be counts and
 * labels only, which produced "Someone saw an error" and nothing else, and
 * Adam's complaint about the whole alert channel was precisely "nothing after
 * that". The rule was aimed at the wrong thing. What must never ride an ntfy
 * topic is WHO: a uid, a session id, an email address. A path on a public
 * website and a message our own JavaScript threw identify nobody, and they are
 * the two facts that turn a push from an anxiety generator into something he
 * can act on from a phone.
 *
 * So, still banned and asserted in the tests: uid, sid, referrer, and anything
 * a person typed. Now allowed, for user_error only: the error head, the path,
 * and how many times it happened to how many sessions.
 */
export function buildPushLine(groups) {
  const lead = groups[0];
  const total = groups.reduce((n, g) => n + g.events.length, 0);
  const label = EVENT_KINDS[lead.kind]?.label || lead.kind;
  const rest = total - lead.events.length;

  let head;
  if (lead.kind === 'user_error') {
    const es = summarizeErrorGroup(lead.events);
    const sig = es.signatures[0];
    const who = es.people === 1 ? '1 session' : es.people ? `${es.people} sessions` : 'unattributed';
    const times = es.occurrences === 1 ? 'once' : `x${es.occurrences}`;
    head = `Error on ${sig?.paths[0] || '/'} ${times}, ${who}: ${String(sig?.signature || 'unknown').slice(0, 90)}`;
  } else {
    head = lead.events.length === 1 ? `Someone ${label}` : `${lead.events.length} people ${label}`;
  }

  return {
    title: lead.kind === 'user_error' ? 'Wovely error' : 'Wovely',
    body: rest > 0 ? `${head}, and ${rest} more thing${rest === 1 ? '' : 's'} happened` : head,
    // Money and breakage get through Do Not Disturb. Arrivals do not.
    priority: lead.kind === 'checkout_started' || lead.kind === 'user_error' ? 'high' : 'default',
  };
}

/** "22-7" → { start: 22, end: 7 }. Anything unparseable means no quiet hours. */
export function parseQuietHours(raw) {
  const m = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(String(raw ?? ''));
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!(start >= 0 && start <= 23 && end >= 0 && end <= 23) || start === end) return null;
  return { start, end };
}

/** Local hour in `tz`, falling back to UTC if the runtime has no such zone. */
export function hourIn(tz, date) {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(date);
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n % 24 : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

/** Is `hour` inside the quiet window? Handles a window that crosses midnight. */
export function isQuietHour(quiet, hour) {
  if (!quiet) return false;
  const { start, end } = quiet;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

// ── The throttle. Pure, so it can be tested without a network. ──────────────

/**
 * Should this kind be included in the message about to be composed?
 * @returns {{due:boolean, reason:string, since?:Date}}
 */
export function throttleDecision({
  kind,
  now,
  lastSentAt,
  maxLookbackMs = MONITOR_MAX_LOOKBACK_MS,
}) {
  const spec = EVENT_KINDS[kind];
  if (!spec) return { due: false, reason: 'unknown_kind' };
  if (!spec.interrupt) return { due: false, reason: 'digest_only' };

  const t = now instanceof Date ? now.getTime() : Number(now);
  const floor = new Date(t - maxLookbackMs);

  if (lastSentAt) {
    const last = lastSentAt instanceof Date ? lastSentAt.getTime() : Number(lastSentAt);
    if (t - last < spec.windowMs) return { due: false, reason: 'throttled' };
    // Cover everything since the last message, but never reach past the cap.
    return { due: true, reason: 'window_elapsed', since: new Date(Math.max(last, floor.getTime())) };
  }
  return { due: true, reason: 'no_previous_message', since: floor };
}

/**
 * The gate that sits above every per-kind decision. Checked once per flush.
 * @returns {{allowed:boolean, reason:string}}
 */
export function flushGate({ config, now, sentToday }) {
  if (!config.enabled) return { allowed: false, reason: 'monitor_disabled' };
  if (!config.interrupts) return { allowed: false, reason: 'interrupts_disabled' };
  if (isQuietHour(config.quietHours, hourIn(config.tz, now))) {
    return { allowed: false, reason: 'quiet_hours' };
  }
  if (sentToday >= config.maxPerDay) return { allowed: false, reason: 'daily_cap' };
  return { allowed: true, reason: 'ok' };
}

// ── Incoming event sanitation ───────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SID_RE = /^[0-9a-f]{8,32}$/i;
const META_KEY_RE = /^[a-z0-9_]{1,24}$/i;

const MAX_PATH = 120;
const MAX_REF = 80;
const MAX_META_KEYS = 8;
const MAX_META_VALUE = 80;

/** A referrer contributes its hostname and nothing else. */
export function refHost(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    const h = new URL(s).hostname;
    return h ? h.slice(0, MAX_REF) : null;
  } catch {
    // Already a bare hostname, or junk. Keep only hostname-shaped input.
    return /^[a-z0-9.-]{1,80}$/i.test(s) ? s : null;
  }
}

/** Path only. Query strings and fragments are dropped, never truncated into. */
export function cleanPath(raw) {
  const s = String(raw ?? '').trim();
  if (!s.startsWith('/')) return '/';
  return s.split('?')[0].split('#')[0].slice(0, MAX_PATH) || '/';
}

/**
 * The only meta keys a BROWSER may set. An allowlist rather than a shape check,
 * and the difference is not academic: with a shape check, any key at all
 * survived as long as it was name-shaped, so anyone could post 80 characters of
 * arbitrary text under a key of their choosing, eight times per event. Eighty
 * characters of somebody's pattern is still somebody's pattern. Every key here
 * is one this app's own pulse() calls actually send, and they are all short
 * enums or small integers.
 *
 * Server-side callers build their rows directly and do not pass through
 * normalizeEvent, so api/client-error.js can still attach the `detail` of an
 * error it was handed. That is a deliberate asymmetry: our own code is trusted
 * with an error string, a stranger's browser is not.
 */
export const BEACON_META_KEYS = new Set([
  'row_index', 'rows_done', 'intent', 'wall', 'to', 'tier', 'cadence', 'file_type',
]);

/**
 * Meta is for scalars that describe an event, never for content. Objects and
 * arrays are refused outright so a caller cannot nest a pattern inside one, and
 * `allow` restricts which keys survive at all.
 */
export function cleanMeta(raw, allow = BEACON_META_KEYS) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_META_KEYS) break;
    if (!META_KEY_RE.test(k)) continue;
    if (allow && !allow.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, MAX_META_VALUE);
    // objects, arrays, null, undefined: dropped
  }
  return out;
}

// A visit from something that is not a person is not news. This is a coarse
// screen, not a bot-detection system: the point is to keep Googlebot out of
// Adam's inbox, and a crawler that lies about its user agent will also fail to
// run the beacon at all.
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python-requests|axios|node-fetch|facebookexternalhit|whatsapp|discord|telegram|bingpreview|semrush|ahrefs|dataprovider|petal|yandex|applebot/i;

export function looksLikeBot(userAgent) {
  const s = String(userAgent ?? '');
  if (!s) return true; // no UA at all is not a browser
  return BOT_RE.test(s);
}

// ERRORS THAT ARE NOT ERRORS. Added 2026-09-11 after a day's report told Adam
// "564 saw an error" and he reasonably read it as an outage.
//
// WHAT ACTUALLY HAPPENED: one non-human visitor hit /tools once and threw the
// same rejection 500 times in a single session. 564 of that day's 584 events
// were that one session. The site returned 200 the whole time.
//
// The signature was `Object Not Found Matching Id:N, MethodName:update,
// ParamCount:4`, which is CefSharp, the .NET Chromium wrapper used by link
// scanners. In practice it is usually Microsoft Outlook SafeLinks opening a
// URL somebody emailed. Ironically it fires because a Wovely link got SHARED.
//
// looksLikeBot did not catch it because that reads the USER AGENT, and these
// scanners present a plausible Chrome UA. The error signature is the reliable
// tell, so this screens on the message instead.
//
// These are DROPPED rather than counted, because a number nobody should act on
// is worse on a daily report than no number: it trains him to ignore the whole
// channel, which is exactly what the monitor exists to prevent.
const NOT_REAL_ERROR_RE = new RegExp([
  // CefSharp / SafeLinks / Outlook link scanning
  'Object Not Found Matching Id',
  // Browser extensions injecting into the page, not our code
  'ResizeObserver loop',
  'Non-Error promise rejection captured',
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  // Network noise from the visitor's side
  'Load failed',
  'Failed to fetch',
  'NetworkError when attempting to fetch',
  'The operation was aborted',
].join('|'), 'i');

export function isRealUserError(message) {
  const s = String(message ?? '').trim();
  if (!s) return false;
  return !NOT_REAL_ERROR_RE.test(s);
}

/**
 * Turn a raw beacon body into a row payload, or null when it is not a real
 * event. Never throws.
 */
export function normalizeEvent(body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object') return null;
  const kind = String(body.kind ?? '').trim();
  if (!Object.prototype.hasOwnProperty.call(EVENT_KINDS, kind)) return null;

  // A user_error carrying a scanner or extension signature is dropped here, at
  // the door, rather than counted and filtered later. Returning null means it
  // never reaches a row, a count, a push or the daily report. See
  // isRealUserError for what happened on 2026-09-10 and why this exists.
  if (kind === 'user_error') {
    const msg = body?.meta?.message ?? body?.meta?.detail ?? body?.detail ?? '';
    if (msg && !isRealUserError(msg)) return null;
  }

  const sid = SID_RE.test(String(body.sid ?? '')) ? String(body.sid).toLowerCase() : null;
  const uid = UUID_RE.test(String(body.uid ?? '')) ? String(body.uid).toLowerCase() : null;

  return {
    kind,
    path: cleanPath(body.path),
    ref: refHost(body.ref),
    sid,
    uid,
    meta: cleanMeta(body.meta),
    at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  };
}

/**
 * What a SERVER-side caller may attach on top of the beacon set. `detail` is
 * the short head of an error message, which only api/client-error.js supplies.
 */
export const SERVER_META_KEYS = new Set([...BEACON_META_KEYS, 'detail']);

/**
 * The vercel_logs row for one event. Meta is cleaned here as well as in
 * normalizeEvent, because server-side callers build their events directly and
 * would otherwise have no sanitiser between them and the database.
 */
export function eventRow(ev, { synthetic = false } = {}) {
  const meta = cleanMeta(ev.meta, SERVER_META_KEYS);
  return {
    timestamp: ev.at,
    level: 'info',
    message: `[${synthetic ? 'synthetic' : 'pulse'}] ${ev.kind} ${ev.path}`,
    source: synthetic ? 'synthetic' : 'monitor',
    request_path: `${synthetic ? SYNTHETIC_PATH_PREFIX : PULSE_PATH_PREFIX}${ev.kind}`,
    request_method: 'PULSE',
    status_code: 200,
    project_id: 'wovely',
    user_id: ev.uid,
    context: { kind: ev.kind, path: ev.path, ref: ev.ref, sid: ev.sid, ...meta, ...(synthetic ? { synthetic: true } : {}) },
  };
}

// ── Ledger I/O ──────────────────────────────────────────────────────────────

function supaHeaders(serviceKey) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

/**
 * Write events. Used by the beacon and by the server-side callers that know
 * something the browser cannot be trusted to report (a completed import, a
 * created Stripe session). Never throws.
 */
export async function recordPulse({ supabaseUrl, serviceKey, events, synthetic = false }) {
  const list = (Array.isArray(events) ? events : [events]).filter(Boolean);
  if (!supabaseUrl || !serviceKey || list.length === 0) return { ok: false, reason: 'noop' };
  if (!monitorConfig().enabled) return { ok: false, reason: 'monitor_disabled' };
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: { ...supaHeaders(serviceKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(list.map((e) => eventRow(e, { synthetic }))),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? { ok: true, count: list.length } : { ok: false, reason: `http_${res.status}` };
  } catch (err) {
    return { ok: false, reason: err?.message || 'exception' };
  }
}

/** kind → Date of the last message that mentioned it. */
async function readLastSent({ supabaseUrl, serviceKey }) {
  const out = {};
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vercel_logs?request_path=like.${encodeURIComponent(SENT_PATH_PREFIX + '*')}` +
        `&order=timestamp.desc&limit=60&select=timestamp,request_path`,
      { headers: supaHeaders(serviceKey), signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return out;
    const rows = await res.json();
    for (const r of Array.isArray(rows) ? rows : []) {
      const kind = String(r.request_path || '').slice(SENT_PATH_PREFIX.length);
      if (kind && !out[kind]) out[kind] = new Date(r.timestamp);
    }
  } catch {
    /* no markers read means the window looks elapsed, which the daily cap still bounds */
  }
  return out;
}

/** How many interrupt messages have gone out since UTC midnight. */
async function readSentToday({ supabaseUrl, serviceKey, now }) {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vercel_logs?request_path=like.${encodeURIComponent(SENT_PATH_PREFIX + '*')}` +
        `&timestamp=gte.${encodeURIComponent(midnight.toISOString())}&select=id`,
      {
        headers: { ...supaHeaders(serviceKey), Prefer: 'count=exact', Range: '0-0' },
        signal: AbortSignal.timeout(6000),
      }
    );
    const cr = res.headers.get('content-range') || '';
    const total = Number.parseInt(cr.split('/')[1], 10);
    return Number.isFinite(total) ? total : 0;
  } catch {
    // Fail CLOSED on the cap: an unreadable ledger must not be read as "no
    // messages sent today", because that is the state that empties an inbox.
    return Number.POSITIVE_INFINITY;
  }
}

/** Every pulse row since `since`, newest first. */
async function readPulses({ supabaseUrl, serviceKey, since, limit = 500 }) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vercel_logs?request_path=like.${encodeURIComponent(PULSE_PATH_PREFIX + '*')}` +
        `&timestamp=gt.${encodeURIComponent(since.toISOString())}` +
        `&order=timestamp.desc&limit=${limit}&select=timestamp,request_path,user_id,context`,
      { headers: supaHeaders(serviceKey), signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : [])
      // Second belt behind SYNTHETIC_PATH_PREFIX. The query above cannot return
      // a synthetic row, so this only catches a row written before the marker
      // existed and relabelled by hand, or one a future writer puts on the
      // wrong prefix. It costs nothing and it cannot be the thing that fails.
      .filter((r) => !(r.context && typeof r.context === 'object' && r.context.synthetic))
      .map((r) => ({
        at: new Date(r.timestamp),
        kind: String(r.request_path || '').slice(PULSE_PATH_PREFIX.length),
        uid: r.user_id || null,
        ...(r.context && typeof r.context === 'object' ? r.context : {}),
      }));
  } catch {
    return [];
  }
}

/**
 * The diagnostic rows api/client-error.js writes, which hold the full message
 * and the stack. Read only when a user_error alert is actually being composed,
 * so the common case costs no extra query.
 */
async function readClientErrorRows({ supabaseUrl, serviceKey, since, limit = 100 }) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vercel_logs?source=eq.client` +
        `&timestamp=gte.${encodeURIComponent(new Date(since).toISOString())}` +
        `&order=timestamp.desc&limit=${limit}&select=timestamp,message,context`,
      { headers: supaHeaders(serviceKey), signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      at: new Date(r.timestamp),
      // The row is written as `CLIENT ERROR: <message> @ <source>`. The prefix
      // is ours; the part after it is what has to line up with the signature.
      message: String(r.message || '').replace(/^CLIENT ERROR:\s*/, ''),
      stack: r.context && typeof r.context === 'object' ? r.context.stack || null : null,
    }));
  } catch {
    return [];
  }
}

/** Earlier occurrences of a user_error, so "is this new" has an answer. */
async function readErrorHistoryRows({ supabaseUrl, serviceKey, before, limit = 300 }) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vercel_logs?request_path=eq.${encodeURIComponent(PULSE_PATH_PREFIX + 'user_error')}` +
        `&timestamp=lt.${encodeURIComponent(new Date(before).toISOString())}` +
        `&order=timestamp.desc&limit=${limit}&select=timestamp,context`,
      { headers: supaHeaders(serviceKey), signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => !(r.context && typeof r.context === 'object' && r.context.synthetic))
      .map((r) => ({ at: new Date(r.timestamp), detail: r.context?.detail || null }));
  } catch {
    return [];
  }
}

/**
 * Everything buildErrorLines needs that is not already in hand. One extra pair
 * of queries, made only when a user_error is in the message being composed.
 */
async function buildErrorContext({ supabaseUrl, serviceKey, group, rows, now }) {
  const s = summarizeErrorGroup(group.events);
  const sigs = s.signatures.map((x) => x.signature);
  const oldest = s.signatures.reduce((min, x) => (x.first.at < min ? x.first.at : min), now);
  const [clientRows, historyRows] = await Promise.all([
    readClientErrorRows({ supabaseUrl, serviceKey, since: new Date(new Date(oldest).getTime() - 60000) }),
    readErrorHistoryRows({ supabaseUrl, serviceKey, before: oldest }),
  ]);
  const { messages, stacks } = matchClientErrorRows(sigs, clientRows);
  const history = {};
  for (const sig of sigs) history[sig] = signatureHistory(historyRows, sig);
  return { rows, messages, stacks, history };
}

async function writeMarker({ supabaseUrl, serviceKey, path, message, now }) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: { ...supaHeaders(serviceKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        timestamp: (now || new Date()).toISOString(),
        level: 'info',
        message,
        source: 'monitor',
        request_path: path,
        request_method: 'POST',
        status_code: 200,
        project_id: 'wovely',
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* the message already went; a missing marker risks one repeat, not a storm */
  }
}

// ── Composition ─────────────────────────────────────────────────────────────

const WHO = (e) => (e.uid ? `member ${String(e.uid).slice(0, 8)}` : e.sid ? `guest ${String(e.sid).slice(0, 6)}` : 'someone');

function timeOf(e, tz) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(e.at instanceof Date ? e.at : new Date(e.at));
  } catch {
    return new Date(e.at).toISOString();
  }
}

// ── WHAT A user_error ALERT HAS TO SAY ──────────────────────────────────────
//
// Adam's words about the version this replaces: "i'm getting random emails
// saying someone saw an error yet nothing after that". He is describing an
// anxiety generator, not a monitor. "Someone saw an error" with no error, no
// path, no count and no outcome cannot be acted on without opening a
// dashboard, which is the thing the alert exists to save him.
//
// So a user_error block answers five questions, in this order:
//   1. WHAT broke. The real message, and in the email the stack under it.
//   2. WHERE. The path.
//   3. HOW BAD. One person or many, and how many times.
//   4. WHAT HAPPENED NEXT, which is the single most useful line in the alert.
//      An error a visitor shrugged off and kept browsing through is a bug.
//      An error that was the last thing that session ever did is a lost
//      customer, and those two need different reactions on a Sunday evening.
//   5. IS THIS NEW. Same signature seen before, how often, and when.
//
// PRIVACY, unchanged and deliberately not widened. Nothing here adds a meta
// key: the signature is the existing `detail`, the session is the existing
// `sid`, and the stack is READ AT FLUSH TIME off the diagnostic row that
// api/client-error.js already writes, so no new content is ever carried
// through the beacon or stored in a pulse row. Still no pattern contents, no
// tokens, no passwords, no email addresses.

/** Below this, "nothing since the error" means the visit is still in progress. */
export const ERROR_RECOVERY_GRACE_MS = 2 * 60 * 1000;

/** The thing two occurrences of the same bug have in common. */
export function errorSignature(e) {
  return String(e?.detail || 'unknown error').slice(0, 80);
}

/** How many, how often, and how many distinct people. */
export function summarizeErrorGroup(events) {
  const list = Array.isArray(events) ? events : [];
  const bySig = new Map();
  const people = new Set();
  for (const e of list) {
    const who = e.uid || e.sid || null;
    if (who) people.add(who);
    const sig = errorSignature(e);
    if (!bySig.has(sig)) bySig.set(sig, { signature: sig, count: 0, paths: new Set(), people: new Set(), first: e, last: e });
    const s = bySig.get(sig);
    s.count += 1;
    if (e.path) s.paths.add(e.path);
    if (who) s.people.add(who);
    if (e.at < s.first.at) s.first = e;
    if (e.at > s.last.at) s.last = e;
  }
  return {
    occurrences: list.length,
    people: people.size,
    // An error with no sid and no uid is one we cannot attribute, which is not
    // the same as zero people. Reported as unknown rather than counted as none.
    unattributed: list.filter((e) => !e.uid && !e.sid).length,
    signatures: [...bySig.values()]
      .map((s) => ({ ...s, paths: [...s.paths], people: s.people.size }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * What that session did after the error. `rows` is every pulse row in the
 * lookback window, which is what flushInterrupts already has in hand.
 */
export function sessionOutcome({ sid, uid, errorAt, rows = [], now = new Date(), graceMs = ERROR_RECOVERY_GRACE_MS }) {
  const key = uid || sid;
  if (!key) return { status: 'unattributed', next: [] };
  const t = errorAt instanceof Date ? errorAt.getTime() : new Date(errorAt).getTime();
  const after = rows
    .filter((r) => (uid ? r.uid === uid : r.sid === sid))
    .filter((r) => r.kind !== 'user_error')
    .filter((r) => (r.at instanceof Date ? r.at.getTime() : new Date(r.at).getTime()) > t)
    .sort((a, b) => a.at - b.at);
  if (after.length) {
    return { status: 'continued', next: after.slice(0, 4).map((r) => ({ kind: r.kind, path: r.path || '/' })), more: Math.max(0, after.length - 4) };
  }
  const quietMs = (now instanceof Date ? now.getTime() : Number(now)) - t;
  // Inside the grace window the visit may simply still be happening. Saying
  // "they left" about someone still reading the page is the kind of wrong that
  // teaches Adam to stop believing the alert.
  return { status: quietMs < graceMs ? 'pending' : 'ended', next: [], quietMs };
}

/** Prior sightings of a signature, out of pulse rows older than this window. */
export function signatureHistory(rows, signature) {
  const hits = (Array.isArray(rows) ? rows : [])
    .filter((r) => errorSignature(r) === signature)
    .map((r) => (r.at instanceof Date ? r.at : new Date(r.at)))
    .sort((a, b) => a - b);
  if (!hits.length) return { count: 0 };
  return { count: hits.length, firstAt: hits[0], lastAt: hits[hits.length - 1] };
}

/**
 * Pair each signature with the full message and stack from the diagnostic row
 * api/client-error.js wrote alongside it. The pulse row carries an 80
 * character head; the fix needs the whole thing.
 */
export function matchClientErrorRows(signatures, rows) {
  const messages = {};
  const stacks = {};
  const list = Array.isArray(rows) ? rows : [];
  for (const sig of signatures) {
    const hit = list.find((r) => String(r.message || '').startsWith(sig));
    if (!hit) continue;
    messages[sig] = String(hit.message || '').slice(0, 500);
    if (hit.stack) stacks[sig] = String(hit.stack);
  }
  return { messages, stacks };
}

/** The user_error block of the email. Pure, so every claim above is a test. */
export function buildErrorLines(group, ctx = {}, { tz = 'America/New_York', now = new Date(), stackLines = 6 } = {}) {
  const { rows = [], messages = {}, stacks = {}, history = {} } = ctx;
  const s = summarizeErrorGroup(group.events);
  const lines = [];

  const who = s.people === 1 ? '1 person' : `${s.people} people`;
  const times = s.occurrences === 1 ? 'once' : `${s.occurrences} times`;
  lines.push(
    s.people
      ? `  ${who}, ${times}, across ${s.signatures.length} distinct error${s.signatures.length === 1 ? '' : 's'}.`
      : `  ${times}, across ${s.signatures.length} distinct error${s.signatures.length === 1 ? '' : 's'}. No session id on any of them, so this could be one person or several.`
  );
  if (s.people && s.unattributed) {
    lines.push(`  ${s.unattributed} of the ${s.occurrences} carried no session id and are not counted in that head count.`);
  }
  lines.push('');

  for (const sig of s.signatures.slice(0, 5)) {
    const e = sig.last;
    lines.push(`  ${messages[sig.signature] || sig.signature}`);
    lines.push(`    where: ${sig.paths.join(', ') || '/'}`);
    lines.push(`    when:  ${timeOf(e, tz)}${sig.count > 1 ? `, and ${sig.count - 1} more time${sig.count === 2 ? '' : 's'} in this window` : ''}`);
    lines.push(`    who:   ${sig.people ? `${sig.people} session${sig.people === 1 ? '' : 's'}` : 'no session id'} (${WHO(e)})`);

    const out = sessionOutcome({ sid: e.sid, uid: e.uid, errorAt: e.at, rows, now });
    if (out.status === 'continued') {
      const trail = out.next.map((n) => `${EVENT_KINDS[n.kind]?.label || n.kind} ${n.path}`).join(' then ');
      lines.push(`    next:  they kept going. ${trail}${out.more ? `, and ${out.more} more` : ''}`);
    } else if (out.status === 'ended') {
      lines.push(`    next:  NOTHING. That error was the last thing this session did.`);
    } else if (out.status === 'pending') {
      lines.push(`    next:  nothing yet, but it only happened ${Math.max(1, Math.round((out.quietMs || 0) / 1000))}s ago, so the visit may still be running.`);
    } else {
      lines.push(`    next:  unknown, no session id on this one.`);
    }

    const h = history[sig.signature];
    if (h && h.count > 0) {
      lines.push(`    seen:  ${h.count} time${h.count === 1 ? '' : 's'} before this window, first ${timeOf({ at: h.firstAt }, tz)}, last ${timeOf({ at: h.lastAt }, tz)}`);
    } else {
      lines.push(`    seen:  first time. No earlier occurrence of this signature.`);
    }

    const stack = stacks[sig.signature];
    if (stack) {
      lines.push('    stack:');
      for (const l of String(stack).split('\n').slice(0, stackLines)) lines.push(`      ${l.trim().slice(0, 160)}`);
    }
    lines.push('');
  }
  if (s.signatures.length > 5) lines.push(`  and ${s.signatures.length - 5} more distinct errors`);
  return lines;
}

/**
 * One message covering every kind that came due on this flush.
 * `groups` is [{ kind, events }] already ordered by priority.
 */
export function buildInterruptEmail(groups, { now = new Date(), tz = 'America/New_York', sentToday = 0, maxPerDay = 40, errorContext = null } = {}) {
  const total = groups.reduce((n, g) => n + g.events.length, 0);
  const lead = groups[0];
  const spec = EVENT_KINDS[lead.kind];

  // A subject that says what broke is worth more than one that says something
  // broke. Everything else keeps the shape it had.
  let headline;
  if (lead.kind === 'user_error') {
    const es = summarizeErrorGroup(lead.events);
    const sig = es.signatures[0];
    const head = sig ? `: ${sig.signature.slice(0, 60)}` : '';
    headline = es.occurrences === 1
      ? `Wovely error on ${sig?.paths[0] || '/'}${head}`
      : `Wovely error x${es.occurrences} on ${sig?.paths[0] || '/'}${head}`;
  } else {
    headline =
      lead.events.length === 1
        ? `Wovely: ${WHO(lead.events[0])} ${spec.label}`
        : `Wovely: ${lead.events.length} ${spec.label}`;
  }
  const subject = groups.length > 1 ? `${headline}, +${total - lead.events.length} more` : headline;

  const lines = [];
  for (const g of groups) {
    const s = EVENT_KINDS[g.kind];
    lines.push(`${g.kind.toUpperCase().replace(/_/g, ' ')}  (${g.events.length})`);
    if (g.kind === 'user_error') {
      lines.push(...buildErrorLines(g, errorContext || {}, { tz, now }));
    } else {
      for (const e of g.events.slice(0, 12)) {
        const bits = [timeOf(e, tz), WHO(e), e.path || '/'];
        if (e.ref) bits.push(`from ${e.ref}`);
        lines.push(`  ${bits.join('  ·  ')}`);
      }
      if (g.events.length > 12) lines.push(`  and ${g.events.length - 12} more`);
    }
    lines.push(`  next message about this no sooner than ${Math.round(s.windowMs / 60000)} min from now`);
    lines.push('');
  }

  lines.push('---');
  lines.push('https://wovely.app   ·   PostHog and Vercel Analytics hold the full picture.');
  lines.push(`Interrupt messages today: ${sentToday + 1} of ${maxPerDay}.`);
  lines.push('Turn this off with MONITOR_INTERRUPTS_ENABLED=0, or all of it with MONITOR_ENABLED=0.');

  return { subject, text: lines.join('\n') };
}

/** Roll a set of pulse rows into the numbers Adam actually reads. */
export function summarize(events) {
  const byKind = {};
  const guests = new Set();
  const members = new Set();
  const paths = {};
  const refs = {};
  for (const e of events) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    if (e.uid) members.add(e.uid);
    else if (e.sid) guests.add(e.sid);
    if (e.path) paths[e.path] = (paths[e.path] || 0) + 1;
    if (e.ref) refs[e.ref] = (refs[e.ref] || 0) + 1;
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    total: events.length,
    guests: guests.size,
    members: members.size,
    byKind,
    topPaths: top(paths, 6),
    topRefs: top(refs, 4),
  };
}

/**
 * Resolve member uids to first names for the pulse email. Adam, 2026-09-15:
 * "I need clarity on these reports." A count is not clarity; "Dani imported a
 * pattern at 1:49 PM" is. One PostgREST call, fails to an empty map.
 */
export async function memberNames({ supabaseUrl, serviceKey, uids }) {
  const ids = [...new Set((uids || []).filter(Boolean))];
  if (!ids.length || !supabaseUrl || !serviceKey) return {};
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/user_profiles?select=id,display_name,first_name,username&id=in.(${ids.map(encodeURIComponent).join(',')})`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!r.ok) return {};
    const out = {};
    for (const row of await r.json()) out[row.id] = row.first_name || row.display_name || row.username || null;
    return out;
  } catch { return {}; }
}

const KIND_SENTENCE = {
  import_succeeded: 'imported a pattern',
  email_captured: 'left an email',
  guest_arrived: 'arrived',
  page_view: 'looked around',
  checkout_started: 'started checkout',
  paywall_hit: 'hit the paywall',
  demo_started: 'started the demo',
  user_error: 'hit an error',
  signup: 'signed up',
};

export function buildHeartbeatEmail(events, { since, now, daily = false, tz = 'America/New_York', note = '', names = {} } = {}) {
  const s = summarize(events);
  const span = daily ? 'the last 24 hours' : 'the last hour';
  const people = s.guests + s.members;
  const clock = (iso) => { try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
  const who = (e) => (e.uid ? (names[e.uid] || 'a member') : 'a guest');

  // The headline is the one thing that mattered, in words, not the counts.
  const imports = events.filter((e) => e.kind === 'import_succeeded');
  const emails = events.filter((e) => e.kind === 'email_captured');
  const money = events.filter((e) => e.kind === 'checkout_started');
  let headline;
  if (people === 0) headline = daily ? 'nobody came today' : 'nobody in the last hour';
  else if (imports.length) headline = `${imports.length === 1 ? who(imports[0]) + ' imported a pattern' : imports.length + ' patterns imported'}`;
  else if (emails.length) headline = `${emails.length} email${emails.length === 1 ? '' : 's'} captured`;
  else if (money.length) headline = `${money.length} checkout${money.length === 1 ? '' : 's'} started`;
  else headline = `${people} ${people === 1 ? 'person' : 'people'}, nobody imported or signed up`;

  const subject = `${daily ? 'Wovely today' : 'Wovely, last hour'}: ${headline}`;

  const lines = [
    `${daily ? 'Today' : 'The last hour'} on wovely.app, ${clock(since.toISOString())} to ${clock(now.toISOString())} ET.`,
    '',
  ];

  if (s.total === 0) {
    lines.push(`Nobody came in ${span}. This note is the proof the monitor is alive; it sends either way.`);
  } else {
    lines.push(`${people} ${people === 1 ? 'person' : 'people'}: ${s.members} signed in, ${s.guests} guest${s.guests === 1 ? '' : 's'}.`);
    lines.push('');
    // One line per person, newest first, what they did and where they went.
    const byActor = new Map();
    for (const e of [...events].sort((a, b) => String(b.at || b.timestamp || '').localeCompare(String(a.at || a.timestamp || '')))) {
      const key = e.uid ? 'u:' + e.uid : 's:' + (e.sid || 'anon');
      if (!byActor.has(key)) byActor.set(key, { e, kinds: new Set(), paths: new Set(), first: e.at || e.timestamp, ref: e.ref });
      const a = byActor.get(key);
      a.kinds.add(e.kind); if (e.path) a.paths.add(e.path); a.first = e.at || e.timestamp || a.first;
    }
    for (const a of [...byActor.values()].slice(0, 12)) {
      const did = [...a.kinds].filter((k) => k !== 'page_view' && !(k === 'guest_arrived' && a.kinds.size > 2)).map((k) => KIND_SENTENCE[k] || k);
      const verbs = did.length ? did.join(', ') : 'looked around';
      const where = [...a.paths].slice(0, 4).join(' ');
      lines.push(`  ${clock(a.first)}  ${who(a.e)} ${verbs}${where ? '  (' + where + ')' : ''}${a.ref ? '  from ' + a.ref : ''}`);
    }
    if (byActor.size > 12) lines.push(`  and ${byActor.size - 12} more`);
    lines.push('');
  }

  lines.push('Not counted above: our own probes and house traffic. They are recorded on the synthetic prefix and never in these numbers.');
  lines.push('');

  if (note) {
    lines.push(note);
    lines.push('');
  }

  lines.push('---');
  lines.push('https://wovely.app');
  lines.push('Turn this off with MONITOR_HEARTBEAT_ENABLED=0.');

  return { subject, text: lines.join('\n') };
}

// ── The two entry points ────────────────────────────────────────────────────

/**
 * Evaluate every interrupt kind and, if anything is due, send ONE message.
 * Called from the per-minute cron. Never throws.
 * @returns {Promise<{sent:boolean, reason:string, kinds?:string[], count?:number}>}
 */
export async function flushInterrupts({ supabaseUrl, serviceKey, now = new Date() }) {
  if (!supabaseUrl || !serviceKey) return { sent: false, reason: 'no_supabase_credentials' };
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'no_resend_key' };

  const config = monitorConfig();
  if (!config.enabled) return { sent: false, reason: 'monitor_disabled' };
  if (!config.interrupts) return { sent: false, reason: 'interrupts_disabled' };

  try {
    const sentToday = await readSentToday({ supabaseUrl, serviceKey, now });
    const gate = flushGate({ config, now, sentToday });
    if (!gate.allowed) return { sent: false, reason: gate.reason };

    const lastSent = await readLastSent({ supabaseUrl, serviceKey });

    // Widest window any kind could need, so one query serves them all.
    const oldest = new Date(now.getTime() - MONITOR_MAX_LOOKBACK_MS);
    const rows = await readPulses({ supabaseUrl, serviceKey, since: oldest });
    if (rows.length === 0) return { sent: false, reason: 'no_events' };

    const groups = [];
    for (const kind of INTERRUPT_KINDS) {
      const d = throttleDecision({ kind, now, lastSentAt: lastSent[kind] });
      if (!d.due) continue;
      const events = rows.filter((r) => r.kind === kind && r.at > d.since).sort((a, b) => a.at - b.at);
      if (events.length) groups.push({ kind, events });
    }
    if (groups.length === 0) return { sent: false, reason: 'nothing_due' };

    groups.sort((a, b) => EVENT_KINDS[a.kind].priority - EVENT_KINDS[b.kind].priority);

    // Only a user_error alert pays for the enrichment queries, and only when
    // one is actually going out.
    const errorGroup = groups.find((g) => g.kind === 'user_error');
    const errorContext = errorGroup
      ? await buildErrorContext({ supabaseUrl, serviceKey, group: errorGroup, rows, now })
      : null;

    const { subject, text } = buildInterruptEmail(groups, {
      now, tz: config.tz, sentToday, maxPerDay: config.maxPerDay, errorContext,
    });
    const result = await sendMail({
      from: FROM_APP,
      to: OWNER_INBOX,
      subject,
      text,
      tags: [{ name: 'kind', value: 'monitor_interrupt' }],
    });
    if (!result.ok) {
      console.error('[monitor] interrupt send failed:', result.error);
      return { sent: false, reason: 'send_failed' };
    }

    // The phone, when a topic is configured. Same throttle, same daily cap: it
    // rides the email's decision rather than making its own, so there is one
    // set of rules to reason about and turning the email off cannot leave a
    // second channel still firing.
    const push = await pushAlert({ ...buildPushLine(groups), config });

    // One marker per kind included, so each kind's window restarts from here.
    const count = groups.reduce((n, g) => n + g.events.length, 0);
    for (const g of groups) {
      await writeMarker({
        supabaseUrl, serviceKey, now,
        path: `${SENT_PATH_PREFIX}${g.kind}`,
        message: `[monitor] interrupt sent, ${g.kind} x${g.events.length}`,
      });
    }
    console.log(`[monitor] interrupt sent: ${groups.map((g) => `${g.kind}x${g.events.length}`).join(' ')} push=${push.ok ? 'ok' : push.reason}`);
    return { sent: true, reason: 'sent', kinds: groups.map((g) => g.kind), count, push: push.ok };
  } catch (err) {
    console.error('[monitor] flush error:', err?.message || err);
    return { sent: false, reason: 'exception' };
  }
}

/** Was the previous heartbeat/daily long enough ago? */
export function heartbeatDecision({ now, lastAt, everyMs }) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  if (!lastAt) return { due: true, reason: 'no_previous', since: new Date(t - everyMs) };
  const last = lastAt instanceof Date ? lastAt.getTime() : Number(lastAt);
  // 60s of slack so a cron that fires a few seconds early is not skipped.
  if (t - last < everyMs - 60000) return { due: false, reason: 'too_soon' };
  return { due: true, reason: 'due', since: new Date(last) };
}

async function readMarkerTime({ supabaseUrl, serviceKey, path }) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vercel_logs?request_path=eq.${encodeURIComponent(path)}&order=timestamp.desc&limit=1&select=timestamp`,
      { headers: supaHeaders(serviceKey), signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const ts = Array.isArray(rows) && rows[0]?.timestamp;
    return ts ? new Date(ts) : null;
  } catch {
    return null;
  }
}

/**
 * Age out old pulse rows so the ledger cannot grow without a bound.
 *
 * DEFAULT OFF, and that is deliberate. At today's ~49 visitors a month this
 * writes a couple of hundred rows a month, which Postgres will not notice for
 * years, and a job that deletes rows nobody asked it to delete is a worse
 * surprise than a table that is slightly larger than it needs to be. Set
 * MONITOR_PRUNE_DAYS to a number to switch it on. Scoped to rows this system
 * wrote, on the reserved pulse prefix. Markers are never touched.
 */
export async function prunePulses({ supabaseUrl, serviceKey, now = new Date(), env = process.env }) {
  const days = Number.parseInt(env.MONITOR_PRUNE_DAYS ?? '', 10);
  if (!Number.isFinite(days) || days < 1) return { pruned: false, reason: 'disabled' };
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/vercel_logs?request_path=like.${encodeURIComponent(PULSE_PATH_PREFIX + '*')}` +
        `&timestamp=lt.${encodeURIComponent(cutoff.toISOString())}`,
      {
        method: 'DELETE',
        headers: { ...supaHeaders(serviceKey), Prefer: 'return=minimal' },
        signal: AbortSignal.timeout(10000),
      }
    );
    return res.ok ? { pruned: true, before: cutoff.toISOString() } : { pruned: false, reason: `http_${res.status}` };
  } catch (err) {
    return { pruned: false, reason: err?.message || 'exception' };
  }
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** Hour of day, in MONITOR_TZ, at which the always-sends roll-up goes out. */
export const DAILY_HOUR = 8;

/**
 * The heartbeat. Hourly: send only when something happened, so a quiet night is
 * a quiet inbox. Once a day at DAILY_HOUR: send whatever the number is, INCLUDING
 * zero, because silence from a monitor is indistinguishable from a broken one.
 */
export async function runHeartbeat({ supabaseUrl, serviceKey, now = new Date() }) {
  if (!supabaseUrl || !serviceKey) return { sent: false, reason: 'no_supabase_credentials' };
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: 'no_resend_key' };

  const config = monitorConfig();
  if (!config.enabled) return { sent: false, reason: 'monitor_disabled' };
  if (!config.heartbeat) return { sent: false, reason: 'heartbeat_disabled' };

  try {
    const localHour = hourIn(config.tz, now);
    const wantDaily = localHour === DAILY_HOUR;

    if (wantDaily) {
      const lastDaily = await readMarkerTime({ supabaseUrl, serviceKey, path: DAILY_MARKER_PATH });
      const d = heartbeatDecision({ now, lastAt: lastDaily, everyMs: DAY_MS });
      if (d.due) {
        const since = new Date(now.getTime() - DAY_MS);
        const events = await readPulses({ supabaseUrl, serviceKey, since, limit: 1000 });
        const names = await memberNames({ supabaseUrl, serviceKey, uids: events.map((e) => e.uid) });
        const { subject, text } = buildHeartbeatEmail(events, { since, now, daily: true, tz: config.tz, names });
        const r = await sendMail({
          from: FROM_APP, to: OWNER_INBOX, subject, text,
          tags: [{ name: 'kind', value: 'monitor_daily' }],
        });
        if (!r.ok) return { sent: false, reason: 'send_failed' };
        await writeMarker({
          supabaseUrl, serviceKey, now, path: DAILY_MARKER_PATH,
          message: `[monitor] daily roll-up sent, ${events.length} event(s)`,
        });
        // Once a day is often enough to age the ledger out. Off unless
        // MONITOR_PRUNE_DAYS is set.
        await prunePulses({ supabaseUrl, serviceKey, now });
        return { sent: true, reason: 'daily', count: events.length };
      }
    }

    if (isQuietHour(config.quietHours, localHour)) return { sent: false, reason: 'quiet_hours' };

    const lastHb = await readMarkerTime({ supabaseUrl, serviceKey, path: HEARTBEAT_MARKER_PATH });
    const d = heartbeatDecision({ now, lastAt: lastHb, everyMs: HOUR_MS });
    if (!d.due) return { sent: false, reason: 'too_soon' };

    const since = new Date(Math.max(d.since.getTime(), now.getTime() - HOUR_MS));
    const events = await readPulses({ supabaseUrl, serviceKey, since });
    if (events.length === 0) return { sent: false, reason: 'quiet_hour_no_events' };

    const names = await memberNames({ supabaseUrl, serviceKey, uids: events.map((e) => e.uid) });
    const { subject, text } = buildHeartbeatEmail(events, { since, now, daily: false, tz: config.tz, names });
    const r = await sendMail({
      from: FROM_APP, to: OWNER_INBOX, subject, text,
      tags: [{ name: 'kind', value: 'monitor_heartbeat' }],
    });
    if (!r.ok) return { sent: false, reason: 'send_failed' };
    await writeMarker({
      supabaseUrl, serviceKey, now, path: HEARTBEAT_MARKER_PATH,
      message: `[monitor] heartbeat sent, ${events.length} event(s)`,
    });
    return { sent: true, reason: 'hourly', count: events.length };
  } catch (err) {
    console.error('[monitor] heartbeat error:', err?.message || err);
    return { sent: false, reason: 'exception' };
  }
}
