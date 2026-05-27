// Programmatic login for logged-in captures. Instead of driving the auth UI we
// fetch a real Supabase session (the same POST the app makes in supabase.js
// signIn) and inject it into localStorage as `yh_session`, plus the tier cache
// keys the app reads on first paint. Playwright applies this as storageState
// so the app boots already authenticated.

import { env } from "./env.js";
import { BASE_URL } from "../config.js";

export async function signIn(email, password) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data; // exact shape the app stores under yh_session
}

// Build a Playwright storageState that boots the app logged in as `tier`.
export function storageStateFor(session, tier) {
  const origin = new URL(BASE_URL).origin;
  const localStorage = [
    { name: "yh_session", value: JSON.stringify(session) },
    { name: "yh_tier", value: tier },
    // Housekeeping: suppress first-run overlays so they don't cover screenshots.
    // These hide one-time toasts/tips, not actual product features.
    { name: "wv_whats_new_last_seen", value: "2099-01-01T00:00:00.000Z" },
    { name: "yh_welcome_dismissed", value: "1" },
    { name: "yh_yarn_summary_tip_seen", value: "1" },
  ];
  if (tier === "pro" || tier === "craft") {
    localStorage.push({ name: "yh_is_pro", value: "true" });
  }
  return { cookies: [], origins: [{ origin, localStorage }] };
}
