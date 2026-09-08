// test/welcomeEmail.test.mjs
// Guards the outbound copy and the gate around it.
//
// The copy tests are not decoration. This email is the FIRST thing a Wovely
// user will ever receive, it goes out under Adam's name, and the house rules
// on it are absolute: no em dashes, no exclamation points, no AI-authorship
// tells, and the price stated in full rather than "free" left hanging. A prior
// draft claimed the app was free without qualification, which repeats a
// competitor's worst review. That specific mistake is asserted against here.
//
// Nothing in this file sends mail or touches the network.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { buildWelcomeEmail, WELCOME_SUBJECT } from '../api/_welcomeEmail.js';
import {
  unsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
  unsubscribeHeaders,
  sendMail,
} from '../api/_mail.js';
import { welcomeEmailEnabled } from '../api/notify-signup.js';
import { alertDecision, buildAlertEmail, ALERT_WINDOW_MS, ALERT_MAX_LOOKBACK_MS } from '../api/_alert.js';

const built = buildWelcomeEmail({
  ctaUrl: 'https://wovely.app/one-click',
  unsubUrl: 'https://wovely.app/api/email-prefs?u=abc&t=def',
});

// Strip HTML tags and attributes so style values and hrefs do not trip the
// prose assertions.
function prose(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('welcome email copy', () => {
  const surfaces = [
    ['subject', built.subject],
    ['text', built.text],
    ['html prose', prose(built.html)],
  ];

  for (const [name, body] of surfaces) {
    test(`${name} contains no em dash or en dash`, () => {
      assert.ok(!body.includes('—'), `${name} contains an em dash`);
      assert.ok(!body.includes('–'), `${name} contains an en dash`);
      assert.ok(!/&mdash;|&ndash;/i.test(body), `${name} contains a dash entity`);
    });

    test(`${name} contains no exclamation point`, () => {
      assert.ok(!body.includes('!'), `${name} contains an exclamation point`);
    });

    test(`${name} carries no AI reference`, () => {
      assert.ok(
        !/\b(AI|A\.I\.|artificial intelligence|machine learning|LLM|GPT|powered by)\b/i.test(body),
        `${name} references AI`
      );
    });

    test(`${name} avoids the word excited and brochure register`, () => {
      const banned = [
        'excited',
        'thrilled',
        'delighted',
        'seamless',
        'effortless',
        'revolutionary',
        'game-chang',
        'supercharge',
        'unlock the power',
        'cutting-edge',
        'best-in-class',
      ];
      for (const word of banned) {
        assert.ok(!body.toLowerCase().includes(word), `${name} uses banned word "${word}"`);
      }
    });
  }

  test('subject is the stable one', () => {
    assert.equal(built.subject, WELCOME_SUBJECT);
    assert.equal(built.subject, 'Your Wovely account is ready');
  });

  test('job 1: confirms the account exists', () => {
    assert.match(built.text, /account is set up/i);
  });

  test('job 2: one link to the first pattern', () => {
    assert.ok(built.text.includes('https://wovely.app/one-click'), 'text is missing the CTA link');
    assert.ok(built.html.includes('https://wovely.app/one-click'), 'html is missing the CTA link');
  });

  test('job 3: names a way to reach a human', () => {
    assert.match(built.text, /reply to this message/i);
    assert.match(built.text, /I answer it myself/i);
  });

  test('price is stated in full, both figures, both surfaces', () => {
    for (const [name, body] of [['text', built.text], ['html', prose(built.html)]]) {
      assert.ok(body.includes('5 patterns'), `${name} does not state the free cap`);
      assert.ok(body.includes('$6.99'), `${name} does not state the monthly price`);
      assert.ok(body.includes('$54.99'), `${name} does not state the annual price`);
    }
  });

  test('never says free without the cap attached', () => {
    // The failure being guarded: "free to use" with no qualification. Every
    // sentence that says free must also carry the 5 pattern limit or a price.
    for (const sentence of built.text.split(/(?<=[.?])\s+/)) {
      if (!/\bfree\b/i.test(sentence)) continue;
      assert.ok(
        /5 patterns|\$6\.99|\$54\.99/.test(sentence),
        `unqualified free claim: "${sentence.trim()}"`
      );
    }
  });

  test('unsubscribe is present in both surfaces', () => {
    assert.ok(built.text.includes('https://wovely.app/api/email-prefs?u=abc&t=def'));
    assert.ok(built.html.includes('email-prefs?u=abc&amp;t=def') || built.html.includes('email-prefs?u=abc&t=def'));
  });

  test('falls back to a mailto unsubscribe when no signed url exists', () => {
    const noUnsub = buildWelcomeEmail({ ctaUrl: 'https://wovely.app', unsubUrl: null });
    assert.match(noUnsub.text, /reply and say so/i);
    assert.ok(noUnsub.html.includes('mailto:adam@wovely.app?subject=unsubscribe'));
  });

  test('defaults the CTA to the site when none is passed', () => {
    const d = buildWelcomeEmail({});
    assert.ok(d.text.includes('https://wovely.app'));
  });
});

describe('welcome email gate', () => {
  test('defaults to OFF with no env var set', () => {
    assert.equal(welcomeEmailEnabled({}), false);
    assert.equal(welcomeEmailEnabled({ WELCOME_EMAIL_ENABLED: '' }), false);
    assert.equal(welcomeEmailEnabled({ WELCOME_EMAIL_ENABLED: '0' }), false);
    assert.equal(welcomeEmailEnabled({ WELCOME_EMAIL_ENABLED: 'false' }), false);
    assert.equal(welcomeEmailEnabled({ WELCOME_EMAIL_ENABLED: 'off' }), false);
    assert.equal(welcomeEmailEnabled({ WELCOME_EMAIL_ENABLED: 'maybe' }), false);
  });

  test('opens on the documented truthy values only', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' true ']) {
      assert.equal(welcomeEmailEnabled({ WELCOME_EMAIL_ENABLED: v }), true, `expected ${v} to enable`);
    }
  });
});

describe('unsubscribe signing', () => {
  const OLD = process.env.WEBHOOK_SECRET;
  // describe bodies run at collection time and tests run afterwards, so the
  // secret has to be set in a hook or it would be restored before any test ran.
  before(() => { process.env.WEBHOOK_SECRET = 'test-secret-for-unit-tests'; });
  after(() => {
    if (OLD === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = OLD;
  });

  test('token verifies for the right user and fails for another', () => {
    const t = unsubscribeToken('user-a');
    assert.equal(typeof t, 'string');
    assert.equal(t.length, 32);
    assert.equal(verifyUnsubscribeToken('user-a', t), true);
    assert.equal(verifyUnsubscribeToken('user-b', t), false);
  });

  test('a forged or empty token is rejected', () => {
    assert.equal(verifyUnsubscribeToken('user-a', ''), false);
    assert.equal(verifyUnsubscribeToken('user-a', 'x'.repeat(32)), false);
    assert.equal(verifyUnsubscribeToken('user-a', null), false);
  });

  test('url carries user and token', () => {
    const url = unsubscribeUrl('user-a');
    assert.ok(url.startsWith('https://wovely.app/api/email-prefs?u=user-a&t='));
  });

  test('headers give one-click plus a mailto fallback', () => {
    const h = unsubscribeHeaders('https://wovely.app/api/email-prefs?u=a&t=b');
    assert.equal(h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.ok(h['List-Unsubscribe'].includes('mailto:adam@wovely.app'));
  });

  test('no one-click header when there is no url to post to', () => {
    const h = unsubscribeHeaders(null);
    assert.equal(h['List-Unsubscribe-Post'], undefined);
    assert.ok(h['List-Unsubscribe'].includes('mailto:adam@wovely.app'));
  });
});

describe('sendMail refuses rather than sends', () => {
  test('returns an error with no api key, and makes no request', async () => {
    const OLD = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const r = await sendMail({ to: 'nobody@example.com', subject: 'x', text: 'y' });
    assert.equal(r.ok, false);
    assert.match(r.error, /RESEND_API_KEY missing/);
    if (OLD !== undefined) process.env.RESEND_API_KEY = OLD;
  });

  test('refuses a message with no recipient', async () => {
    const OLD = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'not-a-real-key';
    const r = await sendMail({ subject: 'x', text: 'y' });
    assert.equal(r.ok, false);
    assert.match(r.error, /to and subject are required/);
    if (OLD === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = OLD;
  });
});

describe('import failure alert throttle', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  test('fires on the next tick when no alert has ever been sent', () => {
    const d = alertDecision({ now, lastAlertAt: null });
    assert.equal(d.due, true);
    assert.equal(d.reason, 'no_previous_alert');
  });

  test('cold start never looks back further than the lookback cap', () => {
    const d = alertDecision({ now, lastAlertAt: null });
    assert.equal(now.getTime() - d.since.getTime(), ALERT_MAX_LOOKBACK_MS);
  });

  test('stays silent inside the window, however many jobs failed', () => {
    for (const minutesAgo of [0, 1, 5, 14]) {
      const last = new Date(now.getTime() - minutesAgo * 60000);
      assert.equal(alertDecision({ now, lastAlertAt: last }).due, false, `${minutesAgo}m ago should be throttled`);
    }
  });

  test('fires again once the window has elapsed', () => {
    const last = new Date(now.getTime() - (ALERT_WINDOW_MS + 1000));
    const d = alertDecision({ now, lastAlertAt: last });
    assert.equal(d.due, true);
    assert.equal(d.reason, 'window_elapsed');
  });

  test('the next digest covers everything since the previous alert', () => {
    const last = new Date(now.getTime() - 20 * 60000);
    const d = alertDecision({ now, lastAlertAt: last });
    assert.equal(d.since.getTime(), last.getTime());
  });

  test('a long quiet spell still respects the lookback cap', () => {
    const last = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const d = alertDecision({ now, lastAlertAt: last });
    assert.equal(now.getTime() - d.since.getTime(), ALERT_MAX_LOOKBACK_MS);
  });
});

describe('import failure alert content', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');
  const since = new Date('2026-09-08T11:45:00.000Z');
  const jobs = [
    {
      id: '083233a9-5242-4303-a63f-9fad3a484b3f',
      user_id: 'd6b18345-a85e-42bd-b7cb-f20efd4b2fe7',
      user_label: 'someone@example.com (d6b18345-a85e-42bd-b7cb-f20efd4b2fe7)',
      file_type: 'pdf',
      retry_count: 2,
      updated_at: '2026-09-08T11:52:00.000Z',
      error_message: 'PDF extraction failed: Gemini and Claude both failed. Last error: Claude timeout after 55s',
    },
  ];

  test('a single failure is named in the singular', () => {
    const { subject } = buildAlertEmail(jobs, { since, now });
    assert.equal(subject, 'Wovely: a pattern import failed');
  });

  test('a batch is counted in the subject', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...jobs[0], id: `job-${i}` }));
    const { subject } = buildAlertEmail(many, { since, now });
    assert.equal(subject, 'Wovely: 7 pattern imports failed');
  });

  test('the body is actionable: job id, user and the real error', () => {
    const { text } = buildAlertEmail(jobs, { since, now });
    assert.ok(text.includes('083233a9-5242-4303-a63f-9fad3a484b3f'), 'missing job id');
    assert.ok(text.includes('someone@example.com'), 'missing user');
    assert.ok(text.includes('Claude timeout after 55s'), 'missing the actual error');
    assert.ok(text.includes('pdf'), 'missing file type');
  });

  test('falls back to the uid when no email could be resolved', () => {
    const { text } = buildAlertEmail([{ ...jobs[0], user_label: null }], { since, now });
    assert.ok(text.includes('d6b18345-a85e-42bd-b7cb-f20efd4b2fe7'));
  });

  test('says so rather than leaving a blank when no error was recorded', () => {
    const { text } = buildAlertEmail([{ ...jobs[0], error_message: null }], { since, now });
    assert.ok(text.includes('(no error_message recorded)'));
  });

  test('a large burst lists a bounded number and says how many were omitted', () => {
    const many = Array.from({ length: 33 }, (_, i) => ({ ...jobs[0], id: `job-${i}` }));
    const { text } = buildAlertEmail(many, { since, now });
    assert.ok(text.includes('and 13 more not listed.'));
  });
});
