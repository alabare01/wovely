import { useState, useEffect, useRef } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import { supabaseAuth, getSession, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

/* ── Typewriter hook ── */
const BEV_LINES = [
  "Row 12 looks tight \u2014 loosen your tension before you continue.",
  "You\u2019ve got 3 patterns on the go. Want to pick up where you left off?",
  "That\u2019s a Moss Stitch \u2014 I\u2019ve got a tutorial if you need a refresher. \uD83E\uDDF6",
  "Your Floral Burst is 47% done. You\u2019ve got this!",
  "BevCheck found a yarn change note on row 24 \u2014 heads up!",
];
const useTypewriter = (lines, typeSpeed = 38, deleteSpeed = 18, pauseEnd = 2200, pauseBetween = 400) => {
  const [text, setText] = useState("");
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const line = lines[lineIdx];
    if (!deleting && charIdx <= line.length) {
      if (charIdx === line.length) {
        const t = setTimeout(() => setDeleting(true), pauseEnd);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => { setText(line.slice(0, charIdx + 1)); setCharIdx(c => c + 1); }, typeSpeed);
      return () => clearTimeout(t);
    }
    if (deleting && charIdx >= 0) {
      if (charIdx === 0) {
        const t = setTimeout(() => { setDeleting(false); setLineIdx(i => (i + 1) % lines.length); }, pauseBetween);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => { setText(line.slice(0, charIdx - 1)); setCharIdx(c => c - 1); }, deleteSpeed);
      return () => clearTimeout(t);
    }
  }, [charIdx, deleting, lineIdx, lines, typeSpeed, deleteSpeed, pauseEnd, pauseBetween]);
  return text;
};

/* ── Shared Styles ── */
const TAG = (bg, color) => ({
  display: "inline-block", background: bg, color, borderRadius: 20,
  padding: "2px 8px", fontSize: 10, fontWeight: 600, lineHeight: 1.4,
});
const LBL = { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.8px", color: "#9B7EC8", fontWeight: 600, fontFamily: "Inter,sans-serif" };
const CARD_SHELL = { background: "rgba(255,255,255,0.84)", border: "1px solid rgba(155,126,200,0.18)", borderRadius: 14, overflow: "hidden" };
const CARD_LABEL = { fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#9B7EC8", marginBottom: 4, fontFamily: "'Inter', sans-serif" };
const CARD_TITLE = { fontSize: 14, fontWeight: 700, color: "#2D2D4E", lineHeight: 1.3, marginBottom: 2, fontFamily: "'Playfair Display', serif" };
const CARD_SUBTITLE = { fontSize: 11, color: "#6B6B8A", lineHeight: 1.4 };
const CARD_PILL = { fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 20, background: "#F8F6FF", color: "#6B6B8A", border: "1px solid #EDE4F7", whiteSpace: "nowrap" };
const BADGE = { width: 32, height: 32, flexShrink: 0 };
const INPUT_STYLE = {
  width: "100%", height: 41, padding: "0 14px", background: "#F8F6FF",
  border: "1px solid #EDE4F7", borderRadius: 10, fontSize: 13,
  color: "#2D2D4E", outline: "none", boxSizing: "border-box",
  transition: "border-color .15s",
};

/* ── Left Column: Product Preview ── */
const ProductPreview = () => {
  const bevText = useTypewriter(BEV_LINES);

  return (
    <div style={{ padding: "40px 36px 16px", boxSizing: "border-box" }}>
      <style>{`@keyframes drawScore{from{stroke-dashoffset:87.96}to{stroke-dashoffset:2.64}}@keyframes bevPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,0.4)}50%{box-shadow:0 0 0 8px rgba(255,255,255,0)}}@keyframes cursorBlink{0%,100%{opacity:1}50%{opacity:0}}@media(min-width:768px){.pill-desktop-only{display:inline-block!important}}`}</style>

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <img src="/bev_neutral.png" alt="Bev" style={{ height: 56, width: "auto", objectFit: "contain" }} />
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 32, fontWeight: 700, color: "#2D3A7C" }}>Wovely</div>
      </div>

      {/* ── TIER BADGES ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ background: "rgba(92,158,122,0.12)", border: "1px solid rgba(92,158,122,0.25)", borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#5C9E7A", textTransform: "uppercase", letterSpacing: "0.5px" }}>Free</span>
          <span style={{ fontSize: 11, color: "#5C9E7A" }}>5 patterns</span>
        </div>
        <div style={{ background: "rgba(201,133,58,0.12)", border: "1px solid rgba(201,133,58,0.25)", borderRadius: 20, padding: "6px 14px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#C9853A", textTransform: "uppercase", letterSpacing: "0.5px" }}>Craft</span>
          <span style={{ fontSize: 11, color: "#C9853A" }}>100 patterns • $6.99/mo</span>
        </div>
      </div>

      {/* Headline */}
      <div style={{ fontFamily: T.serif, fontSize: 28, fontWeight: 700, color: "#2D2D4E", lineHeight: 1.2, marginBottom: 8, textWrap: "balance" }}>
        Crochet patterns, finally organized.
      </div>
      <div style={{ fontSize: 14, color: "#6B6B8A", lineHeight: 1.6, marginBottom: 24 }}>
        Import from anywhere, track every row, organize your whole collection. Free tier or unlimited with Craft.
      </div>

      {/* ── HERO PATTERN CARD ── */}
      <div style={{ ...CARD_SHELL, display: "flex", flexDirection: "row", height: 160 }}>
        <div style={{ width: 140, flexShrink: 0, position: "relative", overflow: "hidden", alignSelf: "stretch", borderRadius: "13px 0 0 13px" }}>
          <img src="/manatee_hero.png" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(12px)", transform: "scale(1.15)", opacity: 0.85 }} />
          <img src="/manatee_hero.png" alt="" style={{ position: "relative", width: "100%", height: "100%", objectFit: "contain", zIndex: 1 }} />
        </div>
        <div style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.84)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={CARD_LABEL}>NOW CRAFTING</div>
            <div style={{ ...CARD_TITLE, fontSize: 16 }}>Marina the Manatee</div>
            <div style={CARD_SUBTITLE}>Beth Folchetti (Mama Crochetti)</div>
            <div style={{ ...CARD_SUBTITLE, marginTop: 2 }}>Round 22 of 30 &middot; In progress</div>
          </div>
          <div>
            <div style={{ height: 4, borderRadius: 2, background: "#EDE4F7" }}>
              <div style={{ width: "73%", height: "100%", borderRadius: 2, background: "#9B7EC8" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={CARD_SUBTITLE}>73% complete</span>
              <span style={CARD_SUBTITLE}>85 rows</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              <span style={{ ...CARD_PILL }}>PDF imported</span>
              <span style={{ ...CARD_PILL }}>85 rows</span>
              <span className="pill-desktop-only" style={{ ...CARD_PILL, display: "none" }}>Yarn stash</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── TWO MAGAZINE CARDS SIDE BY SIDE ── */}
      <div style={{ display: "flex", flexDirection: "row", gap: 10, marginTop: 12 }}>

        {/* LEFT — BevCheck */}
        <div style={{ background: "rgba(255,255,255,0.84)", border: "1px solid rgba(155,126,200,0.18)", borderRadius: 12, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 160, height: "auto" }}>
          <img src="/mommy_fiora.png" alt="" style={{ width: "100%", height: 140, objectFit: "cover", objectPosition: "50% 20%", borderRadius: "12px 12px 0 0", display: "block" }} />
          <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, minHeight: 0 }}>
            <div>
              <div style={CARD_LABEL}>BEVCHECK</div>
              <div style={CARD_TITLE}>Mommy Fiora</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...CARD_SUBTITLE, flex: 1 }}>Pattern reviewed</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                <svg viewBox="0 0 100 55" style={{ width: 48, height: 26, display: "block" }}>
                  <defs>
                    <linearGradient id="miniGaugeGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#EDE4F7" />
                      <stop offset="100%" stopColor="#9B7EC8" />
                    </linearGradient>
                  </defs>
                  <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke="#EDE4F7" strokeWidth="6" strokeLinecap="round" />
                  <path d="M 8 50 A 42 42 0 0 1 92 50" fill="none" stroke="url(#miniGaugeGrad)" strokeWidth="6" strokeLinecap="round" />
                  <g style={{ transform: "rotate(-38deg)", transformOrigin: "50px 50px" }}>
                    <line x1="50" y1="50" x2="50" y2="18" stroke="#9B7EC8" strokeWidth="2" strokeLinecap="round" />
                  </g>
                  <circle cx="50" cy="50" r="3" fill="#9B7EC8" />
                </svg>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#9B7EC8", fontFamily: "'Inter', sans-serif" }}>Issues Found</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Stitch-O-Vision */}
        <div style={{ background: "rgba(255,255,255,0.84)", border: "1px solid rgba(155,126,200,0.18)", borderRadius: 12, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 160, height: "auto" }}>
          <img src="https://vbtsdyxvqqwxjzpuseaf.supabase.co/storage/v1/object/public/pattern-files/stitch-vision/6e1a02d9-c210-4bc4-968e-dde3435565d1/1775515182975.jpg" alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: "12px 12px 0 0", display: "block" }} />
          <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, minHeight: 0 }}>
            <div>
              <div style={{ ...CARD_LABEL, whiteSpace: "nowrap", fontSize: 8 }}>STITCH-O-VISION</div>
              <div style={CARD_TITLE}>Moss Stitch</div>
              <div style={CARD_SUBTITLE}>Linen &middot; Granite Stitch</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...CARD_SUBTITLE, flex: 1 }}>High confidence</span>
              <svg width={BADGE.width} height={BADGE.height} viewBox="0 0 32 32" style={{ flexShrink: BADGE.flexShrink }}>
                <circle cx="16" cy="16" r="15" fill="#5B9B6B" />
                <text x="16" y="17" textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: 11, fontWeight: 700, fill: "#fff" }}>91%</text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ── BEV CARD ── */}
      <div style={{ background: "#9B7EC8", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", flexShrink: 0, overflow: "hidden", animation: "bevPulse 2s ease-in-out infinite", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/bev_neutral.png" alt="Bev" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: "50%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#fff", marginBottom: 2 }}>Bev</div>
          <div style={{ fontSize: 12, color: "#fff", fontStyle: "italic", minHeight: 16, lineHeight: 1.5 }}>
            <span>{bevText}</span><span style={{ display: "inline-block", width: 2, height: 12, background: "#fff", marginLeft: 1, verticalAlign: "text-bottom", animation: "cursorBlink 1s step-end infinite" }} />
          </div>
        </div>
      </div>

      {/* ── APP BADGES ── */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1, background: "#fff", border: "1px solid #EDE4F7", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, opacity: 0.5, cursor: "default" }}>
          <svg width="22" height="26" viewBox="0 0 384 512" fill="#000"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
          <div><div style={{ fontSize: 9, color: "#6B6B8A" }}>Download on the</div><div style={{ fontSize: 12, fontWeight: 600, color: "#2D2D4E" }}>App Store</div><div style={{ fontSize: 10, color: "#9B7EC8" }}>Coming soon</div></div>
        </div>
        <div style={{ flex: 1, background: "#fff", border: "1px solid #EDE4F7", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, opacity: 0.5, cursor: "default" }}>
          <svg width="22" height="24" viewBox="0 0 512 512"><path d="M93.6 28.3l187.2 107.5L93.6 483.7c-5.1-4.4-8.2-10.8-8.2-18V46.3c0-7.2 3.1-13.6 8.2-18z" fill="#4285F4"/><path d="M116.3 11.3L330 135.8 282.4 256 116.3 11.3z" fill="#34A853"/><path d="M116.3 500.7L282.4 256l47.6 120.2-213.7 124.5z" fill="#EA4335"/><path d="M345.6 256l80.8-46.4c14.3-8.2 14.3-28.9 0-37.2L345.6 126l-52.8 130 52.8 130z" fill="#FBBC05"/></svg>
          <div><div style={{ fontSize: 9, color: "#6B6B8A" }}>Get it on</div><div style={{ fontSize: 12, fontWeight: 600, color: "#2D2D4E" }}>Google Play</div><div style={{ fontSize: 10, color: "#9B7EC8" }}>Coming soon</div></div>
        </div>
      </div>
    </div>
  );
};

/* ── Right Column: Signup Form ── */
const SignupForm = ({ onEnter, onEnterAsNew, onTryAnonymous }) => {
  const [mode, setMode] = useState("form"); // "form" | "signin" | "magic"
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [magicSent, setMagicSent] = useState(false);

  const handleSignup = async () => {
    setAuthError(null);
    if (!email.trim() || !pass) { setAuthError("Please fill in all fields."); return; }
    if (pass !== confirmPass) { setAuthError("Passwords don\u2019t match."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabaseAuth.signUp(email.trim(), pass);
      if (error) { setAuthError(error.msg || error.error_description || error.message || "Sign-up failed."); setLoading(false); return; }
      onEnterAsNew();
    } catch { setAuthError("Network error \u2014 please try again."); }
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
    } catch { setAuthError("Network error \u2014 please try again."); }
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
    } catch { setAuthError("Network error \u2014 please try again."); }
    setLoading(false);
  };

  const onKey = e => { if (e.key === "Enter" && !loading) { if (mode === "magic") handleMagicLink(); else if (mode === "signin") handleSignin(); else handleSignup(); } };

  const inputFocus = e => { e.target.style.borderColor = "#9B7EC8"; };
  const inputBlur = e => { e.target.style.borderColor = "#EDE4F7"; };

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 40px", maxWidth: 400, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      {/* Heading */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 700, color: "#2D2D4E", marginBottom: 8 }}>
          {mode === "signin" ? "Welcome back." : "Pick your tier"}
        </div>
        <div style={{ fontSize: 13, color: "#6B6B8A", lineHeight: 1.5 }}>
          {mode === "signin" ? "Your Wovely is waiting." : "Free (5 patterns) always free. Craft ($6.99/mo) for 100 patterns + BevCheck + Collections."}
        </div>
      </div>

      {/* Tier Selection (only on signup) */}
      {mode !== "signin" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button style={{ flex: 1, padding: "14px 16px", border: "2px solid #5C9E7A", borderRadius: 12, background: "#fff", cursor: "pointer", transition: "all 200ms", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <div style={{ fontWeight: 700, color: "#5C9E7A", fontSize: 13 }}>Free</div>
            <div style={{ fontSize: 11, color: "#6B6B8A" }}>5 patterns, always free</div>
          </button>
          <button style={{ flex: 1, padding: "14px 16px", border: "2px solid #9B7EC8", borderRadius: 12, background: "rgba(155,126,200,0.08)", cursor: "pointer", transition: "all 200ms", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <div style={{ fontWeight: 700, color: "#9B7EC8", fontSize: 13 }}>Craft</div>
            <div style={{ fontSize: 11, color: "#6B6B8A" }}>100 patterns + more</div>
            <div style={{ fontSize: 10, color: "#C9853A", fontWeight: 600, marginTop: 2 }}>7-day free trial</div>
          </button>
        </div>
      )}

      {/* Try it free — no-signup entry to the app shell */}
      {onTryAnonymous && (
        <>
          <button
            onClick={onTryAnonymous}
            style={{
              width: "100%", height: 43, background: "#9B7EC8", color: "#fff",
              border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600,
              fontFamily: "Inter,sans-serif", cursor: "pointer",
            }}
          >Try it free — no signup required</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0 18px" }}>
            <div style={{ flex: 1, height: 1, background: "#EDE4F7" }} />
            <div style={{ fontSize: 11, color: "#6B6B8A", whiteSpace: "nowrap" }}>or sign up to save your work</div>
            <div style={{ flex: 1, height: 1, background: "#EDE4F7" }} />
          </div>
        </>
      )}

      {/* Magic link sent */}
      {mode === "magic" && magicSent ? (
        <div style={{ background: "rgba(92,158,122,0.08)", borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>&#9993;</div>
          <div style={{ fontFamily: T.serif, fontSize: 17, fontWeight: 700, color: "#5C9E7A", marginBottom: 4 }}>Check your inbox</div>
          <div style={{ fontSize: 12, color: "#6B6B8A", lineHeight: 1.6 }}>We sent a magic link to <strong>{email}</strong>. Click it to sign in.</div>
          <button onClick={() => { setMode("form"); setMagicSent(false); setAuthError(null); }} style={{ background: "none", border: "none", color: "#9B7EC8", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 12 }}>&larr; Back</button>
        </div>
      ) : mode === "magic" ? (
        /* Magic link form */
        <div onKeyDown={onKey}>
          <div style={{ marginBottom: 12 }}>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" type="email" style={INPUT_STYLE} onFocus={inputFocus} onBlur={inputBlur} />
          </div>
          {authError && <div style={{ background: "#EDE4F7", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#9B7EC8", marginBottom: 10 }}>{authError}</div>}
          <button onClick={handleMagicLink} disabled={loading} style={{ width: "100%", height: 43, background: "#9B7EC8", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Sending\u2026" : "Send magic link \u2192"}
          </button>
          <button onClick={() => { setMode("form"); setAuthError(null); }} style={{ width: "100%", background: "none", border: "none", color: "#6B6B8A", fontSize: 12, cursor: "pointer", marginTop: 10 }}>&larr; Back to email &amp; password</button>
        </div>
      ) : (
        /* Email + password form */
        <div onKeyDown={onKey}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" type="email" style={INPUT_STYLE} onFocus={inputFocus} onBlur={inputBlur} />
            <input value={pass} onChange={e => setPass(e.target.value)} placeholder={mode === "signin" ? "Password" : "Create a password"} type="password" style={INPUT_STYLE} onFocus={inputFocus} onBlur={inputBlur} />
            {mode !== "signin" && (
              <input value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Confirm password" type="password" style={INPUT_STYLE} onFocus={inputFocus} onBlur={inputBlur} />
            )}
          </div>
          {authError && <div style={{ background: "#EDE4F7", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#9B7EC8", marginBottom: 10 }}>{authError}</div>}
          <button onClick={mode === "signin" ? handleSignin : handleSignup} disabled={loading} style={{
            width: "100%", height: 52, background: "#9B7EC8", color: "#fff", border: "none", borderRadius: 12,
            fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1,
            transition: "all 200ms", boxShadow: "0 4px 12px rgba(155,126,200,0.3)",
            animation: "pulse-button 2s ease-in-out infinite"
          }}>
            {loading ? "Please wait\u2026" : mode === "signin" ? "Sign in \u2192" : "Start free today"}
          </button>
          <style>{`
            @keyframes pulse-button {
              0%, 100% { box-shadow: 0 4px 12px rgba(155,126,200,0.3); }
              50% { box-shadow: 0 4px 24px rgba(155,126,200,0.5); }
            }
          `}</style>

          {/* Magic link toggle */}
          <button onClick={() => { setMode("magic"); setAuthError(null); }} style={{ width: "100%", height: 38, background: "transparent", border: "1px solid #EDE4F7", borderRadius: 10, fontSize: 12.5, color: "#6B6B8A", cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>&#9993;</span> Send me a magic link instead
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#EDE4F7" }} />
            <div style={{ fontSize: 11, color: "#6B6B8A", whiteSpace: "nowrap" }}>or continue with</div>
            <div style={{ flex: 1, height: 1, background: "#EDE4F7" }} />
          </div>

          {/* Social sign-in */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => supabaseAuth.signInWithOAuth("google")} style={{ width: "100%", height: 42, background: "#fff", border: "1px solid #EDE4F7", borderRadius: 10, fontSize: 13, fontWeight: 500, color: "#2D2D4E", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 000 24c0 3.77.9 7.35 2.56 10.53l7.97-5.94z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.94C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 20, textAlign: "center" }}>
        {mode === "signin" ? (
          <div style={{ fontSize: 11.5 }}>
            <span style={{ color: "#6B6B8A" }}>Don&apos;t have an account? </span>
            <span onClick={() => { setMode("form"); setAuthError(null); }} style={{ color: "#9B7EC8", cursor: "pointer", fontWeight: 600 }}>Sign up &rarr;</span>
          </div>
        ) : (
          <div style={{ fontSize: 11.5 }}>
            <span style={{ color: "#6B6B8A" }}>Already have an account? </span>
            <span onClick={() => { setMode("signin"); setAuthError(null); }} style={{ color: "#9B7EC8", cursor: "pointer", fontWeight: 600 }}>Sign in &rarr;</span>
          </div>
        )}
        <div style={{ fontSize: 11, color: "#9B9BAA", marginTop: 10 }}>✓ Trusted by 500+ crocheters • No credit card required</div>
      </div>
    </div>
  );
};

/* ── Sticky Mobile Scroll CTA ── */
const MobileCTA = ({ signupRef }) => {
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    if (!signupRef?.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFormVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(signupRef.current);
    return () => observer.disconnect();
  }, [signupRef]);

  const show = !formVisible;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 80,
      background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      padding: "14px 20px", borderTop: "2px solid #EDE4F7", borderRadius: "16px 16px 0 0",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transform: show ? "translateY(0)" : "translateY(100%)",
      transition: "transform 300ms ease",
      pointerEvents: show ? "auto" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: "#F8F6FF", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <img src="/bev_neutral.png" alt="" style={{ width: 36, height: 36, objectFit: "contain" }} />
        </div>
        <span style={{ fontFamily: "Inter,sans-serif", fontSize: 14, fontWeight: 600, color: "#2D2D4E" }}>Start free. Craft tier available.</span>
      </div>
      <button onClick={() => signupRef?.current?.scrollIntoView({ behavior: "smooth" })} style={{ background: "#9B7EC8", color: "#fff", fontSize: 14, fontWeight: 700, borderRadius: 8, padding: "10px 20px", border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, boxShadow: "0 2px 8px rgba(155,126,200,0.3)" }}>Get started ↓</button>
    </div>
  );
};

/* ── Main Auth Component ── */
const Auth = ({ onEnter, onEnterAsNew, onTryAnonymous }) => {
  const { isDesktop, isMobile } = useBreakpoint();
  const signupRef = useRef(null);

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", alignItems: "stretch", fontFamily: T.sans }}>
    <style>{`
      @media(min-width:768px){.wovely-mobile-cta{display:none!important;}}
      /* Hide third-party floating widgets (PostHog toolbar, surveys, etc.) on landing page */
      #__ph_survey_widget,div[class*="PostHog"],div[id*="posthog"],.__ph-toolbar{display:none!important;}
    `}</style>
    <div style={{ maxWidth: 1280, width: "100%", margin: "0 auto", display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: "100vh" }}>
      {/* Left — Product Preview */}
      <div style={{
        flex: isMobile ? "none" : 1.15,
        background: "transparent",
        overflow: "auto",
        display: "flex", flexDirection: "column", justifyContent: "center",
        position: "relative",
        ...(isMobile ? {} : { minHeight: "100vh" }),
      }}>
        <ProductPreview />
      </div>

      {/* Right — Signup Form */}
      <div style={{
        flex: isMobile ? "none" : 0.85,
        background: "transparent",
        borderLeft: isMobile ? "none" : "1px solid rgba(255,255,255,0.45)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: isMobile ? "20px 16px 80px" : 0,
        ...(isMobile ? { minHeight: "auto" } : { minHeight: "100vh" }),
      }}>
        <div ref={signupRef} style={{
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.45)",
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(45,58,124,0.08)",
          maxWidth: 480,
          width: "100%",
        }}>
          <SignupForm onEnter={onEnter} onEnterAsNew={onEnterAsNew} onTryAnonymous={onTryAnonymous} />
        </div>
      </div>
    </div>
    <div className="wovely-mobile-cta"><MobileCTA signupRef={signupRef} /></div>
    </div>
  );
};

export default Auth;
