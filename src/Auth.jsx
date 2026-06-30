import { useState, useEffect, useRef } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import { supabaseAuth } from "./supabase.js";

/* ── Animated Product Preview Component ── */
const AnimatedProductPreview = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 4);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const steps = [
    {
      title: "Import from anywhere",
      desc: "PDF, link, or manual entry. We handle it.",
      visual: "📥",
      color: "#8B6F47"
    },
    {
      title: "Organize into collections",
      desc: "MKALs, seasonal projects, big builds. All in one place.",
      visual: "📂",
      color: "#7A9E74"
    },
    {
      title: "Track every row, stitch by stitch",
      desc: "See progress across all your projects. Never lose your place.",
      visual: "✓",
      color: "#9B7EC8"
    },
    {
      title: "Get smarter with Bev",
      desc: "AI-powered feedback on patterns. Spot issues before they cost you.",
      visual: "🤖",
      color: "#B8860B"
    }
  ];

  const current = steps[step];

  return (
    <div style={{
      flex: 1,
      padding: "40px 36px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",
      minHeight: "100vh",
      background: `linear-gradient(135deg, rgba(250,248,245,1) 0%, rgba(245,242,238,0.8) 100%)`,
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Bev logo top */}
      <div style={{
        position: "absolute",
        top: 40,
        left: 36,
        display: "flex",
        alignItems: "center",
        gap: 10
      }}>
        <img src="/bev_neutral.png" alt="Bev" style={{ height: 48, width: "auto" }} />
        <div style={{
          fontFamily: T.serif,
          fontSize: 28,
          fontWeight: 700,
          color: T.ink
        }}>Wovely</div>
      </div>

      {/* Animated content */}
      <div style={{
        maxWidth: 400,
        margin: "0 auto"
      }}>
        <div style={{
          fontSize: 72,
          marginBottom: 24,
          opacity: 0.85,
          transition: "all 600ms ease-out"
        }}>
          {current.visual}
        </div>

        <h2 style={{
          fontFamily: T.serif,
          fontSize: 32,
          fontWeight: 700,
          color: current.color,
          marginBottom: 12,
          transition: "color 600ms ease-out",
          lineHeight: 1.2
        }}>
          {current.title}
        </h2>

        <p style={{
          fontFamily: T.sans,
          fontSize: 16,
          color: T.ink2,
          lineHeight: 1.6,
          transition: "color 600ms ease-out"
        }}>
          {current.desc}
        </p>
      </div>

      {/* Progress dots */}
      <div style={{
        position: "absolute",
        bottom: 40,
        display: "flex",
        gap: 8,
        justifyContent: "center"
      }}>
        {steps.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === step ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === step ? current.color : T.border,
              transition: "all 300ms ease",
              cursor: "pointer"
            }}
            onClick={() => setStep(i)}
          />
        ))}
      </div>

      {/* Real maker photo (bottom) */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 200,
        background: `linear-gradient(to top, rgba(123, 158, 116, 0.08), transparent)`,
        pointerEvents: "none"
      }} />
    </div>
  );
};

/* ── Auth Form Component ── */
const AuthForm = ({ onEnter, onEnterAsNew, onTryAnonymous }) => {
  const [mode, setMode] = useState("form"); // "form" (signup) | "signin" | "magic"
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [magicSent, setMagicSent] = useState(false);
  const [isSignIn, setIsSignIn] = useState(false); // Toggle for sign-in vs signup

  const handleSignup = async () => {
    setAuthError(null);
    if (!email.trim() || !pass) { setAuthError("Please fill in all fields."); return; }
    if (pass !== confirmPass) { setAuthError("Passwords don't match."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabaseAuth.signUp(email.trim(), pass);
      if (error) { setAuthError(error.msg || error.error_description || error.message || "Sign-up failed."); setLoading(false); return; }
      onEnterAsNew();
    } catch { setAuthError("Network error — please try again."); }
    setLoading(false);
  };

  const handleSignin = async () => {
    setAuthError(null);
    if (!email.trim() || !pass) { setAuthError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const { error } = await supabaseAuth.signIn(email.trim(), pass);
      if (error) { setAuthError(error.error_description || error.msg || error.message || "Invalid email or password."); setLoading(false); return; }
      onEnter();
    } catch { setAuthError("Network error — please try again."); }
    setLoading(false);
  };

  const handleMagicLink = async () => {
    setAuthError(null);
    if (!email.trim() || !email.includes("@")) { setAuthError("Please enter a valid email."); return; }
    setLoading(true);
    try {
      const { error } = await supabaseAuth.signInWithOtp(email.trim());
      if (error) { setAuthError(error.msg || error.message || "Could not send magic link."); setLoading(false); return; }
      setMagicSent(true);
    } catch { setAuthError("Network error — please try again."); }
    setLoading(false);
  };

  const onKey = e => {
    if (e.key === "Enter" && !loading) {
      if (mode === "magic") handleMagicLink();
      else if (isSignIn) handleSignin();
      else handleSignup();
    }
  };

  return (
    <div style={{
      flex: 1,
      padding: "40px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      maxWidth: 420,
      width: "100%",
      boxSizing: "border-box",
      background: "#FFFFFF"
    }}>
      {/* Sign-in / Sign-up Toggle (equal weight) */}
      <div style={{
        display: "flex",
        gap: 0,
        marginBottom: 32,
        borderRadius: 12,
        padding: 4,
        background: T.surface
      }}>
        <button
          onClick={() => { setIsSignIn(false); setMode("form"); setAuthError(null); }}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: !isSignIn ? "#FFFFFF" : "transparent",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            color: !isSignIn ? T.ink : T.ink2,
            cursor: "pointer",
            transition: "all 200ms",
            fontFamily: T.sans,
            boxShadow: !isSignIn ? "0 1px 3px rgba(61,70,33,0.08)" : "none"
          }}
        >
          Create account
        </button>
        <button
          onClick={() => { setIsSignIn(true); setMode("signin"); setAuthError(null); }}
          style={{
            flex: 1,
            padding: "10px 16px",
            background: isSignIn ? "#FFFFFF" : "transparent",
            border: "none",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            color: isSignIn ? T.ink : T.ink2,
            cursor: "pointer",
            transition: "all 200ms",
            fontFamily: T.sans,
            boxShadow: isSignIn ? "0 1px 3px rgba(61,70,33,0.08)" : "none"
          }}
        >
          Sign in
        </button>
      </div>

      {/* Heading */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: T.serif,
          fontSize: 28,
          fontWeight: 700,
          color: T.ochre,
          marginBottom: 8,
          lineHeight: 1.2
        }}>
          {isSignIn ? "Welcome back" : "Start free, organize everything"}
        </h1>
        <p style={{
          fontFamily: T.sans,
          fontSize: 15,
          color: T.ink2,
          lineHeight: 1.6
        }}>
          {isSignIn
            ? "Your Wovely and all your projects are waiting."
            : "Free tier: 5 patterns. Craft: unlimited patterns, collections, and pattern tracking."}
        </p>
      </div>

      {/* Try for free button (signup only) */}
      {!isSignIn && onTryAnonymous && (
        <>
          <button
            onClick={onTryAnonymous}
            style={{
              width: "100%",
              padding: "12px 16px",
              marginBottom: 16,
              background: T.sage,
              color: "#FFFFFF",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: T.sans,
              cursor: "pointer",
              transition: "all 200ms"
            }}
            onMouseEnter={(e) => e.target.style.opacity = "0.9"}
            onMouseLeave={(e) => e.target.style.opacity = "1"}
          >
            Try free for 5 patterns
          </button>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "16px 0 20px"
          }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <div style={{ fontSize: 12, color: T.ink2, whiteSpace: "nowrap" }}>or</div>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>
        </>
      )}

      {/* Magic link sent state */}
      {mode === "magic" && magicSent ? (
        <div style={{
          background: T.surface,
          borderRadius: 12,
          padding: "20px 16px",
          textAlign: "center",
          marginBottom: 16
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✉️</div>
          <div style={{
            fontFamily: T.serif,
            fontSize: 18,
            fontWeight: 700,
            color: T.ink,
            marginBottom: 8
          }}>Check your inbox</div>
          <div style={{
            fontSize: 13,
            color: T.ink2,
            lineHeight: 1.6,
            marginBottom: 16
          }}>
            We sent a magic link to <strong>{email}</strong>. Click it to sign in.
          </div>
          <button
            onClick={() => { setMode(isSignIn ? "signin" : "form"); setMagicSent(false); setAuthError(null); }}
            style={{
              background: "none",
              border: "none",
              color: T.terra,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: T.sans
            }}
          >
            ← Back
          </button>
        </div>
      ) : mode === "magic" ? (
        /* Magic link form */
        <div onKeyDown={onKey}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            type="email"
            style={{
              width: "100%",
              padding: "11px 14px",
              marginBottom: 12,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              fontSize: 14,
              color: T.ink,
              fontFamily: T.sans,
              outline: "none",
              transition: "border-color 200ms"
            }}
            onFocus={(e) => e.target.style.borderColor = T.ochre}
            onBlur={(e) => e.target.style.borderColor = T.border}
          />
          {authError && (
            <div style={{
              background: T.surface,
              color: T.ochre,
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 12,
              fontFamily: T.sans
            }}>
              {authError}
            </div>
          )}
          <button
            onClick={handleMagicLink}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              marginBottom: 12,
              background: T.ochre,
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: T.sans,
              cursor: "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "all 200ms"
            }}
          >
            {loading ? "Sending..." : "Send magic link →"}
          </button>
          <button
            onClick={() => { setMode(isSignIn ? "signin" : "form"); setAuthError(null); }}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              color: T.ink2,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: T.sans,
              fontWeight: 500
            }}
          >
            ← Back to email & password
          </button>
        </div>
      ) : (
        /* Email + password form */
        <div onKeyDown={onKey}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            type="email"
            style={{
              width: "100%",
              padding: "11px 14px",
              marginBottom: 10,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              fontSize: 14,
              color: T.ink,
              fontFamily: T.sans,
              outline: "none",
              transition: "border-color 200ms"
            }}
            onFocus={(e) => e.target.style.borderColor = T.ochre}
            onBlur={(e) => e.target.style.borderColor = T.border}
          />
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder={isSignIn ? "Password" : "Create a password"}
            type="password"
            style={{
              width: "100%",
              padding: "11px 14px",
              marginBottom: 10,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              fontSize: 14,
              color: T.ink,
              fontFamily: T.sans,
              outline: "none",
              transition: "border-color 200ms"
            }}
            onFocus={(e) => e.target.style.borderColor = T.ochre}
            onBlur={(e) => e.target.style.borderColor = T.border}
          />
          {!isSignIn && (
            <input
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="Confirm password"
              type="password"
              style={{
                width: "100%",
                padding: "11px 14px",
                marginBottom: 10,
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                fontSize: 14,
                color: T.ink,
                fontFamily: T.sans,
                outline: "none",
                transition: "border-color 200ms"
              }}
              onFocus={(e) => e.target.style.borderColor = T.ochre}
              onBlur={(e) => e.target.style.borderColor = T.border}
            />
          )}

          {authError && (
            <div style={{
              background: T.surface,
              color: T.ochre,
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 12,
              fontFamily: T.sans
            }}>
              {authError}
            </div>
          )}

          <button
            onClick={isSignIn ? handleSignin : handleSignup}
            disabled={loading}
            style={{
              width: "100%",
              padding: "13px 16px",
              marginBottom: 12,
              background: T.ochre,
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: T.sans,
              cursor: "pointer",
              opacity: loading ? 0.6 : 1,
              transition: "all 200ms",
              boxShadow: "0 2px 6px rgba(184, 134, 11, 0.2)"
            }}
            onMouseEnter={(e) => !loading && (e.target.style.boxShadow = "0 4px 12px rgba(184, 134, 11, 0.3)")}
            onMouseLeave={(e) => e.target.style.boxShadow = "0 2px 6px rgba(184, 134, 11, 0.2)"}
          >
            {loading ? "Please wait..." : (isSignIn ? "Sign in →" : "Start free today")}
          </button>

          <button
            onClick={() => { setMode("magic"); setAuthError(null); }}
            style={{
              width: "100%",
              padding: "11px 14px",
              marginBottom: 16,
              background: "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              fontSize: 13,
              color: T.ink2,
              cursor: "pointer",
              fontFamily: T.sans,
              fontWeight: 500,
              transition: "all 200ms"
            }}
            onMouseEnter={(e) => { e.target.style.borderColor = T.ochre; e.target.style.color = T.ochre; }}
            onMouseLeave={(e) => { e.target.style.borderColor = T.border; e.target.style.color = T.ink2; }}
          >
            ✉️ Magic link instead
          </button>

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "16px 0"
          }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <div style={{ fontSize: 12, color: T.ink2, whiteSpace: "nowrap" }}>or</div>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>

          <button
            onClick={() => supabaseAuth.signInWithOAuth("google")}
            style={{
              width: "100%",
              padding: "11px 14px",
              background: "#FFFFFF",
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              color: T.ink,
              cursor: "pointer",
              fontFamily: T.sans,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 200ms"
            }}
            onMouseEnter={(e) => e.target.style.background = T.surface}
            onMouseLeave={(e) => e.target.style.background = "#FFFFFF"}
          >
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      )}

      {/* Footer social proof */}
      <div style={{
        marginTop: 24,
        textAlign: "center",
        fontSize: 12,
        color: T.ink2,
        fontFamily: T.sans
      }}>
        ✓ Trusted by makers like you • No credit card needed
      </div>
    </div>
  );
};

/* ── Main Auth Component ── */
const Auth = ({ onEnter, onEnterAsNew, onTryAnonymous }) => {
  const { isMobile } = useBreakpoint();

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      alignItems: "stretch",
      fontFamily: T.sans,
      background: "#FFFFFF"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Raleway:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        #__ph_survey_widget, div[class*="PostHog"], div[id*="posthog"], .__ph-toolbar {
          display: none !important;
        }
      `}</style>

      {!isMobile && <AnimatedProductPreview />}
      <AuthForm onEnter={onEnter} onEnterAsNew={onEnterAsNew} onTryAnonymous={onTryAnonymous} />

      {isMobile && (
        <div style={{
          padding: "24px",
          background: T.surface,
          textAlign: "center",
          fontSize: 13,
          color: T.ink2
        }}>
          <AnimatedProductPreview />
        </div>
      )}
    </div>
  );
};

export default Auth;
