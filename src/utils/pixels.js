// ─── AD PLATFORM PIXELS, MIRRORED FROM POSTHOG ───────────────────────────────
//
// PostHog is the one place Wovely decides what an event is. This module does
// not add a second set of capture calls scattered through the app; it listens
// to PostHog's own event stream and mirrors a short, named list to the ad
// platforms, so a new capture call can never drift out of step with the pixel.
//
//   $pageview                                  -> Meta PageView (SPA routes included)
//   email_captured                             -> Meta Lead
//   user_signed_up                             -> Meta CompleteRegistration
//   upgrade_entitlement_check with paid: true  -> Meta Purchase
//
// Purchase keys on the entitlement check, never on upgrade_completed: that one
// fires off the ?upgrade=success redirect param alone, so anyone can load it.
// The entitlement check reports what the database says after Stripe's webhook.
//
// Privacy, matching the promise the tool pages make (see analytics.js):
//   - autoConfig is OFF, so the pixel does not scrape buttons or page content,
//     and advanced matching is never turned on, so no form value is hashed and sent.
//   - Nothing loads inside the native shell, on localhost, or for automation
//     (navigator.webdriver), so the desks' own Playwright visits never enter an
//     ad audience.
//
// Dataset "Wovely" 1094637423151254, business portfolio "2ndbrain"
// 1323654684161849, created 2026-09-23 by SAMM on Adam's authority. It is a
// separate dataset from 2ndBrain's on purpose: audiences must not mix.

export const PIXELS = {
  meta: "1094637423151254",
  ga4: "",
  google: "AW-18410615088",
};

export const META_MAP = {
  $pageview: () => ["PageView"],
  email_captured: () => ["Lead"],
  user_signed_up: () => ["CompleteRegistration"],
  upgrade_entitlement_check: (props) =>
    props && props.paid === true ? ["Purchase", { currency: "USD", content_name: String(props.tier || "paid") }] : null,
};

export const shouldLoad = (env) => {
  if (!env || !env.window) return false;
  const { window: w } = env;
  if (env.native) return false;
  if (w.navigator && w.navigator.webdriver === true) return false;
  const host = (w.location && w.location.hostname) || "";
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")) return false;
  return true;
};

// Returns [eventName, params] for Meta, or null when the event is not mirrored.
export const metaEventFor = (event, props) => {
  const f = META_MAP[event];
  return f ? f(props || {}) : null;
};

const loadGoogle = (w, gids) => {
  w.dataLayer = w.dataLayer || [];
  w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
  w.gtag("js", new Date());
  for (const id of gids) w.gtag("config", id);
  const s = w.document.createElement("script");
  s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gids[0]);
  (w.document.head || w.document.getElementsByTagName("head")[0]).appendChild(s);
};

const loadMeta = (w, id) => {
  if (w.fbq) return;
  const n = (w.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  });
  w._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
  const s = w.document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  (w.document.head || w.document.getElementsByTagName("head")[0]).appendChild(s);
  w.fbq("set", "autoConfig", false, id);
  w.fbq("init", id);
};

export const startPixels = (posthog, { native = false } = {}) => {
  try {
    if (typeof window === "undefined" || !shouldLoad({ window, native })) return;
    const gids = [PIXELS.google, PIXELS.ga4].filter(Boolean);
    if (gids.length) loadGoogle(window, gids);
    if (PIXELS.meta) loadMeta(window, PIXELS.meta);
    posthog.on("eventCaptured", (e) => {
      try {
        const m = e && metaEventFor(e.event, e.properties);
        if (m && window.fbq) window.fbq("track", m[0], m[1] || {});
        if (m && window.gtag && PIXELS.google) {
          const cat = e.event === "upgrade_entitlement_check" ? "purchase" : (e.event === "email_captured" || e.event === "user_signed_up" ? "lead" : null);
          if (cat) window.gtag("event", "conversion", { send_to: PIXELS.google, event_category: cat });
        }
      } catch { /* a pixel must never break the app */ }
    });
  } catch { /* a pixel must never break the app */ }
};
