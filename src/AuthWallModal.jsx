import { useState, useEffect } from "react";
import posthog from "posthog-js";
import { supabaseAuth, getSession } from "./supabase.js";

// Wait for the session and user to be readable from localStorage after signUp/signIn.
// Supabase writes synchronously, but slower browsers/devices occasionally leave one of them
// briefly null. Three attempts at 0ms / 200ms / 400ms (total ~600ms) cover the long tail
// without flashing a false-positive error on fast machines.
const waitForSession = async () => {
  const delays = [0, 200, 400];
  for (const delay of delays) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    const user = supabaseAuth.getUser();
    const session = getSession();
    if (user && session?.access_token) return user;
  }
  return null;
};

const INPUT_STYLE = {
  width: "100%", padding: "14px 16px", background: "#fff",
  border: "1.5px solid #ECE6F8", borderRadius: 14, fontSize: 15,
  fontWeight: 700, color: "#2E2748", outline: "none", boxSizing: "border-box",
  fontFamily: "'Nunito',-apple-system,sans-serif",
};

const AuthWallModal = ({
  isOpen,
  onClose,
  onSuccess,
  title = "Create a free account",
  subtitle = "Takes 10 seconds. No credit card.",
  intent,
  isAnonymous = false,
}) => {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setMode("signup"); setEmail(""); setPass(""); setConfirmPass(""); setError(null); setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !pass) { setError("Please fill in all fields."); return; }
    if (mode === "signup") {
      if (pass.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (pass !== confirmPass) { setError("Passwords don\u2019t match."); return; }
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        // Anonymous → real account conversion preserves the UUID and all
        // attached patterns/import_jobs. Falls back to a fresh signUp if
        // the conversion call fails (e.g. JWT expired mid-flight).
        const { data, error: err } = isAnonymous
          ? await supabaseAuth.convertAnonymousToUser(email.trim(), pass)
          : await supabaseAuth.signUp(email.trim(), pass);
        if (err) { setError(err.msg || err.error_description || err.message || "Sign-up failed."); setLoading(false); return; }
        const user = await waitForSession();
        if (!user) { setError("Signup succeeded but session setup failed. Please sign in manually."); setLoading(false); return; }
        setError(null);
        try {
          posthog.capture("user_signed_up", { intent: intent || "unknown", source: "auth_wall_modal", converted_from_anon: isAnonymous });
          posthog.capture("signed_up_from_wall", { intent: intent || "unknown" });
        } catch {}
        if (onSuccess) await onSuccess(user);
        onClose();
      } else {
        const { error: err } = await supabaseAuth.signIn(email.trim(), pass);
        if (err) { setError(err.error_description || err.msg || err.message || "Invalid email or password."); setLoading(false); return; }
        const user = await waitForSession();
        if (!user) { setError("Sign-in succeeded but session setup failed. Please try again."); setLoading(false); return; }
        setError(null);
        try { posthog.capture("user_logged_in", { intent: intent || "unknown", source: "auth_wall_modal" }); } catch {}
        if (onSuccess) await onSuccess(user);
        onClose();
      }
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
    }
  };

  const onKey = e => { if (e.key === "Enter" && !loading) handleSubmit(); };

  const focusBorder = e => { e.target.style.borderColor = "#7B6AD4"; };
  const blurBorder  = e => { e.target.style.borderColor = "#ECE6F8"; };

  const submitLabel = loading
    ? (mode === "signup" ? "Creating…" : "Signing in…")
    : (mode === "signup" ? "Create account" : "Sign in");

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 800,
        background: "rgba(90,66,160,0.4)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: "Nunito,sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", width: "100%", maxWidth: 440,
          background: "#FFFFFF", border: "1px solid #ECE6F8", borderRadius: 28,
          padding: "36px 34px",
          boxShadow: "0 40px 80px -40px rgba(46,39,72,0.45)",
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 12, right: 12,
            background: "none", border: "none", cursor: "pointer",
            fontSize: 24, color: "#726A92", lineHeight: 1,
            width: 32, height: 32, display: "flex",
            alignItems: "center", justifyContent: "center",
            padding: 0,
          }}
        >×</button>

        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <img
            src="/bev-hero.png"
            alt="Bev"
            style={{ width: 84, objectFit: "contain", margin: "0 auto", display: "block", filter: "drop-shadow(0 12px 18px rgba(90,66,160,.35))" }}
          />
        </div>

        <div style={{
          fontFamily: "'Fredoka','Segoe UI',sans-serif",
          fontSize: 25, fontWeight: 600, color: "#2E2748",
          textAlign: "center", marginBottom: 6, lineHeight: 1.25, marginTop: 10,
        }}>
          {mode === "signup" ? title : "Welcome back"}
        </div>
        <div style={{
          fontFamily: "'Nunito',-apple-system,sans-serif", fontSize: 14, fontWeight: 700, color: "#726A92",
          textAlign: "center", marginBottom: 20, lineHeight: 1.5,
        }}>
          {mode === "signup" ? subtitle : "Bev kept everything right where you left it."}
        </div>

        {isAnonymous && mode === "signin" && (
          <div style={{
            background: "#FFF4D6",
            border: "1px solid #E8C77A",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 12,
            fontSize: 12,
            color: "#6B5400",
            lineHeight: 1.5,
          }}>
            Signing in to an existing account discards your guest pattern. Pick "Create account" to keep it.
          </div>
        )}
        <div onKeyDown={onKey} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            type="email"
            autoComplete="email"
            style={INPUT_STYLE}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
          <input
            value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder={mode === "signup" ? "Create a password" : "Password"}
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            style={INPUT_STYLE}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
          {mode === "signup" && (
            <input
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              placeholder="Confirm password"
              type="password"
              autoComplete="new-password"
              style={INPUT_STYLE}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
          )}
        </div>

        {error && (
          <div style={{
            color: "#C0544A", fontSize: 13, marginTop: 10, lineHeight: 1.5,
            fontFamily: "Nunito,sans-serif",
          }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%", padding: 15, marginTop: 14,
            background: "#7B6AD4", color: "#fff",
            border: "none", borderRadius: 14,
            fontSize: 15, fontWeight: 800, fontFamily: "'Nunito',-apple-system,sans-serif",
            boxShadow: "0 16px 30px -14px #7B6AD4",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >{submitLabel}</button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12.5, fontWeight: 700, fontFamily: "'Nunito',-apple-system,sans-serif" }}>
          {mode === "signup" ? (
            <>
              <span style={{ color: "#726A92" }}>Already have an account? </span>
              <span
                onClick={() => { setMode("signin"); setError(null); setPass(""); setConfirmPass(""); }}
                style={{ color: "#7B6AD4", cursor: "pointer", fontWeight: 800 }}
              >Sign in</span>
            </>
          ) : (
            <>
              <span style={{ color: "#726A92" }}>New to Wovely? </span>
              <span
                onClick={() => { setMode("signup"); setError(null); setPass(""); setConfirmPass(""); }}
                style={{ color: "#7B6AD4", cursor: "pointer", fontWeight: 800 }}
              >Create account</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthWallModal;
