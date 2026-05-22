// ─── SUPABASE AUTH (no package needed) ───────────────────────────────────────
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://wovely.app";

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
