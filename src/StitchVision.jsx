import { useState, useRef } from "react";
import { T } from "./theme.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseAuth, getSession } from "./supabase.js";

const MSGS = [
  "Analyzing the stitch pattern…",
  "Checking the texture and structure…",
  "Almost there…",
];

const DIFF_COLORS = { Beginner: "#1E8A63", Intermediate: "#B07B1E", Advanced: "#C2564A" };

const compressForVision = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    let w = img.width, h = img.height;
    const MAX = 1024;
    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else { w = Math.round(w * MAX / h); h = MAX; }
    }
    const cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    cvs.getContext("2d").drawImage(img, 0, 0, w, h);
    const dataUrl = cvs.toDataURL("image/jpeg", 0.8);
    cvs.toBlob((blob) => {
      resolve({ blob, thumb: dataUrl });
    }, "image/jpeg", 0.8);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
  img.src = url;
});

const getUsage = () => {
  try {
    const raw = localStorage.getItem("wv_sv_uses");
    if (!raw) return { count: 0, month: "" };
    return JSON.parse(raw);
  } catch { return { count: 0, month: "" }; }
};

const currentMonth = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
};

const incrementUsage = () => {
  const m = currentMonth();
  const u = getUsage();
  const count = u.month === m ? u.count + 1 : 1;
  localStorage.setItem("wv_sv_uses", JSON.stringify({ count, month: m }));
};

const canUse = (isPro) => {
  if (isPro) return true;
  const m = currentMonth();
  const u = getUsage();
  return u.month !== m || u.count < 3;
};

const ANON_SCAN_FLAG = "wovely_sov_anon_scan_used";
const anonScanUsed = () => { try { return sessionStorage.getItem(ANON_SCAN_FLAG) === "true"; } catch { return false; } };
const markAnonScanUsed = () => { try { sessionStorage.setItem(ANON_SCAN_FLAG, "true"); } catch {} };

const StitchVision = ({ isPro, isAnon, onUpgrade, onRequireAccount, onImportAsPattern }) => {
  const [stage, setStage] = useState("pick"); // pick | loading | result | limit
  const [result, setResult] = useState(null);
  const [thumb, setThumb] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(MSGS[0]);
  const [error, setError] = useState(null);
  const [shareId, setShareId] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Anonymous users hit the AuthWall — the scan pipeline requires a Supabase session for the
    // image upload, so we can't truly "allow 1 scan anonymously" without backend changes.
    // The sessionStorage flag is kept so the wall copy can evolve to "used your free scan" later.
    if (isAnon) {
      if (e.target) e.target.value = "";
      const wasUsed = anonScanUsed();
      markAnonScanUsed();
      onRequireAccount && onRequireAccount(wasUsed);
      return;
    }
    if (!canUse(isPro)) {
      setStage("limit");
      return;
    }

    setStage("loading");
    setLoadingMsg(MSGS[0]);
    let msgIdx = 0;
    const intv = setInterval(() => { msgIdx = (msgIdx + 1) % MSGS.length; setLoadingMsg(MSGS[msgIdx]); }, 2500);

    try {
      console.log("[StitchVision] Step 1: Compressing image —", f.name, f.size, "bytes, type:", f.type);
      const { blob, thumb: t } = await compressForVision(f);
      console.log("[StitchVision] Step 1 done: blob size:", blob?.size, "type:", blob?.type);
      setThumb(t);

      // Upload to Supabase Storage
      const session = getSession();
      const user = supabaseAuth.getUser();
      console.log("[StitchVision] Step 2: Uploading — user:", user?.id, "session:", !!session?.access_token);
      if (!session?.access_token || !user) throw new Error("Not authenticated");
      const filePath = `stitch-vision/${user.id}/${Date.now()}.jpg`;
      const uploadUrl = `${SUPABASE_URL}/storage/v1/object/pattern-files/${filePath}`;
      console.log("[StitchVision] Step 2: Upload URL:", uploadUrl);
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "image/jpeg" },
        body: blob,
      });
      const uploadBody = await uploadRes.text();
      console.log("[StitchVision] Step 2 done: upload status:", uploadRes.status, "body:", uploadBody.substring(0, 200));
      if (!uploadRes.ok) throw new Error("Image upload failed: " + uploadRes.status + " — " + uploadBody.substring(0, 100));
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/pattern-files/${filePath}`;
      console.log("[StitchVision] Step 3: Calling API — imageUrl:", publicUrl);

      const res = await fetch("/api/stitch-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });

      clearInterval(intv);
      const data = await res.json();
      console.log("[StitchVision] Step 3 done: API status:", res.status, "data keys:", Object.keys(data), "data:", JSON.stringify(data).substring(0, 500));
      if (!res.ok) throw new Error(data.message || data.error || "Server error: " + res.status);
      if (data.error) throw new Error(data.message || "Stitch identification failed. Please try again.");
      incrementUsage();
      setResult(data);
      setStage("result");
      // Save result to Supabase (best-effort, don't block)
      try {
        const session2 = getSession();
        const user2 = supabaseAuth.getUser();
        console.log("[stitch-vision] Saving result, user:", user2?.id, "session:", !!session2);
        const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/stitch_results`, {
          method: "POST",
          headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${session2?.access_token}`, "Content-Type": "application/json", "Prefer": "return=representation" },
          body: JSON.stringify({ image_url: publicUrl, result: data, user_id: user2?.id || null }),
        });
        const saveText = await saveRes.text();
        console.log("[stitch-vision] Save response:", saveRes.status, saveText.substring(0, 200));
        if (saveRes.ok) {
          let savedData;
          try {
            savedData = typeof saveText === 'string' ? JSON.parse(saveText) : saveText;
            const savedRecord = Array.isArray(savedData) ? savedData[0] : savedData;
            if (savedRecord?.id) { setShareId(savedRecord.id); console.log("[stitch-vision] Share ID set:", savedRecord.id); }
            else { console.error("[stitch-vision] No ID in save response:", JSON.stringify(savedData).substring(0, 200)); }
          } catch (parseErr) { console.error("[stitch-vision] Save parse error:", parseErr.message, saveText.substring(0, 200)); }
        } else { console.error("[stitch-vision] Save failed:", saveRes.status, saveText); }
      } catch (saveErr) { console.error("[stitch-vision] Save error:", saveErr.message); }
    } catch (err) {
      clearInterval(intv);
      console.error("[StitchVision] Error:", err);
      setError(err.message);
      setStage("result");
    }
  };

  const reset = () => { setStage("pick"); setResult(null); setThumb(null); setError(null); setShareId(null); setCopied(false); if (fileRef.current) fileRef.current.value = ""; };

  // ── LIMIT SCREEN ──
  if (stage === "limit") return (
    <div style={{ padding: "60px 20px", textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <div style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 8 }}>You've used your 3 free identifications this month</div>
      <div style={{ fontSize: 14, color: T.ink2, lineHeight: 1.7, marginBottom: 24 }}>Upgrade to Craft for unlimited Stitch-O-Vision.</div>
      {onUpgrade && <button onClick={onUpgrade} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "14px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(123,106,212,.3)", marginBottom: 12 }}>Upgrade to Craft</button>}
      <div><button onClick={reset} style={{ background: "none", border: "none", color: T.terra, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 8 }}>← Back</button></div>
    </div>
  );

  // ── LOADING ──
  if (stage === "loading") return (
    <div style={{ padding: "80px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{`@keyframes svSpin{to{transform:rotate(360deg)}}@keyframes svFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ position: "relative", width: 60, height: 60, marginBottom: 24 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "4px solid transparent", borderTopColor: "#7B6AD4", animation: "svSpin 1s linear infinite" }} />
        <img src="/bev_neutral.png" alt="Bev" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 40, height: 40, objectFit: "contain" }} />
      </div>
      <div style={{ fontFamily: "'Fredoka',serif", fontSize: 20, fontWeight: 600, color: "#2E2748", marginBottom: 8 }}>Identifying your stitch…</div>
      <div key={loadingMsg} style={{ fontSize: 13, color: "#7B6AD4", animation: "svFade .4s ease both" }}>{loadingMsg}</div>
    </div>
  );

  // ── RESULT ──
  if (stage === "result") {
    if (error) return (
      <div style={{ padding: "60px 20px", textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
        <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 600, color: T.ink, marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.7, marginBottom: 20 }}>{error}</div>
        <button onClick={reset} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Try again</button>
      </div>
    );

    if (result?.not_stitch) return (
      <div style={{ padding: "40px 20px 60px", textAlign: "center", maxWidth: 440, margin: "0 auto" }}>
        {thumb && <img src={thumb} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12, marginBottom: 20 }} />}
        <img src="/bev_neutral.png" alt="Bev" style={{ width: 110, height: "auto", margin: "0 auto 16px", display: "block", filter: "drop-shadow(0 4px 16px rgba(123,106,212,0.3))" }} />
        <div style={{ fontFamily: "'Fredoka',serif", fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 8 }}>That looks like a pattern, not a stitch</div>
        <div style={{ fontSize: 13, color: "#726A92", lineHeight: 1.7, marginBottom: 20 }}>
          Stitch-O-Vision identifies stitches from photos of actual fabric. Looks like you uploaded a pattern page — Bev can import that for you instead.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {onImportAsPattern && (
            <button
              onClick={() => onImportAsPattern()}
              style={{ width: "100%", background: "#7B6AD4", color: "#fff", border: "none", borderRadius: 99, padding: "13px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Import as a pattern instead
            </button>
          )}
          <button onClick={reset} style={{ width: "100%", background: "transparent", color: T.ink2, border: `1.5px solid ${T.border}`, borderRadius: 99, padding: "12px 28px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Try a different photo
          </button>
        </div>
      </div>
    );

    if (!result || (!result.primary_identifier && !result.stitch_name)) return (
      <div style={{ padding: "60px 20px", textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
        <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 600, color: T.ink, marginBottom: 8 }}>Couldn't identify the stitch</div>
        <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.7, marginBottom: 20 }}>Try a closer, well-lit photo of the stitch texture.</div>
        <button onClick={reset} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Try again</button>
      </div>
    );

    if (result?.not_crochet) return (
      <div style={{ padding: "60px 20px", textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
        {thumb && <img src={thumb} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12, marginBottom: 20 }} />}
        <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 600, color: T.ink, marginBottom: 8 }}>That doesn't look like a crochet stitch</div>
        <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.7, marginBottom: 20 }}>Try a closer photo of the stitch texture.</div>
        <button onClick={reset} style={{ background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Try another photo</button>
      </div>
    );

    const diffColor = DIFF_COLORS[result.difficulty] || T.ink3;
    const isLowConf = result.confidence === "low" || !result.description || !result.description.trim();
    const showDebug = new URLSearchParams(window.location.search).has('debug');

    // ── LOW CONFIDENCE / UNSURE STATE ──
    if (isLowConf) return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 20px", textAlign: "center" }}>
        {thumb && <img src={thumb} alt="" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 12, marginBottom: 20 }} />}
        <img src="/bev_neutral.png" alt="Bev" style={{ width: 120, height: "auto", margin: "0 auto 16px", display: "block", filter: "drop-shadow(0 4px 16px rgba(123,106,212,0.3))" }} />
        <div style={{ fontFamily: "'Fredoka',serif", fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Bev's not quite sure about this one...</div>
        {result.stitch_name && <div style={{ fontSize: 14, color: "#726A92", marginBottom: 16 }}>This might be a <span style={{ fontWeight: 600, color: "#7B6AD4" }}>{result.stitch_name}</span></div>}
        {result.base_stitch && <div style={{ display: "inline-block", background: "#7B6AD4", color: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600, marginBottom: 16 }}>Base stitch: {result.base_stitch}</div>}
        <div style={{ background: "#F5F2FF", border: "1px solid #ECE6F8", borderRadius: 12, padding: "14px 16px", marginBottom: 20, textAlign: "left" }}>
          <div style={{ fontSize: 13, color: "#2E2748", lineHeight: 1.6 }}>💡 Try a closer shot focusing just on the stitch texture — Bev gets more confident with detail shots!</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shareId && result.stitch_name && (
            <button onClick={() => { navigator.clipboard.writeText(`https://wovely.app/stitch/${shareId}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ width: "100%", background: "transparent", color: T.terra, border: `1.5px solid ${T.terra}`, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {copied ? "✓ Copied!" : "🔗 Copy share link"}
            </button>
          )}
          <button onClick={reset} style={{ width: "100%", background: T.terra, color: "#fff", border: "none", borderRadius: 99, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Try another photo</button>
        </div>
      </div>
    );

    // ── CONFIDENT RESULT ──
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 20px" }}>
        {thumb && <img src={thumb} alt="" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 12, marginBottom: 16 }} />}

        <div style={{ fontFamily: "'Fredoka',serif", fontSize: 24, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{result.primary_identifier || result.stitch_name}</div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ background: diffColor + "22", color: diffColor, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{result.difficulty}</span>
          {result.confidence === "high" && <span style={{ background: "#E7F6F0", color: T.success, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>High confidence</span>}
          {result.confidence === "medium" && <span style={{ background: "#FDF3D7", color: T.warning, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Medium confidence</span>}
          {(result.stitch_technique || result.base_stitch) && <span style={{ background: "#7B6AD4", color: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Stitch: {result.stitch_technique || result.base_stitch}</span>}
          {result.pattern_arrangement && <span style={{ background: "#E8DFF5", color: "#5E4680", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Arrangement: {result.pattern_arrangement}</span>}
          {result.construction_method && <span style={{ background: "#D5E0F0", color: "#3D5A8C", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Construction: {result.construction_method}</span>}
          {(result.also_known_as || []).map(name => (
            <span key={name} style={{ background: T.terraLt, color: T.terra, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 500 }}>{name}</span>
          ))}
        </div>

        {result.description && result.description.trim() && (
          <div style={{ fontSize: 14, color: T.ink2, lineHeight: 1.7, marginBottom: 16 }}>{result.description}</div>
        )}

        {result.confidence_reasoning && result.confidence_reasoning.trim() && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: T.ink3, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>Why Bev thinks this</div>
            <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.6, fontStyle: "italic" }}>{result.confidence_reasoning}</div>
          </div>
        )}

        {showDebug && (result.observation_notes || result.candidate_analysis) && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(123,106,212, 0.06)', borderRadius: '12px', border: '1px dashed rgba(123,106,212, 0.3)' }}>
            <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: T.ink, opacity: 0.7, marginBottom: '0.5rem' }}>Debug: Reasoning Trace</div>
            {result.observation_notes && (
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.85rem' }}>Observations:</strong>
                <div style={{ fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.85, marginTop: '0.25rem' }}>{result.observation_notes}</div>
              </div>
            )}
            {result.candidate_analysis && (
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Candidate analysis:</strong>
                <div style={{ fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.85, marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>{result.candidate_analysis}</div>
              </div>
            )}
          </div>
        )}

        {result.common_uses && result.common_uses.trim() && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: T.ink3, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>Common uses</div>
            <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.6 }}>{result.common_uses}</div>
          </div>
        )}

        {result.tutorial_search && (
          <button onClick={() => window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(result.tutorial_search), "_blank")} style={{ width: "100%", background: T.terra, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(123,106,212,.3)", marginBottom: 12 }}>
            Watch a tutorial →
          </button>
        )}

        <div style={{marginBottom:12}}>
          {shareId ? (
            <button onClick={() => { navigator.clipboard.writeText(`https://wovely.app/stitch/${shareId}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ width: "100%", background: "transparent", color: T.terra, border: `1.5px solid ${T.terra}`, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {copied ? "✓ Copied!" : "🔗 Copy share link"}
            </button>
          ) : (
            <div style={{ width: "100%", background: T.linen, borderRadius: 12, padding: "12px", fontSize: 13, color: T.ink3, textAlign: "center" }}>Preparing share link…</div>
          )}
        </div>

        <button onClick={reset} style={{ width: "100%", background: "transparent", color: T.ink3, border: "none", borderRadius: 12, padding: "12px", fontSize: 13, cursor: "pointer" }}>Try another photo</button>
      </div>
    );
  }

  // ── PICK SCREEN ──
  const usage = getUsage();
  const usesLeft = isPro ? "unlimited" : Math.max(0, 3 - (usage.month === currentMonth() ? usage.count : 0));
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontFamily: "'Fredoka',serif", fontSize: 26, fontWeight: 700, color: T.ink }}>Stitch-O-Vision</div>
        <img src="/bev_neutral.png" alt="Bev" style={{ width: 20, height: 20, objectFit: "contain" }} />
      </div>
      <div style={{ fontSize: 14, color: T.ink2, lineHeight: 1.7, marginBottom: 24 }}>Photograph any stitch — we'll tell you what it is</div>

      <label style={{ display: "block", cursor: "pointer" }}>
        <div style={{ border: `2px dashed ${T.border}`, borderRadius: 16, padding: "48px 20px", background: T.linen, transition: "border-color .2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.terra} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
          <div style={{ fontFamily: T.serif, fontSize: 17, color: T.ink, marginBottom: 6 }}>Take a photo or upload an image</div>
          <div style={{ fontSize: 13, color: T.ink3, marginBottom: 16 }}>Close-up of the stitch texture works best</div>
          <div style={{ background: T.terra, color: "#fff", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, display: "inline-block" }}>Choose photo</div>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" onChange={handleFile} style={{ display: "none" }} />
      </label>

      <div style={{ fontSize: 11, color: T.ink3, marginTop: 14, lineHeight: 1.6 }}>Works with photos, screenshots, and images from social media</div>
      {!isPro && !isAnon && <div style={{ fontSize: 11, color: T.terra, marginTop: 8, fontWeight: 500 }}>{usesLeft} free identification{usesLeft !== 1 ? "s" : ""} left this month</div>}
      {isAnon && <div style={{ fontSize: 11, color: T.terra, marginTop: 8, fontWeight: 500 }}>Sign up free for Stitch-O-Vision</div>}
    </div>
  );
};

export default StitchVision;
