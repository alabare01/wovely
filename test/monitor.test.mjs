// test/monitor.test.mjs
// The throttle, and the privacy rules around it.
//
// WHY THIS FILE EXISTS, stated plainly: a throttle that fails open is how an
// inbox gets destroyed. Every one of these paths is a way that could happen —
// a missing marker read as "never sent", an unreadable ledger read as "nothing
// today", a per-kind window that forgets to restart — and every one of them is
// asserted against here rather than hoped about.
//
// The second half guards what the monitor is allowed to carry. A beacon on a
// site that promises a pasted pattern never leaves the browser has to be
// provably incapable of carrying one, and "provably" means a test, not a
// comment. The phone push is held to a harder line still, because an ntfy
// topic is readable by anyone who learns its name.
//
// Nothing in this file sends mail, pushes, or touches the network.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_KINDS,
  INTERRUPT_KINDS,
  MONITOR_MAX_LOOKBACK_MS,
  PULSE_PATH_PREFIX,
  SENT_PATH_PREFIX,
  throttleDecision,
  flushGate,
  heartbeatDecision,
  monitorConfig,
  flagOn,
  parseQuietHours,
  isQuietHour,
  hourIn,
  normalizeEvent,
  eventRow,
  cleanPath,
  cleanMeta,
  BEACON_META_KEYS,
  SERVER_META_KEYS,
  refHost,
  looksLikeBot,
  buildInterruptEmail,
  buildHeartbeatEmail,
  buildPushLine,
  pushHeaderSafe,
  ntfyTopicFromUrl,
  summarize,
  HOUR_MS,
  DAY_MS,
} from '../api/_monitor.js';

const T0 = new Date('2026-09-08T15:00:00.000Z');
const ago = (ms) => new Date(T0.getTime() - ms);
const ev = (kind, over = {}) => ({
  kind,
  at: ago(60_000),
  path: '/',
  ref: null,
  sid: 'aabbccdd',
  uid: null,
  ...over,
});

// ─── THE THROTTLE ────────────────────────────────────────────────────────────

describe('throttle: a kind cannot send twice inside its own window', () => {
  for (const kind of INTERRUPT_KINDS) {
    const w = EVENT_KINDS[kind].windowMs;

    test(`${kind} is throttled one millisecond before its window elapses`, () => {
      const d = throttleDecision({ kind, now: T0, lastSentAt: ago(w - 1) });
      assert.equal(d.due, false);
      assert.equal(d.reason, 'throttled');
    });

    test(`${kind} comes due the moment the window elapses`, () => {
      const d = throttleDecision({ kind, now: T0, lastSentAt: ago(w) });
      assert.equal(d.due, true);
      assert.equal(d.reason, 'window_elapsed');
    });

    test(`${kind} covers everything since the last message, so nothing is dropped`, () => {
      const last = ago(w + 30_000);
      const d = throttleDecision({ kind, now: T0, lastSentAt: last });
      assert.equal(d.due, true);
      // The window starts at the previous message, not at "now minus window".
      // If it started at now-minus-window, events in the gap would vanish.
      assert.equal(d.since.getTime(), last.getTime());
    });
  }
});

describe('throttle: the cold-start cap', () => {
  test('with no previous message it looks back one hour and no further', () => {
    const d = throttleDecision({ kind: 'guest_arrived', now: T0, lastSentAt: null });
    assert.equal(d.due, true);
    assert.equal(d.reason, 'no_previous_message');
    assert.equal(d.since.getTime(), T0.getTime() - MONITOR_MAX_LOOKBACK_MS);
  });

  test('an ancient marker still cannot reach back past the cap', () => {
    // Four months of silence must not become one email listing four months.
    const d = throttleDecision({ kind: 'guest_arrived', now: T0, lastSentAt: ago(120 * DAY_MS) });
    assert.equal(d.due, true);
    assert.equal(d.since.getTime(), T0.getTime() - MONITOR_MAX_LOOKBACK_MS);
  });
});

describe('throttle: kinds that are not allowed to interrupt', () => {
  test('a digest-only kind is never due', () => {
    for (const kind of Object.keys(EVENT_KINDS).filter((k) => !EVENT_KINDS[k].interrupt)) {
      const d = throttleDecision({ kind, now: T0, lastSentAt: null });
      assert.equal(d.due, false, `${kind} must not interrupt`);
      assert.equal(d.reason, 'digest_only');
    }
  });

  test('an unknown kind is never due', () => {
    const d = throttleDecision({ kind: 'not_a_real_kind', now: T0, lastSentAt: null });
    assert.equal(d.due, false);
    assert.equal(d.reason, 'unknown_kind');
  });

  test('signup and checkout_completed digest rather than interrupt', () => {
    // notify-signup.js already emails on signup, and a completed Wovely
    // payment already pushes to Adam's phone through the shared Stripe hook.
    // Interrupting on either would be the same news twice.
    assert.equal(EVENT_KINDS.signup.interrupt, false);
    assert.equal(EVENT_KINDS.checkout_completed.interrupt, false);
  });
});

// ─── THE CEILING ─────────────────────────────────────────────────────────────

const CFG = {
  enabled: true, interrupts: true, heartbeat: true, push: true,
  pushWebhook: '', pushTopic: '', maxPerDay: 40, quietHours: null, tz: 'UTC',
};

describe('the daily cap is a ceiling, not a suggestion', () => {
  test('under the cap the gate opens', () => {
    assert.equal(flushGate({ config: CFG, now: T0, sentToday: 39 }).allowed, true);
  });

  test('at the cap the gate closes', () => {
    const g = flushGate({ config: CFG, now: T0, sentToday: 40 });
    assert.equal(g.allowed, false);
    assert.equal(g.reason, 'daily_cap');
  });

  test('an unreadable ledger fails CLOSED, not open', () => {
    // readSentToday returns Infinity when the count cannot be read. If that
    // were 0 instead, a database blip would lift the ceiling entirely, which
    // is the exact shape of the failure this whole file guards.
    const g = flushGate({ config: CFG, now: T0, sentToday: Number.POSITIVE_INFINITY });
    assert.equal(g.allowed, false);
    assert.equal(g.reason, 'daily_cap');
  });

  test('a cap of zero silences interrupts entirely', () => {
    const g = flushGate({ config: { ...CFG, maxPerDay: 0 }, now: T0, sentToday: 0 });
    assert.equal(g.allowed, false);
  });
});

describe('the kill switches', () => {
  test('MONITOR_ENABLED off closes the gate', () => {
    const g = flushGate({ config: { ...CFG, enabled: false }, now: T0, sentToday: 0 });
    assert.equal(g.allowed, false);
    assert.equal(g.reason, 'monitor_disabled');
  });

  test('MONITOR_INTERRUPTS_ENABLED off closes the gate', () => {
    const g = flushGate({ config: { ...CFG, interrupts: false }, now: T0, sentToday: 0 });
    assert.equal(g.allowed, false);
    assert.equal(g.reason, 'interrupts_disabled');
  });

  test('every switch defaults ON when the variable is absent', () => {
    const c = monitorConfig({});
    assert.equal(c.enabled, true);
    assert.equal(c.interrupts, true);
    assert.equal(c.heartbeat, true);
    assert.equal(c.push, true);
    assert.equal(c.maxPerDay, 40);
    assert.equal(c.quietHours, null);
  });

  test('the off values Adam might actually type all work', () => {
    for (const v of ['0', 'false', 'no', 'off', 'OFF', 'False']) {
      assert.equal(flagOn(v), false, `${v} should read as off`);
    }
    for (const v of ['1', 'true', 'yes', 'on', 'ON']) {
      assert.equal(flagOn(v), true, `${v} should read as on`);
    }
  });

  test('a typo in a kill switch leaves it ON rather than silently off', () => {
    // A monitor that goes quiet because of a misspelt env value is a monitor
    // whose silence lies. Unrecognised input keeps the default.
    assert.equal(flagOn('nope'), true);
    assert.equal(monitorConfig({ MONITOR_ENABLED: 'maybe' }).enabled, true);
  });

  test('a nonsense cap falls back to 40 rather than to zero or infinity', () => {
    assert.equal(monitorConfig({ MONITOR_MAX_INTERRUPTS_PER_DAY: 'lots' }).maxPerDay, 40);
    assert.equal(monitorConfig({ MONITOR_MAX_INTERRUPTS_PER_DAY: '-5' }).maxPerDay, 40);
    assert.equal(monitorConfig({ MONITOR_MAX_INTERRUPTS_PER_DAY: '3' }).maxPerDay, 3);
  });
});

describe('quiet hours', () => {
  test('unset means never quiet', () => {
    assert.equal(parseQuietHours(undefined), null);
    assert.equal(parseQuietHours(''), null);
    assert.equal(isQuietHour(null, 3), false);
  });

  test('a window that crosses midnight covers both sides of it', () => {
    const q = parseQuietHours('22-7');
    assert.deepEqual(q, { start: 22, end: 7 });
    assert.equal(isQuietHour(q, 23), true);
    assert.equal(isQuietHour(q, 3), true);
    assert.equal(isQuietHour(q, 7), false);
    assert.equal(isQuietHour(q, 12), false);
  });

  test('a window inside one day behaves normally', () => {
    const q = parseQuietHours('9-17');
    assert.equal(isQuietHour(q, 8), false);
    assert.equal(isQuietHour(q, 9), true);
    assert.equal(isQuietHour(q, 16), true);
    assert.equal(isQuietHour(q, 17), false);
  });

  test('junk parses to no quiet hours rather than to an accidental all-day mute', () => {
    for (const v of ['22', 'evening', '25-3', '5-5', '-', '22-']) {
      assert.equal(parseQuietHours(v), null, `${v} should not parse`);
    }
  });

  test('quiet hours close the gate', () => {
    const config = { ...CFG, quietHours: { start: 22, end: 7 }, tz: 'UTC' };
    const at3am = new Date('2026-09-08T03:00:00.000Z');
    assert.equal(flushGate({ config, now: at3am, sentToday: 0 }).reason, 'quiet_hours');
  });

  test('midnight reads as hour 0, not hour 24', () => {
    assert.equal(hourIn('UTC', new Date('2026-09-08T00:30:00.000Z')), 0);
  });

  test('an unknown time zone falls back to UTC instead of throwing', () => {
    assert.equal(hourIn('Not/AZone', new Date('2026-09-08T15:00:00.000Z')), 15);
  });
});

describe('the heartbeat cadence', () => {
  test('an hourly heartbeat that just ran does not run again', () => {
    assert.equal(heartbeatDecision({ now: T0, lastAt: ago(10 * 60_000), everyMs: HOUR_MS }).due, false);
  });

  test('a cron firing a few seconds early is not skipped for the whole hour', () => {
    // Vercel does not fire exactly on the second. Without slack, an early tick
    // is refused and the digest waits another full hour.
    assert.equal(heartbeatDecision({ now: T0, lastAt: ago(HOUR_MS - 20_000), everyMs: HOUR_MS }).due, true);
  });

  test('the daily roll-up will not double-send inside one day', () => {
    assert.equal(heartbeatDecision({ now: T0, lastAt: ago(6 * HOUR_MS), everyMs: DAY_MS }).due, false);
    assert.equal(heartbeatDecision({ now: T0, lastAt: ago(DAY_MS), everyMs: DAY_MS }).due, true);
  });
});

// ─── WHAT THE MONITOR IS ALLOWED TO CARRY ────────────────────────────────────

describe('the beacon accepts only its own vocabulary', () => {
  test('a kind outside EVENT_KINDS is dropped', () => {
    assert.equal(normalizeEvent({ kind: 'exfiltrate' }), null);
    assert.equal(normalizeEvent({ kind: '' }), null);
    assert.equal(normalizeEvent({}), null);
    assert.equal(normalizeEvent(null), null);
    assert.equal(normalizeEvent('guest_arrived'), null);
  });

  test('a prototype-polluting kind is not treated as known', () => {
    assert.equal(normalizeEvent({ kind: 'constructor' }), null);
    assert.equal(normalizeEvent({ kind: 'toString' }), null);
  });

  test('a known kind survives', () => {
    const e = normalizeEvent({ kind: 'guest_arrived', path: '/tools', sid: 'deadbeef' });
    assert.equal(e.kind, 'guest_arrived');
    assert.equal(e.path, '/tools');
    assert.equal(e.sid, 'deadbeef');
  });
});

describe('privacy: a pattern cannot be smuggled through the beacon', () => {
  const PATTERN = 'Round 3: sc in next st, 2 sc in next st, repeat around (18) '.repeat(40);

  test('the query string is dropped, not truncated into', () => {
    assert.equal(cleanPath('/pattern?text=' + encodeURIComponent(PATTERN)), '/pattern');
    assert.equal(cleanPath('/p#' + PATTERN), '/p');
  });

  test('a path is capped and must be a path', () => {
    assert.ok(cleanPath('/' + 'a'.repeat(500)).length <= 121);
    assert.equal(cleanPath('https://evil.example/x'), '/');
    assert.equal(cleanPath(''), '/');
    assert.equal(cleanPath(undefined), '/');
  });

  test('a referrer contributes its hostname and nothing else', () => {
    assert.equal(refHost('https://www.google.com/search?q=' + encodeURIComponent(PATTERN)), 'www.google.com');
    assert.equal(refHost('not a url at all ' + PATTERN), null);
    assert.equal(refHost(''), null);
  });

  test('meta refuses nested values, so nothing can hide inside an object', () => {
    const m = cleanMeta({ intent: 'fine', nested: { pattern: PATTERN }, list: [PATTERN] });
    assert.equal(m.intent, 'fine');
    assert.equal('nested' in m, false);
    assert.equal('list' in m, false);
  });

  test('a browser can set only the meta keys this app itself sends', () => {
    // This started as a shape check, and the row-size test below caught it:
    // any name-shaped key survived, so a stranger could post 80 characters of
    // anything under a key of their choosing, eight times per event. Eighty
    // characters of somebody's pattern is still somebody's pattern.
    const m = cleanMeta({ intent: 'import', junk: PATTERN, notes: PATTERN, detail: PATTERN });
    assert.deepEqual(Object.keys(m), ['intent']);
    for (const k of BEACON_META_KEYS) assert.ok(!k.includes('detail'));
  });

  test('every meta string that does survive is capped at 80 characters', () => {
    const m = cleanMeta({ intent: PATTERN });
    assert.equal(m.intent.length, 80);
  });

  test('meta cannot be widened by adding more keys', () => {
    const wide = {};
    for (let i = 0; i < 50; i++) wide[`k${i}`] = PATTERN;
    const m = cleanMeta(wide);
    assert.equal(Object.keys(m).length, 0);
  });

  test('the server side may attach an error detail, and a browser may not', () => {
    // A deliberate asymmetry. api/client-error.js has to carry the head of an
    // error message; a stranger's browser has no such need.
    assert.equal(cleanMeta({ detail: 'TypeError: x is undefined' }, SERVER_META_KEYS).detail,
      'TypeError: x is undefined');
    assert.equal('detail' in cleanMeta({ detail: 'TypeError: x is undefined' }), false);
  });

  test('the whole row a beacon can produce stays small', () => {
    const row = eventRow(normalizeEvent({
      kind: 'demo_started',
      path: '/?q=' + PATTERN,
      ref: 'https://ravelry.com/x/' + PATTERN,
      sid: 'a'.repeat(32),
      uid: '11111111-2222-3333-4444-555555555555',
      meta: { row_index: 3, junk: PATTERN },
    }));
    assert.ok(JSON.stringify(row).length < 1200, 'a single event row must stay small');
    assert.equal(JSON.stringify(row).includes('Round 3: sc in next st'), false);
  });

  test('a uid that is not a uuid is discarded rather than stored', () => {
    // The uid column is a real identity. An email address arriving in that
    // field would be a real leak, so the shape is checked, not trusted.
    assert.equal(normalizeEvent({ kind: 'visit', uid: 'adam@wovely.app' }).uid, null);
    assert.equal(normalizeEvent({ kind: 'visit', uid: '11111111-2222-3333-4444-555555555555' }).uid,
      '11111111-2222-3333-4444-555555555555');
  });

  test('a session id that is not opaque hex is discarded', () => {
    assert.equal(normalizeEvent({ kind: 'visit', sid: 'adam@wovely.app' }).sid, null);
    assert.equal(normalizeEvent({ kind: 'visit', sid: 'ZZZZ' }).sid, null);
  });
});

describe('bots do not reach the inbox', () => {
  test('crawlers and synthetic checkers are refused', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 AhrefsBot/7.0',
      'curl/8.4.0',
      'HeadlessChrome/120.0.0.0',
      'facebookexternalhit/1.1',
      '',
      undefined,
    ]) {
      assert.equal(looksLikeBot(ua), true, `${ua} should read as a bot`);
    }
  });

  test('a real browser is not refused', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    ]) {
      assert.equal(looksLikeBot(ua), false, `${ua} should read as a person`);
    }
  });
});

// ─── WHAT THE MESSAGES SAY ───────────────────────────────────────────────────

describe('the interrupt email', () => {
  const groups = [
    { kind: 'checkout_started', events: [ev('checkout_started', { uid: '11111111-2222-3333-4444-555555555555' })] },
    { kind: 'guest_arrived', events: [ev('guest_arrived'), ev('guest_arrived', { sid: '99887766' })] },
  ];
  const { subject, text } = buildInterruptEmail(groups, { now: T0, tz: 'UTC', sentToday: 3, maxPerDay: 40 });

  test('the subject leads with the loudest kind and counts the rest', () => {
    assert.ok(subject.startsWith('Wovely: '));
    assert.ok(/started checkout/.test(subject));
    assert.ok(/\+2 more/.test(subject));
  });

  test('the body says how to turn it off', () => {
    assert.ok(text.includes('MONITOR_INTERRUPTS_ENABLED=0'));
    assert.ok(text.includes('MONITOR_ENABLED=0'));
  });

  test('the body says where the day stands against the cap', () => {
    assert.ok(text.includes('4 of 40'));
  });

  test('house style holds, because this lands in a real inbox', () => {
    for (const s of [subject, text]) {
      assert.equal(s.includes('—'), false, 'no em dashes');
      assert.equal(s.includes('!'), false, 'no exclamation points');
    }
  });
});

describe('the heartbeat email', () => {
  const events = [
    ev('guest_arrived', { path: '/', ref: 'google.com' }),
    ev('page_view', { path: '/tools' }),
    ev('page_view', { path: '/tools', sid: '11223344' }),
    ev('demo_started', { path: '/' }),
  ];
  const { subject, text } = buildHeartbeatEmail(events, { since: ago(HOUR_MS), now: T0, tz: 'UTC' });

  test('it counts people, not just events', () => {
    const s = summarize(events);
    assert.equal(s.guests, 2);
    assert.equal(s.members, 0);
    assert.equal(s.total, 4);
    assert.ok(subject.includes('2 people'));
  });

  test('it says where they went and how they got here', () => {
    assert.ok(text.includes('/tools'));
    assert.ok(text.includes('google.com'));
  });

  test('the daily roll-up sends on a day when nobody came, and says so', () => {
    // A monitor that only speaks when there is news is indistinguishable from
    // a broken one. This message is the proof of life.
    const { subject: s, text: t } = buildHeartbeatEmail([], { since: ago(DAY_MS), now: T0, daily: true, tz: 'UTC' });
    assert.ok(s.includes('nobody came'));
    assert.ok(t.includes('Nobody came in the last 24 hours.'));
    assert.ok(t.includes('MONITOR_HEARTBEAT_ENABLED=0'));
  });

  test('house style holds here too', () => {
    for (const s of [subject, text]) {
      assert.equal(s.includes('—'), false, 'no em dashes');
      assert.equal(s.includes('!'), false, 'no exclamation points');
    }
  });
});

describe('the phone push carries no identifiers', () => {
  // An ntfy topic is readable by anyone who learns its name. The email is
  // addressed and private; the push is not, so it gets counts and labels only.
  const groups = [
    { kind: 'checkout_started', events: [ev('checkout_started', { uid: '11111111-2222-3333-4444-555555555555', path: '/checkout' })] },
    { kind: 'guest_arrived', events: [ev('guest_arrived', { sid: 'deadbeefcafe', ref: 'google.com' })] },
  ];
  const line = buildPushLine(groups);
  const whole = `${line.title} ${line.body}`;

  test('no uid, no session id, no path, no referrer', () => {
    for (const secret of ['11111111', '2222-3333', 'deadbeefcafe', '/checkout', 'google.com']) {
      assert.equal(whole.includes(secret), false, `push must not carry ${secret}`);
    }
  });

  test('it still says the thing worth saying', () => {
    assert.ok(whole.includes('started checkout'));
    assert.ok(/1 more thing/.test(whole));
  });

  test('money and breakage break through Do Not Disturb, arrivals do not', () => {
    assert.equal(buildPushLine([{ kind: 'checkout_started', events: [ev('checkout_started')] }]).priority, 'high');
    assert.equal(buildPushLine([{ kind: 'user_error', events: [ev('user_error')] }]).priority, 'high');
    assert.equal(buildPushLine([{ kind: 'guest_arrived', events: [ev('guest_arrived')] }]).priority, 'default');
  });

  test('push text is ascii, single line, and short', () => {
    const dirty = pushHeaderSafe('a\r\nb\tc — éè ' + 'x'.repeat(400), 300);
    assert.equal(/[\r\n]/.test(dirty), false);
    assert.equal(/[^\x20-\x7E]/.test(dirty), false);
    assert.ok(dirty.length <= 300);
  });

  test('an ntfy webhook URL yields its topic, and a non-ntfy URL does not', () => {
    assert.equal(ntfyTopicFromUrl('https://ntfy.sh/wovely-abc123'), 'wovely-abc123');
    assert.equal(ntfyTopicFromUrl('https://hooks.example.com/x'), null);
    assert.equal(ntfyTopicFromUrl(''), null);
    assert.equal(ntfyTopicFromUrl(undefined), null);
  });

  test('push is inert with no topic and no webhook configured', () => {
    const c = monitorConfig({});
    assert.equal(c.pushTopic, '');
    assert.equal(c.pushWebhook, '');
  });
});

// ─── THE LEDGER PATHS ────────────────────────────────────────────────────────

describe('the reserved paths are reserved', () => {
  test('nothing the monitor writes can collide with a real route', () => {
    // vercel.json rewrites everything that is not /api/ to the app. These are
    // ledger keys inside a log table, not routes, and the /internal/ prefix
    // keeps them out of the way of anything the site actually serves.
    assert.ok(PULSE_PATH_PREFIX.startsWith('/internal/'));
    assert.ok(SENT_PATH_PREFIX.startsWith('/internal/'));
    assert.notEqual(PULSE_PATH_PREFIX, SENT_PATH_PREFIX);
  });

  test('a pulse row is tagged so the digest query can find it and only it', () => {
    const row = eventRow(normalizeEvent({ kind: 'visit', path: '/' }));
    assert.equal(row.request_path, `${PULSE_PATH_PREFIX}visit`);
    assert.equal(row.source, 'monitor');
    assert.equal(row.project_id, 'wovely');
  });
});
