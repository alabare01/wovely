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

import { sendMail, FROM_APP, OWNER_INBOX } from './_mail.js';

// ── Reserved paths in vercel_logs. None of these is a real route. ───────────
export const PULSE_PATH_PREFIX = '/internal/pulse/';
export const SENT_PATH_PREFIX = '/internal/monitor/sent/';
export const HEARTBEAT_MARKER_PATH = '/internal/monitor/heartbeat';
export const DAILY_MARKER_PATH = '/internal/monitor/daily';

// Never look back further than this when no marker exists. Without it a cold
// start would mail every event in the table.
export const MONITOR_MAX_LOOKBACK_MS = 60 * 60 * 1000;

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
 * What the phone is allowed to say. Counts and labels, never who.
 * Kept pure so the privacy rule above is a test rather than a comment.
 */
export function buildPushLine(groups) {
  const lead = groups[0];
  const total = groups.reduce((n, g) => n + g.events.length, 0);
  const label = EVENT_KINDS[lead.kind]?.label || lead.kind;
  const head = lead.events.length === 1 ? `Someone ${label}` : `${lead.events.length} people ${label}`;
  const rest = total - lead.events.length;
  return {
    title: 'Wovely',
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

/**
 * Turn a raw beacon body into a row payload, or null when it is not a real
 * event. Never throws.
 */
export function normalizeEvent(body, { now = new Date() } = {}) {
  if (!body || typeof body !== 'object') return null;
  const kind = String(body.kind ?? '').trim();
  if (!Object.prototype.hasOwnProperty.call(EVENT_KINDS, kind)) return null;

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
export function eventRow(ev) {
  const meta = cleanMeta(ev.meta, SERVER_META_KEYS);
  return {
    timestamp: ev.at,
    level: 'info',
    message: `[pulse] ${ev.kind} ${ev.path}`,
    source: 'monitor',
    request_path: `${PULSE_PATH_PREFIX}${ev.kind}`,
    request_method: 'PULSE',
    status_code: 200,
    project_id: 'wovely',
    user_id: ev.uid,
    context: { kind: ev.kind, path: ev.path, ref: ev.ref, sid: ev.sid, ...meta },
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
export async function recordPulse({ supabaseUrl, serviceKey, events }) {
  const list = (Array.isArray(events) ? events : [events]).filter(Boolean);
  if (!supabaseUrl || !serviceKey || list.length === 0) return { ok: false, reason: 'noop' };
  if (!monitorConfig().enabled) return { ok: false, reason: 'monitor_disabled' };
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: { ...supaHeaders(serviceKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(list.map(eventRow)),
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
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      at: new Date(r.timestamp),
      kind: String(r.request_path || '').slice(PULSE_PATH_PREFIX.length),
      uid: r.user_id || null,
      ...(r.context && typeof r.context === 'object' ? r.context : {}),
    }));
  } catch {
    return [];
  }
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

/**
 * One message covering every kind that came due on this flush.
 * `groups` is [{ kind, events }] already ordered by priority.
 */
export function buildInterruptEmail(groups, { now, tz = 'America/New_York', sentToday = 0, maxPerDay = 40 } = {}) {
  const total = groups.reduce((n, g) => n + g.events.length, 0);
  const lead = groups[0];
  const spec = EVENT_KINDS[lead.kind];

  const headline =
    lead.events.length === 1
      ? `Wovely: ${WHO(lead.events[0])} ${spec.label}`
      : `Wovely: ${lead.events.length} ${spec.label}`;
  const subject = groups.length > 1 ? `${headline}, +${total - lead.events.length} more` : headline;

  const lines = [];
  for (const g of groups) {
    const s = EVENT_KINDS[g.kind];
    lines.push(`${g.kind.toUpperCase().replace(/_/g, ' ')}  (${g.events.length})`);
    for (const e of g.events.slice(0, 12)) {
      const bits = [timeOf(e, tz), WHO(e), e.path || '/'];
      if (e.ref) bits.push(`from ${e.ref}`);
      lines.push(`  ${bits.join('  ·  ')}`);
    }
    if (g.events.length > 12) lines.push(`  and ${g.events.length - 12} more`);
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

export function buildHeartbeatEmail(events, { since, now, daily = false, tz = 'America/New_York', note = '' } = {}) {
  const s = summarize(events);
  const span = daily ? 'the last 24 hours' : 'the last hour';

  const subject = daily
    ? `Wovely daily: ${s.guests + s.members} visitor${s.guests + s.members === 1 ? '' : 's'}, ${s.total} event${s.total === 1 ? '' : 's'}`
    : `Wovely pulse: ${s.guests + s.members} on the site in the last hour`;

  const lines = [
    daily
      ? `The last 24 hours on wovely.app.`
      : `The last hour on wovely.app.`,
    `${since.toISOString()} to ${now.toISOString()}`,
    '',
    `Visitors: ${s.guests} guest${s.guests === 1 ? '' : 's'}, ${s.members} signed in`,
    `Events: ${s.total}`,
    '',
  ];

  if (s.total === 0) {
    lines.push(`Nobody came to wovely.app in ${span}.`);
    lines.push('');
    lines.push('This message is the proof the monitor is alive. It sends whether or not');
    lines.push('anyone showed up, so silence never has to be interpreted.');
  } else {
    lines.push('What happened');
    for (const [kind, n] of Object.entries(s.byKind).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${String(n).padStart(4)}  ${(EVENT_KINDS[kind]?.label) || kind}`);
    }
    lines.push('');
    if (s.topPaths.length) {
      lines.push('Where they went');
      for (const [p, n] of s.topPaths) lines.push(`  ${String(n).padStart(4)}  ${p}`);
      lines.push('');
    }
    if (s.topRefs.length) {
      lines.push('How they got here');
      for (const [r, n] of s.topRefs) lines.push(`  ${String(n).padStart(4)}  ${r}`);
      lines.push('');
    }
  }

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

    const { subject, text } = buildInterruptEmail(groups, {
      now, tz: config.tz, sentToday, maxPerDay: config.maxPerDay,
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
        const { subject, text } = buildHeartbeatEmail(events, { since, now, daily: true, tz: config.tz });
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

    const { subject, text } = buildHeartbeatEmail(events, { since, now, daily: false, tz: config.tz });
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
