// test/errorAlert.test.mjs
//
// WHAT ADAM SAID, which is the specification: "i'm getting random emails
// saying someone saw an error yet nothing after that". The old alert said
// "Someone saw an error" and stopped. There was no error, no path, no count,
// and no outcome, so nothing could be done about it without opening a
// dashboard. That is an anxiety generator, not a monitor.
//
// Every test here asserts one of the five things the alert now has to answer:
// what broke, where, how bad, WHAT THAT SESSION DID NEXT, and whether it is
// new. The fourth is the one worth the most, because an error a visitor
// shrugged off is a bug and an error that ended the visit is a lost customer.
//
// Nothing in this file sends mail, pushes, or touches the network.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeErrorGroup,
  sessionOutcome,
  signatureHistory,
  matchClientErrorRows,
  errorSignature,
  buildErrorLines,
  buildInterruptEmail,
  buildPushLine,
  ERROR_RECOVERY_GRACE_MS,
} from '../api/_monitor.js';

const T0 = new Date('2026-09-08T15:00:00.000Z');
const ago = (ms) => new Date(T0.getTime() - ms);

const err = (over = {}) => ({
  kind: 'user_error',
  at: ago(10 * 60_000),
  path: '/crochet-abbreviations',
  ref: null,
  sid: 'aabbccdd',
  uid: null,
  detail: "TypeError: Cannot read properties of undefined (reading 'map')",
  ...over,
});

describe('how bad is it: one person or many, and how many times', () => {
  test('one session, three occurrences, is not three people', () => {
    const s = summarizeErrorGroup([err(), err(), err()]);
    assert.equal(s.occurrences, 3);
    assert.equal(s.people, 1);
    assert.equal(s.signatures.length, 1);
    assert.equal(s.signatures[0].count, 3);
  });

  test('three sessions with the same bug is three people, one signature', () => {
    const s = summarizeErrorGroup([err(), err({ sid: '11112222' }), err({ sid: '33334444' })]);
    assert.equal(s.people, 3);
    assert.equal(s.signatures.length, 1);
  });

  test('a signed-in user counts once even across two tabs', () => {
    const uid = '11111111-2222-3333-4444-555555555555';
    const s = summarizeErrorGroup([err({ uid, sid: 'aaaa1111' }), err({ uid, sid: 'bbbb2222' })]);
    assert.equal(s.people, 1);
  });

  test('two different bugs are two signatures, ordered by how loud they are', () => {
    const s = summarizeErrorGroup([
      err({ detail: 'quiet bug' }),
      err({ detail: 'loud bug' }),
      err({ detail: 'loud bug' }),
    ]);
    assert.equal(s.signatures.length, 2);
    assert.equal(s.signatures[0].signature, 'loud bug');
    assert.equal(s.signatures[0].count, 2);
  });

  test('an error with no session id is reported as unattributed, never as zero people', () => {
    // "0 people saw an error" is a sentence a monitor must never produce.
    const s = summarizeErrorGroup([err({ sid: null }), err({ sid: null })]);
    assert.equal(s.people, 0);
    assert.equal(s.unattributed, 2);
    const lines = buildErrorLines({ kind: 'user_error', events: [err({ sid: null })] }, {}, { tz: 'UTC', now: T0 }).join('\n');
    assert.match(lines, /could be one person or several/);
  });
});

describe('what that session did next, which is the whole point', () => {
  const rows = [
    { kind: 'page_view', sid: 'aabbccdd', uid: null, path: '/crochet-abbreviations', at: ago(9 * 60_000) },
    { kind: 'tool_used', sid: 'aabbccdd', uid: null, path: '/tools', at: ago(8 * 60_000) },
    { kind: 'page_view', sid: 'zzzzyyyy', uid: null, path: '/', at: ago(1 * 60_000) },
  ];

  test('a session that kept browsing is reported as recovered, with the trail', () => {
    const out = sessionOutcome({ sid: 'aabbccdd', errorAt: ago(10 * 60_000), rows, now: T0 });
    assert.equal(out.status, 'continued');
    assert.equal(out.next.length, 2);
    assert.equal(out.next[0].kind, 'page_view');
  });

  test('a session whose error was its last event is reported as ended', () => {
    const out = sessionOutcome({ sid: 'nonesuch', errorAt: ago(10 * 60_000), rows, now: T0 });
    assert.equal(out.status, 'ended');
  });

  test('another session busy at the same time does not count as this one recovering', () => {
    // Attribution is per session id. Mixing them up would report every error
    // as recovered on any site with two visitors.
    const out = sessionOutcome({ sid: 'aabbccdd', errorAt: ago(30_000), rows, now: T0 });
    assert.notEqual(out.status, 'continued');
  });

  test('events BEFORE the error are not evidence the visitor carried on after it', () => {
    const out = sessionOutcome({ sid: 'aabbccdd', errorAt: ago(60_000), rows, now: T0 });
    assert.notEqual(out.status, 'continued');
  });

  test('a fresh error with nothing after it yet is pending, not a lost customer', () => {
    // The cron runs every minute. Calling a visit dead 20 seconds in is the
    // kind of wrong that teaches Adam to stop believing the alert.
    const out = sessionOutcome({ sid: 'nonesuch', errorAt: ago(20_000), rows, now: T0 });
    assert.equal(out.status, 'pending');
    assert.ok(out.quietMs < ERROR_RECOVERY_GRACE_MS);
  });

  test('a signed-in user is followed by uid, so a new tab still counts as the same person', () => {
    const uid = '11111111-2222-3333-4444-555555555555';
    const r = [{ kind: 'page_view', sid: 'other', uid, path: '/', at: ago(5 * 60_000) }];
    const out = sessionOutcome({ sid: 'aabbccdd', uid, errorAt: ago(10 * 60_000), rows: r, now: T0 });
    assert.equal(out.status, 'continued');
  });

  test('no session id at all is unattributed, not silently called ended', () => {
    const out = sessionOutcome({ sid: null, uid: null, errorAt: ago(10 * 60_000), rows, now: T0 });
    assert.equal(out.status, 'unattributed');
  });

  test('another user_error from the same session is not "they kept browsing"', () => {
    const r = [{ kind: 'user_error', sid: 'aabbccdd', uid: null, path: '/', at: ago(9 * 60_000) }];
    const out = sessionOutcome({ sid: 'aabbccdd', errorAt: ago(10 * 60_000), rows: r, now: T0 });
    assert.equal(out.status, 'ended');
  });
});

describe('has this been seen before', () => {
  const history = [
    { at: ago(3 * 24 * 3600_000), detail: 'boom' },
    { at: ago(2 * 24 * 3600_000), detail: 'boom' },
    { at: ago(60 * 60_000), detail: 'something else' },
  ];

  test('it counts prior sightings and reports the first and the last', () => {
    const h = signatureHistory(history, 'boom');
    assert.equal(h.count, 2);
    assert.equal(h.firstAt.getTime(), ago(3 * 24 * 3600_000).getTime());
    assert.equal(h.lastAt.getTime(), ago(2 * 24 * 3600_000).getTime());
  });

  test('a signature never seen before reports zero rather than guessing', () => {
    assert.equal(signatureHistory(history, 'brand new bug').count, 0);
    assert.equal(signatureHistory([], 'boom').count, 0);
    assert.equal(signatureHistory(null, 'boom').count, 0);
  });

  test('the signature is the stored detail, truncated the same way every time', () => {
    assert.equal(errorSignature({ detail: 'abc' }), 'abc');
    assert.equal(errorSignature({}), 'unknown error');
    assert.equal(errorSignature({ detail: 'x'.repeat(200) }).length, 80);
  });
});

describe('the full message and the stack come off the diagnostic row', () => {
  const clientRows = [
    { at: T0, message: "TypeError: Cannot read properties of undefined (reading 'map') @ /assets/index.js:12:9", stack: 'at Foo\nat Bar' },
    { at: T0, message: 'some other failure', stack: null },
  ];

  test('a signature is paired with its full message and stack', () => {
    const sig = err().detail;
    const { messages, stacks } = matchClientErrorRows([sig], clientRows);
    assert.ok(messages[sig].includes('/assets/index.js:12:9'));
    assert.equal(stacks[sig], 'at Foo\nat Bar');
  });

  test('a signature with no matching row degrades to the signature, never to a crash', () => {
    const { messages, stacks } = matchClientErrorRows(['nothing matches this'], clientRows);
    assert.equal(messages['nothing matches this'], undefined);
    assert.equal(stacks['nothing matches this'], undefined);
    const lines = buildErrorLines({ kind: 'user_error', events: [err({ detail: 'nothing matches this' })] }, {}, { tz: 'UTC', now: T0 });
    assert.ok(lines.join('\n').includes('nothing matches this'));
  });
});

describe('the email an error now produces', () => {
  const group = {
    kind: 'user_error',
    events: [err(), err({ sid: '99887766' })],
  };
  const ctx = {
    rows: [{ kind: 'page_view', sid: 'aabbccdd', uid: null, path: '/tools', at: ago(9 * 60_000) }],
    messages: { [err().detail]: `${err().detail} @ /assets/index-abc.js:12:9` },
    stacks: { [err().detail]: 'at renderChart (/assets/index-abc.js:12:9)\nat commitRoot' },
    history: { [err().detail]: { count: 4, firstAt: ago(3 * 24 * 3600_000), lastAt: ago(2 * 3600_000) } },
  };
  const { subject, text } = buildInterruptEmail([group], { now: T0, tz: 'UTC', sentToday: 0, maxPerDay: 40, errorContext: ctx });

  test('the subject names the error and the path, not just that something happened', () => {
    assert.ok(subject.includes('/crochet-abbreviations'), subject);
    assert.ok(subject.includes('TypeError'), subject);
  });

  test('the body carries the real message and the stack', () => {
    assert.ok(text.includes('/assets/index-abc.js:12:9'));
    assert.ok(text.includes('at renderChart'));
  });

  test('the body says how many people and how many times', () => {
    assert.ok(/2 people/.test(text), text);
  });

  test('the body says what the session did next', () => {
    assert.ok(/they kept going/.test(text), text);
  });

  test('the body says whether this signature is new', () => {
    assert.ok(/4 times before/.test(text), text);
  });

  test('an unrecognised signature is reported as a first sighting rather than left blank', () => {
    const { text: t } = buildInterruptEmail(
      [{ kind: 'user_error', events: [err({ detail: 'brand new' })] }],
      { now: T0, tz: 'UTC', errorContext: { rows: [] } }
    );
    assert.ok(/first time/.test(t), t);
  });

  test('an error that ended the visit says so in as many words', () => {
    const { text: t } = buildInterruptEmail(
      [{ kind: 'user_error', events: [err({ sid: 'lonely00' })] }],
      { now: T0, tz: 'UTC', errorContext: { rows: [] } }
    );
    assert.ok(/last thing this session did/.test(t), t);
  });

  test('it still composes with no enrichment at all, because the queries can fail', () => {
    const { subject: s, text: t } = buildInterruptEmail([group], { now: T0, tz: 'UTC' });
    assert.ok(s.length > 0);
    assert.ok(t.includes('TypeError'));
  });

  test('house style holds, because this lands in a real inbox', () => {
    for (const s of [subject, text]) {
      assert.equal(s.includes('—'), false, 'no em dashes');
      assert.equal(s.includes('!'), false, 'no exclamation points');
    }
  });

  test('non-error kinds keep the shape they had', () => {
    const { subject: s } = buildInterruptEmail(
      [{ kind: 'guest_arrived', events: [{ kind: 'guest_arrived', at: ago(60_000), path: '/', sid: 'aabbccdd', uid: null, ref: null }] }],
      { now: T0, tz: 'UTC' }
    );
    assert.ok(s.startsWith('Wovely: '), s);
    assert.ok(s.includes('arrived'));
  });
});

describe('the phone push is actionable and still names nobody', () => {
  const line = buildPushLine([
    { kind: 'user_error', events: [err({ uid: '11111111-2222-3333-4444-555555555555' }), err({ sid: 'deadbeefcafe' })] },
  ]);
  const whole = `${line.title} ${line.body}`;

  test('it carries the error, the path and the count', () => {
    assert.ok(whole.includes('/crochet-abbreviations'), whole);
    assert.ok(whole.includes('TypeError'), whole);
    assert.ok(/x2/.test(whole), whole);
  });

  test('it still carries no uid and no session id', () => {
    // An ntfy topic is readable by anyone who learns its name. A public path
    // and our own thrown message identify nobody. A session id does.
    for (const secret of ['11111111', '2222-3333', 'deadbeefcafe', 'aabbccdd']) {
      assert.equal(whole.includes(secret), false, `push must not carry ${secret}`);
    }
  });

  test('it breaks through Do Not Disturb, because breakage should', () => {
    assert.equal(line.priority, 'high');
  });
});
