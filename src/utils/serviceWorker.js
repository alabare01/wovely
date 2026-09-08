// Registers dist/sw.js, and defines the three conditions under which we do not.
//
// The worker's own caching strategy is documented in src/service-worker.js.
// This file is only about the decision to turn it on.

// The native shell is the one place a service worker is wrong. Capacitor
// serves the bundle from its own local origin (capacitor://localhost on iOS,
// https://localhost on Android) off the device's filesystem, so every asset is
// already local: there is nothing to cache and nothing to be offline from. It
// would also sit in front of the deep-link navigations the native layer is
// supposed to handle.
import { isNative } from './native.js';

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Dev runs from the Vite dev server, where there is no sw.js and where a
  // stale worker would fight HMR for control of every module request.
  if (!import.meta.env.PROD) return;

  if (isNative()) return;

  // After load, not during. The worker's install step precaches the whole
  // bundle and every public route; doing that while the page is still
  // rendering makes a first visit slower to become interactive, which is the
  // opposite of the point.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(
      (reg) => {
        // Deliberately NO auto-reload when an update is found. The person using
        // this app may be forty rows into a blanket. A new worker waits for
        // every tab to close, which is the browser default and the right one
        // here. They still get the new build immediately regardless, because
        // the worker serves HTML network-first.
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              console.info("[Wovely] Update downloaded; it applies next time the app is fully closed.");
            }
          });
        });
      },
      (err) => {
        // A failed registration must never be fatal: the site works without it.
        console.warn("[Wovely] Service worker registration failed:", err);
      }
    );
  });
}
