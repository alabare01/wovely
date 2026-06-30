import { useState, useEffect } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import { supabaseAuth } from "./supabase.js";

/* ── Desktop: Feature Showcase with REAL App Mockups ── */
const DesktopShowcase = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 3);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const slides = [
    {
      title: "Your patterns in one place.",
      subtitle: "Upload from phone, desktop, anywhere. We handle PDF, links, manual entry.",
      mockup: (
        <div style={{
          maxWidth: 340,
          margin: "0 auto"
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12
          }}>
            {[
              {
                title: "My Finished Amigurumi",
                author: "Completed projects",
                type: "Stuffed toys & creatures",
                pct: 100,
                img: "/mommy_fiora.png"
              },
              {
                title: "Marina the Manatee",
                author: "by craftybee",
                type: "Amigurumi",
                pct: 100,
                img: "/manatee_hero.png"
              }
            ].map((p, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.85)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(155,126,200,0.2)",
                borderRadius: 16,
                overflow: "hidden",
                animation: `slideUp 600ms ease-out ${i * 100}ms both`
              }}>
                <div style={{
                  height: 100,
                  background: `url('${p.img}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  position: "relative"
                }}>
                  {p.pct === 100 && (
                    <div style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      background: T.sage,
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 99
                    }}>DONE</div>
                  )}
                  {p.pct > 0 && p.pct < 100 && (
                    <>
                      <div style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "rgba(0,0,0,0.5)",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: 99
                      }}>{p.pct}%</div>
                      <div style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        background: "#EDE4F7"
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${p.pct}%`,
                          background: T.terra
                        }} />
                      </div>
                    </>
                  )}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{
                    fontFamily: T.serif,
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.ink
                  }}>{p.title}</div>
                  <div style={{
                    fontSize: 11,
                    color: T.terra,
                    fontWeight: 600,
                    marginTop: 3
                  }}>{p.pct}% complete</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{
            fontSize: 11,
            color: T.ink2,
            textAlign: "center"
          }}>✓ All patterns synced across your devices</div>
        </div>
      )
    },
    {
      title: "Track every stitch. Never lose your place.",
      subtitle: "Row-by-row tracking with visual progress. Complex patterns become manageable.",
      mockup: (
        <div style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(155,126,200,0.2)",
          borderRadius: 16,
          padding: 16,
          maxWidth: 340,
          margin: "0 auto",
          animation: "slideUp 600ms ease-out"
        }}>
          <div style={{
            fontFamily: T.serif,
            fontSize: 13,
            fontWeight: 700,
            color: T.ink,
            marginBottom: 4
          }}>Marina the Manatee</div>
          <div style={{
            fontSize: 11,
            color: T.ink2,
            marginBottom: 12,
            fontWeight: 400
          }}>by craftybee • Amigurumi</div>
          <div style={{
            fontFamily: T.serif,
            fontSize: 12,
            fontWeight: 700,
            color: T.terra,
            marginBottom: 12
          }}>Round 22 of 30</div>
          {[
            { row: "Rnd 21", text: "(sc, dc) x 12", done: true },
            { row: "Rnd 22", text: "(sc, inc) x 12", done: false },
            { row: "Rnd 23", text: "sc in each st", done: false }
          ].map((r, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom: i < 2 ? `1px solid ${T.border}` : "none",
              opacity: r.done ? 0.6 : 1
            }}>
              <input
                type="checkbox"
                checked={r.done}
                readOnly
                style={{
                  width: 18,
                  height: 18,
                  cursor: "pointer",
                  accentColor: T.terra
                }}
              />
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: T.ink,
                minWidth: 40
              }}>{r.row}</div>
              <div style={{
                fontSize: 11,
                color: T.ink2,
                fontFamily: T.sans,
                flex: 1
              }}>{r.text}</div>
            </div>
          ))}
          <div style={{
            fontSize: 10,
            color: T.terra,
            fontWeight: 600,
            marginTop: 12,
            textAlign: "center"
          }}>Progress: 73% (22 of 30 rounds)</div>
        </div>
      )
    },
    {
      title: "Organize multi-part projects. See it all at once.",
      subtitle: "12-clue MKAL? Unify materials, track each clue, see your progress together.",
      mockup: (
        <div style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(155,126,200,0.2)",
          borderRadius: 16,
          padding: 16,
          maxWidth: 340,
          margin: "0 auto",
          animation: "slideUp 600ms ease-out"
        }}>
          <div style={{
            fontFamily: T.serif,
            fontSize: 13,
            fontWeight: 700,
            color: T.ink,
            marginBottom: 4
          }}>Spring MKAL 2025</div>
          <div style={{
            fontSize: 11,
            color: T.ink2,
            marginBottom: 12,
            fontWeight: 400
          }}>12-clue monthly CAL</div>
          <div style={{
            fontFamily: T.serif,
            fontSize: 12,
            fontWeight: 700,
            color: T.terra,
            marginBottom: 12
          }}>3 of 12 clues released</div>
          {[
            { name: "Clue 1: Foundation", progress: 100, done: true },
            { name: "Clue 2: Center Design", progress: 75, done: false },
            { name: "Clue 3: Border", progress: 40, done: false }
          ].map((clue, i) => (
            <div key={i} style={{ marginBottom: i < 2 ? 12 : 0 }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.ink
                }}>{clue.name}</div>
                <div style={{
                  fontSize: 10,
                  color: T.terra,
                  fontWeight: 600
                }}>{clue.progress}%</div>
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
                  transition: "width 0.3s"
                }} />
              </div>
            </div>
          ))}
          <div style={{
            fontSize: 10,
            color: T.terra,
            fontWeight: 600,
            marginTop: 12,
            textAlign: "center"
          }}>Shared: 850g yarn, 5.5mm hook</div>
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
      background: `url('/wovely_landing_bg_v1.png') center/cover no-repeat fixed, linear-gradient(135deg, #FAF8F5 0%, rgba(237, 228, 247, 0.3) 100%)`,
      backgroundBlendMode: "overlay",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Header with BIG BEV */}
      <div style={{
        position: "absolute",
        top: 40,
        left: 40,
        display: "flex",
        alignItems: "center",
        gap: 16,
        zIndex: 10
      }}>
        <img src="/bev_neutral.png" alt="Bev" style={{ height: 100, width: "auto" }} />
        <div style={{
          fontFamily: T.serif,
          fontSize: 32,
          fontWeight: 700,
          color: T.ink,
          display: "flex",
          flexDirection: "column"
        }}>
          <div>Wovely</div>
          <div style={{
            fontSize: 12,
            fontWeight: 400,
            color: T.terra,
            marginTop: 4
          }}>Your patterns. Your progress.</div>
        </div>
      </div>

      {/* Story + Mockup */}
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
          fontSize: 14,
          color: T.ink2,
          lineHeight: 1.6,
          marginBottom: 32,
          minHeight: 50
        }}>
          {current.subtitle}
        </p>

        {/* REAL MOCKUP */}
        <div style={{ marginBottom: 24, minHeight: 200 }}>
          {current.mockup}
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
        {[0, 1, 2].map((i) => (
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

/* ── Mobile: Real Feature Cards with VISUALS ── */
const MobileShowcase = () => {
  return (
    <div style={{
      padding: "40px 20px",
      background: `url('/wovely_landing_bg_v1.png') center/cover no-repeat fixed, linear-gradient(135deg, #FAF8F5 0%, rgba(237, 228, 247, 0.3) 100%)`,
      backgroundBlendMode: "overlay",
      minHeight: "100vh"
    }}>
      {/* Header with BIG BEV */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginBottom: 32
      }}>
        <img src="/bev_neutral.png" alt="Bev" style={{ height: 70, width: "auto" }} />
        <div style={{
          fontFamily: T.serif,
          fontSize: 22,
          fontWeight: 700,
          color: T.ink,
          display: "flex",
          flexDirection: "column"
        }}>
          <div>Wovely</div>
          <div style={{
            fontSize: 11,
            fontWeight: 400,
            color: T.terra,
            marginTop: 2
          }}>Your patterns. Your progress.</div>
        </div>
      </div>

      <h2 style={{
        fontFamily: T.serif,
        fontSize: 22,
        fontWeight: 700,
        color: T.ink,
        marginBottom: 24,
        lineHeight: 1.2,
        textAlign: "center"
      }}>
        Stop losing patterns.<br />Start tracking progress.
      </h2>

      {/* Feature cards with REAL IMAGES as <img> tags */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        marginBottom: 24
      }}>
        {[
          {
            title: "Upload from anywhere",
            author: "by yarn_dreams",
            type: "Granny Square",
            desc: "Phone, desktop, tablet. PDF, link, manual. We sync it all.",
            img: "/mommy_fiora.png"
          },
          {
            title: "Marina the Manatee",
            author: "by craftybee",
            type: "Amigurumi • Rnd 22 of 30",
            desc: "Track row by row. Never lose your place in a 100-page pattern.",
            detail: "73% complete",
            img: "/manatee_hero.png"
          },
          {
            title: "Spring MKAL 2025",
            author: "12-clue monthly CAL",
            type: "3 of 12 clues released",
            desc: "One collection. Shared materials. Unified progress.",
            img: "/mommy_fiora.png"
          },
          {
            title: "Finished projects",
            author: "by the community",
            type: "Showcase & share",
            desc: "Show friends what you're making. Celebrate your builds.",
            img: "/manatee_hero.png"
          }
        ].map((feature, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(155,126,200,0.2)",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(155,126,200,0.1)"
          }}>
            {feature.img && (
              <img
                src={feature.img}
                alt={feature.title}
                style={{
                  width: "100%",
                  height: 140,
                  objectFit: "contain",
                  objectPosition: "center",
                  display: "block",
                  background: "#fafbfc"
                }}
              />
            )}
            <div style={{ padding: 16 }}>
              <div style={{
                fontFamily: T.serif,
                fontSize: 15,
                fontWeight: 700,
                color: T.ink,
                marginBottom: 2
              }}>
                {feature.title}
              </div>
              <div style={{
                fontSize: 11,
                color: T.ink2,
                fontWeight: 400,
                marginBottom: 6
              }}>
                {feature.author}
              </div>
              <div style={{
                fontSize: 11,
                color: T.terra,
                fontWeight: 600,
                marginBottom: 8
              }}>
                {feature.type}
              </div>
              <div style={{
                fontSize: 13,
                color: T.ink2,
                lineHeight: 1.5,
                marginBottom: 8
              }}>
                {feature.desc}
              </div>
              {feature.detail && (
                <div style={{
                  fontSize: 11,
                  color: T.ink,
                  fontFamily: T.sans,
                  fontWeight: 600,
                  background: "rgba(155,126,200,0.06)",
                  padding: "6px 8px",
                  borderRadius: 4
                }}>
                  ✓ {feature.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        fontSize: 12,
        color: T.ink2,
        textAlign: "center",
        fontFamily: T.sans
      }}>
        ✓ Free forever on the basics • Upload, track, share
      </div>
    </div>
  );
};

/* ── Auth Form ── */
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
            : "Upload a pattern and see the magic. Track progress. Never lose your place."}
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

      {isMobile ? <MobileShowcase /> : <DesktopShowcase />}
      <AuthForm onEnter={onEnter} onEnterAsNew={onEnterAsNew} onTryAnonymous={onTryAnonymous} />
    </div>
  );
};

export default Auth;
