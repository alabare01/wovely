import { useState, useEffect, useRef } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import { supabaseAuth } from "./supabase.js";

/* ── Desktop Landing: Problem → Solution Story ── */
const DesktopLanding = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 4);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const slides = [
    {
      title: "Your patterns are everywhere.",
      subtitle: "Ravelry, PDFs, screenshots, old books, links. Scattered.",
      visual: (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          maxWidth: 300,
          margin: "0 auto"
        }}>
          {[
            { name: "PDF", icon: "📄", color: "rgba(229, 57, 53, 0.15)" },
            { name: "Ravelry", icon: "🧶", color: "rgba(25, 118, 210, 0.15)" },
            { name: "Screenshot", icon: "📸", color: "rgba(251, 140, 0, 0.15)" },
            { name: "Bookmarked", icon: "🔗", color: "rgba(56, 142, 60, 0.15)" }
          ].map((item, i) => (
            <div key={i} style={{
              background: item.color,
              border: "1px solid rgba(155,126,200,0.2)",
              borderRadius: 12,
              padding: 16,
              textAlign: "center",
              animation: `slideUp 600ms ease-out ${i * 100}ms both`
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{item.icon}</div>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: T.ink,
                fontFamily: T.sans
              }}>{item.name}</div>
            </div>
          ))}
        </div>
      )
    },
    {
      title: "Wovely collects them all.",
      subtitle: "Upload from any device, any format. We handle it.",
      visual: (
        <div style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(155,126,200,0.2)",
          borderRadius: 16,
          padding: 24,
          maxWidth: 320,
          margin: "0 auto",
          textAlign: "center",
          animation: "slideUp 600ms ease-out"
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 12
          }}>📱</div>
          <div style={{
            fontFamily: T.serif,
            fontSize: 16,
            fontWeight: 700,
            color: T.terra,
            marginBottom: 8
          }}>Tap to upload</div>
          <div style={{
            fontSize: 12,
            color: T.ink2,
            lineHeight: 1.5,
            marginBottom: 16
          }}>PDF, link, or manual entry. Upload from phone, desktop, anywhere.</div>
          <div style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            fontSize: 28
          }}>
            📄 🔗 ✏️
          </div>
        </div>
      )
    },
    {
      title: "Track progress across every device.",
      subtitle: "Start on your phone, continue on desktop. Never lose your place.",
      visual: (
        <div style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          maxWidth: 320,
          margin: "0 auto"
        }}>
          {[
            { name: "Phone", size: "60px", icon: "📱" },
            { name: "Tablet", size: "80px", icon: "📱" },
            { name: "Desktop", size: "100px", icon: "💻" }
          ].map((device, i) => (
            <div key={i} style={{
              textAlign: "center",
              animation: `slideUp 600ms ease-out ${i * 100}ms both`
            }}>
              <div style={{
                fontSize: device.size,
                marginBottom: 8
              }}>{device.icon}</div>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: T.ink,
                fontFamily: T.sans
              }}>{device.name}</div>
              <div style={{
                fontSize: 10,
                color: T.terra,
                fontFamily: T.sans,
                marginTop: 4
              }}>Sync</div>
            </div>
          ))}
        </div>
      )
    },
    {
      title: "Share your progress. Build together.",
      subtitle: "Show friends your patterns, celebrate finished projects.",
      visual: (
        <div style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(155,126,200,0.2)",
          borderRadius: 16,
          padding: 24,
          maxWidth: 320,
          margin: "0 auto",
          animation: "slideUp 600ms ease-out"
        }}>
          <div style={{
            fontSize: 28,
            textAlign: "center",
            marginBottom: 12
          }}>👯</div>
          <div style={{
            fontFamily: T.serif,
            fontSize: 14,
            fontWeight: 700,
            color: T.ink,
            marginBottom: 8,
            textAlign: "center"
          }}>Shared MKAL progress</div>
          <div style={{
            fontSize: 12,
            color: T.ink2,
            lineHeight: 1.5,
            textAlign: "center"
          }}>
            12-clue MKAL, all in one place. Track what everyone's made. Organize shared materials.
          </div>
        </div>
      )
    }
  ];

  const current = slides[step];

  return (
    <div style={{
      flex: 1,
      padding: "60px 40px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      background: `linear-gradient(135deg, #FAF8F5 0%, rgba(237, 228, 247, 0.3) 100%)`,
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{
        position: "absolute",
        top: 40,
        left: 40,
        display: "flex",
        alignItems: "center",
        gap: 12,
        zIndex: 10
      }}>
        <img src="/bev_neutral.png" alt="Bev" style={{ height: 44, width: "auto" }} />
        <div style={{
          fontFamily: T.serif,
          fontSize: 26,
          fontWeight: 700,
          color: T.ink
        }}>Wovely</div>
      </div>

      {/* Animated story */}
      <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{
          fontFamily: T.serif,
          fontSize: 32,
          fontWeight: 700,
          color: T.ink,
          marginBottom: 12,
          lineHeight: 1.2,
          minHeight: 80
        }}>
          {current.title}
        </h2>
        <p style={{
          fontFamily: T.sans,
          fontSize: 15,
          color: T.ink2,
          lineHeight: 1.6,
          marginBottom: 32,
          minHeight: 50
        }}>
          {current.subtitle}
        </p>

        {/* Visual */}
        <div style={{ marginBottom: 24, minHeight: 160 }}>
          {current.visual}
        </div>
      </div>

      {/* Progress dots */}
      <div style={{
        position: "absolute",
        bottom: 50,
        display: "flex",
        gap: 12,
        justifyContent: "center"
      }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: i === step ? 32 : 8,
              height: 8,
              borderRadius: 4,
              background: i === step ? T.terra : "#EDE4F7",
              transition: "all 300ms ease",
              cursor: "pointer"
            }}
            onClick={() => setStep(i)}
          />
        ))}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

/* ── Mobile Preview: Value Flow ── */
const MobileValueFlow = () => {
  return (
    <div style={{
      padding: "40px 20px",
      background: `linear-gradient(135deg, #FAF8F5 0%, rgba(237, 228, 247, 0.3) 100%)`,
      textAlign: "center"
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginBottom: 32
      }}>
        <img src="/bev_neutral.png" alt="Bev" style={{ height: 40, width: "auto" }} />
        <div style={{
          fontFamily: T.serif,
          fontSize: 24,
          fontWeight: 700,
          color: T.ink
        }}>Wovely</div>
      </div>

      {/* Main value prop */}
      <h2 style={{
        fontFamily: T.serif,
        fontSize: 26,
        fontWeight: 700,
        color: T.ink,
        marginBottom: 24,
        lineHeight: 1.2
      }}>
        All your patterns.<br />One home.<br />Real progress.
      </h2>

      {/* Value flow */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        marginBottom: 24
      }}>
        <div style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(155,126,200,0.2)",
          borderRadius: 12,
          padding: 16,
          textAlign: "left"
        }}>
          <div style={{
            fontSize: 24,
            marginBottom: 8
          }}>📱 Upload Anywhere</div>
          <div style={{
            fontSize: 13,
            color: T.ink2,
            lineHeight: 1.5
          }}>
            PDF, link, or type it in. From your phone, laptop, anywhere. We handle it.
          </div>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(155,126,200,0.2)",
          borderRadius: 12,
          padding: 16,
          textAlign: "left"
        }}>
          <div style={{
            fontSize: 24,
            marginBottom: 8
          }}>✓ Track Row by Row</div>
          <div style={{
            fontSize: 13,
            color: T.ink2,
            lineHeight: 1.5
          }}>
            Never lose your place. Track every stitch. See progress in real time.
          </div>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(155,126,200,0.2)",
          borderRadius: 12,
          padding: 16,
          textAlign: "left"
        }}>
          <div style={{
            fontSize: 24,
            marginBottom: 8
          }}>🔄 Sync Everything</div>
          <div style={{
            fontSize: 13,
            color: T.ink2,
            lineHeight: 1.5
          }}>
            Work on your phone, continue on desktop. Progress saves instantly.
          </div>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(155,126,200,0.2)",
          borderRadius: 12,
          padding: 16,
          textAlign: "left"
        }}>
          <div style={{
            fontSize: 24,
            marginBottom: 8
          }}>👯 Share Your Build</div>
          <div style={{
            fontSize: 13,
            color: T.ink2,
            lineHeight: 1.5
          }}>
            Show friends your patterns. Organize group MKALs together.
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Auth Form Component ── */
const AuthForm = ({ onEnter, onEnterAsNew, onTryAnonymous }) => {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [isSignIn, setIsSignIn] = useState(false);

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

  const onKey = e => {
    if (e.key === "Enter" && !loading) {
      isSignIn ? handleSignin() : handleSignup();
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
      {/* Auth Toggle */}
      <div style={{
        display: "flex",
        gap: 0,
        marginBottom: 32,
        borderRadius: 12,
        padding: 4,
        background: T.surface
      }}>
        <button
          onClick={() => { setIsSignIn(false); setAuthError(null); }}
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
          Try Free
        </button>
        <button
          onClick={() => { setIsSignIn(true); setAuthError(null); }}
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
          Sign In
        </button>
      </div>

      {/* Heading */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: T.serif,
          fontSize: 28,
          fontWeight: 700,
          color: T.terra,
          marginBottom: 8,
          lineHeight: 1.2
        }}>
          {isSignIn ? "Welcome back" : "Upload your first pattern"}
        </h1>
        <p style={{
          fontFamily: T.sans,
          fontSize: 15,
          color: T.ink2,
          lineHeight: 1.6
        }}>
          {isSignIn
            ? "Pick up where you left off."
            : "Free: Upload and organize patterns. Track progress. Share builds."}
        </p>
      </div>

      {/* Try Free Button */}
      {!isSignIn && onTryAnonymous && (
        <>
          <button
            onClick={onTryAnonymous}
            style={{
              width: "100%",
              padding: "12px 16px",
              marginBottom: 16,
              background: T.terra,
              color: "#FFFFFF",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: T.sans,
              cursor: "pointer",
              transition: "all 200ms",
              boxShadow: "0 2px 8px rgba(155,126,200,0.2)"
            }}
            onMouseEnter={(e) => e.target.style.boxShadow = "0 4px 12px rgba(155,126,200,0.3)"}
            onMouseLeave={(e) => e.target.style.boxShadow = "0 2px 8px rgba(155,126,200,0.2)"}
          >
            Try free — no credit card
          </button>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "16px 0 20px"
          }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <div style={{ fontSize: 12, color: T.ink2, whiteSpace: "nowrap" }}>or create account</div>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>
        </>
      )}

      {/* Form */}
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
          onFocus={(e) => e.target.style.borderColor = T.terra}
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
          onFocus={(e) => e.target.style.borderColor = T.terra}
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
            onFocus={(e) => e.target.style.borderColor = T.terra}
            onBlur={(e) => e.target.style.borderColor = T.border}
          />
        )}

        {authError && (
          <div style={{
            background: T.surface,
            color: T.terra,
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
            marginBottom: 16,
            background: T.terra,
            color: "#FFFFFF",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            fontFamily: T.sans,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "all 200ms",
            boxShadow: "0 2px 8px rgba(155,126,200,0.2)"
          }}
          onMouseEnter={(e) => !loading && (e.target.style.boxShadow = "0 4px 12px rgba(155,126,200,0.3)")}
          onMouseLeave={(e) => e.target.style.boxShadow = "0 2px 8px rgba(155,126,200,0.2)"}
        >
          {loading ? "Please wait..." : (isSignIn ? "Sign in" : "Create account")}
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

      {/* Footer */}
      <div style={{
        marginTop: 24,
        textAlign: "center",
        fontSize: 12,
        color: T.ink2,
        fontFamily: T.sans
      }}>
        ✓ Free forever on the basics • Upload, track, share
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
        #__ph_survey_widget, div[class*="PostHog"], div[id*="posthog"], .__ph_toolbar {
          display: none !important;
        }
      `}</style>

      {isMobile ? <MobileValueFlow /> : <DesktopLanding />}
      <AuthForm onEnter={onEnter} onEnterAsNew={onEnterAsNew} onTryAnonymous={onTryAnonymous} />
    </div>
  );
};

export default Auth;
