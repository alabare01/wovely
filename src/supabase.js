// ─── SUPABASE AUTH (no package needed) ───────────────────────────────────────
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://wovely.app";

// The one place the reset route is named. App.jsx routes it, Auth.jsx links to
// it and supabaseAuth.resetPasswordForEmail sends Supabase here as the
// redirect target, so a rename cannot leave a recovery email pointing at a
// path the router does not know.
export const RESET_PASSWORD_PATH = "/reset-password";

export const saveSession = (s) => { try { if(s) localStorage.setItem("yh_session",JSON.stringify(s)); else localStorage.removeItem("yh_session"); } catch{} };
export const getSession = () => { try { const r=localStorage.getItem("yh_session"); return r?JSON.parse(r):null; } catch{return null;} };

// Read the is_anonymous claim from the current session's JWT. Anonymous
// users get a real Supabase session, but the claim distinguishes them from
// signed-up Free users. Returns false when there is no session or the JWT
// can't be parsed — never throws, so callers can use it inline.
export const isAnonymousSession = () => {
  const s = getSession();
  if (!s?.access_token) return false;
  try {
    const p = JSON.parse(atob(s.access_token.split(".")[1]));
    return p?.is_anonymous === true;
  } catch { return false; }
};

// ─── SESSION LIFETIME ────────────────────────────────────────────────────────
// Supabase access tokens are short-lived (one hour by default). The only
// renewal the app used to do was the single refresh inside the mount-time
// validate(), so a tab left open past the hour quietly lost its session: REST
// reads started 401ing and getUser() started returning null with nothing on
// screen to explain it. These three helpers give the app one place to ask when
// the token dies and one deduped way to renew it.

// Epoch ms at which the current access token expires. Prefers the session's
// own expires_at (seconds since epoch), falls back to the JWT `exp` claim, and
// returns 0 when neither can be read so callers treat it as "already dead".
export const sessionExpiresAt = (s = getSession()) => {
  if (!s?.access_token) return 0;
  if (typeof s.expires_at === "number" && s.expires_at > 0) return s.expires_at * 1000;
  try {
    const p = JSON.parse(atob(s.access_token.split(".")[1]));
    return typeof p?.exp === "number" ? p.exp * 1000 : 0;
  } catch { return 0; }
};

// Milliseconds of life left in the current access token. Negative once expired.
export const millisUntilExpiry = (s = getSession()) => sessionExpiresAt(s) - Date.now();

// Renew the access token from the stored refresh token.
//
// Deduped on purpose: Supabase invalidates a refresh token the moment it is
// used, so two concurrent rotations (a timer firing at the same instant the
// tab regains focus) would have the loser's token rejected and log the user
// out. Concurrent callers share the one in-flight request instead.
//
// Resolves { ok:true, session } or { ok:false, reason } and never throws.
// `reason` matters to the caller: "network" means we could not reach Supabase
// and the current token may still be perfectly good, so the caller should
// retry rather than tear the session down. Anything else means the refresh
// token itself was rejected and the session is genuinely over.
let inFlightRefresh = null;
export const refreshSession = () => {
  if (inFlightRefresh) return inFlightRefresh;
  const s = getSession();
  if (!s?.refresh_token) return Promise.resolve({ ok: false, reason: "no_refresh_token" });
  inFlightRefresh = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!res.ok) return { ok: false, reason: `http_${res.status}` };
      const ns = await res.json();
      if (!ns?.access_token) return { ok: false, reason: "no_access_token" };
      saveSession(ns);
      return { ok: true, session: ns };
    } catch {
      return { ok: false, reason: "network" };
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
};

export const supabaseAuth = {
  // Native Supabase anonymous sign-in. Requires "Allow anonymous sign-ins"
  // toggle in the Supabase Dashboard (Authentication > Settings > User
  // Signups). The endpoint is the same /auth/v1/signup used by email/password
  // signup — sending it with no email/password creates an anonymous user
  // whose JWT carries is_anonymous: true.
  signInAnonymously: async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data };
    const session = data.session || (data.access_token ? {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      expires_in: data.expires_in,
      token_type: data.token_type || "bearer",
      user: data.user,
    } : null);
    if (session) saveSession(session);
    return { data };
  },
  // Convert the current anonymous user into a real email/password account.
  // PUT /auth/v1/user attaches the email and password to the existing UUID
  // and clears is_anonymous. We then refresh the JWT so callers immediately
  // see is_anonymous=false instead of waiting for the next token rotation.
  convertAnonymousToUser: async (email, password) => {
    const s = getSession();
    if (!s?.access_token) return { error: { message: "No active session" } };
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        "Authorization": `Bearer ${s.access_token}`,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data };
    // Refresh so the new JWT (without is_anonymous) replaces the old one.
    if (s.refresh_token) {
      try {
        const refreshRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: s.refresh_token }),
        });
        if (refreshRes.ok) {
          const ns = await refreshRes.json();
          if (ns.access_token) saveSession(ns);
        }
      } catch {}
    }
    return { data };
  },
  signUp: async (email, password) => {
    console.log("[Wovely] Signup request:", {supabaseUrl:SUPABASE_URL, redirectTo:APP_ORIGIN});
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method:"POST", headers:{"apikey":SUPABASE_ANON_KEY,"Content-Type":"application/json"},
      body: JSON.stringify({email, password, options:{emailRedirectTo:APP_ORIGIN}}),
    });
    const data = await res.json();
    console.log("[Wovely] Signup response:", {status:res.status, hasSession:!!data.session, hasAccessToken:!!data.access_token, confirmationSentAt:data.confirmation_sent_at||"none"});
    if(!res.ok) return {error: data};
    // Supabase signup response can return session nested OR flat (depends on email confirmation settings).
    // With confirmation OFF, the response is flat; with confirmation ON, session is nested. Normalize.
    const session = data.session || (data.access_token ? {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      expires_in: data.expires_in,
      token_type: data.token_type || "bearer",
      user: data.user,
    } : null);
    if (session) saveSession(session);
    return {data};
  },
  signIn: async (email, password) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method:"POST", headers:{"apikey":SUPABASE_ANON_KEY,"Content-Type":"application/json"},
      body: JSON.stringify({email, password}),
    });
    const data = await res.json();
    if(!res.ok) return {error: data};
    if(data.access_token) saveSession(data);
    return {data};
  },
  signOut: async () => {
    const s = getSession();
    if(s?.access_token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method:"POST", headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${s.access_token}`},
      });
    }
    saveSession(null);
  },
  // ─── PASSWORD RESET ────────────────────────────────────────────────────────
  // Until 2026-09-08 Wovely had no reset of any kind: no "Forgot password?"
  // control, no call to this endpoint anywhere in the tree, and App.jsx threw
  // recovery tokens away on arrival. An email/password user who forgot their
  // password was locked out permanently with no self-service route, which for
  // a paying customer is a refund and a support thread.
  //
  // Supabase never reveals whether an address has an account here: the
  // response is 200 either way. That is correct (it blocks account
  // enumeration) and the caller must show the same confirmation for both
  // outcomes rather than trying to be helpful about it.
  resetPasswordForEmail: async (email, redirectTo = `${APP_ORIGIN}${RESET_PASSWORD_PATH}`) => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        let data = {};
        try { data = await res.json(); } catch {}
        // Rate limiting is the one failure worth naming: Supabase returns 429
        // when the same address asks repeatedly, and "nothing happened" reads
        // as a broken button.
        return { error: { ...data, status: res.status } };
      }
      return { data: {} };
    } catch {
      return { error: { message: "network" } };
    }
  },

  // Set a new password on the session currently in localStorage. The recovery
  // link puts a real, short-lived session there, and that session is what
  // authorizes this PUT.
  updatePassword: async (password) => {
    const s = getSession();
    if (!s?.access_token) return { error: { message: "No active session" } };
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          "Authorization": `Bearer ${s.access_token}`,
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data };
      return { data };
    } catch {
      return { error: { message: "network" } };
    }
  },

  signInWithOtp: async (email) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method:"POST", headers:{"apikey":SUPABASE_ANON_KEY,"Content-Type":"application/json"},
      body: JSON.stringify({email, options:{emailRedirectTo:APP_ORIGIN}}),
    });
    const data = await res.json();
    if(!res.ok) return {error: data};
    return {data};
  },
  signInWithOAuth: async (provider) => {
    const redirectTo = APP_ORIGIN;
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;
  },
  getUser: () => {
    const s = getSession(); if(!s?.access_token) return null;
    try {
      const p = JSON.parse(atob(s.access_token.split(".")[1]));
      if(p.exp*1000 < Date.now()) return null;
      return {id:p.sub, email:p.email};
    } catch { return null; }
  },
};
