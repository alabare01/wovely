import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

const DIFF_COLORS = { Beginner: "#1E8A63", Intermediate: "#B07B1E", Advanced: "#C2564A" };

const StitchResultPage = () => {
  const { id: paramId } = useParams();
  const id = paramId || window.location.pathname.split("/stitch/")[1]?.split("/")[0];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) { setError("Not found"); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/stitch_results?id=eq.${id}&select=*`, {
          headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error("Not found");
        const rows = await res.json();
        if (!rows.length) throw new Error("Not found");
        setData(rows[0]);
        document.title = `${rows[0].result?.stitch_name || "Stitch"} — Wovely Stitch-O-Vision`;
      } catch (e) { setError(e.message); }
      setLoading(false);
    })();
  }, [id]);

  const pageStyle = { minHeight: "100vh", background: "#F5F2FF", fontFamily: "Nunito,-apple-system,sans-serif" };

  const backLink = (
    <a href="https://wovely.app" style={{
      display: "flex", alignItems: "center", gap: 6, color: "#7B6AD4",
      fontFamily: "Nunito,sans-serif", fontSize: 13, fontWeight: 500,
      textDecoration: "none", padding: "12px 16px", position: "sticky",
      top: 0, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)", zIndex: 10, borderBottom: "1px solid #ECE6F8",
    }}>← Back to Wovely</a>
  );

  const headerStyle = {
    background: "#fff",
    borderBottom: "1px solid #ECE6F8",
    padding: "0 24px",
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 10,
  };

  if (loading) return (
    <div style={pageStyle}>
      {backLink}
      <style>{`@keyframes srSpin{to{transform:rotate(360deg)}}`}</style>
      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/bev_neutral.png" alt="Bev" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <span style={{ fontFamily: "'Fredoka',serif", fontSize: 18, fontWeight: 700, color: "#2E2748" }}>Wovely</span>
        </div>
        <span style={{ fontSize: 12, color: "#7B6AD4", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" }}>Stitch-O-Vision</span>
      </header>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 56px)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ position: "relative", width: 48, height: 48, margin: "0 auto 16px" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "#7B6AD4", animation: "srSpin 1s linear infinite" }} />
            <img src="/bev_neutral.png" alt="Bev" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 32, height: 32, objectFit: "contain" }} />
          </div>
          <div style={{ fontSize: 14, color: "#726A92" }}>Loading result…</div>
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div style={pageStyle}>
      {backLink}
      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/bev_neutral.png" alt="Bev" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <span style={{ fontFamily: "'Fredoka',serif", fontSize: 18, fontWeight: 700, color: "#2E2748" }}>Wovely</span>
        </div>
        <span style={{ fontSize: 12, color: "#7B6AD4", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" }}>Stitch-O-Vision</span>
      </header>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 56px)" }}>
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontFamily: "'Fredoka',serif", fontSize: 22, fontWeight: 700, color: "#2E2748", marginBottom: 8 }}>Result not found</div>
          <div style={{ fontSize: 14, color: "#726A92", marginBottom: 24 }}>This link may have expired or the result was removed.</div>
          <a href="/" style={{ background: "#7B6AD4", color: "#fff", borderRadius: 99, padding: "12px 28px", fontSize: 14, fontWeight: 600, textDecoration: "none", display: "inline-block" }}>Go to Wovely</a>
        </div>
      </div>
    </div>
  );

  const r = data.result;
  const diffColor = DIFF_COLORS[r.difficulty] || "#726A92";

  return (
    <div style={pageStyle}>
      {backLink}
      <style>{`@media(min-width:640px){.sr-card{box-shadow:0 4px 32px rgba(123,106,212,.15);border-radius:20px!important;}.sr-image{border-radius:12px 12px 0 0!important;}}`}</style>

      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/bev_neutral.png" alt="Bev" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <span style={{ fontFamily: "'Fredoka',serif", fontSize: 18, fontWeight: 700, color: "#2E2748" }}>Wovely</span>
        </div>
        <span style={{ fontSize: 12, color: "#7B6AD4", fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" }}>Stitch-O-Vision</span>
      </header>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 120px" }}>
        <div className="sr-card" style={{ background: "#fff", borderRadius: 12, overflow: "hidden" }}>
          {data.image_url && <img className="sr-image" src={data.image_url} alt="" style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 0, display: "block" }} />}

          <div style={{ padding: "20px 20px 24px" }}>
            {r.confidence === "low" && (
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <img src="/bev_neutral.png" alt="Bev" style={{ width: 80, height: "auto", margin: "0 auto 12px", display: "block", filter: "drop-shadow(0 4px 12px rgba(123,106,212,0.3))" }} />
                <div style={{ fontFamily: "'Fredoka',serif", fontSize: 18, fontWeight: 700, color: "#2E2748", marginBottom: 4 }}>Bev's not quite sure about this one...</div>
                <div style={{ fontSize: 13, color: "#726A92" }}>This might be a <span style={{ fontWeight: 600, color: "#7B6AD4" }}>{r.stitch_name}</span></div>
              </div>
            )}

            {r.confidence !== "low" && <div style={{ fontFamily: "'Fredoka',serif", fontSize: 26, fontWeight: 700, color: "#2E2748", marginBottom: 8 }}>{r.primary_identifier || r.stitch_name}</div>}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {r.confidence !== "low" && <span style={{ background: diffColor + "22", color: diffColor, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{r.difficulty}</span>}
              {r.confidence === "high" && <span style={{ background: "#E7F6F0", color: "#1E8A63", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>High confidence</span>}
              {r.confidence === "medium" && <span style={{ background: "#FDF3D7", color: "#B07B1E", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Medium confidence</span>}
              {(r.stitch_technique || r.base_stitch) && <span style={{ background: "#7B6AD4", color: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Stitch: {r.stitch_technique || r.base_stitch}</span>}
              {r.pattern_arrangement && <span style={{ background: "#E8DFF5", color: "#5E4680", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Arrangement: {r.pattern_arrangement}</span>}
              {r.construction_method && <span style={{ background: "#D5E0F0", color: "#3D5A8C", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Construction: {r.construction_method}</span>}
              {(r.also_known_as || []).map(name => (
                <span key={name} style={{ background: "#ECE6F8", color: "#7B6AD4", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 500 }}>{name}</span>
              ))}
            </div>

            {r.description && r.description.trim() && <div style={{ fontSize: 14, color: "#726A92", lineHeight: 1.8, marginBottom: 16 }}>{r.description}</div>}

            {r.confidence_reasoning && r.confidence_reasoning.trim() && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "#7B6AD4", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4, fontWeight: 600 }}>Why Bev thought this</div>
                <div style={{ fontSize: 13, color: "#726A92", lineHeight: 1.6, fontStyle: "italic" }}>{r.confidence_reasoning}</div>
              </div>
            )}

            {r.common_uses && r.common_uses.trim() && (
              <div style={{ marginBottom: 20, padding: "12px 14px", background: "#F5F2FF", borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: "#7B6AD4", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4, fontWeight: 600 }}>Common uses</div>
                <div style={{ fontSize: 13, color: "#726A92", lineHeight: 1.6 }}>{r.common_uses}</div>
              </div>
            )}

            {r.confidence === "low" && (
              <div style={{ background: "#F5F2FF", border: "1px solid #ECE6F8", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "#2E2748", lineHeight: 1.6 }}>💡 Try a closer shot focusing just on the stitch texture — Bev gets more confident with detail shots!</div>
              </div>
            )}

            {r.tutorial_search && (
              <button onClick={() => window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(r.tutorial_search), "_blank")} style={{ width: "100%", background: "#7B6AD4", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(123,106,212,.3)" }}>
                Watch a tutorial →
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#2E2748", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -4px 20px rgba(0,0,0,.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/bev_neutral.png" alt="Bev" style={{ width: 32, height: 32, objectFit: "contain" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Identify any crochet stitch instantly</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>Free on Wovely</div>
          </div>
        </div>
        <a href="/stitch-vision" style={{ background: "#7B6AD4", color: "#fff", borderRadius: 99, padding: "10px 20px", fontSize: 13, fontWeight: 600, textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap" }}>Try it free →</a>
      </div>
    </div>
  );
};

export default StitchResultPage;
