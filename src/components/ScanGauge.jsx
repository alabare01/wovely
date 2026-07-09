// ScanGauge — the 2b "BevCheck accuracy" meter for import processing screens
// (Wovely App 2b.dc.html .gauge/.g-needle/.g-dial). Three phases:
//   idle      — needle parked left, pct "—"
//   checking  — needle scans back and forth (gscan), pct "checking…"
//   done      — needle settles onto the real score (gsettle) with a stamp.
// Score is REAL BevCheck output only — when a report has no numeric score the
// pct slot shows the report's state label instead. Never invents a number.
import { deriveState } from "./BevGauge.jsx";

// 2b gauge text colors (wovely-patterns): ok ≥80, warn 60–79, low <60
const PCT_COLOR = { ok: "#1E8A63", warn: "#B07B1E", low: "#C2564A" };
const zoneOf = (score) => (score >= 80 ? "ok" : score >= 60 ? "warn" : "low");
const STATE_ZONE = { pass: "ok", warning: "warn", issues: "low" };
const STATE_LABEL = { pass: "Looks good", warning: "Heads up", issues: "Issues found" };
// Legacy-state needle angles when a report has no numeric score
const STATE_ANGLE = { pass: 52, warning: 0, issues: -52 };

export const scanGaugeKeyframes = `
@keyframes wvGscan{0%,100%{transform:rotate(-58deg)}45%{transform:rotate(48deg)}60%{transform:rotate(30deg)}75%{transform:rotate(52deg)}}
@keyframes wvGsettle{0%{transform:rotate(-58deg)}55%{transform:rotate(calc(var(--gA,85deg) + 6deg))}75%{transform:rotate(calc(var(--gA,85deg) - 5deg))}100%{transform:rotate(var(--gA,85deg))}}
@keyframes wvGstamp{to{transform:rotate(-8deg) scale(1);opacity:1}}
@keyframes wvBevbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes wvPulseDot{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
`;

const ScanGauge = ({ phase = "checking", score = null, state = null, note }) => {
  const hasScore = typeof score === "number" && !Number.isNaN(score);
  const done = phase === "done";
  const zone = done ? (hasScore ? zoneOf(score) : STATE_ZONE[state] || "warn") : null;
  // Mockup mapping: -86° = 0%, +86° = 100%
  const angle = done
    ? (hasScore ? (-86 + Math.max(0, Math.min(100, score)) * 1.72) : STATE_ANGLE[state] ?? 0)
    : -86;
  const stamp = done
    ? (hasScore
        ? (score >= 97 ? "Certified" : score >= 85 ? "Passed — with notes" : "Needs a look")
        : (state === "pass" ? "Passed" : state === "warning" ? "Passed — with notes" : "Needs a look"))
    : null;
  const pct = done
    ? (hasScore ? `${Math.round(score * 10) / 10}%` : STATE_LABEL[state] || "Checked")
    : phase === "checking" ? "checking…" : "—";
  const pctColor = done ? PCT_COLOR[zone] : "#726A92";
  const stampColor = zone === "ok" ? { border: "#5EC9AE", text: "#1E8A63" }
    : zone === "warn" ? { border: "#F5B93E", text: "#B07B1E" }
    : { border: "#FF8A73", text: "#C2564A" };
  const needleAnim = phase === "checking"
    ? "wvGscan 1.5s ease-in-out infinite"
    : done ? "wvGsettle 1.15s cubic-bezier(.3,1.4,.4,1) forwards" : "none";

  return (
    <div style={{ width: "100%", maxWidth: 390, background: "#fff", border: "1px solid #ECE6F8", borderRadius: 18, padding: "16px 17px 15px", textAlign: "center", position: "relative", boxShadow: "0 20px 44px -30px rgba(90,66,160,.5)" }}>
      <style>{scanGaugeKeyframes}</style>
      {stamp && (
        <div style={{ position: "absolute", top: 12, right: 12, border: `2.5px solid ${stampColor.border}`, color: stampColor.text, fontFamily: "'Fredoka','Segoe UI',sans-serif", fontWeight: 600, fontSize: 11.5, letterSpacing: ".09em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 9, transform: "rotate(-8deg) scale(0)", opacity: 0, background: "#fff", animation: "wvGstamp .4s .95s cubic-bezier(.2,1.7,.4,1) forwards" }}>{stamp}</div>
      )}
      <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "#726A92", fontFamily: "Nunito,sans-serif" }}>BevCheck accuracy</div>
      <div style={{ width: 200, height: 106, margin: "12px auto 0", position: "relative" }}>
        <svg width="200" height="106" viewBox="0 0 200 106" fill="none">
          <path d="M18 100a82 82 0 01164 0" stroke="#ECE6F8" strokeWidth="9" strokeLinecap="round" strokeDasharray="3 5" />
          <path d="M18 100a82 82 0 01164 0" pathLength="100" stroke="#FF8A73" strokeWidth="9" strokeLinecap="round" strokeDasharray="68 32" opacity=".3" />
          <path d="M18 100a82 82 0 01164 0" pathLength="100" stroke="#5EC9AE" strokeWidth="9" strokeLinecap="round" strokeDasharray="15 85" strokeDashoffset="-85" />
          <path d="M18 100a82 82 0 01164 0" pathLength="100" stroke="#F5B93E" strokeWidth="9" strokeLinecap="round" strokeDasharray="15 85" strokeDashoffset="-70" opacity=".85" />
          <text x="14" y="94" fontFamily="Nunito,sans-serif" fontSize="10" fontWeight="800" fill="#726A92">0</text>
          <text x="172" y="94" fontFamily="Nunito,sans-serif" fontSize="10" fontWeight="800" fill="#726A92">100</text>
        </svg>
        <div style={{ position: "absolute", left: 98, bottom: 2, width: 4, height: 80, background: "#2E2748", borderRadius: 99, transformOrigin: "50% 100%", transform: "rotate(-86deg)", "--gA": `${angle}deg`, animation: needleAnim, transition: "transform .9s cubic-bezier(.3,1.5,.4,1)" }}>
          <div style={{ position: "absolute", left: "50%", bottom: -8, transform: "translateX(-50%)", width: 16, height: 16, borderRadius: "50%", background: "#2E2748", boxShadow: "0 3px 7px -2px rgba(46,39,72,.55)" }} />
          <div style={{ position: "absolute", left: "50%", bottom: -3, transform: "translateX(-50%)", width: 6, height: 6, borderRadius: "50%", background: "#fff", zIndex: 2 }} />
        </div>
      </div>
      <div style={{ fontFamily: "'Fredoka','Segoe UI',sans-serif", fontWeight: 600, fontSize: 30, marginTop: 4, color: pctColor }}>{pct}</div>
      {note && <div style={{ fontWeight: 700, fontSize: 12.5, color: "#726A92", marginTop: 4, fontFamily: "Nunito,sans-serif" }}>{note}</div>}
    </div>
  );
};

// The 2b 4-step progress list (.steps/.pstep/.pdot) used beside the gauge.
export const ProcSteps = ({ steps, activeStep }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 20, width: "100%", maxWidth: 390, textAlign: "left" }}>
    {steps.map((label, i) => {
      const done = i < activeStep, act = i === activeStep;
      return (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: `1px solid ${act ? "#7B6AD4" : "#ECE6F8"}`, borderRadius: 14, padding: "13px 16px", fontWeight: 800, fontSize: 14, fontFamily: "Nunito,sans-serif", color: done || act ? "#2E2748" : "#726A92" }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? "#5EC9AE" : act ? "#7B6AD4" : "#F2EEFB", color: done || act ? "#fff" : "#7B6AD4", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 13, fontWeight: 800, animation: act ? "wvPulseDot 1.1s ease-in-out infinite" : "none" }}>{done ? "✓" : i + 1}</div>
          {label}
        </div>
      );
    })}
  </div>
);

export const deriveGaugeState = deriveState;
export default ScanGauge;
