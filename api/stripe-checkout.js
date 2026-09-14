// api/stripe-checkout.js
// Creates a Stripe Checkout session for the Wovely paid tier (craft).
//
// Env vars (required for the tier-aware flow):
//   STRIPE_SECRET_KEY            — Stripe API key
//   STRIPE_CRAFT_PRICE_ID        — recurring price for the $6.99/mo Craft tier
//   STRIPE_CRAFT_ANNUAL_PRICE_ID — recurring price for the $54.99/yr Craft tier (canon)
//
// If a tier's price ID isn't configured we 500 with a clear message
// rather than silently creating an ad-hoc line item — tier shipping
// without the corresponding Stripe price would be hard to reconcile
// later.

import Stripe from 'stripe';
import { recordPulse, isSyntheticRequest } from './_monitor.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_ENV = {
  craft: {
    monthly: 'STRIPE_CRAFT_PRICE_ID',
    annual:  'STRIPE_CRAFT_ANNUAL_PRICE_ID',
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const _url = process.env.VITE_SUPABASE_URL;
  const _key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const _t0 = Date.now();

  const { userId, email, tier: rawTier, cadence: rawCadence } = req.body || {};

  // Every failure response carries BOTH a machine-readable `error` code and a
  // `message` the client is allowed to show a customer verbatim. Raw Stripe
  // exception text never goes in `message` — it lands in the logs instead.
  // The client falls back to its own generic copy if `message` is ever absent,
  // so no failure can reach a user as silence.
  const fail = (status, code, message) => res.status(status).json({ error: code, message });

  if (!userId || !email) {
    return fail(400, 'missing_identity', 'We could not confirm your account, so checkout did not open. Nothing has been charged. Sign out, sign back in, and try again.');
  }

  // Craft is the only purchasable tier now. Reject any explicit tier param
  // that isn't 'craft'; otherwise default to 'craft' unconditionally.
  if (rawTier != null && rawTier !== 'craft') {
    console.error(`[stripe-checkout] Rejected unknown tier "${rawTier}"`);
    return fail(400, 'unknown_tier', 'That plan is not available. Close this and open the plans list again to pick Wovely Craft.');
  }
  const tier = 'craft';

  // Billing cadence selects which Stripe price we charge. Defaults to monthly
  // for any client that hasn't sent the field yet; reject anything else.
  if (rawCadence != null && rawCadence !== 'monthly' && rawCadence !== 'annual') {
    console.error(`[stripe-checkout] Rejected unknown cadence "${rawCadence}"`);
    return fail(400, 'unknown_cadence', 'That billing option is not available. Open the plans list again and choose monthly or yearly.');
  }
  const cadence = rawCadence || 'monthly';
  const priceEnvKey = PRICE_ENV[tier][cadence];
  const priceId = process.env[priceEnvKey];

  if (!priceId) {
    console.error(`[stripe-checkout] Missing env var ${priceEnvKey} for tier=${tier}`);
    return fail(500, 'price_not_configured', 'Checkout is not set up on our side yet, so nothing has been charged. Email support@wovely.app and we will get you subscribed by hand.');
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      // Grand opening, 2026-09-15 to 2026-11-30: the code COZY (50 percent
      // off Craft for three months) only works if Checkout shows the field.
      // Harmless outside the window: Stripe rejects an expired or unknown
      // code on its own page and the price is unchanged.
      allow_promotion_codes: true,
      metadata: { userId, tier, cadence },
      // Second carrier for the same id. metadata is the primary channel, but
      // the webhook has already logged "missing metadata.userId" in the wild,
      // and a payment we cannot attach to an account is the worst outcome on
      // this path. client_reference_id survives independently of metadata.
      client_reference_id: userId,
      success_url: `https://wovely.app?upgrade=success&tier=${tier}&cadence=${cadence}`,
      cancel_url: 'https://wovely.app?upgrade=cancelled',
    });

    // A 200 with no url would send the client to the string "undefined".
    // Treat it as the failure it is, and check BEFORE the success log so the
    // log never claims a 200 we did not send.
    if (!session?.url) {
      console.error('[stripe-checkout] Stripe returned a session with no url:', session?.id);
      return fail(502, 'no_session_url', 'Stripe did not return a checkout page. Nothing has been charged. Try again in a moment, or email support@wovely.app.');
    }
    if (_url && _key) {
      await fetch(`${_url}/rest/v1/vercel_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: `POST /api/stripe-checkout tier=${tier} cadence=${cadence} → 200 (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/stripe-checkout', request_method: 'POST', status_code: 200, project_id: 'wovely', user_id: userId })
      }).catch(() => {});
    }
    // The closest thing this business has to a revenue event. Recorded from
    // the server that created the session, so a person who bounces off the
    // Stripe page still counts as having got that far.
    await recordPulse({
      supabaseUrl: _url,
      serviceKey: _key,
      // checkout_started is the loudest interrupt this system has: priority 1
      // in the subject line and high priority through Do Not Disturb. This
      // endpoint is public, so a marked probe of it must not page Adam either.
      // Unmarked is a real person, always.
      synthetic: isSyntheticRequest(req.headers),
      events: [{
        kind: 'checkout_started',
        path: '/checkout',
        ref: null,
        sid: null,
        uid: userId,
        meta: { tier, cadence },
        at: new Date().toISOString(),
      }],
    });

    res.json({ url: session.url, tier });
  } catch (err) {
    console.error('[stripe-checkout] Error:', err.message);
    if (_url && _key) {
      await fetch(`${_url}/rest/v1/vercel_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: `[stripe-checkout] tier=${tier} error: ${err.message} (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/stripe-checkout', request_method: 'POST', status_code: 500, project_id: 'wovely', user_id: userId })
      }).catch(() => {});
    }
    // err.message is Stripe's internal text ("No such price: ..."). It goes to
    // the logs above, never to the customer.
    return fail(500, 'stripe_error', 'Stripe could not open a checkout page just now. Nothing has been charged. Try again in a moment, or email support@wovely.app and we will sort it out.');
  }
}
