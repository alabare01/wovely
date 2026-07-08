// NOTE: Supabase Storage bucket 'feedback-attachments' must be public. Create it manually in Supabase dashboard if it does not exist.
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { T, useBreakpoint } from "./theme.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY, getSession } from "./supabase.js";

const C = {
  lavender: T.accent,
  navy: T.ink,
  border: T.line,
  text: T.ink,
  sub: T.muted,
  surface: T.linen,
};

const inputBase = {
  width: "100%",
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 12,
  fontSize: 14,
  fontFamily: T.sans,
  color: C.text,
  outline: "none",
  boxSizing: "border-box",
  resize: "vertical",
  transition: "border-color .15s ease, box-shadow .15s ease",
};

const focusStyle = { borderColor: C.lavender, boxShadow: "0 0 0 3px rgba(123,106,212,0.15)" };
const blurStyle = { borderColor: C.border, boxShadow: "none" };

function Input({ rows = 3, placeholder, value, onChange, required }) {
  return (
    <textarea
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={inputBase}
      onFocus={e => Object.assign(e.target.style, focusStyle)}
      onBlur={e => Object.assign(e.target.style, blurStyle)}
    />
  );
}

function SeverityPills({ value, onChange }) {
  const opts = [
    { label: "Minor 🟡", value: "Minor" },
    { label: "Annoying 🟠", value: "Annoying" },
    { label: "Broken 🔴", value: "Broken" },
  ];
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8, fontFamily: T.sans }}>Severity</div>
      <div style={{ display: "flex", gap: 8 }}>
        {opts.map(o => {
          const sel = value === o.value;
          return (
            <button key={o.value} onClick={() => onChange(sel ? "" : o.value)} style={{
              background: sel ? C.lavender : "#fff",
              color: sel ? "#fff" : C.sub,
              border: `1px solid ${sel ? C.lavender : C.border}`,
              borderRadius: 99, padding: "6px 14px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: T.sans, transition: "all .15s ease",
            }}>{o.label}</button>
          );
        })}
      </div>
    </div>
  );
}

function getDeviceInfo() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox " + (ua.match(/Firefox\/([\d.]+)/)?.[1] || "");
  else if (ua.includes("Edg/")) browser = "Edge " + (ua.match(/Edg\/([\d.]+)/)?.[1] || "");
  else if (ua.includes("Chrome/")) browser = "Chrome " + (ua.match(/Chrome\/([\d.]+)/)?.[1] || "");
  else if (ua.includes("Safari/")) browser = "Safari " + (ua.match(/Version\/([\d.]+)/)?.[1] || "");
  const device = w < 768 ? "mobile" : w < 1100 ? "tablet" : "desktop";
  return { browser: browser.trim(), screenSize: `${w}x${h}`, device, page: window.location.pathname };
}

const CATEGORIES = [
  { label: "Bug 🐛", value: "Bug" },
  { label: "Idea 💡", value: "Idea" },
  { label: "Love it ❤️", value: "Love it" },
];

const FB_DRAFT_KEY = "wovely_feedback_draft";

export default function FeedbackWidget({ user }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(() => { try { const d=sessionStorage.getItem(FB_DRAFT_KEY); return d?JSON.parse(d).category||"":""; } catch { return ""; } });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const { isMobile } = useBreakpoint();

  // Bug fields — restore from draft
  const [bugWhat, setBugWhat] = useState(() => { try { return JSON.parse(sessionStorage.getItem(FB_DRAFT_KEY)||"{}").bugWhat||""; } catch { return ""; } });
  const [bugSteps, setBugSteps] = useState("");
  const [bugExpected, setBugExpected] = useState("");
  const [bugSeverity, setBugSeverity] = useState("");

  // Idea fields
  const [ideaWhat, setIdeaWhat] = useState(() => { try { return JSON.parse(sessionStorage.getItem(FB_DRAFT_KEY)||"{}").ideaWhat||""; } catch { return ""; } });
  const [ideaWhy, setIdeaWhy] = useState("");

  // Love it field
  const [loveMsg, setLoveMsg] = useState(() => { try { return JSON.parse(sessionStorage.getItem(FB_DRAFT_KEY)||"{}").loveMsg||""; } catch { return ""; } });

  // Save draft on changes
  useEffect(() => {
    if (!open) return;
    try { sessionStorage.setItem(FB_DRAFT_KEY, JSON.stringify({ category, bugWhat, ideaWhat, loveMsg })); } catch {}
  }, [open, category, bugWhat, ideaWhat, loveMsg]);

  // File attachment (bug only)
  const [attachedFile, setAttachedFile] = useState(null); // { name, url } or null
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  const resetForm = () => {
    setCategory(""); setBugWhat(""); setBugSteps(""); setBugExpected(""); setBugSeverity("");
    setIdeaWhat(""); setIdeaWhy(""); setLoveMsg(""); setError("");
    setAttachedFile(null); setUploadError("");
    try { sessionStorage.removeItem(FB_DRAFT_KEY); } catch {}
  };

  const handleAttachClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setTimeout(() => { fileInputRef.current?.click(); }, 100);
  };

  const handleFileSelect = async (e) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadError("File must be under 10MB"); return; }
    setUploadError("");
    setUploading(true);
    try {
      const uid = user?.id || "anon";
      const path = `${uid}/${Date.now()}-${file.name}`;
      const session = getSession();
      const token = session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/feedback-attachments/${path}`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/feedback-attachments/${path}`;
      setAttachedFile({ name: file.name, url: publicUrl });
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => { setOpen(false); setSuccess(false); resetForm(); }, 3000);
    return () => clearTimeout(t);
  }, [success]);

  const canSubmit = !sending && (
    (category === "Bug" && bugWhat.trim()) ||
    (category === "Idea" && ideaWhat.trim()) ||
    (category === "Love it" && loveMsg.trim())
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    setError("");
    const info = getDeviceInfo();
    let message = "", stepsToReproduce = "", expectedBehavior = "", severity = "";
    if (category === "Bug") {
      message = bugWhat.trim(); stepsToReproduce = bugSteps.trim(); expectedBehavior = bugExpected.trim(); severity = bugSeverity;
    } else if (category === "Idea") {
      message = ideaWhat.trim(); stepsToReproduce = ideaWhy.trim();
    } else {
      message = loveMsg.trim();
    }
    try {
      const res = await fetch("/api/send-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id || null, email: user?.email || null,
          category, message, stepsToReproduce, expectedBehavior, severity,
          attachmentUrl: attachedFile?.url || null,
          page: info.page, browser: info.browser, device: info.device, screenSize: info.screenSize,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => { if (!success) { setOpen(false); setError(""); try { sessionStorage.removeItem(FB_DRAFT_KEY); } catch {} } };

  // ── Heart button ──
  const heartBtn = (
    <button
      onClick={() => { setOpen(true); setSuccess(false); setError(""); }}
      aria-label="Send feedback"
      style={{
        background: "none", border: "none", cursor: "pointer", padding: 4,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        animation: "fbHeartPulse 2.5s ease-in-out infinite", flexShrink: 0,
        position: "relative", zIndex: 60, pointerEvents: "auto",
      }}
    >
      <svg width="28" height="26" viewBox="0 0 24 24" fill={C.lavender} xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"/>
      </svg>
      <div style={{ fontSize: 9, fontWeight: 600, color: "#7B6AD4", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2, fontFamily: "Nunito, sans-serif", lineHeight: 1 }}>Talk to Us</div>
    </button>
  );

  // ── Success state ──
  const successContent = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 24px 36px", gap: 12 }}>
      <img src="/bev_neutral.png" alt="Bev" style={{ width: 100, height: "auto", animation: "fbBevBounce 0.6s ease" }} />
      <div style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 700, color: C.navy, textAlign: "center" }}>Thank you! 🐍</div>
      <div style={{ fontSize: 13, color: C.sub, textAlign: "center", fontFamily: T.sans }}>Your feedback helps Wovely grow.</div>
    </div>
  );

  // ── Category-specific forms ──
  const bugForm = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T.sans }}>What went wrong? <span style={{ color: "#C2564A" }}>*</span></div>
        <Input rows={3} placeholder="Describe what happened..." value={bugWhat} onChange={setBugWhat} required />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T.sans }}>What were you doing when it happened?</div>
        <Input rows={2} placeholder="e.g. I was uploading a PDF when..." value={bugSteps} onChange={setBugSteps} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T.sans }}>What did you expect to happen?</div>
        <Input rows={2} placeholder="e.g. I expected it to save..." value={bugExpected} onChange={setBugExpected} />
      </div>
      <SeverityPills value={bugSeverity} onChange={setBugSeverity} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, fontFamily: T.sans }}>Attach a file (optional)</div>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, fontFamily: T.sans }}>Screenshot, PDF, or pattern file — helps us fix it faster</div>
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.pdf" onChange={handleFileSelect} onClick={e=>e.stopPropagation()} style={{ display: "none" }} />
        {attachedFile ? (
          <div style={{
            border: `1px solid #1E8A63`, borderRadius: 12, padding: "12px 16px",
            display: "flex", alignItems: "center", gap: 10, background: "#F0F8F0",
          }}>
            <span style={{ color: "#1E8A63", fontSize: 16 }}>✓</span>
            <span style={{ fontSize: 13, color: C.text, fontFamily: T.sans, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachedFile.name}</span>
            <button onClick={() => setAttachedFile(null)} style={{
              background: "none", border: "none", fontSize: 14, color: C.sub, cursor: "pointer", padding: 2, lineHeight: 1,
            }}>✕</button>
          </div>
        ) : (
          <div onClick={e => { if (!uploading) handleAttachClick(e); }} style={{
            border: `2px dashed ${C.border}`, borderRadius: 12, padding: "12px 16px",
            cursor: uploading ? "default" : "pointer", display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>📎</span>
            <span style={{ fontSize: 13, color: uploading ? C.sub : C.lavender, fontFamily: T.sans }}>
              {uploading ? "Uploading..." : "Tap to attach a file"}
            </span>
          </div>
        )}
        {uploadError && <div style={{ color: "#C2564A", fontSize: 12, marginTop: 6, fontFamily: T.sans }}>{uploadError}</div>}
      </div>
    </div>
  );

  const ideaForm = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T.sans }}>What's your idea? <span style={{ color: "#C2564A" }}>*</span></div>
        <Input rows={4} placeholder="Tell us what you'd love to see in Wovely..." value={ideaWhat} onChange={setIdeaWhat} required />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6, fontFamily: T.sans }}>How would this help you?</div>
        <Input rows={2} placeholder="Optional — but it helps us prioritize!" value={ideaWhy} onChange={setIdeaWhy} />
      </div>
    </div>
  );

  const loveForm = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Input rows={4} placeholder="Tell Bev what you love 🐍" value={loveMsg} onChange={setLoveMsg} required />
      <div style={{ fontSize: 12, color: C.sub, fontFamily: T.sans, textAlign: "center" }}>Danielle & Adam read every single one.</div>
    </div>
  );

  // ── Form content ──
  const formContent = success ? successContent : (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "0 24px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 20 }}>
        <img src="/bev_neutral.png" alt="Bev" style={{ width: 48, height: "auto" }} />
        <div>
          <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 700, color: C.navy }}>Help us make Wovely better</div>
          <div style={{ fontSize: 13, color: C.sub, fontFamily: T.sans, marginTop: 2 }}>Every report goes directly to our team</div>
        </div>
      </div>

      {/* Category pills */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        {CATEGORIES.map(c => {
          const sel = category === c.value;
          return (
            <button key={c.value} onClick={() => { setCategory(c.value); setError(""); }} style={{
              background: sel ? C.lavender : "#fff",
              color: sel ? "#fff" : C.sub,
              border: `1px solid ${sel ? C.lavender : C.border}`,
              borderRadius: 99, padding: "8px 18px", fontSize: 14, fontWeight: 600,
              cursor: "pointer", fontFamily: T.sans, transition: "all .15s ease",
            }}>{c.label}</button>
          );
        })}
      </div>

      {/* Category-specific form */}
      {category === "Bug" && bugForm}
      {category === "Idea" && ideaForm}
      {category === "Love it" && loveForm}

      {/* Error */}
      {error && <div style={{ color: "#C2564A", fontSize: 13, textAlign: "center", fontFamily: T.sans }}>{error}</div>}

      {/* Submit */}
      {category && (
        <button onClick={handleSubmit} disabled={!canSubmit} style={{
          width: "100%", background: canSubmit ? C.lavender : C.lavender, color: "#fff",
          border: "none", borderRadius: 12, padding: "14px 0", fontSize: 14, fontWeight: 600,
          cursor: canSubmit ? "pointer" : "default", fontFamily: T.sans,
          opacity: canSubmit ? 1 : 0.5, transition: "all .15s ease",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {sending ? (<><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "fbSpin .6s linear infinite", display: "inline-block" }} />Sending...</>) : "Send Feedback"}
        </button>
      )}
    </div>
  );

  // ── Modal overlay ──
  const overlay = open ? (
    <>
      <div onClick={handleClose} style={{
        position: "fixed", inset: 0, background: "rgba(90,66,160,0.25)",
        backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        zIndex: 200, animation: "fbFadeIn .2s ease",
      }} />
      {isMobile ? (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 201,
          background: "#fff", borderRadius: "20px 20px 0 0",
          boxShadow: "0 8px 40px rgba(90,66,160,0.15)",
          animation: "slideUp .3s ease", maxHeight: "90vh", overflowY: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99 }} />
          </div>
          <button onClick={handleClose} style={{
            position: "absolute", top: 14, right: 16, background: "none",
            border: "none", fontSize: 18, color: C.navy, cursor: "pointer", padding: 4, lineHeight: 1,
          }}>✕</button>
          {formContent}
        </div>
      ) : (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 201, background: "#fff", borderRadius: 20,
          boxShadow: "0 8px 40px rgba(90,66,160,0.15)",
          width: "100%", maxWidth: 480, animation: "modalPop .25s ease",
          overflowY: "auto", maxHeight: "90vh",
        }}>
          <button onClick={handleClose} style={{
            position: "absolute", top: 14, right: 16, background: "none",
            border: "none", fontSize: 18, color: C.navy, cursor: "pointer", padding: 4, lineHeight: 1, zIndex: 1,
          }}>✕</button>
          {formContent}
        </div>
      )}
    </>
  ) : null;

  return (
    <>
      <style>{`
        @keyframes fbHeartPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        @keyframes fbFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fbBevBounce { 0% { transform: translateY(0); } 40% { transform: translateY(-8px); } 100% { transform: translateY(0); } }
        @keyframes fbSpin { to { transform: rotate(360deg); } }
      `}</style>
      {heartBtn}
      {overlay && createPortal(overlay, document.body)}
    </>
  );
}
