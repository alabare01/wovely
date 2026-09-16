// probe-webhook-ownership.mjs
// One Stripe account carries Wovely, 2ndBrain care plans, workshops and
// retainers, and api/stripe-webhook.js receives all of it. This probe proves
// the handler claims only what it can prove is Wovely's. It runs the handler
// in-process with signed synthetic events (livemode false, no mail, no
// celebration, no row written) and fails loudly on any wrong claim.
//   cd ~/wovely; node scripts/probe-webhook-ownership.mjs
// Exit 0 = PROBE_OK. Exit 1 = a foreign event was claimed or ours was dropped.
import fs from 'fs';
import Stripe from 'stripe';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v;
delete process.env.RESEND_API_KEY;          // the probe never mails
const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secret) { console.error('PROBE_FAIL no STRIPE_WEBHOOK_SECRET'); process.exit(1); }

const { default: handler } = await import('../api/stripe-webhook.js');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function fire(type, object) {
  const payload = JSON.stringify({ id: 'evt_probe_' + Date.now(), object: 'event', type, livemode: false, data: { object } });
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const chunks = [Buffer.from(payload)];
  const req = { method: 'POST', headers: { 'stripe-signature': sig }, on(ev, cb) { if (ev === 'data') chunks.forEach(cb); if (ev === 'end') setImmediate(cb); } };
  let status = 200, body = null;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; }, end() { return this; } };
  await handler(req, res);
  return { status, body };
}

const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail }); console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); }

// A. The Sea Pine care plan of 2026-09-16: empty metadata, no client_reference_id,
//    a real subscription on a non-Wovely price. Must be ignored.
const care = await fire('checkout.session.completed', {
  id: 'cs_probe_care', object: 'checkout.session', livemode: false, mode: 'subscription', metadata: {}, client_reference_id: null,
  customer: 'cus_probe', subscription: 'sub_1UGMViE7r5ExERfEPxIcqx7F', amount_total: 20000, customer_details: { email: 'probe-care@example.com' },
});
check('care plan checkout ignored', care.status === 200 && care.body?.ignored === true, JSON.stringify(care.body));

// B. A Wovely session: userId and app stamped, no subscription to retrieve.
//    Must be claimed (no ignored flag). The uuid matches no row, so nothing is written.
const ours = await fire('checkout.session.completed', {
  id: 'cs_probe_wovely', object: 'checkout.session', livemode: false, mode: 'subscription',
  metadata: { userId: '00000000-0000-4000-8000-000000000000', tier: 'craft', cadence: 'monthly', app: 'wovely' }, client_reference_id: '00000000-0000-4000-8000-000000000000',
  customer: 'cus_probe', subscription: null, amount_total: 699, customer_details: { email: 'probe-webhook@wovely.app' },
});
check('wovely checkout claimed', ours.status === 200 && ours.body?.received === true && !ours.body?.ignored, JSON.stringify(ours.body));

// C. A foreign subscription cancelled: no user_profiles row holds it. Must be ignored, no mail.
const del = await fire('customer.subscription.deleted', { id: 'sub_probe_foreign', object: 'subscription', livemode: false, customer: 'cus_probe', status: 'canceled', items: { data: [] } });
check('foreign cancellation ignored', del.status === 200 && del.body?.ignored === true, JSON.stringify(del.body));

// D. A foreign renewal invoice: not first, not a Wovely price, not held. Must be ignored.
const inv = await fire('invoice.paid', { id: 'in_probe_foreign', object: 'invoice', livemode: false, billing_reason: 'subscription_cycle', subscription: 'sub_probe_foreign', amount_paid: 20000, lines: { data: [{ price: { id: 'price_1U1Si0E7r5ExERfEul9WgOep', product: 'prod_V1Vi0tbDvenigs' } }] } });
check('foreign renewal ignored', inv.status === 200 && inv.body?.ignored === true, JSON.stringify(inv.body));

const bad = results.filter(r => !r.ok);
if (bad.length) { console.log('PROBE_FAIL', bad.map(b => b.name).join('; ')); process.exit(1); }
console.log('PROBE_OK webhook claims only Wovely events');
