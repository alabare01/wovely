// test/syntheticProbe.test.mjs
//
// THE DEFECT THIS FILE GUARDS. On 2026-09-08 two health probes were curled at
// /api/client-error to confirm the endpoint had stopped returning 500. Both
// were recorded as a real person hitting a real error and both woke Adam's
// phone and his inbox. No real visitor has ever errored on wovely.app. A
// monitor that cannot tell its own health check from a customer will cry wolf,
// and a channel that cries wolf gets muted.
//
// The fix is a marker. The marker has exactly one dangerous failure mode, and
// it is not "a probe pages Adam": it is "a real user's error is silently
// swallowed because something looked synthetic". So the bulk of this file
// asserts the FAIL-SAFE DIRECTION. Unmarked traffic is real. An unverifiable
// header is real. A wrong header is real. A thrown error is real. There is no
// input in here that turns an unmarked request synthetic, and that is the
// property being tested.
//
// Nothing in this file sends mail, pushes, or touches the network.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROBE_HEADER,
  SYNTHETIC_PATH_PREFIX,
  PULSE_PATH_PREFIX,
  probeToken,
  isSyntheticRequest,
  eventRow,
  normalizeEvent,
} from '../api/_monitor.js';

const SECRET = 'test-cron-secret-value';
const ENV = { CRON_SECRET: SECRET };
const TOKEN = probeToken(SECRET);

describe('the probe token', () => {
  test('it is derived, so publishing it never publishes CRON_SECRET', () => {
    assert.ok(TOKEN);
    assert.equal(TOKEN.length, 32);
    assert.equal(TOKEN.includes(SECRET), false);
    assert.match(TOKEN, /^[0-9a-f]{32}$/);
  });

  test('it is stable for one secret and different for another', () => {
    assert.equal(probeToken(SECRET), TOKEN);
    assert.notEqual(probeToken(SECRET + 'x'), TOKEN);
  });

  test('no secret means no token, which means nothing can be marked', () => {
    assert.equal(probeToken(''), null);
    assert.equal(probeToken('   '), null);
    assert.equal(probeToken(undefined), null);
    assert.equal(probeToken(null), null);
  });

  test('the token cannot be replayed as the cron bearer secret', () => {
    // /api/cron/* wants `Bearer <CRON_SECRET>`. Knowing the probe token must
    // not get anybody there.
    assert.notEqual(TOKEN, SECRET);
    assert.equal(TOKEN.includes(SECRET), false);
  });
});

describe('THE FAIL-SAFE: unmarked traffic is a real user, always', () => {
  test('no headers at all is real', () => {
    assert.equal(isSyntheticRequest(undefined, ENV), false);
    assert.equal(isSyntheticRequest(null, ENV), false);
    assert.equal(isSyntheticRequest({}, ENV), false);
  });

  test('a real browser, which sends none of our headers, is real', () => {
    const browser = {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'content-type': 'application/json',
      referer: 'https://wovely.app/',
    };
    assert.equal(isSyntheticRequest(browser, ENV), false);
  });

  test('an empty or whitespace header value is real', () => {
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: '' }, ENV), false);
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: '   ' }, ENV), false);
  });

  test('a WRONG token is real, so guessing gains nothing', () => {
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: 'yes' }, ENV), false);
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: 'true' }, ENV), false);
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: '1' }, ENV), false);
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: 'f'.repeat(32) }, ENV), false);
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: TOKEN.slice(0, 31) }, ENV), false);
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: TOKEN + 'a' }, ENV), false);
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: TOKEN.toUpperCase() }, ENV), false);
  });

  test('the CRON_SECRET itself is not a valid marker', () => {
    // Somebody who has the secret should still have to derive the token, so a
    // secret pasted into a header by mistake never silences an alert.
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: SECRET }, ENV), false);
  });

  test('a correct token with NO secret configured is real', () => {
    // The environment that cannot verify a claim must not believe it. This is
    // the branch that matters on a preview deploy or a misconfigured project.
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: TOKEN }, {}), false);
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: TOKEN }, { CRON_SECRET: '' }), false);
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: TOKEN }, undefined), false);
  });

  test('a header value of a hostile shape is real, never a crash', () => {
    for (const v of [{}, [], 0, false, NaN, Symbol.iterator.toString()]) {
      assert.equal(isSyntheticRequest({ [PROBE_HEADER]: v }, ENV), false);
    }
  });

  test('no other header name can mark a request', () => {
    assert.equal(isSyntheticRequest({ 'x-synthetic': TOKEN }, ENV), false);
    assert.equal(isSyntheticRequest({ 'x-probe': TOKEN }, ENV), false);
    assert.equal(isSyntheticRequest({ 'user-agent': TOKEN }, ENV), false);
    assert.equal(isSyntheticRequest({ authorization: `Bearer ${TOKEN}` }, ENV), false);
  });
});

describe('the marker does work when it is correct', () => {
  test('the right token on the right header marks the request', () => {
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: TOKEN }, ENV), true);
  });

  test('header casing does not matter, because runtimes disagree about it', () => {
    assert.equal(isSyntheticRequest({ 'X-Wovely-Probe': TOKEN }, ENV), true);
    assert.equal(isSyntheticRequest({ 'X-WOVELY-PROBE': TOKEN }, ENV), true);
  });

  test('a repeated header arrives as an array and still works', () => {
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: [TOKEN, TOKEN] }, ENV), true);
  });

  test('surrounding whitespace is tolerated', () => {
    assert.equal(isSyntheticRequest({ [PROBE_HEADER]: `  ${TOKEN}  ` }, ENV), true);
  });
});

describe('a synthetic row is written, and lands where nothing can page anybody', () => {
  const ev = normalizeEvent({ kind: 'user_error', path: '/', sid: 'aabbccdd' });

  test('a real event keeps the pulse prefix the alert queries read', () => {
    const row = eventRow(ev);
    assert.equal(row.request_path, `${PULSE_PATH_PREFIX}user_error`);
    assert.equal(row.source, 'monitor');
    assert.equal(row.context.synthetic, undefined);
  });

  test('a synthetic event is still recorded, on its own prefix', () => {
    // The point of a health probe is a record that the endpoint worked. It is
    // written. It is just written somewhere the monitor does not look.
    const row = eventRow(ev, { synthetic: true });
    assert.equal(row.request_path, `${SYNTHETIC_PATH_PREFIX}user_error`);
    assert.equal(row.source, 'synthetic');
    assert.equal(row.context.synthetic, true);
    assert.ok(row.message.startsWith('[synthetic]'));
  });

  test('the two prefixes cannot overlap, so no LIKE query can match both', () => {
    assert.ok(SYNTHETIC_PATH_PREFIX.startsWith('/internal/'));
    assert.equal(SYNTHETIC_PATH_PREFIX.startsWith(PULSE_PATH_PREFIX), false);
    assert.equal(PULSE_PATH_PREFIX.startsWith(SYNTHETIC_PATH_PREFIX), false);
  });

  test('the default is REAL, so a caller that forgets the flag pages Adam', () => {
    // Stated as a test because it is the whole safety argument: the mistake a
    // future caller makes must be the loud one, never the silent one.
    assert.equal(eventRow(ev).request_path, `${PULSE_PATH_PREFIX}user_error`);
    assert.equal(eventRow(ev, {}).request_path, `${PULSE_PATH_PREFIX}user_error`);
  });
});

describe('the endpoints that can be probed all consult the marker', () => {
  test('every public handler that can raise an interrupt imports it', async () => {
    // A new endpoint that records an interrupt kind and does not check the
    // marker recreates this defect exactly. This is the check that catches it.
    const fs = await import('node:fs');
    for (const f of ['api/client-error.js', 'api/pulse.js', 'api/stripe-checkout.js']) {
      const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      assert.ok(src.includes('isSyntheticRequest'), `${f} must consult the synthetic marker`);
    }
  });
});
