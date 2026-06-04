import { useState, useEffect, useCallback } from "react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const PF = "'Playfair Display',Georgia,serif";
const INTER = "Inter,sans-serif";
const NAVY = "#2D3A7C";
const ACCENT = "#9B7EC8";
const MUTED = "#9B87B8";
const BG = "#FAF8F5";

const USERS = [
  { id: "6e1a02d9-c210-4bc4-968e-dde3435565d1", email: "alabare@gmail.com", joined: "2026-03-24", is_pro: true },
  { id: "d6b18345-a85e-42bd-b7cb-f20efd4b2fe7", email: "danielle2673@me.com", joined: "2026-03-26", is_pro: true },
  { id: "038442a2-b13d-4abb-9960-24a360078f6c", email: "danielle2673@gmail.com", joined: "2026-03-23", is_pro: true },
  { id: "019d4564-aa95-79fc-8a57-7e08d2f3ecd1", email: "steffaniembrown@gmail.com", joined: "2026-03-31", is_pro: true },
  { id: "70d18298-06a9-468e-825d-2c561e6de9a0", email: "tbrightjax@gmail.com", joined: "2026-03-31", is_pro: true },
  { id: "c143044b-25f8-48e6-9831-15ed2e3b474f", email: "stinkyswife@gmail.com", joined: "2026-03-31", is_pro: true },
  { id: "b58607be-e04c-4194-b568-47e557087016", email: "turttlesong@yahoo.com", joined: "2026-04-03", is_pro: true, trialExpires: "2026-05-03" },
  { id: "ronsrit-real-id", email: "ronsrit@hotmail.com", joined: "2026-04-01", is_pro: true },
  { id: "test-id-123", email: "alabare+test1@gmail.com", joined: "2026-03-31", is_pro: false },
];

// ─── DATA FETCHERS ──────────────────────────────────────────────────────────
const phQuery = async (sql) => {
  const key = import.meta.env.VITE_POSTHOG_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://us.posthog.com/api/projects/363175/query/", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql } }),
    });
    const d = await res.json();
    return d.results || [];
  } catch { return []; }
};

const sbFetch = async (table, params = "") => {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    return res.ok ? await res.json() : [];
  } catch { return []; }
};

// ─── STATUS LOGIC ───────────────────────────────────────────────────────────
const getStatus = (patternCount, lastActive, email) => {
  if (email === "turttlesong@yahoo.com") return { label: "Trial", bg: "#FAEEDA", color: "#854F0B" };
  if (!patternCount || patternCount === 0) return { label: "Ghosted", bg: "#FCEBEB", color: "#A32D2D" };
  if (!lastActive) return { label: "Ghosted", bg: "#FCEBEB", color: "#A32D2D" };
  const days = Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000);
  if (days <= 3) return { label: "Active", bg: "#EAF3DE", color: "#3B6D11" };
  if (days <= 7) return { label: "At risk", bg: "#FAEEDA", color: "#854F0B" };
  return { label: "Drifting", bg: "#FAEEDA", color: "#854F0B" };
};

const tierBadge = (u) => {
  if (!u.is_pro) return { label: "Free", bg: "#F1EFE8", color: "#5F5E5A" };
  if (u.trialExpires) return { label: "Trial", bg: "#FAEEDA", color: "#854F0B" };
  return { label: "Pro", bg: "#EDE4F7", color: "#6B3FA0" };
};

// ─── CARD / SECTION STYLES ──────────────────────────────────────────────────
const card = { background: "#fff", borderRadius: 16, border: "1px solid #EDE4F7", padding: 20 };
const secHead = { fontFamily: PF, fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 };
const badge = (bg, color) => ({ display: "inline-block", background: bg, color, borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 600 });

// ─── BAR ROW ────────────────────────────────────────────────────────────────
const BarRow = ({ label, value, max }) => (
  <div style={{ display: "flex", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #F8F5FF" }}>
    <div style={{ width: 150, fontSize: 12, color: "#2D2D4E", fontFamily: INTER, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{label}</div>
    <div style={{ flex: 1, margin: "0 14px", height: 5, background: "#F0EAF9", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: max > 0 ? (value / max * 100) + "%" : "0%", height: "100%", background: ACCENT, borderRadius: 3 }} />
    </div>
    <div style={{ width: 36, textAlign: "right", fontSize: 12, fontWeight: 600, color: NAVY, fontFamily: INTER }}>{value}</div>
  </div>
);

// ─── COMPONENT ──────────────────────────────────────────────────────────────
export default function Founders() {
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [data, setData] = useState({
    patterns: [], stitches: [], pvDay: [], events: [], sources: [], locations: [], topPages: [], aiLogs: [],
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [patterns, stitches, pvDay, events, sources, locations, topPages, aiLogs] = await Promise.all([
      sbFetch("patterns", "select=user_id,status,updated_at,is_starter&status=neq.deleted&limit=500"),
      sbFetch("stitch_results", "select=user_id,created_at&limit=500"),
      phQuery("SELECT toDate(timestamp) as day, count() as n FROM events WHERE event = '$pageview' AND properties.$current_url LIKE '%wovely.app%' AND timestamp >= now() - interval 7 day GROUP BY day ORDER BY day ASC"),
      phQuery("SELECT event, count() as n FROM events WHERE event IN ('user_logged_in','pattern_uploaded','user_signed_up','upgrade_clicked','stitch_check_run') AND timestamp >= now() - interval 30 day GROUP BY event ORDER BY n DESC"),
      phQuery("SELECT properties.$referring_domain as d, count() as n FROM events WHERE event = '$pageview' AND properties.$current_url LIKE '%wovely.app%' AND timestamp >= now() - interval 30 day GROUP BY d ORDER BY n DESC LIMIT 8"),
      phQuery("SELECT properties.$geoip_city_name as city, properties.$geoip_country_name as country, count() as n FROM events WHERE event = 'user_logged_in' AND timestamp >= now() - interval 30 day GROUP BY city, country ORDER BY n DESC LIMIT 8"),
      phQuery("SELECT properties.$current_url as url, count() as n FROM events WHERE event = '$pageview' AND properties.$current_url LIKE '%wovely.app%' AND timestamp >= now() - interval 30 day GROUP BY url ORDER BY n DESC LIMIT 8"),
      sbFetch("vercel_logs", "select=timestamp,message,status_code,level&request_path=eq./api/extract-pattern&order=timestamp.desc&limit=50"),
    ]);
    setData({ patterns: patterns || [], stitches: stitches || [], pvDay: pvDay || [], events: events || [], sources: sources || [], locations: locations || [], topPages: topPages || [], aiLogs: aiLogs || [] });
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Derived stats
  const userPatterns = data.patterns.filter(p => !p.is_starter);
  const totalLogins = data.events.find(e => e[0] === "user_logged_in")?.[1] || 0;
  const totalPatterns = userPatterns.length;
  const totalStitches = data.stitches.length;
  const proCount = USERS.filter(u => u.is_pro).length;
  const mrr = "$6.99";

  // Per-user enrichment
  const enrichedUsers = USERS.map(u => {
    const pats = userPatterns.filter(p => p.user_id === u.id);
    const stit = data.stitches.filter(s => s.user_id === u.id);
    const dates = pats.map(p => p.updated_at).filter(Boolean).sort().reverse();
    const lastActive = dates[0] || null;
    const status = getStatus(pats.length, lastActive, u.email);
    return { ...u, patternCount: pats.length, stitchCount: stit.length, lastActive, status };
  });

  // Bev insight
  const fbVisits = data.sources.find(s => (s[0] || "").includes("facebook"))?.[1] || 0;
  const ghosted = enrichedUsers.filter(u => u.status.label === "Ghosted").length;
  const bevText = `${totalLogins} logins from ${USERS.length} users = ${(totalLogins / Math.max(USERS.length, 1)).toFixed(1)} avg sessions each. ${fbVisits > 0 ? `Facebook drove ${fbVisits} visits — viral loop working. ` : ""}${ghosted > 0 ? `${ghosted} user${ghosted > 1 ? "s" : ""} haven't added a pattern yet — they need a welcome email. ` : ""}turttlesong trial expires May 3.`;

  // Max helpers for bar widths
  const maxOf = (arr, idx) => Math.max(...arr.map(r => r[idx] || 0), 1);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <style>{`@keyframes bspin { to { transform: rotate(360deg) } }`}</style>
      <img src="/bev_neutral.png" alt="Bev" style={{ width: 80, height: 80, borderRadius: "50%", background: "#fff", padding: 6, objectFit: "contain", boxShadow: "0 4px 20px rgba(155,126,200,0.2)", animation: "bspin 1.5s linear infinite" }} />
      <div style={{ fontFamily: PF, fontStyle: "italic", fontSize: 20, color: ACCENT }}>Loading your numbers...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: INTER }}>
      <style>{`@keyframes bspin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      {/* ── HEADER ── */}
      <div style={{ background: NAVY, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src="/bev_neutral.png" alt="Bev" style={{ width: 52, height: 52, borderRadius: "50%", background: "#fff", padding: 4, objectFit: "contain" }} />
          <div>
            <div style={{ fontFamily: PF, fontSize: 22, fontWeight: 700, color: "#fff" }}>Wovely — Founder Dashboard</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Live · wovely.app</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(155,126,200,0.3)", borderRadius: 20, padding: "4px 12px" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#34D399", animation: "pulse 2s ease infinite" }} />
            <span style={{ fontSize: 11, color: "#fff", fontWeight: 500 }}>Live data</span>
          </div>
          {lastRefresh && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{lastRefresh.toLocaleTimeString()}</span>}
          <button onClick={fetchAll} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>↻ Refresh</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 28px 60px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── STAT CARDS ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          {[
            { label: "Total Users", value: USERS.length, sub: `${proCount} pro` },
            { label: "Logins / 30d", value: totalLogins, sub: `${(totalLogins / Math.max(USERS.length, 1)).toFixed(1)} avg/user` },
            { label: "Patterns Saved", value: totalPatterns, sub: "excl. starters" },
            { label: "Stitches Found", value: totalStitches },
            { label: "MRR", value: mrr, sub: "1 Stripe sub" },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontFamily: PF, fontSize: 30, fontWeight: 700, color: ACCENT, lineHeight: 1 }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* ── BEV INSIGHT ── */}
        <div style={{ background: "#EDE4F7", borderRadius: 16, border: "1px solid #D4C5ED", padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(155,126,200,0.15)" }}>
            <img src="/bev_neutral.png" alt="Bev" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
          </div>
          <div style={{ fontSize: 13, color: "#2D2D4E", lineHeight: 1.6 }}>{bevText}</div>
        </div>

        {/* ── USER TABLE ── */}
        <div style={{ ...card, overflowX: "auto" }}>
          <div style={secHead}>Users</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Email", "Joined", "Tier", "Patterns", "Stitches", "Last Active", "Status"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "0 8px 10px 0", fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, borderBottom: "1px solid #F0EAF9" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {enrichedUsers.map(u => {
                const tb = tierBadge(u);
                return (
                  <tr key={u.id}>
                    <td style={{ padding: "10px 8px 10px 0", fontSize: 12, color: "#2D2D4E", fontWeight: 500, borderBottom: "1px solid #F8F5FF" }}>{u.email}</td>
                    <td style={{ padding: "10px 8px 10px 0", fontSize: 12, color: MUTED, borderBottom: "1px solid #F8F5FF" }}>{u.joined}</td>
                    <td style={{ padding: "10px 8px 10px 0", borderBottom: "1px solid #F8F5FF" }}><span style={badge(tb.bg, tb.color)}>{tb.label}</span></td>
                    <td style={{ padding: "10px 8px 10px 0", fontSize: 12, color: "#2D2D4E", fontWeight: 600, borderBottom: "1px solid #F8F5FF" }}>{u.patternCount}</td>
                    <td style={{ padding: "10px 8px 10px 0", fontSize: 12, color: "#2D2D4E", fontWeight: 600, borderBottom: "1px solid #F8F5FF" }}>{u.stitchCount}</td>
                    <td style={{ padding: "10px 8px 10px 0", fontSize: 12, color: MUTED, borderBottom: "1px solid #F8F5FF" }}>{u.lastActive ? new Date(u.lastActive).toLocaleDateString() : "—"}</td>
                    <td style={{ padding: "10px 8px 10px 0", borderBottom: "1px solid #F8F5FF" }}><span style={badge(u.status.bg, u.status.color)}>{u.status.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── TRAFFIC + EVENTS (2-col) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={card}>
            <div style={secHead}>Traffic Sources (30d)</div>
            {data.sources.length > 0 ? data.sources.map(r => (
              <BarRow key={r[0] || "direct"} label={r[0] || "(direct)"} value={r[1]} max={maxOf(data.sources, 1)} />
            )) : <div style={{ color: MUTED, fontSize: 13 }}>No data</div>}
          </div>
          <div style={card}>
            <div style={secHead}>Events (30d)</div>
            {data.events.length > 0 ? data.events.map(r => (
              <BarRow key={r[0]} label={r[0]} value={r[1]} max={maxOf(data.events, 1)} />
            )) : <div style={{ color: MUTED, fontSize: 13 }}>No data</div>}
          </div>
        </div>

        {/* ── PAGEVIEWS CHART (7d) ── */}
        <div style={card}>
          <div style={secHead}>Pageviews (7d)</div>
          {data.pvDay.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140 }}>
              {data.pvDay.map(r => {
                const mx = maxOf(data.pvDay, 1);
                const h = mx > 0 ? (r[1] / mx * 100) : 0;
                const day = new Date(r[0]).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                return (
                  <div key={r[0]} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: NAVY }}>{r[1]}</div>
                    <div style={{ width: "100%", height: h + "%", minHeight: 4, background: ACCENT, borderRadius: "4px 4px 0 0" }} />
                    <div style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap" }}>{day}</div>
                  </div>
                );
              })}
            </div>
          ) : <div style={{ color: MUTED, fontSize: 13 }}>No data</div>}
        </div>

        {/* ── TOP PAGES + LOCATIONS (2-col) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <div style={card}>
            <div style={secHead}>Top Pages (30d)</div>
            {data.topPages.length > 0 ? data.topPages.map(r => {
              const path = (r[0] || "").replace(/https?:\/\/[^/]+/, "") || "/";
              return <BarRow key={r[0]} label={path} value={r[1]} max={maxOf(data.topPages, 1)} />;
            }) : <div style={{ color: MUTED, fontSize: 13 }}>No data</div>}
          </div>
          <div style={card}>
            <div style={secHead}>User Locations (30d)</div>
            {data.locations.length > 0 ? data.locations.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F8F5FF", fontSize: 12 }}>
                <span style={{ color: "#2D2D4E" }}>{r[0] || "Unknown"}, {r[1] || ""}</span>
                <span style={{ fontWeight: 600, color: ACCENT }}>{r[2]}</span>
              </div>
            )) : <div style={{ color: MUTED, fontSize: 13 }}>No data</div>}
          </div>
        </div>

        {/* ── AI HEALTH ── */}
        {(() => {
          const parseProvider = (row) => {
            const msg = row.message || "";
            if (msg.includes("claude-fallback")) return "Claude ✦";
            if (msg.includes("simplified")) return "Gemini (simplified)";
            if (msg.includes("all 3 attempts failed")) return "All failed";
            if (row.status_code === 500) return "Failed";
            return "Gemini";
          };
          const parseDuration = (msg) => {
            const m = (msg || "").match(/\((\d+)ms\)/);
            return m ? (parseInt(m[1]) / 1000).toFixed(1) + "s" : "—";
          };
          const providerColor = (p) => {
            if (p.startsWith("Claude")) return "#5B9B6B";
            if (p === "All failed" || p === "Failed") return "#C0544A";
            return ACCENT;
          };
          const rows = data.aiLogs.map(r => ({
            time: new Date(r.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + new Date(r.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
            provider: parseProvider(r),
            duration: parseDuration(r.message),
            status: r.status_code,
          }));
          const geminiCount = rows.filter(r => r.provider.startsWith("Gemini")).length;
          const claudeCount = rows.filter(r => r.provider.startsWith("Claude")).length;
          const failedCount = rows.filter(r => r.provider === "All failed" || r.provider === "Failed").length;
          return (
            <div style={card}>
              <div style={secHead}>AI Health — Import Pipeline</div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>
                <span style={{ color: ACCENT, fontWeight: 600 }}>Gemini: {geminiCount}</span>
                {" · "}
                <span style={{ color: "#5B9B6B", fontWeight: 600 }}>Claude saves: {claudeCount}</span>
                {" · "}
                <span style={{ color: "#C0544A", fontWeight: 600 }}>Failed: {failedCount}</span>
              </div>
              {rows.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["Time", "Provider", "Duration", "Status"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "0 8px 10px 0", fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, borderBottom: "1px solid #F0EAF9" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: "8px 8px 8px 0", fontSize: 12, color: "#2D2D4E", borderBottom: "1px solid #F8F5FF", whiteSpace: "nowrap" }}>{r.time}</td>
                        <td style={{ padding: "8px 8px 8px 0", fontSize: 12, fontWeight: 600, color: providerColor(r.provider), borderBottom: "1px solid #F8F5FF" }}>{r.provider}</td>
                        <td style={{ padding: "8px 8px 8px 0", fontSize: 12, color: "#2D2D4E", borderBottom: "1px solid #F8F5FF" }}>{r.duration}</td>
                        <td style={{ padding: "8px 8px 8px 0", fontSize: 12, borderBottom: "1px solid #F8F5FF" }}>{r.status === 200 ? "✅" : "❌"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div style={{ color: MUTED, fontSize: 13 }}>No extract-pattern logs found</div>}
            </div>
          );
        })()}

        {/* ── FOOTER ── */}
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ display: "inline-flex", width: 32, height: 32, borderRadius: "50%", background: "#fff", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(155,126,200,0.12)", marginBottom: 8 }}>
            <img src="/bev_neutral.png" alt="Bev" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
          </div>
          <div style={{ fontSize: 11, color: MUTED }}>Wovely · Founder Dashboard · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
        </div>
      </div>
    </div>
  );
}
