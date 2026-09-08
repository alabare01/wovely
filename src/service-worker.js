// ─── WOVELY SERVICE WORKER ───────────────────────────────────────────────────
//
// This file is a TEMPLATE. It is never served as-is. The `pwaServiceWorker`
// plugin in vite.config.js substitutes the build-id and precache placeholders
// below and writes the result to dist/sw.js. Editing dist/sw.js by hand is
// pointless; edit this.
//
// Each placeholder token must appear EXACTLY ONCE in this file, at the
// assignment that uses it. They are deliberately not spelled out in prose
// anywhere above, because the first version of this plugin used
// String.replace with a string pattern, which replaces only the first match,
// and the first match was a mention in this very comment block. The build
// printed a cheerful success line and shipped a worker whose precache list was
// an undeclared identifier. test/pwa.test.mjs now pins the "exactly once"
// rule, and the plugin asserts no placeholder survives into dist/sw.js.
//
// ─── THE RULE THIS FILE IS WRITTEN AROUND ────────────────────────────────────
//
// A service worker is the only thing in a web app that can outlive a bad
// deploy. Cache HTML aggressively and you can pin every returning visitor to a
// broken build with no way to reach them, because the fix you deploy is the
// thing they will not fetch. Wovely is live, has paying customers, and has ten
// prerendered pages doing real SEO work. So the strategy below is deliberately
// timid about HTML and only confident where it is provably safe.
//
//   NAVIGATION (HTML)   network first, cache only as an offline fallback
//   /assets/*-<hash>.*  cache first, because the filename IS the version
//   icons, images       stale while revalidate
//   /api/*              never touched, at all
//   cross-origin        never touched, at all
//
// Network-first navigation is the load-bearing decision. It means a new deploy
// is live for every online user on their very next page load, whether or not
// this worker has updated itself yet. Staleness is possible only while offline,
// which is the one time stale beats nothing.
//
// ─── WHY THERE IS NO skipWaiting() ───────────────────────────────────────────
//
// The default lifecycle (a new worker waits until every tab of the app is
// closed) is the safe one, and we keep it. skipWaiting swaps the worker under
// a page that is already running, which for this app could mean doing it to
// somebody halfway through counting a row. We do not need it: because
// navigation is network-first, a new deploy already reaches users immediately.
// The only thing that lags a cold start is this worker's own code, which is
// exactly the thing that should lag.
//
// ─── THE ESCAPE HATCH, IF THIS EVER GOES WRONG ───────────────────────────────
//
// Replace the body of this file with the four lines below and deploy. Every
// browser picks it up on its next update check, drops every cache, and
// unregisters, returning the site to plain HTTP with no worker:
//
//   self.addEventListener('install', () => self.skipWaiting());
//   self.addEventListener('activate', (e) => e.waitUntil((async () => {
//     for (const k of await caches.keys()) await caches.delete(k);
//     await self.registration.unregister();
//   })()));
//
// That works because sw.js is served must-revalidate (see vercel.json) and
// because browsers check for a new worker on navigation regardless.

const BUILD_ID = "__BUILD_ID__";
const PRECACHE = "wovely-precache-" + BUILD_ID;
const RUNTIME = "wovely-runtime-" + BUILD_ID;
const CURRENT = [PRECACHE, RUNTIME];

// Route URLs, not file paths. /tools is a rewrite to /tools.html, and the
// browser will ask for /tools, so that is what has to be in the cache.
const PRECACHE_URLS = __PRECACHE__;

// Served when a navigation fails offline and we have nothing cached for that
// exact URL. The noindex app shell: correct for any signed-in route.
const OFFLINE_URL = "/app.html";

// ─── INSTALL ─────────────────────────────────────────────────────────────────
//
// Individually, with allSettled, rather than cache.addAll. addAll is atomic: a
// single 404 anywhere in the list fails the whole install. That is a fine
// failure mode (no worker, normal site) but a silly one to accept when one
// stale entry in the precache list should not cost every user their offline
// mode.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      const results = await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          // cache: "reload" bypasses the HTTP cache, so we precache what the
          // server has right now rather than whatever the browser held from
          // the previous deploy.
          const res = await fetch(new Request(url, { cache: "reload" }));
          if (!res.ok) throw new Error(url + " -> " + res.status);
          await cache.put(url, res);
        })
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        console.warn("[sw] %d/%d precache entries failed", failed.length, PRECACHE_URLS.length);
      }
    })()
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("wovely-") && !CURRENT.includes(key)) {
          await caches.delete(key);
        }
      }
      await self.clients.claim();
    })()
  );
});

// Allows the page to promote a waiting worker if we ever add an "update ready"
// prompt. Nothing calls this today; it is here so the capability does not
// require a worker redeploy to exist.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// ─── STRATEGIES ──────────────────────────────────────────────────────────────

const cacheable = (res) => res && res.ok && res.type === "basic";

async function networkFirstNavigation(request) {
  try {
    const res = await fetch(request);
    if (cacheable(res)) {
      const copy = res.clone();
      caches.open(RUNTIME).then((c) => c.put(request, copy)).catch(() => {});
    }
    return res;
  } catch {
    // ignoreSearch so the manifest's start_url (/?utm_source=pwa) matches the
    // precached "/", and so a shared link with tracking params still opens.
    const hit =
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match(OFFLINE_URL));
    if (hit) return hit;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title><body style=\"font-family:system-ui;padding:2rem\"><h1>You are offline</h1><p>Wovely could not reach the network. Your work is saved; open the app again once you have a connection.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(request, copy)).catch(() => {});
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const hit = await caches.match(request);
  const network = fetch(request)
    .then((res) => {
      if (cacheable(res)) {
        const copy = res.clone();
        caches.open(cacheName).then((c) => c.put(request, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  return hit || (await network) || Response.error();
}

// Vite writes content-hashed filenames into /assets, so the name is the
// version and cache-first can never serve the wrong bytes for a given URL.
const HASHED_ASSET = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css)$/;
const STATIC_ASSET = /\.(png|jpg|jpeg|svg|gif|webp|avif|ico|webmanifest|woff2?)$/;

// ─── FETCH ───────────────────────────────────────────────────────────────────
//
// Every early `return` here means "do not call respondWith", which hands the
// request back to the browser untouched. That is the default for anything this
// worker is not certain about.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  // Range requests (media seeking) must not be answered from a full cached
  // body; the browser handles them correctly on its own.
  if (request.headers.has("range")) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Supabase, Stripe, PostHog, Google Fonts. Auth tokens and payment traffic
  // have no business in a cache, and a third party's caching headers are not
  // ours to override.
  if (url.origin !== self.location.origin) return;

  // The API is the live state of the app: import jobs, checkout sessions,
  // webhooks. Caching any of it would be a correctness bug, not a perf win.
  if (url.pathname.startsWith("/api/")) return;

  // Vercel's own analytics and insights endpoints.
  if (url.pathname.startsWith("/_vercel/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (HASHED_ASSET.test(url.pathname)) {
    event.respondWith(cacheFirst(request, PRECACHE));
    return;
  }

  if (STATIC_ASSET.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME));
    return;
  }

  // Anything else: untouched.
});
