# Stripe setup — three-tier pricing

Steps for Adam. **Do not skip the env-var step or paid checkout will fail loudly with "Checkout for X is not configured yet."**

## 1. Stripe Dashboard

Stripe account: `acct_1TDQ1WGbX5hxxc0T` (LIVE).

### Edit the existing Pro product

1. Products → find the existing "Wovely Pro" product.
2. Rename to **Wovely Pro** (if not already).
3. Description: "Unlimited patterns, big-pattern support, BevCheck quality scoring."
4. Add a new recurring price: **$4.99 USD / month**. Currency USD, billing period monthly.
5. Archive the old $8.99 price on this product so legacy clients can't accidentally pick it up. (Don't delete — historical invoices still need the reference.)
6. Copy the new price ID. Format: `price_XXXXXXXXXXXX`.

### Create the Craft product

1. Products → New product.
2. Name: **Wovely Craft**.
3. Description: "Everything in Pro, plus Collections for pattern books and MKALs."
4. Recurring price: **$8.99 USD / month**.
5. Copy this price ID.

## 2. Vercel env vars

Project → Settings → Environment Variables. Add **for Production and Preview**:

| Key | Value |
|---|---|
| `STRIPE_PRO_PRICE_ID` | the $4.99 Pro price ID from step 1 |
| `STRIPE_CRAFT_PRICE_ID` | the $8.99 Craft price ID from step 1 |

The existing `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` stay as they are.

## 3. Redeploy

Env var changes require a fresh deployment to pick up. Either:
- Push any commit to `main` (Vercel auto-redeploys), or
- Vercel Dashboard → Deployments → … → Redeploy.

## 4. Smoke test

After the redeploy goes READY:
1. Sign in as a Free user.
2. Click any upgrade entry point → the three-tier modal opens.
3. Click "Upgrade to Pro". Stripe Checkout should redirect to a $4.99/mo session.
4. Cancel out of checkout.
5. Click "Upgrade to Craft". Should redirect to a $8.99/mo session.

If either CTA shows the "Checkout for X is not configured yet" toast, the corresponding env var is missing on that environment. Re-check step 2.

## 5. Webhook events

The existing `STRIPE_WEBHOOK_SECRET` is already wired. The webhook handler now routes by price ID:

- `checkout.session.completed` → fetches the subscription, maps `price_id` to `pro` or `craft`, writes `user_profiles.tier` plus `is_pro=true` (legacy mirror).
- `customer.subscription.updated` → handles plan changes (Pro ↔ Craft) when the user's price changes. Updates tier accordingly.
- `customer.subscription.deleted` → sets `tier='free'`, clears `stripe_subscription_id`.

No new webhook endpoints to configure. Existing webhook URL still works.

## 6. Customer-facing migration note

Pre-launch state:
- `user_profiles.tier` column added by migration 008 (already applied to production Supabase).
- All existing `is_pro=true` accounts were backfilled to `tier='craft'` (they were testers — top tier as thanks).
- All other accounts default to `tier='free'`.
- Zero paying Stripe subscribers exist, so there's no real-money cohort to migrate.

If a tester decides they actually want Pro instead of Craft, manually flip `user_profiles.tier` to `'pro'` via Supabase SQL editor:

```sql
UPDATE user_profiles SET tier = 'pro' WHERE id = '<their_uid>';
```

The `is_pro` mirror column will be updated next time their Stripe subscription event hits the webhook; until then it stays at its existing value (probably `true` from the initial backfill).
