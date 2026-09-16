// api/stripe-webhook.js
// Handles Stripe webhook events for Wovely subscriptions (Craft).
// Requires Vercel env vars:
//   STRIPE_SECRET_KEY            — from Stripe dashboard
//   STRIPE_WEBHOOK_SECRET        — from Stripe webhook endpoint config
//   STRIPE_CRAFT_PRICE_ID        — recurring price for the $6.99/mo Craft tier;
//                                  matched to derive tier. The $54.99/yr annual
//                                  price (canon) resolves to Craft via fallback,
//                                  so the webhook doesn't need the annual price id.
//                                  Annual checkout reads STRIPE_CRAFT_ANNUAL_PRICE_ID
//                                  (see api/stripe-checkout.js) — this file never does.
//   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS so we can write tier on any row
//   VITE_SUPABASE_URL      — Supabase project URL
//
// Source of truth on the row is user_profiles.tier ('free' | 'pro' | 'craft').
// is_pro is kept synced (true for pro and craft) as a legacy mirror until
// every client has rolled to the tier-aware read path.

export const config = { api: { bodyParser: false } };

import Stripe from 'stripe';
import { celebrate } from './_celebrate.js';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CRAFT_PRICE_ID = process.env.STRIPE_CRAFT_PRICE_ID;
const CRAFT_ANNUAL_PRICE_ID = process.env.STRIPE_CRAFT_ANNUAL_PRICE_ID;

// ONE STRIPE ACCOUNT, MANY PRODUCTS. This endpoint receives every event on
// the account, including 2ndBrain care plans, workshops and retainers. On
// 2026-09-16 a $200 care-plan checkout with empty metadata was read as a
// Wovely Craft sale: the tier defaulted to craft, the office celebrated, and
// the admin mail said "Someone just paid for Wovely." Nothing here may act
// on an event it cannot prove is Wovely's. Proof, any one of:
//   - the session carries a Wovely user id (metadata.userId or
//     client_reference_id, which api/stripe-checkout.js always sets)
//   - metadata.app === 'wovely' (stamped by stripe-checkout.js from today)
//   - the price is a Wovely price (env ids) or its product is named Wovely
//   - user_profiles already holds this subscription id
function isWovelyPrice(price) {
  if (!price) return false;
  const id = typeof price === 'string' ? price : price.id;
  if (id && (id === CRAFT_PRICE_ID || id === CRAFT_ANNUAL_PRICE_ID)) return true;
  const name = typeof price === 'object' ? (price.product?.name || price.nickname || '') : '';
  return /wovely/i.test(name);
}

async function subscriptionIsWovely(subscriptionId) {
  if (!subscriptionId) return false;
  const { data } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

async function ignored(event, why, _t0) {
  console.log('[stripe-webhook] not a Wovely event, ignored:', event.type, why);
  const _url = process.env.VITE_SUPABASE_URL;
  const _key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (_url && _key) {
    await fetch(_url + '/rest/v1/vercel_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': _key, 'Authorization': 'Bearer ' + _key, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: 'POST /api/stripe-webhook -> 200 ' + event.type + ' ignored, not Wovely: ' + why + ' (' + (Date.now() - _t0) + 'ms)', source: 'serverless', request_path: '/api/stripe-webhook', request_method: 'POST', status_code: 200, project_id: 'wovely' })
    }).catch(() => {});
  }
}

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

// Admin notification via Resend. Never fatal — a failed email must never
// break the entitlement write or make Stripe retry the event.
async function notifyAdmin(subject, text) {
  if (!process.env.RESEND_API_KEY) { console.warn('[stripe-webhook] RESEND_API_KEY missing, notification skipped'); return; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Wovely App <support@wovely.app>', to: 'adam@wovely.app', subject, text }),
    });
    if (!r.ok) console.error('[stripe-webhook] Resend error:', r.status, await r.text());
  } catch (e) {
    console.error('[stripe-webhook] notifyAdmin failed:', e.message);
  }
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
    // client_reference_id is the fallback carrier set by api/stripe-checkout.js.
    // metadata has come back empty on this endpoint before, and a paid session
    // we cannot attach to an account is money taken with nothing delivered.
    const userId = session.metadata?.userId || session.client_reference_id || null;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    // The session's line_items isn't expanded by default; fetch the
    // subscription to get the price id we need to derive the tier from.
    let purchasedTier = session.metadata?.tier || 'craft';
    let price = null;
    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price.product'] });
        price = sub.items?.data?.[0]?.price || null;
        purchasedTier = tierFromPriceId(price?.id, session.metadata?.tier);
      } catch (e) {
        console.warn('[stripe-webhook] subscription retrieve failed, using metadata tier:', e.message);
      }
    }
    const ours = !!userId || session.metadata?.app === 'wovely' || isWovelyPrice(price);
    if (!ours) {
      await ignored(event, 'session ' + session.id + ' price ' + (price?.id || 'n/a') + ' product ' + (price?.product?.name || 'n/a'), _t0);
      return res.json({ received: true, ignored: true });
    }
    if (userId) {
      await setTierForUser(userId, purchasedTier, {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      });
      console.log(`[stripe-webhook] tier=${purchasedTier} activated for user:`, userId);
    } else {
      console.error('[stripe-webhook] PAID SESSION WITH NO USER ID — metadata.userId and client_reference_id both empty. Session:', session.id);
    }
    const buyerEmail = session.customer_details?.email || session.customer_email || 'unknown email';
    const amount = typeof session.amount_total === 'number' ? `$${(session.amount_total / 100).toFixed(2)}` : 'unknown amount';
    await notifyAdmin(
      `💸 Wovely purchase: ${buyerEmail} (${amount})`,
      `Someone just paid for Wovely.\n\nEmail: ${buyerEmail}\nAmount: ${amount}\nTier: ${purchasedTier}\nSubscription: ${subscriptionId || 'n/a'}\nUser ID: ${userId || 'MISSING — no metadata.userId and no client_reference_id, this payment is NOT attached to an account'}\nCheckout session: ${session.id}\n\n— Wovely`
    );
  }

  // 1b. The office hears it, on every Echo and in the announcer voice.
  //     Adam, 2026-09-15: "Same for paying customers. and my office set up of course."
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const cents = typeof session.amount_total === 'number' ? session.amount_total : null;
    const synthetic = !!session.livemode === false || /probe-[^@]*@wovely\.app$/i.test(String(session.customer_details?.email || session.customer_email || ''));
    await celebrate({ kind: 'sale', what: 'Wovely ' + (session.metadata?.tier || 'plan'), who: 'a new customer', amount: cents != null ? cents / 100 : undefined, id: 'cs:' + session.id, synthetic });
  }
  if (event.type === 'invoice.paid') {
    const inv = event.data.object;
    const first = inv.billing_reason === 'subscription_create';
    // The first invoice rides with checkout.session.completed above; a renewal is its own moment.
    const invPrice = inv.lines?.data?.[0]?.price || null;
    const invOurs = isWovelyPrice(invPrice) || await subscriptionIsWovely(inv.subscription);
    if (!first && !invOurs) {
      await ignored(event, 'invoice ' + inv.id + ' subscription ' + (inv.subscription || 'n/a'), _t0);
      return res.json({ received: true, ignored: true });
    }
    if (!first) {
      const cents = typeof inv.amount_paid === 'number' ? inv.amount_paid : null;
      await celebrate({ kind: 'sale', what: 'Wovely renewal', who: 'a returning customer', amount: cents != null ? cents / 100 : undefined, id: 'in:' + inv.id, synthetic: !!inv.livemode === false });
    }
  }

  // 2. Plan change (Pro ↔ Craft) — update tier from the new price.
  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    // Only relevant when the subscription is still active. cancel_at_period_end
    // doesn't change tier; the actual deletion event will.
    if ((subscription.status === 'active' || subscription.status === 'trialing') && !(await subscriptionIsWovely(subscription.id))) {
      await ignored(event, 'subscription ' + subscription.id + ' not on any user_profiles row', _t0);
      return res.json({ received: true, ignored: true });
    }
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      const newTier = tierFromPriceId(priceId, null);
      await setTierBySubscription(subscription.id, newTier);
      console.log(`[stripe-webhook] subscription ${subscription.id} updated → tier=${newTier}`);
    }
  }

  // 3. Cancellation — back to free.
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    if (!(await subscriptionIsWovely(subscription.id))) {
      await ignored(event, 'subscription ' + subscription.id + ' not on any user_profiles row', _t0);
      return res.json({ received: true, ignored: true });
    }
    await setTierBySubscription(subscription.id, 'free');
    console.log('[stripe-webhook] tier=free (cancelled) for subscription:', subscription.id);
    await notifyAdmin(
      `📉 Wovely subscription cancelled: ${subscription.id}`,
      `A Wovely subscription ended and the account dropped to free.\n\nSubscription: ${subscription.id}\nCustomer: ${subscription.customer}\n\n— Wovely`
    );
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
