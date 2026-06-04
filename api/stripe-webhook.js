// api/stripe-webhook.js
// Handles Stripe webhook events for Wovely subscriptions (Craft).
// Requires Vercel env vars:
//   STRIPE_SECRET_KEY            — from Stripe dashboard
//   STRIPE_WEBHOOK_SECRET        — from Stripe webhook endpoint config
//   STRIPE_CRAFT_PRICE_ID        — recurring price for the $6.99/mo Craft tier;
//                                  matched to derive tier. The $59.99/yr annual
//                                  price resolves to Craft via fallback, so the
//                                  webhook doesn't need the annual price id.
//   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS so we can write tier on any row
//   VITE_SUPABASE_URL      — Supabase project URL
//
// Source of truth on the row is user_profiles.tier ('free' | 'pro' | 'craft').
// is_pro is kept synced (true for pro and craft) as a legacy mirror until
// every client has rolled to the tier-aware read path.

export const config = { api: { bodyParser: false } };

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CRAFT_PRICE_ID = process.env.STRIPE_CRAFT_PRICE_ID;

// Map a Stripe price_id back to a Wovely tier string. Craft is the only paid
// tier now, so any paid subscription event on this account resolves to craft.
// Falls back to 'craft' when nothing matches — better to give a paying user a
// paid tier than to leave them on free while we figure out an env var mismatch.
function tierFromPriceId(priceId, fallbackMeta) {
  if (priceId && CRAFT_PRICE_ID && priceId === CRAFT_PRICE_ID) return 'craft';
  if (fallbackMeta === 'craft') return fallbackMeta;
  return 'craft';
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function setTierForUser(userId, tier, extra = {}) {
  const isPro = tier === 'pro' || tier === 'craft';
  const { error } = await supabase
    .from('user_profiles')
    .update({ tier, is_pro: isPro, ...extra })
    .eq('id', userId);
  if (error) console.error('[stripe-webhook] tier update failed:', error.message);
  return !error;
}

async function setTierBySubscription(subscriptionId, tier) {
  const isPro = tier === 'pro' || tier === 'craft';
  const update = { tier, is_pro: isPro };
  // 'free' = cancelled subscription, so clear the subscription id too.
  if (tier === 'free') update.stripe_subscription_id = null;
  const { error } = await supabase
    .from('user_profiles')
    .update(update)
    .eq('stripe_subscription_id', subscriptionId);
  if (error) console.error('[stripe-webhook] tier-by-subscription update failed:', error.message);
  return !error;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const _url = process.env.VITE_SUPABASE_URL;
  const _key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const _t0 = Date.now();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature error:', err.message);
    return res.status(400).json({ error: err.message });
  }

  console.log('[stripe-webhook] Event:', event.type);

  // 1. New subscription — set tier from the purchased price.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    // The session's line_items isn't expanded by default; fetch the
    // subscription to get the price id we need to derive the tier from.
    let purchasedTier = session.metadata?.tier || 'craft';
    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items?.data?.[0]?.price?.id;
        purchasedTier = tierFromPriceId(priceId, session.metadata?.tier);
      } catch (e) {
        console.warn('[stripe-webhook] subscription retrieve failed, using metadata tier:', e.message);
      }
    }
    if (userId) {
      await setTierForUser(userId, purchasedTier, {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      });
      console.log(`[stripe-webhook] tier=${purchasedTier} activated for user:`, userId);
    } else {
      console.warn('[stripe-webhook] checkout.session.completed missing metadata.userId');
    }
  }

  // 2. Plan change (Pro ↔ Craft) — update tier from the new price.
  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    // Only relevant when the subscription is still active. cancel_at_period_end
    // doesn't change tier; the actual deletion event will.
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      const newTier = tierFromPriceId(priceId, null);
      await setTierBySubscription(subscription.id, newTier);
      console.log(`[stripe-webhook] subscription ${subscription.id} updated → tier=${newTier}`);
    }
  }

  // 3. Cancellation — back to free.
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    await setTierBySubscription(subscription.id, 'free');
    console.log('[stripe-webhook] tier=free (cancelled) for subscription:', subscription.id);
  }

  if (_url && _key) {
    await fetch(`${_url}/rest/v1/vercel_logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': `Bearer ${_key}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: `POST /api/stripe-webhook → 200 ${event.type} (${Date.now() - _t0}ms)`, source: 'serverless', request_path: '/api/stripe-webhook', request_method: 'POST', status_code: 200, project_id: 'wovely' })
    }).catch(() => {});
  }
  res.json({ received: true });
}
