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

// Meta only, on purpose (2026-09-23). AW-18410615088 is 2ndBrain's Google Ads
// tag; loading it here would pour Wovely visitors and conversions into
// 2ndBrain's ad account. Google Analytics and Google Ads come in their own
// change once Wovely's own IDs are read off Google's own pages.
export const PIXELS = {
  meta: "1094637423151254",
};

// ─── GOOGLE ANALYTICS 4, WOVELY'S OWN PROPERTY (2026-09-28) ─────────────────
//
// Wovely is its own business, so it gets its own GA4 property under
// adam@wovely.app, never a stream on 2ndBrain's (G-KYJ4D76JVN). The id is a
// build-time config value, VITE_GA4_ID, set in the Vercel project's env once it
// is read off Google's own Admin > Data streams page. Until then it is empty
// and nothing Google loads. A 2ndBrain id, or any Google Ads (AW-) id, is
// refused outright so the audiences can never mix.
const TWO_BRAIN_IDS = ["G-KYJ4D76JVN", "AW-18410615088"];
export const ga4IdFrom = (raw) => {
  const id = String(raw || "").trim();
  if (!/^G-[A-Z0-9]{6,12}$/.test(id)) return "";
  if (TWO_BRAIN_IDS.includes(id)) return "";
  return id;
};
let envId = "";
try { envId = import.meta.env && import.meta.env.VITE_GA4_ID; } catch { envId = ""; }
export const GA4_ID = ga4IdFrom(envId);

// PostHog event -> GA4 recommended event. Page views are sent by hand (SPA
// routes), so gtag's own automatic page_view is switched off below.
export const GA4_MAP = {
  $pageview: (p) => ["page_view", { page_location: p.$current_url, page_path: p.$pathname }],
  email_captured: () => ["generate_lead", { method: "email" }],
  user_signed_up: () => ["sign_up", { method: "wovely" }],
  checkout_started: (p) => ["begin_checkout", { currency: "USD", items: [{ item_id: String(p.tier || "craft"), item_variant: String(p.cadence || "monthly") }] }],
  upgrade_entitlement_check: (p) =>
    p && p.paid === true ? ["purchase", { currency: "USD", items: [{ item_id: String(p.tier || "paid") }] }] : null,
};
export const ga4EventFor = (event, props) => {
  const f = GA4_MAP[event];
  return f ? f(props || {}) : null;
};

const loadGa4 = (w, id) => {
  if (w.gtag) return;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer.push(arguments); };
  w.gtag("js", new Date());
  w.gtag("config", id, { send_page_view: false });
  const s = w.document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  (w.document.head || w.document.getElementsByTagName("head")[0]).appendChild(s);
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
    if (!PIXELS.meta && !GA4_ID) return;
    if (PIXELS.meta) loadMeta(window, PIXELS.meta);
    if (GA4_ID) loadGa4(window, GA4_ID);
    posthog.on("eventCaptured", (e) => {
      try {
        const m = e && metaEventFor(e.event, e.properties);
        if (m && window.fbq) window.fbq("track", m[0], m[1] || {});
      } catch { /* a pixel must never break the app */ }
      try {
        const g = GA4_ID && e && ga4EventFor(e.event, e.properties);
        if (g && window.gtag) window.gtag("event", g[0], { send_to: GA4_ID, ...(g[1] || {}) });
      } catch { /* a pixel must never break the app */ }
    });
  } catch { /* a pixel must never break the app */ }
};
