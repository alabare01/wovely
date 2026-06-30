import { useState, useEffect, useRef } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import { supabaseAuth } from "./supabase.js";

/* ── Animated Product Preview Component (Real Features) ── */
const AnimatedProductPreview = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 3);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
      {/* Wovely header */}
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

      {/* Feature carousel */}
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {step === 0 && (
          <div style={{ animation: "fadeIn 600ms ease-out", opacity: 1 }}>
            <h2 style={{
              fontFamily: T.serif,
              fontSize: 28,
              fontWeight: 700,
              color: T.ink,
              marginBottom: 28,
              textAlign: "center"
            }}>
              Save & Track Every Pattern
            </h2>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16
            }}>
              {/* Mock pattern cards */}
              {[
                { title: "Baby Blanket", pct: 75, img: "linear-gradient(135deg, rgba(155,126,200,0.15), rgba(155,126,200,0.05))" },
                { title: "Amigurumi Set", pct: 100, img: "linear-gradient(135deg, rgba(122,158,116,0.15), rgba(122,158,116,0.05))" },
                { title: "Market Bag", pct: 45, img: "linear-gradient(135deg, rgba(139,111,71,0.15), rgba(139,111,71,0.05))" },
                { title: "Scarf MKAL", pct: 20, img: "linear-gradient(135deg, rgba(185,134,11,0.15), rgba(185,134,11,0.05))" }
              ].map((p, i) => (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.85)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(155,126,200,0.2)",
                  borderRadius: 16,
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  animation: `slideUp 600ms ease-out ${i * 100}ms both`
                }}>
                  <div style={{
                    height: 120,
                    background: p.img,
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 12,
                    position: "relative"
                  }}>
                    {p.pct === 100 && (
                      <span style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: T.sage,
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 99
                      }}>DONE</span>
                    )}
                    {p.pct > 0 && p.pct < 100 && (
                      <div style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        background: "#EDE4F7",
                        overflow: "hidden"
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${p.pct}%`,
                          background: T.terra,
                          transition: "width 0.3s"
                        }} />
                      </div>
                    )}
                  </div>
                  <div style={{
                    padding: "12px 14px",
                    textAlign: "center"
                  }}>
                    <div style={{
                      fontFamily: T.serif,
                      fontSize: 14,
                      fontWeight: 700,
                      color: T.ink,
                      marginBottom: 4
                    }}>{p.title}</div>
                    <div style={{
                      fontSize: 12,
                      color: T.terra,
                      fontWeight: 600
                    }}>{p.pct}% complete</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ animation: "fadeIn 600ms ease-out", opacity: 1 }}>
            <h2 style={{
              fontFamily: T.serif,
              fontSize: 28,
              fontWeight: 700,
              color: T.ink,
              marginBottom: 28,
              textAlign: "center"
            }}>
              Bev Analyzes Your Patterns
            </h2>
            {/* BevCheck gauge mockup */}
            <div style={{
              background: "rgba(255,255,255,0.87)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.75)",
              borderRadius: 24,
              padding: "28px 24px",
              textAlign: "center",
              animation: "slideUp 600ms ease-out"
            }}>
              <span style={{
                display: "inline-block",
                fontFamily: T.sans,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: T.terra,
                padding: "3px 10px",
                borderRadius: 99,
                background: "rgba(155,126,200,0.12)",
                marginBottom: 12
              }}>BevCheck</span>

              <div style={{
                fontSize: 20,
                fontFamily: T.serif,
                fontWeight: 700,
                color: "#2D3A7C",
                marginBottom: 20
              }}>Pattern Quality</div>

              {/* Gauge SVG */}
              <svg viewBox="0 0 240 140" style={{ width: "100%", maxWidth: 240, margin: "0 auto 20px" }}>
                <defs>
                  <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#CEA0A4" />
                    <stop offset="50%" stopColor="#E2D985" />
                    <stop offset="100%" stopColor="#A4C2C3" />
                  </linearGradient>
                </defs>
                {/* Arc */}
                <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="#EDE4F7" strokeWidth="12" strokeLinecap="round" />
                <path d="M 20 120 A 100 100 0 0 1 220 120" fill="none" stroke="url(#gaugeGrad)" strokeWidth="12" strokeLinecap="round" opacity="0.85" />
                {/* Needle */}
                <g>
                  <line x1="120" y1="120" x2="160" y2="75" stroke={T.terra} strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="120" cy="120" r="6" fill={T.terra} />
                </g>
              </svg>

              <div style={{
                fontFamily: T.serif,
                fontSize: 36,
                fontWeight: 700,
                color: "#2D3A7C",
                marginBottom: 12,
                lineHeight: 1
              }}>85%</div>

              <div style={{
                fontFamily: T.serif,
                fontSize: 16,
                fontWeight: 600,
                color: "#2D3A7C",
                marginBottom: 14
              }}>Looks Good</div>

              <div style={{
                fontSize: 12,
                color: T.ink2,
                lineHeight: 1.5
              }}>Pattern structure is clear. One minor stitch count to verify in round 12.</div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ animation: "fadeIn 600ms ease-out", opacity: 1 }}>
            <h2 style={{
              fontFamily: T.serif,
              fontSize: 28,
              fontWeight: 700,
              color: T.ink,
              marginBottom: 28,
              textAlign: "center"
            }}>
              Organize Multi-Part Projects
            </h2>
            <div style={{
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(155,126,200,0.2)",
              borderRadius: 20,
              padding: "20px 18px",
              animation: "slideUp 600ms ease-out"
            }}>
              <div style={{
                fontFamily: T.serif,
                fontSize: 16,
                fontWeight: 700,
                color: T.ink,
                marginBottom: 16
              }}>Spring MKAL 2025</div>

              {[
                { name: "Clue 1: Base", progress: 100, done: true },
                { name: "Clue 2: Stripes", progress: 60, done: false },
                { name: "Clue 3: Border", progress: 0, done: false }
              ].map((clue, i) => (
                <div key={i} style={{
                  marginBottom: i < 2 ? 14 : 0
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6
                  }}>
                    <span style={{
                      fontSize: 13,
                      fontFamily: T.sans,
                      color: T.ink,
                      fontWeight: 600
                    }}>{clue.name}</span>
                    <span style={{
                      fontSize: 12,
                      color: T.terra,
                      fontWeight: 600
                    }}>{clue.progress}%</span>
                  </div>
                  <div style={{
                    height: 6,
                    background: "#EDE4F7",
                    borderRadius: 3,
                    overflow: "hidden"
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${clue.progress}%`,
                      background: clue.done ? T.sage : T.terra,
                      transition: "width 0.4s ease-out",
                      borderRadius: 3
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div style={{
        position: "absolute",
        bottom: 50,
        display: "flex",
        gap: 12,
        justifyContent: "center"
      }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: i === step ? 28 : 8,
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
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
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
          color: T.terra,
          marginBottom: 8,
          lineHeight: 1.2
        }}>
          {isSignIn ? "Welcome back" : "Your patterns, organized"}
        </h1>
        <p style={{
          fontFamily: T.sans,
          fontSize: 15,
          color: T.ink2,
          lineHeight: 1.6
        }}>
          {isSignIn
            ? "Pick up right where you left off."
            : "Free: 5 patterns. Craft: Unlimited tracking, Collections, and BevCheck pattern analysis."}
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
            Try free for 5 patterns
          </button>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "16px 0 20px"
          }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <div style={{ fontSize: 12, color: T.ink2, whiteSpace: "nowrap" }}>or create an account</div>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>
        </>
      )}

      {/* Email + password form */}
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
