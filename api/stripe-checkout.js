// api/stripe-checkout.js
// Creates a Stripe Checkout session for the Wovely paid tier (craft).
//
// Env vars (required for the tier-aware flow):
//   STRIPE_SECRET_KEY            — Stripe API key
//   STRIPE_CRAFT_PRICE_ID        — recurring price for the $6.99/mo Craft tier
//   STRIPE_CRAFT_ANNUAL_PRICE_ID — recurring price for the $59.99/yr Craft tier
//
// If a tier's price ID isn't configured we 500 with a clear message
// rather than silently creating an ad-hoc line item — tier shipping
// without the corresponding Stripe price would be hard to reconcile
// later.

import Stripe from 'stripe';

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
  if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' });

  // Craft is the only purchasable tier now. Reject any explicit tier param
  // that isn't 'craft'; otherwise default to 'craft' unconditionally.
  if (rawTier != null && rawTier !== 'craft') {
    return res.status(400).json({ error: `Unknown tier "${rawTier}". The only purchasable tier is "craft".` });
  }
  const tier = 'craft';

  // Billing cadence selects which Stripe price we charge. Defaults to monthly
  // for any client that hasn't sent the field yet; reject anything else.
  if (rawCadence != null && rawCadence !== 'monthly' && rawCadence !== 'annual') {
    return res.status(400).json({ error: `Unknown cadence "${rawCadence}". Use "monthly" or "annual".` });
  }
  const cadence = rawCadence || 'monthly';
  const priceEnvKey = PRICE_ENV[tier][cadence];
  const priceId = process.env[priceEnvKey];

  if (!priceId) {
    console.error(`[stripe-checkout] Missing env var ${priceEnvKey} for tier=${tier}`);
    return res.status(500).json({ error: `Checkout for ${tier} is not configured yet. Try again in a moment, or contact support.` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, tier, cadence },
      success_url: `https://wovely.app?upgrade=success&tier=${tier}&cadence=${cadence}`,
      cancel_url: 'https://wovely.app?upgrade=cancelled',
    });

    if (_url && _key) {
      await fetch(`${_url}/rest/v1/vercel_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: `POST /api/stripe-checkout tier=${tier} cadence=${cadence} → 200 (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/stripe-checkout', request_method: 'POST', status_code: 200, project_id: 'wovely', user_id: userId })
      }).catch(() => {});
    }
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
    res.status(500).json({ error: err.message });
  }
}
