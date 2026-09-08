// Everything that behaves differently inside the Capacitor native shell.
//
// Nothing in this file runs in a browser. `initNative()` returns immediately
// unless Capacitor reports a native platform, so importing it from main.jsx
// costs the web build one function call and the ~10 kB of @capacitor/core.
//
// Imports point one way only: this file imports from supabase.js, never the
// reverse. supabase.js exposes `setOAuthHandler` so the native sign-in path can
// be registered at startup instead of supabase.js having to know Capacitor
// exists.

import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import {
  SUPABASE_URL,
  saveSession,
  setOAuthHandler,
} from "../supabase.js";

export const isNative = () => Capacitor.isNativePlatform();

export const nativePlatform = () => Capacitor.getPlatform(); // "ios" | "android" | "web"

// The custom scheme Supabase sends the browser back to after OAuth. It must
// match:
//   - android/app/src/main/res/values/strings.xml  (custom_url_scheme)
//   - the CFBundleURLSchemes array in ios/App/App/Info.plist
//   - the Redirect URLs allow-list in the Supabase dashboard
// Change it in one place and sign-in breaks silently in the other three.
export const NATIVE_AUTH_REDIRECT = "app.wovely://auth";

// ─── OAUTH, WHICH DOES NOT WORK THE WAY IT DOES ON THE WEB ───────────────────
//
// On the web, `signInWithOAuth` assigns window.location.href and the whole tab
// navigates to Google. Doing that inside a Capacitor WebView fails, and not
// subtly: Google detects the embedded user agent and returns
// `403 disallowed_useragent` rather than a login form. This is a deliberate
// Google policy against embedded webviews, it applies to every OAuth provider
// they run, and no amount of user-agent spoofing is a supported way around it.
//
// The supported flow is to hand the URL to the SYSTEM browser —
// SFSafariViewController on iOS, Chrome Custom Tabs on Android — which is what
// @capacitor/browser opens. The user signs in there, in a real browser with
// their real cookies, and Supabase redirects to the custom scheme above. The
// OS routes that back into this app, `appUrlOpen` fires, and the handler below
// takes the tokens out of the fragment.
//
// Supabase's implicit flow returns the session in the URL FRAGMENT
// (#access_token=...), which is the same shape App.jsx already parses at module
// scope for email-confirmation links. The parsing is duplicated here rather
// than shared because that block runs once, at import time, against
// window.location — by the time a deep link arrives the app has been mounted
// for a while and the URL never touches the address bar.
const handleAuthCallback = async (url) => {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return false;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");

  if (!access_token || !refresh_token) {
    // Supabase reports a refusal in the fragment too. Failing silently here is
    // what "sign-in just does nothing" looks like from the outside.
    const err = params.get("error_description") || params.get("error");
    if (err) console.warn("[Wovely] OAuth returned an error:", err);
    return false;
  }

  try {
    const payload = JSON.parse(atob(access_token.split(".")[1]));
    const nowSec = Math.floor(Date.now() / 1000);
    const expires_at = Number(params.get("expires_at")) || payload.exp || nowSec + 3600;
    saveSession({
      access_token,
      refresh_token,
      token_type: params.get("token_type") || "bearer",
      expires_at,
      expires_in: Number(params.get("expires_in")) || Math.max(0, expires_at - nowSec),
      user: { id: payload.sub, email: payload.email },
    });
  } catch (e) {
    console.warn("[Wovely] Could not read the OAuth token:", e);
    return false;
  }

  try { await Browser.close(); } catch {}

  // A full reload rather than a router push. Auth state is read at several
  // points during mount (App.jsx checks _hasLocalSession on its first render),
  // so restarting the app is the one path guaranteed to leave every one of
  // them agreeing that the user is now signed in.
  window.location.replace("/");
  return true;
};

const nativeSignInWithOAuth = async (provider) => {
  const url =
    `${SUPABASE_URL}/auth/v1/authorize` +
    `?provider=${encodeURIComponent(provider)}` +
    `&redirect_to=${encodeURIComponent(NATIVE_AUTH_REDIRECT)}`;
  await Browser.open({ url, presentationStyle: "popover" });
};

// ─── DEEP LINKS ──────────────────────────────────────────────────────────────
//
// Two kinds arrive through the same listener:
//
//   app.wovely://auth#access_token=...   the OAuth return above
//   https://wovely.app/pattern/:id       a shared link, via App Links /
//                                        Universal Links
//
// The second is routed in-app with history.pushState plus a synthetic popstate,
// which is what React Router listens to. Assigning window.location instead
// would ask Capacitor's local file server for /pattern/:id, a path that is not
// a file in the bundle.
const handleAppUrl = (url) => {
  if (!url) return;

  if (url.startsWith("app.wovely://")) {
    handleAuthCallback(url);
    return;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "wovely.app" && parsed.hostname !== "www.wovely.app") return;
    const target = parsed.pathname + parsed.search;
    window.history.pushState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    /* not a URL we own */
  }
};

// ─── SAFE AREAS ──────────────────────────────────────────────────────────────
//
// index.html deliberately ships WITHOUT viewport-fit=cover, because turning it
// on changes landscape layout on notched iPhones for every ordinary browser
// visitor to a live site. The native shell is the one place it is both needed
// and safe, so it is set here at runtime.
//
// It pairs with the `wv-native` class on <html>, which is what src/index.css
// hangs the env(safe-area-inset-*) padding off. Both are applied together: the
// padding without the viewport meta is a no-op, and the viewport meta without
// the padding runs content under the status bar.
const applyNativeViewport = () => {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta && !meta.content.includes("viewport-fit")) {
    meta.content = meta.content + ", viewport-fit=cover";
  }
  document.documentElement.classList.add("wv-native");
  document.documentElement.dataset.platform = nativePlatform();
};

// ─── ANDROID HARDWARE BACK BUTTON ────────────────────────────────────────────
//
// Android's back button has no browser chrome behind it, so if nothing handles
// it the app closes outright, which for someone mid-pattern reads as a crash.
//
// A cancelable `wovely:backbutton` event is dispatched first so a modal can
// claim the press by calling preventDefault(). NOTHING LISTENS TO IT TODAY:
// the hook exists so that closing a modal on back can be added inside the
// components that own that state, without editing this file. Until something
// does, back navigates history and exits at the root, which is the standard
// Android behaviour and is correct for the routed screens.
const wireBackButton = () => {
  CapApp.addListener("backButton", ({ canGoBack }) => {
    const claimed = !window.dispatchEvent(
      new CustomEvent("wovely:backbutton", { cancelable: true })
    );
    if (claimed) return;
    if (canGoBack && window.history.length > 1) window.history.back();
    else CapApp.exitApp();
  });
};

export function initNative() {
  if (!isNative()) return;

  applyNativeViewport();
  setOAuthHandler(nativeSignInWithOAuth);
  wireBackButton();

  CapApp.addListener("appUrlOpen", ({ url }) => handleAppUrl(url));

  // A link that launched the app cold has already been consumed by the time
  // the listener is attached, so the launch URL is asked for explicitly.
  CapApp.getLaunchUrl()
    .then((res) => { if (res && res.url) handleAppUrl(res.url); })
    .catch(() => {});
}
