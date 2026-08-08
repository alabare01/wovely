// Single entry point for every Stripe checkout call in the app.
//
// It exists because three separate call sites used to hand-roll the same fetch
// and all three swallowed their failures into console.error: the plans modal
// only cleared its spinner, the post-signup auto-checkout discarded its return
// value, and the legacy upgrade-intent replay had a bare catch. A customer
// whose checkout died saw an unchanged page and concluded the button was
// broken. Nothing told them, and nothing told us.
//
// The contract is deliberately total: this function always resolves, never
// throws, and always returns either { ok:true, url } or { ok:false, code,
// message } where `message` is copy we are willing to show a paying customer
// verbatim. A caller cannot accidentally end up with nothing to display.

export const CHECKOUT_SUPPORT_EMAIL = "support@wovely.app";

export const CHECKOUT_GENERIC_MSG =
  `We could not open the checkout page, so nothing has been charged. Try again, or email ${CHECKOUT_SUPPORT_EMAIL} and we will get you subscribed by hand.`;

export const CHECKOUT_NO_SESSION_MSG =
  "We could not confirm your account, so checkout did not open. Nothing has been charged. Try again in a moment, or sign out and back in.";

export const CHECKOUT_NETWORK_MSG =
  "We could not reach the checkout server, so nothing has been charged. Check your connection and try again.";

export const CHECKOUT_STALLED_MSG =
  "Checkout did not open on its own. Nothing has been charged yet. Use the link below to finish subscribing.";

// How long to wait after assigning window.location.href before deciding the
// redirect never took. If it did take, the page is already gone and the timer
// never fires.
export const CHECKOUT_REDIRECT_WATCHDOG_MS = 6000;

export async function requestCheckoutSession({ userId, email, tier, cadence }, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!userId || !email) {
    return { ok: false, code: "no_session", message: CHECKOUT_NO_SESSION_MSG };
  }
  if (!doFetch) {
    return { ok: false, code: "no_fetch", message: CHECKOUT_GENERIC_MSG };
  }
  let res;
  try {
    res = await doFetch("/api/stripe-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, email, tier: tier || "craft", cadence: cadence || "monthly" }),
    });
  } catch (err) {
    console.error("[Wovely] Checkout request failed to send:", err);
    return { ok: false, code: "network", message: CHECKOUT_NETWORK_MSG };
  }
  // A gateway timeout returns HTML, not JSON. Never let the parse throw.
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    console.error("[Wovely] Checkout error:", res.status, data);
    return {
      ok: false,
      code: data?.error || `http_${res.status}`,
      // Prefer the server's customer-safe `message`. Raw Stripe exception text
      // arrives under `error` and must never be shown, so anything without a
      // `message` falls back to our own copy.
      message: typeof data?.message === "string" && data.message ? data.message : CHECKOUT_GENERIC_MSG,
    };
  }
  // A 200 with no url used to send the browser to the literal string
  // "undefined". Treat it as the failure it is.
  if (!data?.url) {
    console.error("[Wovely] Checkout returned 200 with no url:", data);
    return { ok: false, code: "no_url", message: CHECKOUT_GENERIC_MSG };
  }
  return { ok: true, url: data.url };
}
